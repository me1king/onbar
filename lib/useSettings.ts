'use client';

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export interface CatalogNavigationItem {
    id: string;
    label: string;
    href: string;
    enabled: boolean;
}

export const DEFAULT_CATALOG_NAVIGATION: CatalogNavigationItem[] = [
    { id: 'whiskey', label: 'Whisky', href: '/shop/category/whiskey', enabled: true },
    { id: 'wine', label: 'Wine', href: '/shop/category/wine', enabled: true },
    { id: 'beer', label: 'Beers', href: '/shop/category/beer', enabled: true },
    { id: 'champagne', label: 'Champagne', href: '/shop/category/champagne', enabled: true },
    { id: 'liqueur', label: 'Liqueur', href: '/shop/category/liqueur', enabled: true },
    { id: 'tequila', label: 'Tequila', href: '/shop/category/tequila', enabled: true },
    { id: 'gin', label: 'Gin', href: '/shop/category/gin', enabled: true },
    { id: 'cognac', label: 'Cognac', href: '/shop/category/cognac', enabled: true },
    { id: 'brandy', label: 'Brandy', href: '/shop/category/brandy', enabled: true },
    { id: 'vodka', label: 'Vodka', href: '/shop/category/vodka', enabled: true },
    { id: 'rum', label: 'Rum', href: '/shop/category/rum', enabled: true },
    { id: 'extras', label: 'Extras', href: '/extras', enabled: true },
    { id: 'gifts', label: 'Gifts', href: '/shop/category/gifts', enabled: true }
];

export function normalizeCatalogNavigation(value: unknown): CatalogNavigationItem[] {
    const defaults = DEFAULT_CATALOG_NAVIGATION;
    if (!Array.isArray(value)) return defaults.map(item => ({ ...item }));

    const defaultById = new Map(defaults.map(item => [item.id, item]));
    const seen = new Set<string>();
    const normalized = value.flatMap((entry): CatalogNavigationItem[] => {
        if (typeof entry !== 'object' || entry === null) return [];
        const saved = entry as Record<string, unknown>;
        if (typeof saved.id !== 'string' || seen.has(saved.id)) return [];
        const fallback = defaultById.get(saved.id);
        if (!fallback) return [];
        seen.add(saved.id);
        const label = typeof saved.label === 'string' ? saved.label.trim().slice(0, 40) : '';
        return [{
            ...fallback,
            label: label || fallback.label,
            enabled: typeof saved.enabled === 'boolean' ? saved.enabled : fallback.enabled
        }];
    });

    for (const item of defaults) {
        if (!seen.has(item.id)) normalized.push({ ...item });
    }
    return normalized;
}

export interface StoreSettings {
    contact: {
        whatsapp: string;
        email: string;
        address: string;
    };
    branding: {
        owner_name: string;
        portfolio_url: string;
        hero_title: string;
        hero_subtitle: string;
        logo_url?: string;
        favicon_url?: string;
    };
    homepage: {
        hero_image_url: string;
        hero_starting_price: number;
        hero_badge_text: string;
        hero_visual_label?: string;
        hero_title_line1?: string;
        hero_title_line2?: string;
        hero_subtitle?: string;
        featured_product_id?: number | null;
        primary_cta_label?: string;
        primary_cta_href?: string;
        secondary_cta_label?: string;
        secondary_cta_href?: string;
        browse_link_label?: string;
        categories?: { label: string; href: string }[];
    };
    catalog: {
        categories: { id: string; label: string }[];
        navigation: CatalogNavigationItem[];
    };
    shipping: {
        nairobi_cbd_label: string;
        nairobi_cbd: number;
        nairobi_outskirts_label: string;
        nairobi_outskirts: number;
        upcountry_label: string;
        upcountry: number;
    };
    logistics: {
        dispatch_zones: string[];
    };
    theme_config: {
        primary: string;
        secondary: string;
        accent: string;
        custom_css: string;
    };
    seo_config: {
        title: string;
        description: string;
        keywords: string;
        og_image: string;
    };
    social_links: {
        instagram: string;
        tiktok: string;
        facebook: string;
        x: string;
        youtube: string;
        snapchat: string;
    };
    store_info: {
        name: string;
        hours: string;
        google_maps: string;
        footer_copy: string;
    };
    features: {
        ai_concierge_enabled: boolean;
        dynamic_pricing_enabled: boolean;
        gamification_enabled: boolean;
        fraud_shield_enabled: boolean;
    };
    ai_config?: {
        build_setup_limit: number;
        assistant_name: string;
        response_style: string;
    };
    promotions?: {
        flash_sale_text: string;
        discount_percent: number;
        is_active: boolean;
        flash_sale_end: string;
    };
}

export function normalizeShippingSettings(value: unknown): StoreSettings['shipping'] {
    const saved = typeof value === 'object' && value !== null
        ? value as Record<string, unknown>
        : {};
    const defaults = DEFAULT_SETTINGS.shipping;
    const readLabel = (key: keyof StoreSettings['shipping'], fallback: string) => {
        const label = saved[key];
        return typeof label === 'string' && label.trim() ? label.trim() : fallback;
    };
    const readFee = (key: keyof StoreSettings['shipping'], fallback: number) => {
        const rawFee = saved[key];
        if (rawFee === null || rawFee === undefined || rawFee === '') return fallback;
        const fee = Number(rawFee);
        return Number.isFinite(fee) && fee >= 0 ? Math.round(fee) : fallback;
    };

    return {
        nairobi_cbd_label: readLabel('nairobi_cbd_label', defaults.nairobi_cbd_label),
        nairobi_cbd: readFee('nairobi_cbd', defaults.nairobi_cbd),
        nairobi_outskirts_label: readLabel('nairobi_outskirts_label', defaults.nairobi_outskirts_label),
        nairobi_outskirts: readFee('nairobi_outskirts', defaults.nairobi_outskirts),
        upcountry_label: readLabel('upcountry_label', defaults.upcountry_label),
        upcountry: readFee('upcountry', defaults.upcountry)
    };
}

export const DEFAULT_SETTINGS: StoreSettings = {
    contact: {
        whatsapp: "254769345599",
        email: "support@onlinebar.co.ke",
        address: "Nairobi, Kenya"
    },
    branding: {
        owner_name: "Online Bar Team",
        portfolio_url: "#",
        hero_title: "Make tonight. A good one.",
        hero_subtitle: "Find something for the table, the celebration, or a gift worth sending. Browse the live menu and choose what suits your night."
    },
    homepage: {
        hero_image_url: "",
        hero_starting_price: 2500,
        hero_badge_text: "Nairobi drinks, snacks & gifting",
        hero_visual_label: "Online Bar Selection",
        hero_title_line1: "Make tonight",
        hero_title_line2: "a good one.",
        hero_subtitle: "Find something for the table, the celebration, or a gift worth sending. Browse the live menu and choose what suits your night.",
        featured_product_id: null,
        primary_cta_label: "Explore the menu",
        primary_cta_href: "/shop",
        secondary_cta_label: "Send a gift",
        secondary_cta_href: "/gifting",
        browse_link_label: "Find your kind of night",
        categories: [
            { label: "Spirits", href: "/shop/category/spirits" },
            { label: "Wine", href: "/shop/category/wine" },
            { label: "Beer", href: "/shop/category/beer" },
            { label: "Snacks", href: "/bites" }
        ]
    },
    catalog: {
        categories: [
            { id: 'wine', label: 'Vintages' },
            { id: 'spirits', label: 'Premium Spirits' },
            { id: 'snacks', label: 'Late Night Snacks' },
            { id: 'beer', label: 'Chilled Beers' },
            { id: 'mixers', label: 'Mixers' },
            { id: 'essentials', label: 'Bar Essentials' },
            { id: 'extras', label: 'Extras' }
        ],
        navigation: DEFAULT_CATALOG_NAVIGATION.map(item => ({ ...item }))
    },
    shipping: {
        nairobi_cbd_label: "Nairobi CBD / Local",
        nairobi_cbd: 0,
        nairobi_outskirts_label: "Nairobi Outskirts",
        nairobi_outskirts: 300,
        upcountry_label: "Upcountry / Major Towns",
        upcountry: 500
    },
    logistics: {
        dispatch_zones: ["CBD", "Westlands", "Kilimani", "Lavington", "Kileleshwa", "Karen", "Langata", "South C", "South B", "Embakasi", "Roysambu", "Kasarani", "Kahawa", "Githurai", "Zimmerman", "Utawala", "Syokimau", "Kitengela", "Rongai", "Ngong", "Kikuyu", "Thika Road", "Mombasa Road"]
    },
    theme_config: {
        primary: "#F5A000",
        secondary: "#0F172A",
        accent: "#5B5BFF",
        custom_css: ""
    },
    seo_config: {
        title: "Online Bar | Premium Drinks",
        description: "Premium wine, spirits and snacks delivery in Nairobi.",
        keywords: "Wine delivery, Whiskey Nairobi, Late night snacks, Kenya Bar",
        og_image: ""
    },
    social_links: {
        instagram: "",
        tiktok: "",
        facebook: "",
        x: "",
        youtube: "",
        snapchat: ""
    },
    store_info: {
        name: "ONLINE BAR",
        hours: "24/7 Dispatch: Nairobi",
        google_maps: "",
        footer_copy: "© 2026 Online Bar™"
    },
    features: {
        ai_concierge_enabled: true,
        dynamic_pricing_enabled: true,
        gamification_enabled: true,
        fraud_shield_enabled: true
    }
};

/**
 * Hook to manage global store settings from Supabase
 */
export function useSettings() {
    const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadSettings() {
            if (!supabase) {
                setLoading(false);
                return;
            }

            try {
                const { data } = await supabase
                    .from('settings')
                    .select('*')
                    .eq('is_published', true);

                if (data && data.length > 0) {
                    const newSettings = { ...DEFAULT_SETTINGS };
                    data.forEach(item => {
                        if (item.key === 'contact') newSettings.contact = { ...newSettings.contact, ...item.value };
                        if (item.key === 'branding') newSettings.branding = { ...newSettings.branding, ...item.value };
                        if (item.key === 'homepage') newSettings.homepage = { ...newSettings.homepage, ...item.value };
                        if (item.key === 'catalog') newSettings.catalog = {
                            ...newSettings.catalog,
                            ...item.value,
                            navigation: normalizeCatalogNavigation(item.value.navigation)
                        };
                        if (item.key === 'shipping') newSettings.shipping = normalizeShippingSettings(item.value);
                        if (item.key === 'logistics') newSettings.logistics = { ...newSettings.logistics, ...item.value };
                        if (item.key === 'theme_config') newSettings.theme_config = { ...newSettings.theme_config, ...item.value };
                        if (item.key === 'seo_config') newSettings.seo_config = { ...newSettings.seo_config, ...item.value };
                        if (item.key === 'social_links') newSettings.social_links = { ...newSettings.social_links, ...item.value };
                        if (item.key === 'store_info') newSettings.store_info = { ...newSettings.store_info, ...item.value };
                        if (item.key === 'features') newSettings.features = { ...newSettings.features, ...item.value };
                        if (item.key === 'ai_config') newSettings.ai_config = { ...newSettings.ai_config, ...item.value };
                        if (item.key === 'promotions') newSettings.promotions = { ...newSettings.promotions, ...item.value };
                    });
                    setSettings(newSettings);
                }
            } catch (err) {
                console.error("Settings Load Error:", err);
            } finally {
                setLoading(false);
            }
        }

        loadSettings();
    }, []);

    return { settings, loading };
}
