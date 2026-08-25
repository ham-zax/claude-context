/** Generation-domain errors shared by Core mutation owners. */
export class AtomicIncrementalPublicationUnsupportedError extends Error {
    constructor() {
        super('The active vector backend cannot stage an atomic incremental publication; a full rebuild is required.');
        this.name = 'AtomicIncrementalPublicationUnsupportedError';
    }
}
