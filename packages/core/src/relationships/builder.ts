import type { LanguageAnalysisResult } from '../language-analysis';
import type { RelationshipRecord, SymbolRecord, SymbolRegistry } from '../symbols';
import {
    compareRelationshipRecords,
    compareStrings,
    getEvidence,
    getEvidenceEntries,
    relationshipKey,
    relationshipSpan,
    resolvePythonModulePath,
    resolveRelativeModulePath,
} from './python-resolution';
import type { ResolutionClaim } from './resolution';
import { pythonResolutionContributionEngine } from './contributions/python';
import { syntacticResolutionContributionEngine } from './contributions/syntactic';
import type { RelationshipBuildMode } from './contributions/contracts';
import type { LanguageResolutionStrategyRegistry } from './resolution-strategy-registry';


export type RelationshipAnalysisEvidence =
    Pick<LanguageAnalysisResult, 'moduleBindings' | 'callSites'>
    & Partial<Pick<LanguageAnalysisResult, 'receiverTypeBindings' | 'pythonFlowFacts'>>
    & {
        readonly resolutionClaims?: readonly ResolutionClaim[];
    };

export interface BuildCallRelationshipsForRegistryInput {
    registry: SymbolRegistry;
    analysisByFile: Map<string, RelationshipAnalysisEvidence> | Record<string, RelationshipAnalysisEvidence>;
    /**
     * Restrict publication to these source files while retaining the complete
     * analysis map as semantic context for cross-file resolution.
     */
    sourceFiles?: ReadonlySet<string>;
    mode?: RelationshipBuildMode;
    strategyRegistry?: LanguageResolutionStrategyRegistry;
}

export type BuildRelationshipsForRegistryInput = BuildCallRelationshipsForRegistryInput;

export interface BuildRelationshipDeltaInput extends BuildRelationshipsForRegistryInput {
    previousRegistry: SymbolRegistry;
    existingRecords: readonly RelationshipRecord[];
    changedFiles: ReadonlySet<string>;
    previousAnalysisByFile?: Map<string, RelationshipAnalysisEvidence> | Record<string, RelationshipAnalysisEvidence>;
}

export interface BuildRelationshipDeltaResult {
    records: RelationshipRecord[];
    affectedFiles: string[];
}

function getFileOwners(symbols: readonly SymbolRecord[]): Map<string, SymbolRecord> {
    return new Map(
        symbols
            .filter((symbol) => symbol.kind === 'file')
            .map((symbol) => [symbol.file, symbol]),
    );
}

function resolveUniqueLocalSymbol(
    file: string,
    name: string,
    symbols: readonly SymbolRecord[],
): SymbolRecord | undefined {
    const matches = symbols.filter((symbol) => (
        symbol.file === file
        && symbol.kind !== 'file'
        && symbol.name === name
        && symbol.parentQualifiedNamePath.length === 0
    ));
    return matches.length === 1 ? matches[0] : undefined;
}

function resolveModulePathForDelta(
    sourceFile: string,
    specifier: string,
    registry: SymbolRegistry,
    language: string,
    availableFiles: ReadonlySet<string>,
): string | undefined {
    return language === 'python'
        ? resolvePythonModulePath(sourceFile, specifier, registry, availableFiles)
        : resolveRelativeModulePath(sourceFile, specifier, registry, language, availableFiles);
}

function attachResolutionClaims(
    evidenceByFile: BuildRelationshipsForRegistryInput['analysisByFile'],
    claimsByFile: ReadonlyMap<string, readonly ResolutionClaim[]>,
): void {
    for (const [file, claims] of claimsByFile) {
        const evidence = getEvidence(evidenceByFile, file);
        if (!evidence) continue;
        (evidence as { resolutionClaims?: readonly ResolutionClaim[] }).resolutionClaims = [...claims].sort((left, right) => (
            left.callSpan.startByte - right.callSpan.startByte
        ));
    }
}

/**
 * Centrally admits resolved call claims proposed by language providers,
 * verifying that the decision is resolved, authority is approved, and both
 * source and target symbol instances exist in the current registry.
 */
export function admitResolvedCallClaims(input: {
    registry: SymbolRegistry;
    claims: readonly ResolutionClaim[];
}): RelationshipRecord[] {
    const symbolsByInstanceId = new Map(
        input.registry.symbols.map((symbol) => [symbol.symbolInstanceId, symbol]),
    );
    const admitted: RelationshipRecord[] = [];

    for (const claim of input.claims) {
        if (claim.decision !== 'resolved') continue;
        if (claim.relationshipType !== 'CALLS') continue;
        if (!claim.sourceInstanceId || !claim.targetInstanceId) continue;
        if (claim.resolutionAuthority !== 'direct_binding' && claim.resolutionAuthority !== 'origin_flow') continue;

        const source = symbolsByInstanceId.get(claim.sourceInstanceId);
        const target = symbolsByInstanceId.get(claim.targetInstanceId);
        if (!source || !target) continue;

        const record: RelationshipRecord = {
            sourceKey: source.symbolKey,
            sourceInstanceId: source.symbolInstanceId,
            targetKey: target.symbolKey,
            targetInstanceId: target.symbolInstanceId,
            type: 'CALLS',
            file: source.file,
            span: claim.callSpan,
            confidence: target.file === source.file ? 'high' : 'low',
        };
        admitted.push(record);
    }

    return admitted;
}


export function buildCallRelationshipsForRegistry(input: BuildCallRelationshipsForRegistryInput): RelationshipRecord[] {
    const recordsByKey = new Map<string, RelationshipRecord>();
    const allClaimsByFile = new Map<string, ResolutionClaim[]>();

    // Python-specific module/direct/member/flow resolution and claim construction
    const pythonResult = pythonResolutionContributionEngine.resolveCalls({
        registry: input.registry,
        analysisByFile: input.analysisByFile,
        sourceFiles: input.sourceFiles,
        mode: input.mode,
    });
    for (const record of pythonResult.records) {
        recordsByKey.set(relationshipKey(record), record);
    }
    if (pythonResult.claimsByFile) {
        for (const [file, claims] of pythonResult.claimsByFile) {
            allClaimsByFile.set(file, [...claims]);
        }
    }

    // Syntactic non-Python direct call matching and derived TESTS edges
    const syntacticResult = syntacticResolutionContributionEngine.resolveCalls({
        registry: input.registry,
        analysisByFile: input.analysisByFile,
        sourceFiles: input.sourceFiles,
        mode: input.mode,
    });
    for (const record of syntacticResult.records) {
        recordsByKey.set(relationshipKey(record), record);
    }
    if (syntacticResult.claimsByFile) {
        for (const [file, claims] of syntacticResult.claimsByFile) {
            const existing = allClaimsByFile.get(file) ?? [];
            existing.push(...claims);
            allClaimsByFile.set(file, existing);
        }
    }

    attachResolutionClaims(input.analysisByFile, allClaimsByFile);
    return [...recordsByKey.values()].sort(compareRelationshipRecords);
}


function buildImportExportRelationshipsForRegistry(input: BuildRelationshipsForRegistryInput): RelationshipRecord[] {
    const fileOwners = getFileOwners(input.registry.symbols);
    const symbolsByFile = input.registry.symbolsByFile;
    const availableFiles = new Set(input.registry.manifest.files.map((file) => file.path));
    const recordsByKey = new Map<string, RelationshipRecord>();

    for (const source of input.registry.symbols.filter((symbol) => symbol.kind === 'file')) {
        if (input.sourceFiles && !input.sourceFiles.has(source.file)) continue;
        const evidence = getEvidence(input.analysisByFile, source.file);
        if (!evidence) continue;
        for (const binding of evidence.moduleBindings) {
            if (binding.kind === 'import' || binding.kind === 'reexport') {
                const specifier = binding.moduleSpecifier;
                const targetPath = specifier
                    ? source.language === 'python'
                        ? resolvePythonModulePath(source.file, specifier, input.registry, availableFiles)
                        : resolveRelativeModulePath(
                            source.file,
                            specifier,
                            input.registry,
                            source.language,
                            availableFiles,
                        )
                    : undefined;
                const target = targetPath ? fileOwners.get(targetPath) : undefined;
                if (!target) continue;
                const record: RelationshipRecord = {
                    sourceKey: source.symbolKey,
                    sourceInstanceId: source.symbolInstanceId,
                    targetKey: target.symbolKey,
                    targetInstanceId: target.symbolInstanceId,
                    targetPath: target.file,
                    type: binding.kind === 'import' ? 'IMPORTS' : 'EXPORTS',
                    file: source.file,
                    span: relationshipSpan(binding),
                    confidence: 'high',
                };
                recordsByKey.set(relationshipKey(record), record);
                continue;
            }

            const localName = binding.localName ?? binding.exportedName;
            const target = localName
                ? resolveUniqueLocalSymbol(source.file, localName, symbolsByFile.get(source.file) ?? [])
                : undefined;
            if (!target) continue;
            const record: RelationshipRecord = {
                sourceKey: source.symbolKey,
                sourceInstanceId: source.symbolInstanceId,
                targetKey: target.symbolKey,
                targetInstanceId: target.symbolInstanceId,
                type: 'EXPORTS',
                file: source.file,
                span: relationshipSpan(binding),
                confidence: 'high',
            };
            recordsByKey.set(relationshipKey(record), record);
        }
    }

    return [...recordsByKey.values()].sort(compareRelationshipRecords);
}

export function buildRelationshipsForRegistry(input: BuildRelationshipsForRegistryInput): RelationshipRecord[] {
    const recordsByKey = new Map<string, RelationshipRecord>();
    for (const record of [
        ...buildImportExportRelationshipsForRegistry(input),
        ...buildCallRelationshipsForRegistry(input),
    ]) {
        recordsByKey.set(relationshipKey(record), record);
    }
    return [...recordsByKey.values()].sort(compareRelationshipRecords);
}

export function buildRelationshipDelta(input: BuildRelationshipDeltaInput): BuildRelationshipDeltaResult {
    const affectedFiles = new Set(input.changedFiles);
    const changedTargetNames = new Set<string>();
    const previousFilesByPath = new Map(
        input.previousRegistry.manifest.files.map((file) => [file.path, file]),
    );
    const previousAvailableFiles = new Set(previousFilesByPath.keys());
    const availableFiles = new Set(input.registry.manifest.files.map((file) => file.path));
    const changedPreviousTargetInstanceIds = new Set(
        input.previousRegistry.symbols
            .filter((symbol) => symbol.kind !== 'file' && input.changedFiles.has(symbol.file))
            .map((symbol) => symbol.symbolInstanceId),
    );
    for (const record of input.existingRecords) {
        if (record.targetInstanceId && changedPreviousTargetInstanceIds.has(record.targetInstanceId)) {
            affectedFiles.add(record.file);
        }
    }
    for (const symbol of [...input.previousRegistry.symbols, ...input.registry.symbols]) {
        if (symbol.kind !== 'file' && input.changedFiles.has(symbol.file)) {
            changedTargetNames.add(symbol.name);
        }
    }

    if (input.previousAnalysisByFile) {
        for (const [, evidence] of getEvidenceEntries(input.previousAnalysisByFile)) {
            for (const claim of evidence.resolutionClaims ?? []) {
                if (claim.dependencyKeys.some((dependencyKey) => (
                    [...input.changedFiles].some((file) => dependencyKey.startsWith(`${file}:`))
                ))) {
                    affectedFiles.add(claim.sourceFile);
                }
            }
        }
    }

    for (const file of input.registry.manifest.files) {
        if (affectedFiles.has(file.path)) continue;
        const evidence = getEvidence(input.analysisByFile, file.path);
        if (!evidence) continue;
        if (evidence.callSites.some((call) => changedTargetNames.has(call.calleeName))) {
            affectedFiles.add(file.path);
            continue;
        }
        const previousFile = previousFilesByPath.get(file.path);
        const language = previousFile?.language ?? file.language;
        const resolutionChanged = evidence.moduleBindings.some((binding) => {
            if ((binding.kind !== 'import' && binding.kind !== 'reexport') || !binding.moduleSpecifier) {
                return false;
            }
            const previousTarget = resolveModulePathForDelta(
                file.path,
                binding.moduleSpecifier,
                input.previousRegistry,
                language,
                previousAvailableFiles,
            );
            const nextTarget = resolveModulePathForDelta(
                file.path,
                binding.moduleSpecifier,
                input.registry,
                file.language,
                availableFiles,
            );
            return previousTarget !== nextTarget
                || (previousTarget !== undefined && input.changedFiles.has(previousTarget))
                || (nextTarget !== undefined && input.changedFiles.has(nextTarget));
        });
        if (resolutionChanged) affectedFiles.add(file.path);
    }

    const retained = input.existingRecords.filter((record) => !affectedFiles.has(record.file));
    const rebuilt = buildRelationshipsForRegistry({
        registry: input.registry,
        analysisByFile: input.analysisByFile,
        sourceFiles: affectedFiles,
    });
    const recordsByKey = new Map<string, RelationshipRecord>();
    for (const record of [...retained, ...rebuilt]) {
        recordsByKey.set(relationshipKey(record), record);
    }
    return {
        records: [...recordsByKey.values()].sort(compareRelationshipRecords),
        affectedFiles: [...affectedFiles].sort(compareStrings),
    };
}
