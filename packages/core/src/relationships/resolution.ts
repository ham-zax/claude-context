import type { SourceSpan } from '../language-analysis';

/** Stable semantic configuration identity; publication generations are not part of it. */
export const PYTHON_NATIVE_ENVIRONMENT_CONFIG_ID = 'python-native-resolution-v1';
export const NATIVE_PYTHON_PROVIDER_ID = 'satori-native-python';
export const NATIVE_PYTHON_PROVIDER_VERSION = 'bounded-origin-v1';
/**
 * A flow hop is one bounded value-origin transfer across an allocation,
 * field, or callback/parameter boundary. Constructor origins and direct
 * symbol/import evidence start at zero; syntactic member selection and class
 * inheritance do not increment the count. Every increment is represented by
 * one ordered `flow_hop` proof step, and claims above this bound abstain.
 */
export const MAX_PYTHON_FLOW_HOPS = 6;

export type ResolutionDecision = 'resolved' | 'unresolved' | 'ambiguous';

export type ResolutionProofStepKind =
    | 'call_site'
    | 'containing_caller'
    | 'absolute_import'
    | 'relative_import'
    | 'same_file_definition'
    | 'constructor_origin'
    | 'parameter_annotation'
    | 'allocation_origin'
    | 'field_origin'
    | 'callback_origin'
    | 'class_inheritance'
    | 'flow_hop'
    | 'candidate_set'
    | 'ambiguity'
    | 'unresolved_dependency';

export interface ResolutionProofStep {
    readonly kind: ResolutionProofStepKind;
    readonly subject: string;
    readonly detail?: string;
    readonly span?: SourceSpan;
    /** One-based flow hop number for flow_hop steps. */
    readonly hop?: number;
}

/**
 * Provider-neutral evidence. A provider proposes identity; Satori validates
 * spans/snapshots and decides whether a relationship is publishable.
 */
export interface ResolutionClaim {
    readonly providerId: string;
    readonly providerVersion: string;
    readonly environmentConfigId: string;
    readonly sourceFile: string;
    readonly sourceInstanceId?: string;
    readonly targetInstanceId?: string;
    readonly targetSymbol?: string;
    readonly callSpan: SourceSpan;
    readonly decision: ResolutionDecision;
    readonly relationshipType: 'CALLS' | 'REFERENCES';
    readonly proofSteps: readonly ResolutionProofStep[];
    /** Stable keys for unresolved/ambiguous and flow-origin dependencies. */
    readonly dependencyKeys: readonly string[];
    readonly flowHops: number;
}

export interface ResolutionProvider<TInput = unknown> {
    readonly providerId: string;
    readonly providerVersion: string;
    resolve(input: TInput): readonly ResolutionClaim[];
}

export function dependencyKeyForCall(input: {
    file: string;
    span: SourceSpan;
    receiverText?: string;
    calleeName: string;
}): string {
    return [
        input.file,
        input.span.startByte,
        input.span.endByte,
        input.receiverText ?? '',
        input.calleeName,
    ].join(':');
}
