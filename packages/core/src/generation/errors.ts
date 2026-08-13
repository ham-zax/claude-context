/**
 * Generation-domain publication errors.
 *
 * Neutral module so generation owners can throw and catch these errors without
 * importing from `core/context.ts`. `Context` re-exports them for public
 * compatibility.
 */
import type { IndexPolicyPublicationReceipt } from './contracts';

export class IndexPolicyPublicationError extends Error {
    readonly committed = true;

    constructor(
        message: string,
        readonly receipt: IndexPolicyPublicationReceipt,
        readonly publicationCause: unknown,
    ) {
        super(message);
        this.name = 'IndexPolicyPublicationError';
    }
}

export class AtomicIncrementalPublicationUnsupportedError extends Error {
    constructor() {
        super('The active vector backend cannot stage an atomic incremental publication; a full rebuild is required.');
        this.name = 'AtomicIncrementalPublicationUnsupportedError';
    }
}
