import type {
    SemanticProjectAnalyzer,
} from '../analyzer-port';
import type {
    SemanticDecision,
    SemanticProjectEvidence,
    SemanticProjectInput,
    SemanticReceiverBindingKind,
    SemanticResolvedOccurrence,
    SemanticStrategy,
    SemanticTargetKind,
    SemanticTargetProvenance,
} from '../contracts';
import { Utf8SourceMap } from '../../language-analysis/source-map';
import { WasmSemanticEngine } from './wasm-engine';
import { ReceiverBindingKind, SemanticDecision as WasmSemanticDecision, SemanticStrategy as WasmSemanticStrategy } from './wasm-types';

export class WasmSemanticProjectAnalyzer implements SemanticProjectAnalyzer {
    constructor(private readonly engineProvider: () => Promise<WasmSemanticEngine> = () => WasmSemanticEngine.create()) {}

    supportsLanguage(language: string): boolean {
        return language === 'go';
    }

    async analyze(input: SemanticProjectInput): Promise<SemanticProjectEvidence> {
        if (!this.supportsLanguage(input.language)) {
            return {
                language: input.language,
                occurrencesByFile: new Map(),
            };
        }

        const engine = await this.engineProvider();
        const session = await engine.createSession(input.language);

        try {
            const sourceMapByFile = new Map<string, Utf8SourceMap>();

            for (const aux of input.auxiliaryFiles) {
                session.addAuxiliary(aux.role, aux.path, aux.source);
            }

            for (const src of input.sourceFiles) {
                session.addSource(src.path, src.source);
                sourceMapByFile.set(src.path, new Utf8SourceMap(src.source));
            }

            const rawResults = await session.resolve();
            const occurrencesByFile = new Map<string, SemanticResolvedOccurrence[]>();

            for (const raw of rawResults) {
                const occurrences = occurrencesByFile.get(raw.sourceFile) ?? [];
                const srcMap = sourceMapByFile.get(raw.sourceFile) ?? new Utf8SourceMap('');

                let strategy: SemanticStrategy = 'direct_call';
                if (raw.strategy === WasmSemanticStrategy.TYPE_DISPATCH) strategy = 'type_dispatch';
                else if (raw.strategy === WasmSemanticStrategy.EMBED_DISPATCH) strategy = 'embed_dispatch';
                else if (raw.strategy === WasmSemanticStrategy.INTERFACE_DISPATCH) strategy = 'interface_dispatch';

                let decision: SemanticDecision = 'resolved';
                if (raw.decision === WasmSemanticDecision.UNRESOLVED) decision = 'unresolved';
                else if (raw.decision === WasmSemanticDecision.AMBIGUOUS) decision = 'ambiguous';

                let receiverKind: SemanticReceiverBindingKind = 'none';
                if (raw.receiverBindingKind === ReceiverBindingKind.TYPED_PARAMETER) receiverKind = 'typed_parameter';
                else if (raw.receiverBindingKind === ReceiverBindingKind.CONSTRUCTOR_RETURN) receiverKind = 'constructor_return';
                else if (raw.receiverBindingKind === ReceiverBindingKind.COMPOSITE_LITERAL) receiverKind = 'composite_literal';
                else if (raw.receiverBindingKind === ReceiverBindingKind.FIELD_ACCESS) receiverKind = 'field_access';
                else if (raw.receiverBindingKind === ReceiverBindingKind.MULTI_RETURN) receiverKind = 'multi_return';
                else if (raw.receiverBindingKind === ReceiverBindingKind.RANGE_VARIABLE) receiverKind = 'range_variable';
                else if (raw.receiverBindingKind === ReceiverBindingKind.EMBEDDED_PROMOTED) receiverKind = 'embedded_promoted';

                const targetMap = raw.targetFile ? sourceMapByFile.get(raw.targetFile) : undefined;
                const targetKind: SemanticTargetKind = raw.targetKind === 2 ? 'method' : (raw.targetKind === 1 ? 'function' : 'none');

                let targetProvenance: SemanticTargetProvenance | undefined;
                if (
                    raw.targetFile &&
                    raw.targetName &&
                    targetMap &&
                    raw.targetStartByte !== undefined &&
                    raw.targetEndByte !== undefined &&
                    raw.targetEndByte > raw.targetStartByte
                ) {
                    targetProvenance = {
                        file: raw.targetFile,
                        span: targetMap.span(raw.targetStartByte, raw.targetEndByte),
                        name: raw.targetName,
                        kind: targetKind,
                        ownerName: raw.receiverType,
                    };
                }

                const occurrence: SemanticResolvedOccurrence = {
                    sourceFile: raw.sourceFile,
                    callSpan: srcMap.span(raw.callStartByte, raw.callEndByte),
                    targetProvenance,
                    proof: {
                        strategy,
                        packageBinding: raw.importPath ? {
                            importPath: raw.importPath,
                        } : undefined,
                        receiverBinding: raw.receiverType ? {
                            kind: receiverKind,
                            receiverType: raw.receiverType,
                        } : undefined,
                    },
                    decision,
                    confidence: raw.confidence,
                };

                occurrences.push(occurrence);
                occurrencesByFile.set(raw.sourceFile, occurrences);
            }

            return {
                language: input.language,
                occurrencesByFile,
            };
        } finally {
            session.destroy();
        }
    }
}
