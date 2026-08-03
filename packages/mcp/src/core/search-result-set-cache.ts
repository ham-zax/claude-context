import crypto from "node:crypto";
import { serializeCanonicalJson } from "./canonical-json.js";

export const MAX_RESULT_SET_ENTRY_BYTES = 8 * 1024 * 1024;
export const MAX_RESULT_SET_CACHE_BYTES = 16 * 1024 * 1024;
export const MIN_RESIDENT_RESULT_SETS = 2;
export const MAX_RESULT_SET_CACHE_ENTRIES = 32;
export const RESULT_SET_TTL_MS = 15 * 60_000;

export type SearchResultSetLookup<T> =
    | {
        status: "hit";
        entry: Readonly<T>;
        nextOffset: number;
        expiresAtMs: number;
        lastPage: Readonly<SearchResultSetReplay> | null;
    }
    | { status: "expired" }
    | { status: "not_found" };

export type SearchResultSetReplay = {
    expectedOffset: number;
    pageSize: number;
    responseText: string;
};

export type SearchResultSetStoreResult =
    | {
        status: "stored";
        handle: string;
        expiresAtMs: number;
        reservationBytes: number;
    }
    | {
        status: "not_admissible";
        reason: "entry_too_large";
        valueBytes: number;
        reservedReplayBytes: number;
        reservationBytes: number;
        maxEntryBytes: number;
    };

export type SearchResultSetCacheOptions = Readonly<{
    maxEntries: number;
    maxEntryBytes: number;
    maxCacheBytes: number;
    ttlMs: number;
}>;

type ScopedOwnedSearchResultSet<T> = {
    scopeId: string;
    ownerId: string;
    value: T;
};

export type SearchResultSetCoordinatorLookup<T, TOwner extends object> =
    | {
        status: "hit";
        owner: TOwner;
        entry: Readonly<T>;
        nextOffset: number;
        expiresAtMs: number;
        lastPage: Readonly<SearchResultSetReplay> | null;
    }
    | { status: "expired" }
    | { status: "not_found" }
    | { status: "owner_unavailable" };

type CacheEntry<T> = {
    value: T;
    nextOffset: number;
    expiresAtMs: number;
    reservationBytes: number;
    reservedReplayBytes: number;
    lastPage: SearchResultSetReplay | null;
};

const DEFAULT_OPTIONS: SearchResultSetCacheOptions = Object.freeze({
    maxEntries: MAX_RESULT_SET_CACHE_ENTRIES,
    maxEntryBytes: MAX_RESULT_SET_ENTRY_BYTES,
    maxCacheBytes: MAX_RESULT_SET_CACHE_BYTES,
    ttlMs: RESULT_SET_TTL_MS,
});

function resolveOptions(
    options: Partial<SearchResultSetCacheOptions> = {},
): SearchResultSetCacheOptions {
    const resolved = { ...DEFAULT_OPTIONS, ...options };
    for (const [label, value] of Object.entries(resolved)) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new Error(`Search result-set cache ${label} must be a positive safe integer.`);
        }
    }
    if (resolved.maxEntryBytes > resolved.maxCacheBytes) {
        throw new Error("Search result-set entry byte limit cannot exceed aggregate capacity.");
    }
    return Object.freeze(resolved);
}

function canonicalByteLength(value: unknown): number {
    const json = JSON.stringify(value);
    if (json === undefined) {
        throw new TypeError("Search result-set cache values must be JSON-serializable.");
    }
    return Buffer.byteLength(serializeCanonicalJson(JSON.parse(json)), "utf8");
}

export class SearchResultSetCache<T> {
    private readonly entries = new Map<string, CacheEntry<T>>();
    private readonly options: SearchResultSetCacheOptions;
    private totalReservationBytes = 0;

    constructor(options: Partial<SearchResultSetCacheOptions> = {}) {
        this.options = resolveOptions(options);
    }

    public store(input: {
        value: T;
        nextOffset: number;
        reservedReplayBytes: number;
        nowMs: number;
    }): SearchResultSetStoreResult {
        if (
            !Number.isSafeInteger(input.reservedReplayBytes)
            || input.reservedReplayBytes < 0
        ) {
            throw new Error("Search result-set replay reservation must be a non-negative safe integer.");
        }
        const valueBytes = canonicalByteLength(input.value);
        const reservationBytes = valueBytes + input.reservedReplayBytes;
        if (reservationBytes > this.options.maxEntryBytes) {
            return {
                status: "not_admissible",
                reason: "entry_too_large",
                valueBytes,
                reservedReplayBytes: input.reservedReplayBytes,
                reservationBytes,
                maxEntryBytes: this.options.maxEntryBytes,
            };
        }

        const handle = crypto.randomBytes(24).toString("hex");
        const expiresAtMs = input.nowMs + this.options.ttlMs;
        this.entries.set(handle, {
            value: structuredClone(input.value),
            nextOffset: Math.max(0, Math.floor(input.nextOffset)),
            expiresAtMs,
            reservationBytes,
            reservedReplayBytes: input.reservedReplayBytes,
            lastPage: null,
        });
        this.totalReservationBytes += reservationBytes;
        this.prune(input.nowMs);
        return { status: "stored", handle, expiresAtMs, reservationBytes };
    }

    public lookup(
        handle: string,
        nowMs: number,
        accepts: (value: Readonly<T>) => boolean = () => true,
    ): SearchResultSetLookup<T> {
        const entry = this.entries.get(handle);
        if (!entry) return { status: "not_found" };
        if (nowMs >= entry.expiresAtMs) {
            this.delete(handle, entry);
            return { status: "expired" };
        }
        if (!accepts(entry.value)) return { status: "not_found" };
        this.entries.delete(handle);
        this.entries.set(handle, entry);
        return {
            status: "hit",
            entry: structuredClone(entry.value),
            nextOffset: entry.nextOffset,
            expiresAtMs: entry.expiresAtMs,
            lastPage: entry.lastPage ? structuredClone(entry.lastPage) : null,
        };
    }

    public advance(input: {
        handle: string;
        expectedOffset: number;
        nextOffset: number;
        nowMs: number;
        replay: SearchResultSetReplay;
        accepts?: (value: Readonly<T>) => boolean;
    }): "advanced" | "conflict" | "expired" | "not_found" | "too_large" {
        const entry = this.entries.get(input.handle);
        if (!entry) return "not_found";
        if (input.nowMs >= entry.expiresAtMs) {
            this.delete(input.handle, entry);
            return "expired";
        }
        if (input.accepts && !input.accepts(entry.value)) return "not_found";
        if (entry.nextOffset !== input.expectedOffset) return "conflict";
        const replayBytes = Buffer.byteLength(input.replay.responseText, "utf8");
        if (replayBytes > entry.reservedReplayBytes) return "too_large";
        entry.lastPage = structuredClone(input.replay);
        entry.nextOffset = Math.max(entry.nextOffset, Math.floor(input.nextOffset));
        this.entries.delete(input.handle);
        this.entries.set(input.handle, entry);
        return "advanced";
    }

    public remove(handle: string, accepts: (value: Readonly<T>) => boolean = () => true): void {
        const entry = this.entries.get(handle);
        if (entry && accepts(entry.value)) this.delete(handle, entry);
    }

    public removeWhere(predicate: (value: Readonly<T>) => boolean): void {
        for (const [handle, entry] of this.entries) {
            if (predicate(entry.value)) this.delete(handle, entry);
        }
    }

    public clear(): void {
        this.entries.clear();
        this.totalReservationBytes = 0;
    }

    private prune(nowMs: number): void {
        for (const [handle, entry] of this.entries) {
            if (nowMs >= entry.expiresAtMs) this.delete(handle, entry);
        }
        while (
            this.entries.size > this.options.maxEntries
            || this.totalReservationBytes > this.options.maxCacheBytes
        ) {
            const oldest = this.entries.entries().next().value as [string, CacheEntry<T>] | undefined;
            if (!oldest) break;
            this.delete(oldest[0], oldest[1]);
        }
    }

    private delete(handle: string, entry: CacheEntry<T>): void {
        if (!this.entries.delete(handle)) return;
        this.totalReservationBytes -= entry.reservationBytes;
    }
}

export class SearchResultSetCoordinatorPool<T> {
    private readonly cache: SearchResultSetCache<ScopedOwnedSearchResultSet<T>>;

    constructor(options: Partial<SearchResultSetCacheOptions> = {}) {
        this.cache = new SearchResultSetCache(options);
    }

    public store(input: {
        value: ScopedOwnedSearchResultSet<T>;
        nextOffset: number;
        reservedReplayBytes: number;
        nowMs: number;
    }): SearchResultSetStoreResult {
        return this.cache.store(input);
    }

    public lookup(
        scopeId: string,
        handle: string,
        nowMs: number,
    ): SearchResultSetLookup<ScopedOwnedSearchResultSet<T>> {
        return this.cache.lookup(handle, nowMs, (entry) => entry.scopeId === scopeId);
    }

    public advance(scopeId: string, input: {
        handle: string;
        expectedOffset: number;
        nextOffset: number;
        nowMs: number;
        replay: SearchResultSetReplay;
    }): "advanced" | "conflict" | "expired" | "not_found" | "too_large" {
        return this.cache.advance({
            ...input,
            accepts: (entry) => entry.scopeId === scopeId,
        });
    }

    public remove(scopeId: string, handle: string): void {
        this.cache.remove(handle, (entry) => entry.scopeId === scopeId);
    }

    public removeOwner(scopeId: string, ownerId: string): void {
        this.cache.removeWhere((entry) => (
            entry.scopeId === scopeId && entry.ownerId === ownerId
        ));
    }

    public clear(): void {
        this.cache.clear();
    }
}

/**
 * One continuation authority scope over a potentially shared aggregate pool.
 * Sharing capacity never shares handle lookup or owner routing authority.
 */
export class SearchResultSetCoordinator<T, TOwner extends object> {
    private readonly scopeId = crypto.randomBytes(24).toString("hex");
    private readonly owners = new Map<string, TOwner>();
    private readonly ownerIds = new WeakMap<TOwner, string>();

    constructor(
        private readonly pool: SearchResultSetCoordinatorPool<T> =
            new SearchResultSetCoordinatorPool<T>(),
    ) {}

    public registerOwner(owner: TOwner): void {
        if (this.ownerIds.has(owner)) return;
        const ownerId = crypto.randomBytes(24).toString("hex");
        this.ownerIds.set(owner, ownerId);
        this.owners.set(ownerId, owner);
    }

    public unregisterOwner(owner: TOwner): void {
        const ownerId = this.ownerIds.get(owner);
        if (!ownerId) return;
        this.ownerIds.delete(owner);
        this.owners.delete(ownerId);
        this.pool.removeOwner(this.scopeId, ownerId);
    }

    public store(owner: TOwner, input: {
        value: T;
        nextOffset: number;
        reservedReplayBytes: number;
        nowMs: number;
    }): SearchResultSetStoreResult {
        const ownerId = this.ownerIds.get(owner);
        if (!ownerId || this.owners.get(ownerId) !== owner) {
            throw new Error("Search continuation owner is not registered.");
        }
        return this.pool.store({
            value: { scopeId: this.scopeId, ownerId, value: input.value },
            nextOffset: input.nextOffset,
            reservedReplayBytes: input.reservedReplayBytes,
            nowMs: input.nowMs,
        });
    }

    public lookup(handle: string, nowMs: number): SearchResultSetCoordinatorLookup<T, TOwner> {
        const lookup = this.pool.lookup(this.scopeId, handle, nowMs);
        if (lookup.status !== "hit") return lookup;
        const owner = this.owners.get(lookup.entry.ownerId);
        if (!owner) {
            this.pool.remove(this.scopeId, handle);
            return { status: "owner_unavailable" };
        }
        return {
            status: "hit",
            owner,
            entry: lookup.entry.value,
            nextOffset: lookup.nextOffset,
            expiresAtMs: lookup.expiresAtMs,
            lastPage: lookup.lastPage,
        };
    }

    public advance(input: {
        handle: string;
        expectedOffset: number;
        nextOffset: number;
        nowMs: number;
        replay: SearchResultSetReplay;
    }): "advanced" | "conflict" | "expired" | "not_found" | "too_large" {
        return this.pool.advance(this.scopeId, input);
    }

    public remove(handle: string): void {
        this.pool.remove(this.scopeId, handle);
    }
}
