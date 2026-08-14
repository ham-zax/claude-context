import fs from 'node:fs';
import path from 'node:path';
import { normalizeLanguageId } from '../language';

export interface SemanticAuxiliaryPattern {
    readonly pattern: string;
    readonly role: string;
}

export interface SemanticLanguageDescriptor {
    readonly language: string;
    readonly canonicalLanguage: string;
    readonly extensions: readonly string[];
    readonly strategy?: string;
    readonly semanticRevision: string;
    readonly grammar: string;
    readonly auxiliaryFiles: readonly SemanticAuxiliaryPattern[];
    readonly providerId: string;
    readonly providerVersion: string;
    readonly environmentConfigId: string;
}

export interface SemanticAuxiliaryMatch {
    readonly role: string;
    readonly language: string;
}

export interface SemanticLanguageRegistry {
    supportsLanguage(language: string): boolean;
    getDescriptor(language: string): SemanticLanguageDescriptor | undefined;
    getAllSupportedLanguages(): readonly string[];
    getStrategyForLanguage(language: string): string | undefined;
    getAllAuxiliaryPatterns(): readonly { pattern: string; role: string; language: string }[];
    matchAuxiliaries(filePath: string): readonly SemanticAuxiliaryMatch[];
    isAuxiliaryPath(filePath: string): boolean;
}

function matchPattern(filePath: string, pattern: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    const base = path.basename(normalized);
    if (pattern.startsWith('**/')) {
        const target = pattern.slice(3);
        return base.toLowerCase() === target.toLowerCase() || normalized.toLowerCase().endsWith('/' + target.toLowerCase());
    }
    return base.toLowerCase() === pattern.toLowerCase() || normalized.toLowerCase().endsWith(pattern.toLowerCase());
}

function resolveDescriptorPath(): string {
    const candidatePaths = [
        path.resolve(__dirname, '../../../assets/semantic-engine/semantic-languages.json'),
        path.resolve(__dirname, '../../assets/semantic-engine/semantic-languages.json'),
        path.resolve(__dirname, '../assets/semantic-engine/semantic-languages.json'),
        path.resolve(__dirname, './assets/semantic-engine/semantic-languages.json'),
    ];
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    throw new Error(`Semantic language descriptor configuration file missing. Searched: ${candidatePaths.join(', ')}`);
}

function loadDefaultLanguagesConfig(): { languages: SemanticLanguageDescriptor[] } {
    const jsonPath = resolveDescriptorPath();
    const content = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(content);
    if (!parsed || !Array.isArray(parsed.languages)) {
        throw new Error(`Invalid semantic language configuration in ${jsonPath}: missing 'languages' array`);
    }
    return parsed;
}

export class DefaultSemanticLanguageRegistry implements SemanticLanguageRegistry {
    private readonly descriptorsByLanguage: Map<string, SemanticLanguageDescriptor>;
    private readonly descriptorsByExtension: Map<string, SemanticLanguageDescriptor>;

    constructor(descriptors?: readonly SemanticLanguageDescriptor[]) {
        this.descriptorsByLanguage = new Map();
        this.descriptorsByExtension = new Map();

        const list = descriptors ?? loadDefaultLanguagesConfig().languages;
        for (const desc of list) {
            const canonical = normalizeLanguageId(desc.canonicalLanguage || desc.language);
            this.descriptorsByLanguage.set(canonical, desc);
            for (const ext of desc.extensions) {
                this.descriptorsByExtension.set(ext.toLowerCase(), desc);
            }
        }
    }

    supportsLanguage(language: string): boolean {
        const canonical = normalizeLanguageId(language);
        return this.descriptorsByLanguage.has(canonical);
    }

    getDescriptor(language: string): SemanticLanguageDescriptor | undefined {
        const canonical = normalizeLanguageId(language);
        return this.descriptorsByLanguage.get(canonical);
    }

    getAllSupportedLanguages(): readonly string[] {
        return Array.from(this.descriptorsByLanguage.keys());
    }

    getStrategyForLanguage(language: string): string | undefined {
        const desc = this.getDescriptor(language);
        return desc?.strategy ?? (desc ? 'cbm_semantic' : undefined);
    }

    getAllAuxiliaryPatterns(): readonly { pattern: string; role: string; language: string }[] {
        const results: { pattern: string; role: string; language: string }[] = [];
        for (const [lang, desc] of this.descriptorsByLanguage) {
            for (const aux of desc.auxiliaryFiles) {
                results.push({
                    pattern: aux.pattern,
                    role: aux.role,
                    language: lang,
                });
            }
        }
        return results;
    }

    matchAuxiliaries(filePath: string): readonly SemanticAuxiliaryMatch[] {
        const matches: SemanticAuxiliaryMatch[] = [];
        for (const [lang, desc] of this.descriptorsByLanguage) {
            for (const aux of desc.auxiliaryFiles) {
                if (matchPattern(filePath, aux.pattern)) {
                    matches.push({ role: aux.role, language: lang });
                }
            }
        }
        return matches;
    }

    isAuxiliaryPath(filePath: string): boolean {
        return this.matchAuxiliaries(filePath).length > 0;
    }
}

export const defaultSemanticLanguageRegistry: SemanticLanguageRegistry =
    new DefaultSemanticLanguageRegistry();
