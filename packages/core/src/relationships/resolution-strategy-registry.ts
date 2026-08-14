import { normalizeLanguageId } from '../language';

export type LanguageResolutionStrategy =
    | 'python_native'
    | 'syntactic'
    | 'cbm_semantic'
    | 'none';

export interface LanguageResolutionStrategyRegistry {
    strategyForLanguage(language: string): LanguageResolutionStrategy;
}

const STRATEGY_BY_CANONICAL_LANGUAGE: Readonly<Record<string, LanguageResolutionStrategy>> = {
    python: 'python_native',
    go: 'cbm_semantic',
    javascript: 'syntactic',
    typescript: 'syntactic',
};


export class DefaultLanguageResolutionStrategyRegistry implements LanguageResolutionStrategyRegistry {
    private readonly customStrategies: Map<string, LanguageResolutionStrategy>;

    constructor(customStrategies?: ReadonlyMap<string, LanguageResolutionStrategy> | Record<string, LanguageResolutionStrategy>) {
        this.customStrategies = new Map();
        if (customStrategies) {
            const entries = customStrategies instanceof Map ? customStrategies.entries() : Object.entries(customStrategies);
            for (const [lang, strategy] of entries) {
                this.customStrategies.set(normalizeLanguageId(lang), strategy);
            }
        }
    }

    strategyForLanguage(language: string): LanguageResolutionStrategy {
        const canonical = normalizeLanguageId(language);
        return this.customStrategies.get(canonical) ?? STRATEGY_BY_CANONICAL_LANGUAGE[canonical] ?? 'none';
    }
}

export const defaultResolutionStrategyRegistry: LanguageResolutionStrategyRegistry =
    new DefaultLanguageResolutionStrategyRegistry();
