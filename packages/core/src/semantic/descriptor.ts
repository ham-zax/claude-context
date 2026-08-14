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
    readonly semanticRevision: string;
    readonly grammar: string;
    readonly auxiliaryFiles: readonly SemanticAuxiliaryPattern[];
    readonly providerId: string;
    readonly providerVersion: string;
    readonly environmentConfigId: string;
}

export interface SemanticLanguageRegistry {
    supportsLanguage(language: string): boolean;
    getDescriptor(language: string): SemanticLanguageDescriptor | undefined;
    getAllSupportedLanguages(): readonly string[];
    matchAuxiliaryRole(filePath: string): { role: string; language: string } | undefined;
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

function loadDefaultLanguagesConfig(): { languages: SemanticLanguageDescriptor[] } {
    try {
        const jsonPath = path.join(__dirname, 'languages', 'semantic-languages.json');
        if (fs.existsSync(jsonPath)) {
            return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }
    } catch {
        // Fallback to embedded default
    }
    return {
        languages: [
            {
                language: 'go',
                canonicalLanguage: 'go',
                extensions: ['.go'],
                semanticRevision: 'go-v1',
                grammar: 'tree-sitter-go',
                auxiliaryFiles: [
                    { pattern: '**/go.mod', role: 'manifest' },
                    { pattern: '**/go.sum', role: 'lockfile' },
                    { pattern: '**/go.work', role: 'workspace' },
                ],
                providerId: 'satori-cbm-semantic-go',
                providerVersion: 'cbm-d150ebe4+satori-go-semantic-v1',
                environmentConfigId: 'cbm-go-semantic-v1',
            },
        ],
    };
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

    matchAuxiliaryRole(filePath: string): { role: string; language: string } | undefined {
        for (const [lang, desc] of this.descriptorsByLanguage) {
            for (const aux of desc.auxiliaryFiles) {
                if (matchPattern(filePath, aux.pattern)) {
                    return { role: aux.role, language: lang };
                }
            }
        }
        return undefined;
    }
}

export const defaultSemanticLanguageRegistry: SemanticLanguageRegistry =
    new DefaultSemanticLanguageRegistry();
