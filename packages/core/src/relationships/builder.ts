import type { CallSite, LanguageAnalysisResult, ModuleBinding } from '../language-analysis';
import { isLanguageCapabilitySupportedForLanguage } from '../language';
import { isCallableSymbolKind } from '../symbols';
import type { RelationshipRecord, SymbolRecord, SymbolRegistry } from '../symbols';
import type { PythonFlowFact, SourceSpan } from '../language-analysis';
import { isTestOrFixturePath } from './test-path';
import {
    dependencyKeyForCall,
    MAX_PYTHON_FLOW_HOPS,
    NATIVE_PYTHON_PROVIDER_ID,
    NATIVE_PYTHON_PROVIDER_VERSION,
    PYTHON_NATIVE_ENVIRONMENT_CONFIG_ID,
    type ResolutionClaim,
    type ResolutionProofStep,
    type ResolutionProofStepKind,
} from './resolution';

export type RelationshipAnalysisEvidence =
    Pick<LanguageAnalysisResult, 'moduleBindings' | 'callSites'>
    & Partial<Pick<LanguageAnalysisResult, 'receiverTypeBindings' | 'pythonFlowFacts'>>
    & {
        readonly resolutionClaims?: readonly ResolutionClaim[];
    };

export interface BuildCallRelationshipsForRegistryInput {
    registry: SymbolRegistry;
    analysisByFile: Map<string, RelationshipAnalysisEvidence> | Record<string, RelationshipAnalysisEvidence>;
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

function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function compareRelationshipRecords(a: RelationshipRecord, b: RelationshipRecord): number {
    if (a.file !== b.file) return compareStrings(a.file, b.file);
    const aLine = a.span?.startLine ?? 0;
    const bLine = b.span?.startLine ?? 0;
    if (aLine !== bLine) return aLine - bLine;
    const aStartByte = a.span?.startByte ?? 0;
    const bStartByte = b.span?.startByte ?? 0;
    if (aStartByte !== bStartByte) return aStartByte - bStartByte;
    const aEndByte = a.span?.endByte ?? 0;
    const bEndByte = b.span?.endByte ?? 0;
    if (aEndByte !== bEndByte) return aEndByte - bEndByte;
    const aStartColumn = a.span?.startColumn ?? 0;
    const bStartColumn = b.span?.startColumn ?? 0;
    if (aStartColumn !== bStartColumn) return aStartColumn - bStartColumn;
    const aEndColumn = a.span?.endColumn ?? 0;
    const bEndColumn = b.span?.endColumn ?? 0;
    if (aEndColumn !== bEndColumn) return aEndColumn - bEndColumn;
    if (a.sourceKey !== b.sourceKey) return compareStrings(a.sourceKey, b.sourceKey);
    return compareStrings(a.targetKey || '', b.targetKey || '');
}

function relationshipKey(record: RelationshipRecord): string {
    return [
        record.sourceInstanceId || record.sourceKey,
        record.targetInstanceId || record.targetKey || record.targetPath || '',
        record.type,
        record.file,
        record.span?.startLine ?? 0,
        record.span?.endLine ?? 0,
        record.span?.startByte ?? 0,
        record.span?.endByte ?? 0,
        record.span?.startColumn ?? 0,
        record.span?.endColumn ?? 0,
    ].join('\0');
}

function getEvidence(
    evidenceByFile: BuildRelationshipsForRegistryInput['analysisByFile'],
    file: string,
): RelationshipAnalysisEvidence | undefined {
    return evidenceByFile instanceof Map ? evidenceByFile.get(file) : evidenceByFile[file];
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

function resolveUnambiguousTarget(source: SymbolRecord, candidates: readonly SymbolRecord[]): SymbolRecord | undefined {
    const nonSelfCandidates = candidates.filter((candidate) => candidate.symbolInstanceId !== source.symbolInstanceId);
    const sameFileCandidates = nonSelfCandidates.filter((candidate) => candidate.file === source.file);
    if (sameFileCandidates.length === 1) return sameFileCandidates[0];
    if (sameFileCandidates.length > 1) return undefined;
    return nonSelfCandidates.length === 1 ? nonSelfCandidates[0] : undefined;
}

function buildTargetIndex(symbols: readonly SymbolRecord[]): Map<string, SymbolRecord[]> {
    const targets = new Map<string, SymbolRecord[]>();
    for (const symbol of symbols.filter((candidate) => candidate.kind !== 'file')) {
        const key = symbol.name;
        targets.set(key, [...(targets.get(key) ?? []), symbol]);
    }
    return targets;
}

function isSourceOwner(symbol: SymbolRecord): boolean {
    return isCallableSymbolKind(symbol.kind);
}

function isEligibleCallTarget(call: CallSite, symbol: SymbolRecord): boolean {
    if (call.kind === 'direct') {
        return isCallableSymbolKind(symbol.kind);
    }
    if (call.kind === 'constructor') {
        return symbol.kind === 'class';
    }
    return false;
}

function ownerForCall(fileSymbols: readonly SymbolRecord[], call: CallSite): SymbolRecord | undefined {
    const lineCandidates = fileSymbols.filter((symbol) => (
        isSourceOwner(symbol)
        && symbol.span.startLine <= call.span.startLine
        && symbol.span.endLine >= call.span.endLine
    ));
    const byteCandidates = lineCandidates.filter((symbol) => (
        symbol.span.startByte !== undefined
        && symbol.span.endByte !== undefined
        && symbol.span.startByte <= call.span.startByte
        && symbol.span.endByte >= call.span.endByte
    ));
    const candidates = byteCandidates.length > 0
        ? byteCandidates
        : lineCandidates.filter((symbol) => (
            symbol.span.startByte === undefined || symbol.span.endByte === undefined
        ));
    candidates.sort((a, b) => {
        if (
            a.span.startByte !== undefined
            && a.span.endByte !== undefined
            && b.span.startByte !== undefined
            && b.span.endByte !== undefined
        ) {
            const byteSize = (a.span.endByte - a.span.startByte) - (b.span.endByte - b.span.startByte);
            if (byteSize !== 0) return byteSize;
        }
        const aSize = a.span.endLine - a.span.startLine;
        const bSize = b.span.endLine - b.span.startLine;
        if (aSize !== bSize) return aSize - bSize;
        return compareStrings(a.symbolInstanceId, b.symbolInstanceId);
    });
    return candidates[0];
}

function symbolContains(container: SymbolRecord, nested: SymbolRecord): boolean {
    if (
        container.span.startByte !== undefined
        && container.span.endByte !== undefined
        && nested.span.startByte !== undefined
        && nested.span.endByte !== undefined
    ) {
        return container.span.startByte <= nested.span.startByte
            && container.span.endByte >= nested.span.endByte;
    }
    return container.span.startLine <= nested.span.startLine
        && container.span.endLine >= nested.span.endLine;
}

function compareContainingClasses(left: SymbolRecord, right: SymbolRecord): number {
    if (
        left.span.startByte !== undefined
        && left.span.endByte !== undefined
        && right.span.startByte !== undefined
        && right.span.endByte !== undefined
    ) {
        const byteSize = (left.span.endByte - left.span.startByte)
            - (right.span.endByte - right.span.startByte);
        if (byteSize !== 0) return byteSize;
    }
    const lineSize = (left.span.endLine - left.span.startLine)
        - (right.span.endLine - right.span.startLine);
    if (lineSize !== 0) return lineSize;
    return compareStrings(left.symbolInstanceId, right.symbolInstanceId);
}

function enclosingClassForSymbol(
    symbol: SymbolRecord,
    classesByFile: ReadonlyMap<string, readonly SymbolRecord[]>,
): SymbolRecord | undefined {
    return classesByFile.get(symbol.file)
        ?.filter((candidate) => symbolContains(candidate, symbol))
        .sort(compareContainingClasses)[0];
}

function buildClassIndex(symbols: readonly SymbolRecord[]): {
    byFile: Map<string, SymbolRecord[]>;
    byName: Map<string, SymbolRecord[]>;
} {
    const byFile = new Map<string, SymbolRecord[]>();
    const byName = new Map<string, SymbolRecord[]>();
    for (const symbol of symbols) {
        if (symbol.kind !== 'class') continue;
        byFile.set(symbol.file, [...(byFile.get(symbol.file) ?? []), symbol]);
        byName.set(symbol.name, [...(byName.get(symbol.name) ?? []), symbol]);
    }
    return { byFile, byName };
}

function resolveRelativeModulePath(
    sourceFile: string,
    specifier: string,
    registry: SymbolRegistry,
    language: string,
    availableFiles: ReadonlySet<string> = new Set(registry.manifest.files.map((file) => file.path)),
): string | undefined {
    if (!specifier.startsWith('.')) return undefined;
    const candidates = language === 'python'
        ? resolvePythonRelativeModuleCandidates(sourceFile, specifier)
        : resolveJsRelativeModuleCandidates(sourceFile, specifier);
    return candidates.find((candidate) => availableFiles.has(candidate));
}

function pythonModuleNameForPath(filePath: string): string | undefined {
    if (!filePath.endsWith('.py')) return undefined;
    const withoutExtension = filePath.slice(0, -'.py'.length);
    const packagePath = withoutExtension.endsWith('/__init__')
        ? withoutExtension.slice(0, -'/__init__'.length)
        : withoutExtension;
    return packagePath.replace(/\//g, '.');
}

function resolvePythonAbsoluteModulePath(
    specifier: string,
    registry: SymbolRegistry,
    availableFiles: ReadonlySet<string>,
): string | undefined {
    const normalizedSpecifier = specifier.trim().replace(/^\.+/, '');
    if (!normalizedSpecifier) return undefined;
    const matches = [...availableFiles]
        .filter((file) => {
            if (!registry.manifest.files.some((entry) => entry.path === file && entry.language === 'python')) {
                return false;
            }
            const moduleName = pythonModuleNameForPath(file);
            return moduleName === normalizedSpecifier
                || moduleName?.endsWith(`.${normalizedSpecifier}`) === true;
        })
        .sort(compareStrings);
    return matches.length === 1 ? matches[0] : undefined;
}

function resolvePythonModulePath(
    sourceFile: string,
    specifier: string,
    registry: SymbolRegistry,
    availableFiles: ReadonlySet<string>,
): string | undefined {
    return specifier.startsWith('.')
        ? resolveRelativeModulePath(sourceFile, specifier, registry, 'python', availableFiles)
        : resolvePythonAbsoluteModulePath(specifier, registry, availableFiles);
}

function pathJoinPosix(...parts: string[]): string | undefined {
    const segments: string[] = [];
    for (const segment of parts.filter(Boolean).join('/').split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            if (segments.length === 0) return undefined;
            segments.pop();
        } else {
            segments.push(segment);
        }
    }
    return segments.join('/');
}

function resolveJsRelativeModuleCandidates(sourceFile: string, specifier: string): string[] {
    const sourceDir = sourceFile.includes('/') ? sourceFile.slice(0, sourceFile.lastIndexOf('/')) : '';
    const basePath = pathJoinPosix(sourceDir, specifier);
    if (!basePath) return [];
    const runtimeExtensionSubstitutions: Record<string, string[]> = {
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
        '.mjs': ['.mts', '.mjs'],
        '.cjs': ['.cts', '.cjs'],
    };
    const explicitRuntimeExtension = Object.keys(runtimeExtensionSubstitutions)
        .find((extension) => basePath.endsWith(extension));
    if (explicitRuntimeExtension) {
        const withoutExtension = basePath.slice(0, -explicitRuntimeExtension.length);
        return runtimeExtensionSubstitutions[explicitRuntimeExtension]
            .map((extension) => `${withoutExtension}${extension}`);
    }
    return [
        basePath,
        ...['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].map((extension) => `${basePath}.${extension}`),
        ...['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']
            .map((extension) => pathJoinPosix(basePath, `index.${extension}`))
            .filter((candidate): candidate is string => candidate !== undefined),
    ];
}

function resolvePythonRelativeModuleCandidates(sourceFile: string, specifier: string): string[] {
    let leadingDots = 0;
    while (specifier[leadingDots] === '.') leadingDots += 1;
    if (leadingDots === 0) return [];
    const sourceDir = sourceFile.includes('/') ? sourceFile.slice(0, sourceFile.lastIndexOf('/')) : '';
    const baseParts = sourceDir ? sourceDir.split('/') : [];
    const parentLevels = Math.max(0, leadingDots - 1);
    if (leadingDots > baseParts.length) return [];
    const keptParts = baseParts.slice(0, baseParts.length - parentLevels);
    const modulePath = specifier.slice(leadingDots).replace(/\./g, '/');
    const moduleBase = pathJoinPosix(...keptParts, modulePath);
    if (!moduleBase) return [];
    const packageCandidate = pathJoinPosix(moduleBase, '__init__.py');
    return [`${moduleBase}.py`, ...(packageCandidate ? [packageCandidate] : [])];
}

function relationshipSpan(binding: ModuleBinding | CallSite): RelationshipRecord['span'] {
    return { ...binding.span };
}

function spansEqual(
    left: CallSite['span'] | undefined,
    right: CallSite['span'] | undefined,
): boolean {
    return Boolean(left && right
        && left.startLine === right.startLine
        && left.endLine === right.endLine
        && left.startByte === right.startByte
        && left.endByte === right.endByte
        && left.startColumn === right.startColumn
        && left.endColumn === right.endColumn);
}

function resolvePythonClassReference(input: {
    classReference: string;
    source: SymbolRecord;
    evidence: RelationshipAnalysisEvidence;
    registry: SymbolRegistry;
    classesByName: ReadonlyMap<string, readonly SymbolRecord[]>;
    availableFiles: ReadonlySet<string>;
}): SymbolRecord | undefined {
    const classCandidatesById = new Map<string, SymbolRecord>();
    for (const candidate of input.classesByName.get(input.classReference) ?? []) {
        if (candidate.file === input.source.file) {
            classCandidatesById.set(candidate.symbolInstanceId, candidate);
        }
    }
    for (const binding of input.evidence.moduleBindings) {
        if (
            (binding.kind !== 'import' && binding.kind !== 'reexport')
            || !binding.moduleSpecifier
            || !binding.importedName
            || binding.localName !== input.classReference
        ) {
            continue;
        }
        const importedFile = resolvePythonModulePath(
            input.source.file,
            binding.moduleSpecifier,
            input.registry,
            input.availableFiles,
        );
        if (!importedFile) continue;
        for (const candidate of input.classesByName.get(binding.importedName) ?? []) {
            if (candidate.file === importedFile) {
                classCandidatesById.set(candidate.symbolInstanceId, candidate);
            }
        }
    }
    const classCandidates = [...classCandidatesById.values()];
    return classCandidates.length === 1 ? classCandidates[0] : undefined;
}

function resolvePythonDirectTarget(input: {
    call: CallSite;
    source: SymbolRecord;
    candidates: readonly SymbolRecord[];
    evidence: RelationshipAnalysisEvidence;
    registry: SymbolRegistry;
    availableFiles: ReadonlySet<string>;
}): SymbolRecord | undefined {
    if (input.source.language !== 'python') {
        return resolveUnambiguousTarget(
            input.source,
            input.candidates.filter((candidate) => isEligibleCallTarget(input.call, candidate)),
        );
    }

    const eligible = input.candidates.filter((candidate) => isEligibleCallTarget(input.call, candidate));
    const importedBindings = input.evidence.moduleBindings.filter((binding) => (
        (binding.kind === 'import' || binding.kind === 'reexport')
        && Boolean(binding.moduleSpecifier)
        && Boolean(binding.importedName)
        && binding.localName === input.call.calleeName
    ));
    if (importedBindings.length > 0) {
        const importedTargets = new Map<string, SymbolRecord>();
        for (const binding of importedBindings) {
            const importedFile = resolvePythonModulePath(
                input.source.file,
                binding.moduleSpecifier!,
                input.registry,
                input.availableFiles,
            );
            if (!importedFile) continue;
            for (const candidate of eligible) {
                if (candidate.file === importedFile && candidate.name === binding.importedName) {
                    importedTargets.set(candidate.symbolInstanceId, candidate);
                }
            }
        }
        const targets = [...importedTargets.values()];
        return targets.length === 1 ? targets[0] : undefined;
    }

    const sameFile = eligible.filter((candidate) => candidate.file === input.source.file);
    if (sameFile.length === 1) return sameFile[0];
    // A cross-file Python call without an exact import binding has no provider
    // proof. Do not turn a unique repository-wide name into an authority.
    return undefined;
}

function resolvePythonMemberTarget(input: {
    call: CallSite;
    source: SymbolRecord;
    candidates: readonly SymbolRecord[];
    evidence: RelationshipAnalysisEvidence;
    registry: SymbolRegistry;
    classesByFile: ReadonlyMap<string, readonly SymbolRecord[]>;
    classesByName: ReadonlyMap<string, readonly SymbolRecord[]>;
    availableFiles: ReadonlySet<string>;
}): SymbolRecord | undefined {
    if (
        input.call.kind !== 'member'
        || input.source.language !== 'python'
        || !input.call.receiverText
    ) {
        return undefined;
    }

    const receiver = input.call.receiverText.trim();
    if (input.call.qualifiedCallee?.trim() !== `${receiver}.${input.call.calleeName}`) {
        return undefined;
    }

    let targetClass: SymbolRecord | undefined;
    if (receiver === 'self' || receiver === 'cls') {
        if (input.source.kind !== 'method') return undefined;
        targetClass = enclosingClassForSymbol(input.source, input.classesByFile);
    } else {
        const fileSymbols = input.registry.symbolsByFile.get(input.source.file) ?? [];
        let classReference: string | undefined;
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(receiver)) {
            const scopedBindings = (input.evidence.receiverTypeBindings ?? []).filter((binding) => (
                binding.localName === receiver
                && ownerForCall(fileSymbols, { calleeName: '', span: binding.span })?.symbolInstanceId
                    === input.source.symbolInstanceId
            ));
            const annotatedTypes = new Set(
                scopedBindings
                    .filter((binding) => binding.kind === 'parameter_annotation')
                    .map((binding) => binding.typeName),
            );
            const localBindings = scopedBindings.filter((binding) => binding.kind === 'local_constructor');
            const localTypes = new Set(localBindings.map((binding) => binding.typeName));
            if (annotatedTypes.size + localTypes.size > 1) return undefined;
            const preceding = localBindings
                .filter((binding) => (
                    binding.span.endByte <= input.call.span.startByte
                    && spansEqual(binding.statementBlockSpan, input.call.statementBlockSpan)
                    && !localBindings.some((other) => (
                        other.span.startByte > binding.span.endByte
                        && other.span.endByte <= input.call.span.startByte
                    ))
                ))
                .sort((left, right) => right.span.endByte - left.span.endByte)[0];
            const importedClassBindings = input.evidence.moduleBindings.filter((binding) => (
                (binding.kind === 'import' || binding.kind === 'reexport')
                && Boolean(binding.moduleSpecifier)
                && Boolean(binding.importedName)
                && binding.localName === receiver
            ));
            if (importedClassBindings.length > 1) return undefined;
            classReference = [...annotatedTypes][0]
                ?? (preceding && localTypes.size === 1 ? preceding.typeName : undefined)
                ?? (importedClassBindings.length === 1 ? receiver : undefined)
                ?? ((input.classesByName.get(receiver) ?? []).some((candidate) => candidate.file === input.source.file)
                    ? receiver
                    : undefined);
        } else if (/^self\.[A-Za-z_][A-Za-z0-9_]*$/.test(receiver) && input.source.kind === 'method') {
            const sourceClass = enclosingClassForSymbol(input.source, input.classesByFile);
            if (!sourceClass) return undefined;
            const fieldBindings = (input.evidence.receiverTypeBindings ?? []).filter((binding) => {
                if (binding.kind !== 'self_field_constructor' || binding.localName !== receiver) return false;
                const bindingOwner = ownerForCall(fileSymbols, { calleeName: '', span: binding.span });
                return bindingOwner?.kind === 'method'
                    && bindingOwner.name === '__init__'
                    && enclosingClassForSymbol(bindingOwner, input.classesByFile)?.symbolInstanceId
                        === sourceClass.symbolInstanceId;
            });
            const fieldTypes = new Set(fieldBindings.map((binding) => binding.typeName));
            if (fieldBindings.length === 0 || fieldTypes.size !== 1) return undefined;
            [classReference] = fieldTypes;
        } else {
            return undefined;
        }
        if (!classReference) return undefined;
        targetClass = resolvePythonClassReference({
            classReference,
            source: input.source,
            evidence: input.evidence,
            registry: input.registry,
            classesByName: input.classesByName,
            availableFiles: input.availableFiles,
        });
    }
    if (!targetClass) return undefined;

    const matchingMembers = input.candidates.filter((candidate) => (
        candidate.kind === 'method'
        && candidate.symbolInstanceId !== input.source.symbolInstanceId
        && enclosingClassForSymbol(candidate, input.classesByFile)?.symbolInstanceId
            === targetClass.symbolInstanceId
    ));
    return matchingMembers.length === 1 ? matchingMembers[0] : undefined;
}

interface PythonFlowContext {
    readonly registry: SymbolRegistry;
    readonly analysisByFile: BuildRelationshipsForRegistryInput['analysisByFile'];
    readonly targetIndex: ReadonlyMap<string, readonly SymbolRecord[]>;
    readonly classesByFile: ReadonlyMap<string, readonly SymbolRecord[]>;
    readonly classesByName: ReadonlyMap<string, readonly SymbolRecord[]>;
    readonly availableFiles: ReadonlySet<string>;
    readonly classBasesByName: ReadonlyMap<string, readonly string[]>;
}

interface PythonValueOrigin {
    readonly kind: 'instance' | 'callable';
    readonly typeNames: readonly string[];
    readonly targetIds: readonly string[];
    readonly flowHops: number;
    readonly proofSteps: readonly ResolutionProofStep[];
    readonly dependencyKeys: readonly string[];
}

interface PythonFlowResolution {
    readonly target?: SymbolRecord;
    readonly decision: 'resolved' | 'unresolved' | 'ambiguous';
    readonly proofSteps: readonly ResolutionProofStep[];
    readonly flowHops: number;
    readonly dependencyKeys: readonly string[];
}

function spanContainsSpan(container: SourceSpan, nested: SourceSpan): boolean {
    return container.startByte <= nested.startByte && container.endByte >= nested.endByte;
}

function spanIdentity(span: SourceSpan | undefined): string {
    return span
        ? [span.startByte, span.endByte, span.startLine, span.endLine].join(':')
        : '';
}

function callableForContext(
    registry: SymbolRegistry,
    file: string,
    contextSpan: SourceSpan,
): SymbolRecord | undefined {
    return (registry.symbolsByFile.get(file) ?? [])
        .filter((symbol) => isSourceOwner(symbol) && spanContainsSpan(symbol.span as SourceSpan, contextSpan))
        .sort((left, right) => {
            const leftSize = left.span.endByte !== undefined && left.span.startByte !== undefined
                ? left.span.endByte - left.span.startByte
                : left.span.endLine - left.span.startLine;
            const rightSize = right.span.endByte !== undefined && right.span.startByte !== undefined
                ? right.span.endByte - right.span.startByte
                : right.span.endLine - right.span.startLine;
            return leftSize - rightSize;
        })[0];
}

function factBelongsToContext(
    registry: SymbolRegistry,
    file: string,
    fact: PythonFlowFact,
    context: SymbolRecord | undefined,
): boolean {
    if (!context) {
        return !(registry.symbolsByFile.get(file) ?? []).some((symbol) => (
            isSourceOwner(symbol) && spanContainsSpan(symbol.span as SourceSpan, fact.contextSpan)
        ));
    }
    return spanContainsSpan(context.span as SourceSpan, fact.contextSpan);
}

function pythonFactsForFile(
    context: PythonFlowContext,
    file: string,
): readonly PythonFlowFact[] {
    return getEvidence(context.analysisByFile, file)?.pythonFlowFacts ?? [];
}

function normalizePythonExpression(value: string): string {
    return value.replace(/\s+/g, ' ').trim().replace(/^\((.*)\)$/, '$1').trim();
}

function simplePythonName(value: string): string | undefined {
    const normalized = normalizePythonExpression(value);
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized) ? normalized : undefined;
}

function pythonMemberExpression(value: string): { receiver: string; member: string } | undefined {
    const normalized = normalizePythonExpression(value);
    const match = /^(?<receiver>[A-Za-z_][A-Za-z0-9_.]*)\.(?<member>[A-Za-z_][A-Za-z0-9_]*)$/.exec(normalized);
    return match?.groups?.receiver && match.groups.member
        ? { receiver: match.groups.receiver, member: match.groups.member }
        : undefined;
}

function pythonConstructorExpression(value: string): string | undefined {
    const normalized = normalizePythonExpression(value);
    const match = /^(?<typeName>[A-Za-z_][A-Za-z0-9_.]*)\s*\(/.exec(normalized);
    return match?.groups?.typeName?.split('.').at(-1);
}

function originIdentity(origin: PythonValueOrigin): string {
    return JSON.stringify([
        origin.kind,
        [...origin.typeNames].sort(),
        [...origin.targetIds].sort(),
    ]);
}

function flowDependencyKey(file: string, span: SourceSpan, subject: string): string {
    return `${file}:${span.startByte}:${span.endByte}:${subject}`;
}

function deduplicateOrigins(origins: readonly PythonValueOrigin[]): PythonValueOrigin[] {
    const byIdentity = new Map<string, PythonValueOrigin>();
    for (const origin of origins) {
        const identity = originIdentity(origin);
        const existing = byIdentity.get(identity);
        if (!existing || origin.flowHops < existing.flowHops) {
            byIdentity.set(identity, origin);
        } else if (origin.flowHops === existing.flowHops) {
            byIdentity.set(identity, {
                ...existing,
                dependencyKeys: [...new Set([...existing.dependencyKeys, ...origin.dependencyKeys])],
            });
        }
    }
    return [...byIdentity.values()];
}

function classBasesFor(
    className: string,
    classBasesByName: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
    return classBasesByName.get(className) ?? [];
}

function classNamesWithBases(
    typeNames: readonly string[],
    classBasesByName: ReadonlyMap<string, readonly string[]>,
): Set<string> {
    const names = new Set(typeNames);
    let changed = true;
    while (changed) {
        changed = false;
        for (const className of [...names]) {
            for (const baseName of classBasesFor(className, classBasesByName)) {
                if (!names.has(baseName)) {
                    names.add(baseName);
                    changed = true;
                }
            }
        }
    }
    return names;
}

function runtimeReceiverTypeNames(
    owner: SymbolRecord,
    classesByFile: ReadonlyMap<string, readonly SymbolRecord[]>,
    classesByName: ReadonlyMap<string, readonly SymbolRecord[]>,
    classBasesByName: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
    const enclosingClass = enclosingClassForSymbol(owner, classesByFile);
    if (!enclosingClass) return [];
    const possible = [...classesByName.values()]
        .flat()
        .filter((candidate) => {
            const inherited = classNamesWithBases([candidate.name], classBasesByName);
            return candidate.name === enclosingClass.name || inherited.has(enclosingClass.name);
        })
        .map((candidate) => candidate.name);
    return [...new Set(possible)].sort(compareStrings);
}

function appendFlowHop(
    origin: PythonValueOrigin,
    kind: ResolutionProofStepKind,
    subject: string,
    span: SourceSpan,
    dependencyKey?: string,
): PythonValueOrigin | undefined {
    const hop = origin.flowHops + 1;
    if (hop > MAX_PYTHON_FLOW_HOPS) return undefined;
    return {
        ...origin,
        flowHops: hop,
        proofSteps: [
            ...origin.proofSteps,
            { kind: 'flow_hop', subject, span, hop },
            { kind, subject, span },
        ],
        dependencyKeys: dependencyKey
            ? [...new Set([...origin.dependencyKeys, dependencyKey])]
            : origin.dependencyKeys,
    };
}

function exactPythonCallableTargets(
    context: PythonFlowContext,
    file: string,
    calleeText: string,
): SymbolRecord[] {
    const simpleName = calleeText.split('.').at(-1);
    if (!simpleName) return [];
    const evidence = getEvidence(context.analysisByFile, file);
    if (!evidence) return [];
    const imported = evidence.moduleBindings.filter((binding) => (
        (binding.kind === 'import' || binding.kind === 'reexport')
        && binding.localName === simpleName
        && Boolean(binding.importedName)
        && Boolean(binding.moduleSpecifier)
    ));
    const importedTargets = new Map<string, SymbolRecord>();
    for (const binding of imported) {
        const importedFile = resolvePythonModulePath(
            file,
            binding.moduleSpecifier!,
            context.registry,
            context.availableFiles,
        );
        if (!importedFile) continue;
        for (const candidate of context.targetIndex.get(binding.importedName!) ?? []) {
            if (
                candidate.file === importedFile
                && isSourceOwner(candidate)
                && candidate.name === binding.importedName
            ) {
                importedTargets.set(candidate.symbolInstanceId, candidate);
            }
        }
    }
    if (imported.length > 0) return [...importedTargets.values()];

    const sameFile = (context.registry.symbolsByFile.get(file) ?? [])
        .filter((candidate) => isSourceOwner(candidate) && candidate.name === simpleName);
    if (sameFile.length > 0) return sameFile;
    return [];
}

function resolvePythonParameterOrigins(
    context: PythonFlowContext,
    target: SymbolRecord,
    parameterName: string,
    stack: ReadonlySet<string>,
): PythonValueOrigin[] {
    const targetKey = `${target.symbolInstanceId}:${parameterName}`;
    if (stack.has(targetKey)) return [];
    const nextStack = new Set(stack);
    nextStack.add(targetKey);
    const origins: PythonValueOrigin[] = [];
    for (const [file, evidence] of getEvidenceEntries(context.analysisByFile)) {
        for (const fact of evidence.pythonFlowFacts ?? []) {
            if (fact.kind !== 'call_argument' || fact.argumentName !== parameterName) continue;
            const calledTargets = exactPythonCallableTargets(context, file, fact.calleeText);
            if (!calledTargets.some((candidate) => candidate.symbolInstanceId === target.symbolInstanceId)) continue;
            const caller = callableForContext(context.registry, file, fact.contextSpan);
            if (!caller) continue;
            const valueOrigins = resolvePythonExpressionOrigins(
                context,
                file,
                caller,
                fact.valueText,
                fact.span,
                nextStack,
            );
            for (const origin of valueOrigins) {
                const transferred = appendFlowHop(
                    origin,
                    'callback_origin',
                    `${target.name}.${parameterName}`,
                    fact.span,
                    flowDependencyKey(file, fact.span, `${target.name}.${parameterName}`),
                );
                if (transferred) origins.push(transferred);
            }
        }
    }
    return deduplicateOrigins(origins);
}

function resolvePythonFieldOrigins(
    context: PythonFlowContext,
    receiverTypeNames: readonly string[],
    memberName: string,
    stack: ReadonlySet<string>,
): PythonValueOrigin[] {
    const origins: PythonValueOrigin[] = [];
    for (const [file, evidence] of getEvidenceEntries(context.analysisByFile)) {
        for (const fact of evidence.pythonFlowFacts ?? []) {
            if (fact.kind !== 'assignment_origin') continue;
            const member = pythonMemberExpression(fact.targetText);
            if (!member || member.member !== memberName) continue;
            const assignmentContext = callableForContext(context.registry, file, fact.contextSpan);
            const receiverOrigins = resolvePythonExpressionOrigins(
                context,
                file,
                assignmentContext,
                member.receiver,
                fact.span,
                stack,
            );
            if (!receiverOrigins.some((origin) => (
                origin.kind === 'instance'
                && origin.typeNames.some((typeName) => receiverTypeNames.includes(typeName))
            ))) continue;
            const valueOrigins = resolvePythonExpressionOrigins(
                context,
                file,
                assignmentContext,
                fact.valueText,
                fact.span,
                stack,
            );
            for (const origin of valueOrigins) {
                const transferred = appendFlowHop(
                    origin,
                    'field_origin',
                    fact.targetText,
                    fact.span,
                    flowDependencyKey(file, fact.span, fact.targetText),
                );
                if (transferred) origins.push(transferred);
            }
        }
    }
    return deduplicateOrigins(origins);
}

function resolvePythonExpressionOrigins(
    context: PythonFlowContext,
    file: string,
    owner: SymbolRecord | undefined,
    expression: string,
    atSpan: SourceSpan,
    stack: ReadonlySet<string>,
): PythonValueOrigin[] {
    const normalized = normalizePythonExpression(expression);
    if (!normalized) return [];
    if (normalized === 'self' || normalized === 'cls') {
        if (!owner) return [];
        const typeNames = runtimeReceiverTypeNames(
            owner,
            context.classesByFile,
            context.classesByName,
            context.classBasesByName,
        );
        return typeNames.length > 0
            ? [{
                kind: 'instance',
                typeNames,
                targetIds: [],
                flowHops: 0,
                proofSteps: [{ kind: 'allocation_origin', subject: normalized, span: atSpan }],
                dependencyKeys: [],
            }]
            : [];
    }

    const constructorTypeName = pythonConstructorExpression(normalized);
    if (constructorTypeName) {
        if (!owner) return [];
        const constructorTarget = resolvePythonClassReference({
            classReference: constructorTypeName,
            source: owner,
            evidence: getEvidence(context.analysisByFile, file) ?? {
                moduleBindings: [],
                callSites: [],
            },
            registry: context.registry,
            classesByName: context.classesByName,
            availableFiles: context.availableFiles,
        });
        if (!constructorTarget) return [];
        return [{
            kind: 'instance',
            typeNames: [constructorTarget.name],
            targetIds: [],
            flowHops: 0,
            proofSteps: [{
                kind: 'constructor_origin',
                subject: constructorTarget.qualifiedName,
                detail: 'exact constructor binding',
                span: atSpan,
            }],
            dependencyKeys: [],
        }];
    }

    const simpleName = simplePythonName(normalized);
    if (simpleName) {
        const localFacts = pythonFactsForFile(context, file)
            .filter((fact): fact is Extract<PythonFlowFact, { kind: 'assignment_origin' }> => (
                fact.kind === 'assignment_origin'
                && fact.targetText === simpleName
                && factBelongsToContext(context.registry, file, fact, owner)
                && fact.span.endByte <= atSpan.startByte
            ))
            .sort((left, right) => right.span.endByte - left.span.endByte);
        const latest = localFacts[0];
        if (latest) {
            const origins = resolvePythonExpressionOrigins(context, file, owner, latest.valueText, latest.span, stack);
            return origins
                .map((origin) => appendFlowHop(
                    origin,
                    'allocation_origin',
                    latest.targetText,
                    latest.span,
                    flowDependencyKey(file, latest.span, latest.targetText),
                ))
                .filter((origin): origin is PythonValueOrigin => origin !== undefined);
        }
        if (owner) {
            const origins = resolvePythonParameterOrigins(context, owner, simpleName, stack);
            if (origins.length > 0) return origins;
        }
        return [];
    }

    const member = pythonMemberExpression(normalized);
    if (!member) return [];
    const receiverOrigins = resolvePythonExpressionOrigins(context, file, owner, member.receiver, atSpan, stack);
    if (receiverOrigins.length === 0) return [];
    const origins: PythonValueOrigin[] = [];
    for (const receiverOrigin of receiverOrigins) {
        if (receiverOrigin.kind !== 'instance') continue;
        const fieldOrigins = resolvePythonFieldOrigins(
            context,
            receiverOrigin.typeNames,
            member.member,
            stack,
        );
        origins.push(...fieldOrigins);
        const inheritedClassNames = classNamesWithBases(
            receiverOrigin.typeNames,
            context.classBasesByName,
        );
        const targets = [...(context.targetIndex.get(member.member) ?? [])].filter((candidate) => {
            if (!isSourceOwner(candidate)) return false;
            const candidateClass = enclosingClassForSymbol(candidate, context.classesByFile);
            return candidateClass !== undefined && inheritedClassNames.has(candidateClass.name);
        });
        const uniqueTargets = new Map(targets.map((target) => [target.symbolInstanceId, target]));
        if (uniqueTargets.size > 0) {
            origins.push({
                kind: 'callable',
                typeNames: receiverOrigin.typeNames,
                targetIds: [...uniqueTargets.keys()],
                flowHops: receiverOrigin.flowHops,
                proofSteps: [
                    ...receiverOrigin.proofSteps,
                    { kind: 'field_origin', subject: member.member, span: atSpan },
                ],
                dependencyKeys: receiverOrigin.dependencyKeys,
            });
        }
    }
    return deduplicateOrigins(origins);
}

function getEvidenceEntries(
    evidenceByFile: BuildRelationshipsForRegistryInput['analysisByFile'],
): Array<[string, RelationshipAnalysisEvidence]> {
    return evidenceByFile instanceof Map
        ? [...evidenceByFile.entries()]
        : Object.entries(evidenceByFile);
}

function resolvePythonServiceMemberTarget(input: {
    call: CallSite;
    source: SymbolRecord;
    evidence: RelationshipAnalysisEvidence;
    context: PythonFlowContext;
}): PythonFlowResolution | undefined {
    if (
        input.source.language !== 'python'
        || input.call.kind !== 'member'
        || !input.call.receiverText
    ) return undefined;
    const receiverParts = input.call.receiverText.trim().split('.');
    const rootReceiver = receiverParts[0];
    if (!rootReceiver || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(rootReceiver)) return undefined;
    const parameterBindings = (input.evidence.receiverTypeBindings ?? []).filter((binding) => (
        binding.kind === 'parameter_annotation'
        && binding.localName === rootReceiver
        && ownerForCall(
            input.context.registry.symbolsByFile.get(input.source.file) ?? [],
            { calleeName: '', span: binding.span },
        )?.symbolInstanceId === input.source.symbolInstanceId
    ));
    const typeNames = [...new Set(parameterBindings.map((binding) => binding.typeName))];
    if (typeNames.length !== 1) return undefined;
    const serviceType = typeNames[0];
    const fieldName = receiverParts.length === 1 ? input.call.calleeName : receiverParts[1];
    if (!fieldName) return undefined;

    const allocationOrigins: PythonValueOrigin[] = [];
    const allocationDependencyKeys: string[] = [];
    let sawAllocation = false;
    const allocationSteps: ResolutionProofStep[] = [{
        kind: 'parameter_annotation',
        subject: `${rootReceiver}:${serviceType}`,
        span: parameterBindings[0].span,
    }];
    for (const [file, evidence] of getEvidenceEntries(input.context.analysisByFile)) {
        for (const fact of evidence.pythonFlowFacts ?? []) {
            if (
                fact.kind !== 'call_argument'
                || fact.calleeText.split('.').at(-1) !== serviceType
                || fact.argumentName !== fieldName
            ) continue;
            sawAllocation = true;
            allocationDependencyKeys.push(flowDependencyKey(file, fact.span, `${serviceType}.${fieldName}`));
            const allocationContext = callableForContext(input.context.registry, file, fact.contextSpan);
            const origins = resolvePythonExpressionOrigins(
                input.context,
                file,
                allocationContext,
                fact.valueText,
                fact.span,
                new Set(),
            );
            for (const origin of origins) {
                const allocationOrigin = appendFlowHop(
                    origin,
                    'allocation_origin',
                    `${serviceType}.${fieldName}`,
                    fact.span,
                    flowDependencyKey(file, fact.span, `${serviceType}.${fieldName}`),
                );
                if (allocationOrigin) allocationOrigins.push(allocationOrigin);
            }
            allocationSteps.push({ kind: 'allocation_origin', subject: `${serviceType}.${fieldName}`, span: fact.span });
        }
    }
    const origins = deduplicateOrigins(allocationOrigins);
    if (!sawAllocation) return undefined;
    if (origins.length === 0) {
        return {
            decision: 'unresolved',
            proofSteps: [
                ...allocationSteps,
                { kind: 'unresolved_dependency', subject: `${serviceType}.${fieldName}` },
            ],
            flowHops: MAX_PYTHON_FLOW_HOPS,
            dependencyKeys: [...new Set(allocationDependencyKeys)],
        };
    }

    const targets = new Map<string, SymbolRecord>();
    const proofSteps = [...allocationSteps];
    for (const origin of origins) {
        proofSteps.push(...origin.proofSteps);
        if (receiverParts.length > 2) continue;
        if (origin.kind === 'callable') {
            for (const targetId of origin.targetIds) {
                const target = input.context.registry.symbolsByInstanceId.get(targetId);
                if (target?.name === input.call.calleeName) targets.set(target.symbolInstanceId, target);
            }
            continue;
        }
        const inherited = classNamesWithBases(origin.typeNames, input.context.classBasesByName);
        for (const target of input.context.targetIndex.get(input.call.calleeName) ?? []) {
            if (!isSourceOwner(target)) continue;
            const targetClass = enclosingClassForSymbol(target, input.context.classesByFile);
            if (targetClass && inherited.has(targetClass.name)) targets.set(target.symbolInstanceId, target);
        }
    }
    if (targets.size > 1) {
        return {
            decision: 'ambiguous',
            proofSteps: [...proofSteps, { kind: 'ambiguity', subject: `${serviceType}.${fieldName}.${input.call.calleeName}` }],
            flowHops: Math.max(...origins.map((origin) => origin.flowHops)),
            dependencyKeys: [...new Set(origins.flatMap((origin) => origin.dependencyKeys))],
        };
    }
    const target = [...targets.values()][0];
    return {
        target,
        decision: target ? 'resolved' : 'unresolved',
        proofSteps: target
            ? proofSteps
            : [...proofSteps, { kind: 'unresolved_dependency', subject: `${serviceType}.${fieldName}.${input.call.calleeName}` }],
        flowHops: Math.max(...origins.map((origin) => origin.flowHops)),
        dependencyKeys: [...new Set(origins.flatMap((origin) => origin.dependencyKeys))],
    };
}

function resolvePythonOriginMemberTarget(input: {
    call: CallSite;
    source: SymbolRecord;
    context: PythonFlowContext;
}): PythonFlowResolution | undefined {
    if (
        input.source.language !== 'python'
        || input.call.kind !== 'member'
        || !input.call.receiverText
    ) return undefined;
    const origins = resolvePythonExpressionOrigins(
        input.context,
        input.source.file,
        input.source,
        input.call.receiverText,
        input.call.span,
        new Set(),
    );
    if (origins.length === 0) return undefined;

    const targets = new Map<string, SymbolRecord>();
    const proofSteps: ResolutionProofStep[] = [];
    for (const origin of origins) {
        proofSteps.push(...origin.proofSteps);
        for (const targetId of origin.targetIds) {
            const target = input.context.registry.symbolsByInstanceId.get(targetId);
            if (target?.name === input.call.calleeName) targets.set(target.symbolInstanceId, target);
        }
        if (origin.kind !== 'instance') continue;
        const inheritedClassNames = classNamesWithBases(
            origin.typeNames,
            input.context.classBasesByName,
        );
        for (const target of input.context.targetIndex.get(input.call.calleeName) ?? []) {
            if (!isSourceOwner(target) || target.symbolInstanceId === input.source.symbolInstanceId) continue;
            const targetClass = enclosingClassForSymbol(target, input.context.classesByFile);
            if (!targetClass || !inheritedClassNames.has(targetClass.name)) continue;
            if (!origin.typeNames.includes(targetClass.name)) {
                proofSteps.push({
                    kind: 'class_inheritance',
                    subject: `${origin.typeNames.join('|')} -> ${targetClass.name}`,
                    span: targetClass.span as SourceSpan,
                });
            }
            targets.set(target.symbolInstanceId, target);
        }
    }
    const uniqueProofSteps = proofSteps.filter((step, index, steps) => (
        steps.findIndex((candidate) => (
            candidate.kind === step.kind
            && candidate.subject === step.subject
            && spanIdentity(candidate.span as SourceSpan | undefined) === spanIdentity(step.span as SourceSpan | undefined)
        )) === index
    ));
    if (targets.size > 1) {
        return {
            decision: 'ambiguous',
            proofSteps: [...uniqueProofSteps, { kind: 'ambiguity', subject: `${input.call.receiverText}.${input.call.calleeName}` }],
            flowHops: Math.max(...origins.map((origin) => origin.flowHops)),
            dependencyKeys: [...new Set(origins.flatMap((origin) => origin.dependencyKeys))],
        };
    }
    const target = [...targets.values()][0];
    return {
        target,
        decision: target ? 'resolved' : 'unresolved',
        proofSteps: target
            ? uniqueProofSteps
            : [...uniqueProofSteps, { kind: 'unresolved_dependency', subject: `${input.call.receiverText}.${input.call.calleeName}` }],
        flowHops: Math.max(...origins.map((origin) => origin.flowHops)),
        dependencyKeys: [...new Set(origins.flatMap((origin) => origin.dependencyKeys))],
    };
}

function buildPythonClassBases(
    analysisByFile: BuildRelationshipsForRegistryInput['analysisByFile'],
): Map<string, string[]> {
    const byClass = new Map<string, Map<string, Set<string>>>();
    for (const [file, evidence] of getEvidenceEntries(analysisByFile)) {
        for (const fact of evidence.pythonFlowFacts ?? []) {
            if (fact.kind !== 'class_bases') continue;
            const byFile = byClass.get(fact.className) ?? new Map<string, Set<string>>();
            const existing = byFile.get(file) ?? new Set<string>();
            for (const baseName of fact.baseNames) existing.add(baseName);
            byFile.set(file, existing);
            byClass.set(fact.className, byFile);
        }
    }
    const bases = new Map<string, string[]>();
    for (const [className, byFile] of byClass) {
        // A type-only origin cannot safely select between same-named classes
        // from different modules. Retain inheritance only when its definition
        // is unique in the indexed snapshot.
        if (byFile.size !== 1) continue;
        bases.set(className, [...(byFile.values().next().value as Set<string>)].sort(compareStrings));
    }
    return bases;
}

function appendClaim(
    claimsByFile: Map<string, ResolutionClaim[]>,
    file: string,
    claim: ResolutionClaim,
): void {
    claimsByFile.set(file, [...(claimsByFile.get(file) ?? []), claim]);
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

function pythonFallbackProofSteps(input: {
    call: CallSite;
    source: SymbolRecord;
    evidence: RelationshipAnalysisEvidence;
    registry: SymbolRegistry;
    target: SymbolRecord;
}): ResolutionProofStep[] {
    if (input.source.language !== 'python') return [];

    const proof: ResolutionProofStep[] = [];
    const fileSymbols = input.registry.symbolsByFile.get(input.source.file) ?? [];
    const receiverBindings = input.evidence.receiverTypeBindings ?? [];
    const receiver = input.call.receiverText?.trim();
    if (input.call.kind === 'member' && receiver) {
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(receiver)) {
            const scopedBindings = receiverBindings.filter((binding) => (
                binding.localName === receiver
                && ownerForCall(
                    fileSymbols,
                    { calleeName: '', span: binding.span },
                )?.symbolInstanceId === input.source.symbolInstanceId
            ));
            if (scopedBindings.length > 0) {
                const annotatedTypes = [...new Set(scopedBindings
                    .filter((binding) => binding.kind === 'parameter_annotation')
                    .map((binding) => binding.typeName))];
                if (annotatedTypes.length === 1) {
                    const binding = scopedBindings.find((candidate) => candidate.kind === 'parameter_annotation');
                    proof.push({
                        kind: 'parameter_annotation',
                        subject: `${receiver}:${annotatedTypes[0]}`,
                        span: binding?.span,
                    });
                }
            }
        }

        const imported = input.evidence.moduleBindings.filter((binding) => (
            (binding.kind === 'import' || binding.kind === 'reexport')
            && binding.localName === receiver
        ));
        if (imported.length === 1) {
            proof.push({
                kind: imported[0].moduleSpecifier?.startsWith('.') ? 'relative_import' : 'absolute_import',
                subject: imported[0].moduleSpecifier ?? '',
                span: imported[0].span,
            });
        }
    } else {
        const imported = input.evidence.moduleBindings.filter((binding) => (
            (binding.kind === 'import' || binding.kind === 'reexport')
            && binding.localName === input.call.calleeName
        ));
        if (imported.length === 1) {
            proof.push({
                kind: imported[0].moduleSpecifier?.startsWith('.') ? 'relative_import' : 'absolute_import',
                subject: imported[0].moduleSpecifier ?? '',
                span: imported[0].span,
            });
        }
    }

    if (proof.length === 0 && input.target.file === input.source.file) {
        proof.push({
            kind: 'same_file_definition',
            subject: input.target.qualifiedName,
            span: input.target.span as SourceSpan,
        });
    }
    return proof;
}

function claimProofForCall(input: {
    call: CallSite;
    source: SymbolRecord;
    evidence: RelationshipAnalysisEvidence;
    registry: SymbolRegistry;
    resolution?: PythonFlowResolution;
    target?: SymbolRecord;
}): ResolutionProofStep[] {
    const proof: ResolutionProofStep[] = [
        { kind: 'call_site', subject: input.call.calleeName, span: input.call.span },
        { kind: 'containing_caller', subject: input.source.qualifiedName, span: input.source.span as SourceSpan },
    ];
    if (input.resolution) proof.push(...input.resolution.proofSteps);
    if (input.resolution?.decision === 'ambiguous' && !input.resolution.proofSteps.some((step) => step.kind === 'ambiguity')) {
        proof.push({
            kind: 'ambiguity',
            subject: input.call.qualifiedCallee ?? input.call.calleeName,
        });
    }
    if (input.resolution?.decision === 'unresolved' && !input.resolution.proofSteps.some((step) => step.kind === 'unresolved_dependency')) {
        proof.push({
            kind: 'unresolved_dependency',
            subject: dependencyKeyForCall({
                file: input.source.file,
                span: input.call.span,
                receiverText: input.call.receiverText,
                calleeName: input.call.calleeName,
            }),
        });
    }
    if (input.target && (!input.resolution || input.resolution.proofSteps.length === 0)) {
        proof.push(...pythonFallbackProofSteps({
            call: input.call,
            source: input.source,
            evidence: input.evidence,
            registry: input.registry,
            target: input.target,
        }));
        if (proof.length === 2 && input.source.language !== 'python') {
            proof.push({ kind: 'candidate_set', subject: input.target.qualifiedName });
        }
    }
    return proof;
}

function buildResolutionClaim(input: {
    source: SymbolRecord;
    call: CallSite;
    evidence: RelationshipAnalysisEvidence;
    registry: SymbolRegistry;
    target?: SymbolRecord;
    resolution?: PythonFlowResolution;
}): ResolutionClaim {
    const decision = input.resolution?.decision ?? (input.target ? 'resolved' : 'unresolved');
    const dependencyKey = dependencyKeyForCall({
        file: input.source.file,
        span: input.call.span,
        receiverText: input.call.receiverText,
        calleeName: input.call.calleeName,
    });
    const dependencyKeys = [...new Set([
        ...(input.resolution?.dependencyKeys ?? []),
        ...(decision === 'resolved' ? [] : [dependencyKey]),
    ])];
    return {
        providerId: NATIVE_PYTHON_PROVIDER_ID,
        providerVersion: NATIVE_PYTHON_PROVIDER_VERSION,
        environmentConfigId: PYTHON_NATIVE_ENVIRONMENT_CONFIG_ID,
        sourceFile: input.source.file,
        sourceInstanceId: input.source.symbolInstanceId,
        ...(input.target ? { targetInstanceId: input.target.symbolInstanceId, targetSymbol: input.target.qualifiedName } : {}),
        callSpan: { ...input.call.span },
        decision,
        relationshipType: decision === 'resolved' ? 'CALLS' : 'REFERENCES',
        proofSteps: claimProofForCall(input),
        dependencyKeys,
        flowHops: input.resolution?.flowHops ?? 0,
    };
}

export function buildCallRelationshipsForRegistry(input: BuildCallRelationshipsForRegistryInput): RelationshipRecord[] {
    const targetIndex = buildTargetIndex(input.registry.symbols);
    const symbolsByFile = input.registry.symbolsByFile;
    const classes = buildClassIndex(input.registry.symbols);
    const availableFiles = new Set(input.registry.manifest.files.map((file) => file.path));
    const flowContext: PythonFlowContext = {
        registry: input.registry,
        analysisByFile: input.analysisByFile,
        targetIndex,
        classesByFile: classes.byFile,
        classesByName: classes.byName,
        availableFiles,
        classBasesByName: buildPythonClassBases(input.analysisByFile),
    };
    const recordsByKey = new Map<string, RelationshipRecord>();
    const claimsByFile = new Map<string, ResolutionClaim[]>();

    for (const file of input.registry.manifest.files) {
        if (!isLanguageCapabilitySupportedForLanguage(file.language, 'callGraphBuild')) continue;
        const evidence = getEvidence(input.analysisByFile, file.path);
        if (!evidence) continue;
        for (const call of evidence.callSites) {
            const source = ownerForCall(symbolsByFile.get(file.path) ?? [], call);
            if (!source) continue;
            const candidates = targetIndex.get(call.calleeName);
            const evidenceForCall = evidence;
            const flowResolution = source.language === 'python'
                ? resolvePythonServiceMemberTarget({
                    call,
                    source,
                    evidence: evidenceForCall,
                    context: flowContext,
                }) ?? resolvePythonOriginMemberTarget({
                    call,
                    source,
                    context: flowContext,
                })
                : undefined;
            const resolvedTarget = flowResolution
                ? flowResolution.target
                : !candidates || candidates.length === 0
                    ? undefined
                    : call.kind === 'member'
                        ? resolvePythonMemberTarget({
                            call,
                            source,
                            candidates,
                            evidence,
                            registry: input.registry,
                            classesByFile: classes.byFile,
                            classesByName: classes.byName,
                            availableFiles,
                        })
                        : source.language === 'python'
                            ? resolvePythonDirectTarget({
                                call,
                                source,
                                candidates,
                                evidence,
                                registry: input.registry,
                                availableFiles,
                            })
                            : resolveUnambiguousTarget(
                                source,
                                candidates.filter((candidate) => isEligibleCallTarget(call, candidate)),
                            );
            const fallbackProof = source.language === 'python' && resolvedTarget && !flowResolution
                ? pythonFallbackProofSteps({
                    call,
                    source,
                    evidence,
                    registry: input.registry,
                    target: resolvedTarget,
                })
                : [];
            // A Python target that cannot carry exact binding/import/local proof
            // is evidence only. Do not publish the old candidate-set guess.
            const target = source.language === 'python'
                && resolvedTarget
                && !flowResolution
                && fallbackProof.length === 0
                ? undefined
                : resolvedTarget;
            const resolution = flowResolution
                ?? (target
                    ? { decision: 'resolved' as const, proofSteps: fallbackProof, flowHops: 0, dependencyKeys: [] }
                    : resolvedTarget
                        ? {
                            decision: 'unresolved' as const,
                            proofSteps: [{
                                kind: 'unresolved_dependency' as const,
                                subject: dependencyKeyForCall({
                                    file: source.file,
                                    span: call.span,
                                    receiverText: call.receiverText,
                                    calleeName: call.calleeName,
                                }),
                            }],
                            flowHops: 0,
                            dependencyKeys: [dependencyKeyForCall({
                                file: source.file,
                                span: call.span,
                                receiverText: call.receiverText,
                                calleeName: call.calleeName,
                            })],
                        }
                    : {
                        decision: (candidates && candidates.length > 1 ? 'ambiguous' : 'unresolved') as 'ambiguous' | 'unresolved',
                        proofSteps: [],
                        flowHops: 0,
                        dependencyKeys: [],
                    });
            if (source.language === 'python') {
                appendClaim(claimsByFile, file.path, buildResolutionClaim({
                    source,
                    call,
                    evidence,
                    registry: input.registry,
                    target,
                    resolution,
                }));
            }
            if (!target) continue;
            const record: RelationshipRecord = {
                sourceKey: source.symbolKey,
                sourceInstanceId: source.symbolInstanceId,
                targetKey: target.symbolKey,
                targetInstanceId: target.symbolInstanceId,
                type: 'CALLS',
                file: source.file,
                span: relationshipSpan(call),
                confidence: target.file === source.file ? 'high' : 'low',
            };
            recordsByKey.set(relationshipKey(record), record);
            if (isTestOrFixturePath(source.file) && !isTestOrFixturePath(target.file)) {
                const testRecord: RelationshipRecord = {
                    ...record,
                    type: 'TESTS',
                };
                recordsByKey.set(relationshipKey(testRecord), testRecord);
            }
        }
    }

    attachResolutionClaims(input.analysisByFile, claimsByFile);
    return [...recordsByKey.values()].sort(compareRelationshipRecords);
}

function buildImportExportRelationshipsForRegistry(input: BuildRelationshipsForRegistryInput): RelationshipRecord[] {
    const fileOwners = getFileOwners(input.registry.symbols);
    const symbolsByFile = input.registry.symbolsByFile;
    const availableFiles = new Set(input.registry.manifest.files.map((file) => file.path));
    const recordsByKey = new Map<string, RelationshipRecord>();

    for (const source of input.registry.symbols.filter((symbol) => symbol.kind === 'file')) {
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
            const previousTarget = resolveRelativeModulePath(
                file.path,
                binding.moduleSpecifier,
                input.previousRegistry,
                language,
                previousAvailableFiles,
            );
            const nextTarget = resolveRelativeModulePath(
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

    const affectedEvidence = new Map<string, RelationshipAnalysisEvidence>();
    for (const filePath of [...affectedFiles].sort(compareStrings)) {
        const evidence = getEvidence(input.analysisByFile, filePath);
        if (evidence) affectedEvidence.set(filePath, evidence);
    }
    const retained = input.existingRecords.filter((record) => !affectedFiles.has(record.file));
    const rebuilt = buildRelationshipsForRegistry({
        registry: input.registry,
        analysisByFile: affectedEvidence,
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
