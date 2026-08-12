// Compatibility facade for the navigation sidecar boundary.
//
// Ownership after the Phase 2.4 decomposition:
// - artifact writes (symbols, relationships) and sidecar-specific atomic
//   replacement/rollback: ./sidecar-writes
// - generation staging, publication, discard, prune, and clear:
//   ./sidecar-lifecycle
// - reads: ./sidecar-reads; parsing/validation: ./sidecar-validators
//
// This module stores no artifacts and decides nothing about which generation
// is active; it only re-exports the established public contract.

export {
    writeRelationshipSidecar,
    writeSymbolRegistrySidecar,
} from './sidecar-writes';
export type {
    WriteRelationshipSidecarInput,
    WriteRelationshipSidecarResult,
    WriteSymbolRegistrySidecarInput,
    WriteSymbolRegistrySidecarResult,
} from './sidecar-writes';
export {
    NavigationSidecarStagingCleanupError,
    clearSymbolRegistrySidecar,
    discardNavigationSidecarGeneration,
    pruneNavigationSidecarGenerations,
    publishNavigationSidecarGeneration,
    stageNavigationSidecarGeneration,
    writeNavigationSidecarGeneration,
} from './sidecar-lifecycle';
export type {
    ClearSymbolRegistrySidecarInput,
    NavigationGenerationPointerCandidate,
    StagedNavigationSidecarGeneration,
    WriteNavigationSidecarGenerationInput,
    WriteNavigationSidecarGenerationResult,
} from './sidecar-lifecycle';
export {
    isRelationshipRecord,
    isSymbolRecord,
    parseNavigationGenerationSeal,
} from './sidecar-validators';
export type {
    NavigationGenerationSeal,
    NavigationSymbolQualityAggregate,
} from './sidecar-validators';
export {
    RetiredNavigationPointerError,
    UnsupportedNavigationPointerError,
    computeNavigationGenerationSealHash,
    computeNavigationSourceFilesDigest,
    computeRelationshipManifestHash,
    readNavigationGenerationSeal,
    readRelationshipSidecar,
    readSymbolRegistrySidecar,
    resolveCurrentNavigationGeneration,
    resolveNavigationGeneration,
    resolveNavigationSidecarRoot,
    verifyNavigationGenerationSealArtifacts,
} from './sidecar-reads';
export type {
    CurrentNavigationGeneration,
    ReadNavigationGenerationSealResult,
    ReadRelationshipSidecarInput,
    ReadRelationshipSidecarResult,
    ReadSymbolRegistrySidecarInput,
    ReadSymbolRegistrySidecarResult,
} from './sidecar-reads';
