import type { RelationshipRecord, SymbolRecord, SymbolRegistry } from '../../symbols';
import type {
    CallResolutionContribution,
    CallResolutionEngine,
    CallResolutionEngineInput,
} from './contracts';
import {
    dependencyKeyForCall,
    type ResolutionClaim,
    resolutionAuthorityForProof,
    type ResolutionProofStep,
} from '../resolution';
import type { SemanticProjectEvidence } from '../../semantic/contracts';
import { defaultSemanticLanguageRegistry, type SemanticLanguageDescriptor } from '../../semantic/descriptor';

function findEnclosingCaller(
    fileSymbols: readonly SymbolRecord[] | undefined,
    callSpan: { startByte?: number; endByte?: number; startLine: number; endLine: number },
): SymbolRecord | undefined {
    if (!fileSymbols || fileSymbols.length === 0) return undefined;

    let bestCandidate: SymbolRecord | undefined;
    let smallestSpan = Infinity;

    for (const sym of fileSymbols) {
        if (!sym.span) continue;
        if (sym.kind === 'file') continue;

        const contains = (
            callSpan.startByte !== undefined &&
            callSpan.endByte !== undefined &&
            sym.span.startByte !== undefined &&
            sym.span.endByte !== undefined &&
            callSpan.startByte >= sym.span.startByte &&
            callSpan.endByte <= sym.span.endByte
        ) || (
            callSpan.startLine >= sym.span.startLine &&
            callSpan.endLine <= sym.span.endLine
        );

        if (contains) {
            const symSpan = (sym.span.endByte ?? 0) - (sym.span.startByte ?? 0);
            if (symSpan < smallestSpan) {
                smallestSpan = symSpan;
                bestCandidate = sym;
            }
        }
    }

    if (bestCandidate) return bestCandidate;
    return fileSymbols.find((s) => s.kind === 'file') ?? fileSymbols[0];
}

function findMatchingTarget(
    registry: SymbolRegistry,
    targetFile: string,
    targetName: string,
    ownerName?: string,
): SymbolRecord[] {
    const fileSymbols = registry.symbolsByFile.get(targetFile);
    if (!fileSymbols) return [];

    return fileSymbols.filter((sym: SymbolRecord) => {
        if (sym.kind === 'file') return false;
        if (sym.name === targetName || sym.qualifiedName.endsWith(`.${targetName}`)) {
            if (ownerName) {
                return (
                    sym.parentQualifiedNamePath.includes(ownerName) ||
                    sym.qualifiedName.includes(ownerName)
                );
            }
            return true;
        }
        return false;
    });
}

export interface CbmResolutionInput extends CallResolutionEngineInput {
    readonly semanticEvidence?: SemanticProjectEvidence;
    readonly semanticEvidenceByLanguage?: ReadonlyMap<string, SemanticProjectEvidence> | Record<string, SemanticProjectEvidence>;
}

export class CbmSemanticContributionEngine implements CallResolutionEngine {
    private readonly descriptor?: SemanticLanguageDescriptor;

    constructor(
        readonly language: string,
        descriptor?: SemanticLanguageDescriptor,
    ) {
        this.descriptor = descriptor ?? defaultSemanticLanguageRegistry.getDescriptor(language);
    }

    resolveCalls(input: CbmResolutionInput): CallResolutionContribution {
        const records: RelationshipRecord[] = [];
        const claimsByFile = new Map<string, ResolutionClaim[]>();

        let semanticEvidence = input.semanticEvidence;
        if (!semanticEvidence && input.semanticEvidenceByLanguage) {
            semanticEvidence = input.semanticEvidenceByLanguage instanceof Map
                ? input.semanticEvidenceByLanguage.get(this.language)
                : (input.semanticEvidenceByLanguage as Record<string, SemanticProjectEvidence>)[this.language];
        }

        if (!semanticEvidence || semanticEvidence.language !== this.language) {
            return { records: [], claimsByFile: new Map() };
        }

        const providerId = this.descriptor?.providerId ?? `satori-cbm-semantic-${this.language}`;
        const providerVersion = this.descriptor?.providerVersion ?? `cbm-${this.language}-v1`;
        const environmentConfigId = this.descriptor?.environmentConfigId ?? `cbm-${this.language}-config-v1`;

        const sourceFilter = input.sourceFiles;

        for (const [filePath, occurrences] of semanticEvidence.occurrencesByFile) {
            if (sourceFilter && !sourceFilter.has(filePath)) {
                continue;
            }

            const fileSymbols = input.registry.symbolsByFile.get(filePath);
            const fileClaims: ResolutionClaim[] = [];

            for (const occ of occurrences) {
                const caller = findEnclosingCaller(fileSymbols, occ.callSpan);
                if (!caller) continue;

                const proofSteps: ResolutionProofStep[] = [
                    {
                        kind: 'call_site',
                        subject: occ.targetProvenance?.name ?? 'unknown',
                        span: occ.callSpan,
                    },
                    {
                        kind: 'containing_caller',
                        subject: caller.qualifiedName,
                        span: caller.span && caller.span.startByte !== undefined && caller.span.endByte !== undefined ? {
                            startLine: caller.span.startLine,
                            endLine: caller.span.endLine,
                            startByte: caller.span.startByte,
                            endByte: caller.span.endByte,
                            startColumn: caller.span.startColumn ?? 0,
                            endColumn: caller.span.endColumn ?? 0,
                        } : undefined,
                    },
                ];

                if (occ.proof.packageBinding) {
                    proofSteps.push({
                        kind: 'package_binding',
                        subject: occ.proof.packageBinding.importPath,
                        detail: occ.proof.packageBinding.packageIdentity,
                        span: occ.proof.packageBinding.span,
                    });
                }

                if (occ.proof.receiverBinding) {
                    proofSteps.push({
                        kind: 'receiver_type_binding',
                        subject: occ.proof.receiverBinding.receiverType,
                        detail: occ.proof.receiverBinding.kind,
                        span: occ.proof.receiverBinding.span,
                    });
                }

                if (occ.targetProvenance) {
                    proofSteps.push({
                        kind: 'exact_target_definition',
                        subject: occ.targetProvenance.name,
                        detail: occ.targetProvenance.file,
                        span: occ.targetProvenance.span,
                    });
                }

                let targetSymbol: SymbolRecord | undefined;
                let decision = occ.decision;

                if (occ.targetProvenance && decision === 'resolved') {
                    const matches = findMatchingTarget(
                        input.registry,
                        occ.targetProvenance.file,
                        occ.targetProvenance.name,
                        occ.targetProvenance.ownerName,
                    );

                    if (matches.length === 1) {
                        targetSymbol = matches[0];
                    } else if (matches.length > 1) {
                        decision = 'ambiguous';
                        proofSteps.push({
                            kind: 'ambiguity',
                            subject: occ.targetProvenance.name,
                            detail: `Found ${matches.length} matching symbols in ${occ.targetProvenance.file}`,
                        });
                    } else {
                        decision = 'unresolved';
                        proofSteps.push({
                            kind: 'unresolved_dependency',
                            subject: occ.targetProvenance.name,
                            detail: `Symbol not found in target file ${occ.targetProvenance.file}`,
                        });
                    }
                }

                const depKey = dependencyKeyForCall({
                    file: filePath,
                    span: occ.callSpan,
                    receiverText: occ.targetProvenance?.ownerName,
                    calleeName: occ.targetProvenance?.name ?? '',
                });

                const claim: ResolutionClaim = {
                    providerId,
                    providerVersion,
                    environmentConfigId,
                    sourceFile: filePath,
                    sourceInstanceId: caller.symbolInstanceId,
                    ...(targetSymbol ? {
                        targetInstanceId: targetSymbol.symbolInstanceId,
                        targetSymbol: targetSymbol.qualifiedName,
                    } : {}),
                    callSpan: { ...occ.callSpan },
                    decision,
                    relationshipType: decision === 'resolved' ? 'CALLS' : 'REFERENCES',
                    resolutionAuthority: resolutionAuthorityForProof({
                        decision,
                        proofSteps,
                        flowHops: 0,
                    }),
                    proofSteps,
                    dependencyKeys: decision === 'resolved' ? [] : [depKey],
                    flowHops: 0,
                };

                fileClaims.push(claim);

                if (decision === 'resolved' && targetSymbol) {
                    const record: RelationshipRecord = {
                        sourceKey: caller.symbolKey,
                        sourceInstanceId: caller.symbolInstanceId,
                        targetKey: targetSymbol.symbolKey,
                        targetInstanceId: targetSymbol.symbolInstanceId,
                        type: 'CALLS',
                        file: filePath,
                        span: occ.callSpan,
                        confidence: targetSymbol.file === filePath ? 'high' : 'medium',
                        resolutionAuthority: 'direct_binding',
                    };
                    records.push(record);
                }
            }

            claimsByFile.set(filePath, fileClaims);
        }

        return {
            records,
            claimsByFile,
        };
    }
}
