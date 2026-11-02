export const BUILD_MY_NIGHT_OCCASIONS = [
    { id: 'CELEBRATION', label: 'Celebration' },
    { id: 'DATE_NIGHT', label: 'Date night' },
    { id: 'PARTY', label: 'House party' },
    { id: 'DINNER', label: 'Dinner tonight' },
    { id: 'CHILL', label: 'Chill night' },
    { id: 'GIFT', label: 'Premium gift' }
] as const;

export const BUILD_MY_NIGHT_CATEGORIES = ['wine', 'spirits', 'beer', 'snacks', 'mixers', 'extras'] as const;

export type BuildMyNightOccasion = typeof BUILD_MY_NIGHT_OCCASIONS[number]['id'];
export type BuildMyNightCategory = typeof BUILD_MY_NIGHT_CATEGORIES[number];

export interface BuildMyNightConfig {
    concierge_mode: 'classic' | 'managed';
    random_suggestions_enabled: boolean;
    build_setup_limit: number;
    party_categories: BuildMyNightCategory[];
    date_night_categories: BuildMyNightCategory[];
    recommendation_limit: number;
    occasion_products: Record<BuildMyNightOccasion, number[]>;
}

export const DEFAULT_BUILD_MY_NIGHT_CONFIG: BuildMyNightConfig = {
    concierge_mode: 'classic',
    random_suggestions_enabled: false,
    build_setup_limit: 5000,
    party_categories: ['spirits', 'snacks', 'mixers'],
    date_night_categories: ['wine', 'snacks', 'mixers'],
    recommendation_limit: 4,
    occasion_products: {
        CELEBRATION: [],
        DATE_NIGHT: [],
        PARTY: [],
        DINNER: [],
        CHILL: [],
        GIFT: []
    }
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCategoryList(value: unknown): value is BuildMyNightCategory[] {
    return Array.isArray(value)
        && value.length > 0
        && value.every(category => typeof category === 'string'
            && BUILD_MY_NIGHT_CATEGORIES.includes(category as BuildMyNightCategory));
}

export function normalizeBuildMyNightConfig(value: unknown): BuildMyNightConfig | null {
    if (!isRecord(value)) return null;
    const config = { ...DEFAULT_BUILD_MY_NIGHT_CONFIG };
    if (value.concierge_mode !== undefined) {
        if (value.concierge_mode !== 'classic' && value.concierge_mode !== 'managed') return null;
        config.concierge_mode = value.concierge_mode;
    }
    if (value.random_suggestions_enabled !== undefined) {
        if (typeof value.random_suggestions_enabled !== 'boolean') return null;
        config.random_suggestions_enabled = value.random_suggestions_enabled;
    }
    if (value.build_setup_limit !== undefined) {
        if (typeof value.build_setup_limit !== 'number' || !Number.isSafeInteger(value.build_setup_limit)
            || value.build_setup_limit < 1 || value.build_setup_limit > 1_000_000) return null;
        config.build_setup_limit = value.build_setup_limit;
    }
    if (value.recommendation_limit !== undefined) {
        if (typeof value.recommendation_limit !== 'number' || !Number.isInteger(value.recommendation_limit)
            || value.recommendation_limit < 1 || value.recommendation_limit > 6) return null;
        config.recommendation_limit = value.recommendation_limit;
    }
    if (value.party_categories !== undefined) {
        if (!isCategoryList(value.party_categories)) return null;
        config.party_categories = value.party_categories;
    }
    if (value.date_night_categories !== undefined) {
        if (!isCategoryList(value.date_night_categories)) return null;
        config.date_night_categories = value.date_night_categories;
    }
    if (value.occasion_products !== undefined) {
        if (!isRecord(value.occasion_products)) return null;
        for (const [occasion, productIds] of Object.entries(value.occasion_products)) {
            if (!BUILD_MY_NIGHT_OCCASIONS.some(item => item.id === occasion)
                || !Array.isArray(productIds)
                || productIds.length > 500
                || !productIds.every(id => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
                return null;
            }
            config.occasion_products[occasion as BuildMyNightOccasion] = [...new Set(productIds)];
        }
    }
    if (config.concierge_mode === 'managed'
        && (value.build_setup_limit === undefined
            || value.recommendation_limit === undefined
            || value.party_categories === undefined
            || value.date_night_categories === undefined)) {
        return null;
    }
    return config;
}

export function validateBuildMyNightConfig(value: Record<string, unknown>): string | null {
    return normalizeBuildMyNightConfig(value)
        ? null
        : 'Planner settings are invalid. Check the managed budget, categories, recommendation limit, and occasion products.';
}
