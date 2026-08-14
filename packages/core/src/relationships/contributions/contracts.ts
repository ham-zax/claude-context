import type { SymbolRegistry, RelationshipRecord } from '../../symbols';
import type { RelationshipAnalysisEvidence } from '../builder';
import type { ResolutionClaim } from '../resolution';

export type RelationshipBuildMode =
    | { readonly kind: 'production' }
    | {
        readonly kind: 'qualification';
        readonly enabledUnpromotedCallLanguages: ReadonlySet<string>;
    };

export interface CallResolutionContribution {
    readonly records: readonly RelationshipRecord[];
    readonly claimsByFile?: ReadonlyMap<string, readonly ResolutionClaim[]>;
}

export interface CallResolutionEngineInput {
    readonly registry: SymbolRegistry;
    readonly analysisByFile: Map<string, RelationshipAnalysisEvidence> | Record<string, RelationshipAnalysisEvidence>;
    readonly sourceFiles?: ReadonlySet<string>;
    readonly mode?: RelationshipBuildMode;
}

export interface CallResolutionEngine {
    resolveCalls(input: CallResolutionEngineInput): CallResolutionContribution;
}
