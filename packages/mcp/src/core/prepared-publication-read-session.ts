/**
 * Phase 5.2 — Prepared publication-read session.
 *
 * Owns the full lifetime of a publication-bound read:
 *
 *   prepare readiness
 *   → acquire publication read lease
 *   → execute search/navigation read
 *   → revalidate authority
 *   → release lease
 *
 * Contract guarantees:
 * - The publication read lease is acquired strictly AFTER readiness
 *   preparation resolves; a short-lived lease callback is never placed inside
 *   readiness preparation (the session structure enforces this ordering).
 * - Dependencies are narrow callables supplied by the host. The session never
 *   reaches Context, SyncManager, or ToolHandlers readiness internals itself.
 * - The lease is released exactly once, on every path (normal completion,
 *   stale revalidation, thrown errors), including paths where the executor
 *   already released it early (e.g. source-drift retry handoff).
 */

export interface PreparedPublicationReadSessionDependencies<TPrepared> {
    /**
     * Establish readiness for the read (e.g. prepared navigation read or the
     * search front door). Must NOT acquire the publication read lease.
     */
    prepareReadiness(): Promise<TPrepared>;
    /**
     * Acquire the publication read lease for the prepared state, returning a
     * release function (or undefined when no lease applies, e.g. the prepared
     * state is not ready). Called only after `prepareReadiness` resolves.
     */
    acquirePublicationReadLease(prepared: TPrepared): Promise<(() => void) | undefined>;
    /**
     * Final authority revalidation after the read executed. Returning false
     * yields a `stale` outcome so the caller can retry or fail closed.
     * Skipped when the executor already released the lease early (the read
     * handed off to a fresh attempt, which performs its own revalidation).
     */
    revalidateAuthority(prepared: TPrepared): Promise<boolean> | boolean;
}

export type PreparedPublicationReadExecutor<TPrepared, TResult> = (
    prepared: TPrepared,
    releaseLease: () => void,
) => Promise<TResult>;

export type PreparedPublicationReadOutcome<TResult> =
    | { status: "completed"; result: TResult }
    | { status: "stale" };

export class PreparedPublicationReadSession<TPrepared> {
    public constructor(
        private readonly deps: PreparedPublicationReadSessionDependencies<TPrepared>,
    ) {}

    public async read<TResult>(
        execute: PreparedPublicationReadExecutor<TPrepared, TResult>,
    ): Promise<PreparedPublicationReadOutcome<TResult>> {
        // 1. Prepare readiness. The lease is not acquired here by construction.
        const prepared = await this.deps.prepareReadiness();
        // 2. Acquire the publication read lease only after readiness resolves.
        const release = await this.deps.acquirePublicationReadLease(prepared);
        let released = false;
        const releaseLease = (): void => {
            if (released) {
                return;
            }
            released = true;
            release?.();
        };
        try {
            // 3. Execute the read under the lease.
            const result = await execute(prepared, releaseLease);
            // 4. Revalidate authority. An executor that released the lease early
            //    (drift retry handoff) already delegated revalidation to the
            //    fresh attempt, so it is skipped here.
            if (!released && !(await this.deps.revalidateAuthority(prepared))) {
                return { status: "stale" };
            }
            return { status: "completed", result };
        } finally {
            // 5. Release the lease exactly once on every path.
            releaseLease();
        }
    }
}
