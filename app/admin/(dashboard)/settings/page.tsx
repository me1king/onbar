'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import { DEFAULT_CATALOG_NAVIGATION, normalizeCatalogNavigation, normalizeShippingSettings } from '@/lib/useSettings';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';
import {
    Phone,
    Palette,
    Truck,
    Save,
    RefreshCcw,
    CheckCircle2,
    Zap,
    Loader2,
    ShieldAlert,
    Globe,
    Image as ImageIcon,
    Eye,
    Code,
    Clock,
    Activity,
    Info,
    Share2,
    Camera,
    Rocket,
    Trash2,
    Plus,
    MoveUp,
    MoveDown,
    EyeOff,
    UserPlus,
    DollarSign,
    Home as HomeIcon,
    MapPin,
    Bot,
    Wine,
    GlassWater,
    MessageSquare,
    Music,
    Mail,
    Ghost,
    Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { applyThemeColors, normalizeThemeColors, THEME_UPDATED_EVENT } from '@/lib/themeColors';
import { isSpiritProductCategory, spiritCategoryPostgrestFilter } from '@/lib/productCategories';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

const DeliveryAreaManager = dynamic(() => import('@/components/admin/DeliveryAreaManager'), { ssr: false });

const DEFAULTS = {
    contact: { whatsapp: "254769345599", email: "support@onlinebar.co.ke", address: "Nairobi, Kenya" },
    branding: { owner_name: "Online Bar Team", portfolio_url: "#", hero_title: "Premium Vintages. Chilled Spirits.", hero_subtitle: "Experience authentic vintages and premium spirits curated for excellence.", logo_url: "", favicon_url: "" },
    homepage: {
        hero_image_url: "",
        hero_starting_price: 2500,
        hero_badge_text: "Nairobi drinks, snacks & gifting",
        hero_visual_label: "Online Bar Selection",
        hero_title_line1: "Make tonight",
        hero_title_line2: "a good one.",
        hero_subtitle: "Find something for the table, the celebration, or a gift worth sending. Browse the live menu and choose what suits your night.",
        featured_product_id: null as number | null,
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
    shipping: { nairobi_cbd_label: "Nairobi CBD / Local", nairobi_cbd: 0, nairobi_outskirts_label: "Nairobi Outskirts", nairobi_outskirts: 300, upcountry_label: "Upcountry / Major Towns", upcountry: 500 },
    logistics: { dispatch_zones: ["CBD", "Westlands", "Kilimani", "Lavington", "Kileleshwa", "Karen", "Langata", "South C", "South B", "Embakasi", "Roysambu", "Kasarani", "Kahawa", "Githurai", "Zimmerman", "Utawala", "Syokimau", "Kitengela", "Rongai", "Ngong", "Kikuyu", "Thika Road", "Mombasa Road"] },
    catalog: {
        categories: [{ id: 'wine', label: 'Vintages' }, { id: 'spirits', label: 'Premium Spirits' }, { id: 'snacks', label: 'Late Night Snacks' }, { id: 'beer', label: 'Chilled Beers' }, { id: 'mixers', label: 'Mixers' }, { id: 'extras', label: 'Extras' }],
        navigation: DEFAULT_CATALOG_NAVIGATION.map(item => ({ ...item }))
    },
    promotions: { flash_sale_text: 'Happy Hour: 20% OFF Select Spirits!', discount_percent: 20, is_active: true, flash_sale_end: '' },
    theme_config: { primary: "#D91C1C", secondary: "#10231f", accent: "#F9F4EC", custom_css: "" },
    seo_config: { title: "Online Bar | Premium Drinks", description: "Premium wine, spirits and snacks delivery in Nairobi.", keywords: "Wine delivery, Whiskey Nairobi, Late night snacks, Kenya Bar", og_image: "" },
    social_links: { instagram: "", tiktok: "", facebook: "", x: "", youtube: "", snapchat: "" },
    store_info: { name: "ONLINE BAR", hours: "24/7 Dispatch", google_maps: "", footer_copy: "© 2026 Online Bar™" },
    ai_config: {
        build_setup_limit: 5000,
        assistant_name: "Bar AI",
        response_style: "Premium",
        concierge_mode: 'classic' as 'classic' | 'managed',
        party_categories: ['spirits', 'snacks', 'mixers'],
        date_night_categories: ['wine', 'snacks', 'mixers'],
        recommendation_limit: 4,
        primary_gateway: "AUTO"
    },
    onboarding_config: {
        rider_steps: [
            { id: 'welcome', label: 'Welcome Screen', enabled: true },
            { id: 'phone', label: 'Phone Verification', enabled: true },
            { id: 'identity', label: 'Identity Profile', enabled: true },
            { id: 'vehicle', label: 'Logistics Specs', enabled: true },
            { id: 'verification', label: 'Photo Verification', enabled: true },
            { id: 'agreement', label: 'Legal Agreement', enabled: true },
            { id: 'biometrics', label: 'Bio-Lock Enrollment', enabled: true }
        ],
        rules: {
            min_age: 18,
            require_license: true,
            auto_approve: false
        }
    }
};

const THEME_PRESETS = {
    classic: {
        label: 'Classic Online Bar',
        description: 'Restore the familiar yellow primary color with clean white surfaces.',
        colors: { primary: '#F5A000', secondary: '#0F172A', accent: '#5B5BFF' }
    },
    midnight: {
        label: 'Midnight Society',
        description: 'Use the cream, red and deep-green palette.',
        colors: { primary: '#D91C1C', secondary: '#10231f', accent: '#F9F4EC' }
    }
} as const;

type TabId = 'identity' | 'homepage' | 'promotions' | 'theme' | 'seo' | 'ops' | 'catalog' | 'ai' | 'onboarding' | 'integrations' | 'features' | 'advanced';

interface HomepageProduct {
    id: number;
    name: string;
    stock: number | null;
}

export default function AdminSettingsPage() {
    const { email } = useAdmin();
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [contact, setContact] = useState(DEFAULTS.contact);
    const [branding, setBranding] = useState(DEFAULTS.branding);
    const [homepage, setHomepage] = useState(DEFAULTS.homepage);
    const [homepageProducts, setHomepageProducts] = useState<HomepageProduct[]>([]);
    const [shipping, setShipping] = useState(DEFAULTS.shipping);
    const [logistics, setLogistics] = useState(DEFAULTS.logistics);
    const [catalog, setCatalog] = useState(DEFAULTS.catalog);
    const [promotions, setPromotions] = useState(DEFAULTS.promotions);
    const [theme, setTheme] = useState(DEFAULTS.theme_config);
    const [seo, setSeo] = useState(DEFAULTS.seo_config);
    const [social, setSocial] = useState(DEFAULTS.social_links);
    const [store, setStore] = useState(DEFAULTS.store_info);
    const [aiConfig, setAiConfig] = useState(DEFAULTS.ai_config);
    const [gatewaysConfig, setGatewaysConfig] = useState({
        paystack_secret_key: '',
        paystack_public_key: '',
        mpesa_consumer_key: '',
        mpesa_consumer_secret: '',
        mpesa_shortcode: '174379',
        mpesa_passkey: '',
        google_maps_api_key: ''
    });
    const [onboarding, setOnboarding] = useState(DEFAULTS.onboarding_config);
    const [features, setFeatures] = useState({
        ai_concierge_enabled: true,
        dynamic_pricing_enabled: true,
        gamification_enabled: true,
        fraud_shield_enabled: true
    });

    const [expandedIntegration, setExpandedIntegration] = useState<string | null>(null);
    const [promotionSyncMessage, setPromotionSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [activeTab, setActiveTab] = useState<TabId>('identity');

    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);
    const [heroFile, setHeroFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
    const [heroPreview, setHeroPreview] = useState<string | null>(null);

    useEffect(() => {
        const validTheme = normalizeThemeColors(theme);
        if (validTheme) applyThemeColors(validTheme);
    }, [theme]);

    const logoInputRef = useRef<HTMLInputElement>(null);
    const faviconInputRef = useRef<HTMLInputElement>(null);
    const heroInputRef = useRef<HTMLInputElement>(null);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/settings', { cache: 'no-store' });
            const result = await response.json() as {
                settings?: Array<{ key: string; value: Record<string, unknown> }>;
                error?: string;
            };
            if (!response.ok) throw new Error(result.error || 'Could not load settings.');
            if (result.settings && result.settings.length > 0) {
                result.settings.forEach((item: { key: string; value: Record<string, unknown> }) => {
                    if (item.key === 'contact') setContact(item.value as typeof DEFAULTS.contact);
                    if (item.key === 'branding') {
                        setBranding(item.value as typeof DEFAULTS.branding);
                        const val = item.value as typeof DEFAULTS.branding;
                        if (val.logo_url) setLogoPreview(val.logo_url);
                        if (val.favicon_url) setFaviconPreview(val.favicon_url);
                    }
                    if (item.key === 'homepage') {
                        setHomepage({
                            ...DEFAULTS.homepage,
                            ...item.value,
                            categories: Array.isArray(item.value.categories)
                                ? item.value.categories as typeof DEFAULTS.homepage.categories
                                : DEFAULTS.homepage.categories
                        });
                        const val = item.value as typeof DEFAULTS.homepage;
                        if (val.hero_image_url) setHeroPreview(val.hero_image_url);
                    }
                    if (item.key === 'shipping') setShipping(normalizeShippingSettings(item.value));
                    if (item.key === 'logistics') setLogistics(item.value as typeof DEFAULTS.logistics);
                    if (item.key === 'catalog') {
                        setCatalog({
                            ...DEFAULTS.catalog,
                            ...item.value,
                            categories: Array.isArray(item.value.categories)
                                ? item.value.categories as typeof DEFAULTS.catalog.categories
                                : DEFAULTS.catalog.categories,
                            navigation: normalizeCatalogNavigation(item.value.navigation)
                        });
                    }
                    if (item.key === 'promotions') setPromotions(item.value as typeof DEFAULTS.promotions);
                    if (item.key === 'theme_config') setTheme({ ...DEFAULTS.theme_config, ...item.value });
                    if (item.key === 'seo_config') setSeo(item.value as typeof DEFAULTS.seo_config);
                    if (item.key === 'social_links') setSocial(item.value as typeof DEFAULTS.social_links);
                    if (item.key === 'store_info') setStore(item.value as typeof DEFAULTS.store_info);
                    if (item.key === 'ai_config') setAiConfig({
                        ...DEFAULTS.ai_config,
                        ...Object.fromEntries(Object.entries(item.value).filter(([key]) =>
                            !['google_gemini_api_key', 'openai_api_key', 'anthropic_claude_api_key'].includes(key)
                        )),
                        concierge_mode: item.value.concierge_mode === 'managed' ? 'managed' : 'classic',
                        party_categories: Array.isArray(item.value.party_categories)
                            ? item.value.party_categories.filter((category): category is string => typeof category === 'string')
                            : DEFAULTS.ai_config.party_categories,
                        date_night_categories: Array.isArray(item.value.date_night_categories)
                            ? item.value.date_night_categories.filter((category): category is string => typeof category === 'string')
                            : DEFAULTS.ai_config.date_night_categories,
                        recommendation_limit: Number.isInteger(item.value.recommendation_limit)
                            ? Math.min(6, Math.max(1, Number(item.value.recommendation_limit)))
                            : DEFAULTS.ai_config.recommendation_limit
                    } as typeof DEFAULTS.ai_config);
                    if (item.key === 'onboarding_config') setOnboarding(item.value as typeof DEFAULTS.onboarding_config);
                    if (item.key === 'features') setFeatures(item.value as typeof features);
                });
            }

            if (!supabase) throw new Error('Product database access is not configured.');
            const { data: productData, error: productsError } = await supabase
                .from('products')
                .select('id, name, stock')
                .gt('stock', 0)
                .order('name');
            if (productsError) throw productsError;
            setHomepageProducts(productData || []);

        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not load settings or homepage products.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const uploadAsset = async (file: File, folder: string) => {
        if (!supabase) throw new Error("Database not connected");
        const BUCKET = 'onlinebar-assets';
        const path = `${folder}/${folder.split('/')[0]}-${Date.now()}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return data.publicUrl;
    };

    const saveSettings = async (settings: { key: string; value: unknown; is_published?: boolean }[]) => {
        const themeSetting = settings.find(setting => setting.key === 'theme_config' && setting.is_published !== false);
        if (themeSetting && !normalizeThemeColors(themeSetting.value)) {
            throw new Error('Theme colors must each be a valid six-digit hex color.');
        }

        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || 'Settings could not be saved.');

        const publishedTheme = settings.find(setting => setting.key === 'theme_config' && setting.is_published !== false);
        if (publishedTheme) {
            const colors = normalizeThemeColors(publishedTheme.value);
            if (!colors) throw new Error('Theme colors must each be a valid six-digit hex color.');
            applyThemeColors(colors);
            window.dispatchEvent(new CustomEvent(THEME_UPDATED_EVENT, { detail: colors }));
        }
    };

    const handleSave = async (key: string, value: unknown, publish: boolean = true) => {
        if (key === 'ai_config') {
            const config = value as typeof aiConfig;
            const allowedCategories = new Set(['wine', 'spirits', 'beer', 'snacks', 'mixers', 'extras']);
            if (
                config.concierge_mode === 'managed'
                && (
                    !Number.isInteger(config.recommendation_limit)
                    || config.recommendation_limit < 1
                    || config.recommendation_limit > 6
                    || !Number.isFinite(config.build_setup_limit)
                    || config.build_setup_limit < 1
                    || ![config.party_categories, config.date_night_categories].every(categories =>
                        categories.length > 0 && categories.every(category => allowedCategories.has(category))
                    )
                )
            ) {
                setMessage({
                    type: 'error',
                    text: 'Managed Concierge needs a budget above zero, 1–6 recommendations, and valid product categories.'
                });
                return;
            }
        }
        if (key === 'catalog') {
            const catalogValue = value as typeof catalog;
            if (catalogValue.navigation.some(item => !item.label.trim())) {
                setMessage({ type: 'error', text: 'Give every category tab a name before saving.' });
                return;
            }
        }
        if (key === 'homepage') {
            const homepageValue = value as typeof homepage;
            const links = [
                homepageValue.primary_cta_href,
                homepageValue.secondary_cta_href,
                ...(homepageValue.categories || []).map(category => category.href)
            ];
            if (links.some(href => !href.startsWith('/') || href.startsWith('//'))) {
                setMessage({ type: 'error', text: 'Homepage links must be internal paths beginning with /.' });
                return;
            }
        }
        setSavingKey(key);
        setMessage(null);

        let finalValue = value;

        try {
            // Handle File Uploads for Branding
            if (key === 'branding') {
                const updatedBrandingLocal = { ...(value as Record<string, unknown>) };
                if (logoFile) updatedBrandingLocal.logo_url = await uploadAsset(logoFile, 'branding');
                if (faviconFile) updatedBrandingLocal.favicon_url = await uploadAsset(faviconFile, 'branding');
                finalValue = updatedBrandingLocal;
                setBranding(updatedBrandingLocal as typeof branding);
                setLogoFile(null);
                setFaviconFile(null);
            }

            // Handle File Uploads for Homepage
            if (key === 'homepage') {
                const updatedHomepageLocal = { ...(value as Record<string, unknown>) };
                if (heroFile) updatedHomepageLocal.hero_image_url = await uploadAsset(heroFile, 'homepage');
                finalValue = updatedHomepageLocal;
                setHomepage(updatedHomepageLocal as typeof homepage);
                setHeroFile(null);
            }

            await saveSettings([{ key, value: finalValue, is_published: publish }]);

            await logAuditAction(email, 'UPDATE_SETTINGS', { key, published: publish });
            setMessage({
                type: 'success',
                text: publish ? `${key.toUpperCase()} published to live bar.` : `${key.toUpperCase()} saved as draft.`
            });

            setTimeout(() => setMessage(null), 5000);
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Save Error:", error);
            setMessage({ type: 'error', text: error.message || 'Failed to update.' });
        } finally {
            setSavingKey(null);
        }
    };

    const saveOperationsSettings = async () => {
        const fees = [shipping.nairobi_cbd, shipping.nairobi_outskirts, shipping.upcountry];
        if (fees.some(fee => !Number.isSafeInteger(fee) || fee < 0)) {
            setMessage({ type: 'error', text: 'Enter a whole-number delivery fee of zero or more for each zone.' });
            return;
        }

        setSavingKey('ops');
        setMessage(null);
        try {
            await saveSettings([
                { key: 'contact', value: contact, is_published: true },
                { key: 'shipping', value: shipping, is_published: true }
            ]);

            await logAuditAction(email, 'UPDATE_SETTINGS', { keys: ['contact', 'shipping'], published: true });
            setMessage({ type: 'success', text: 'Contact and delivery prices are live at checkout.' });
            setTimeout(() => setMessage(null), 5000);
        } catch (err) {
            console.error('Operations settings save failed:', err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not save contact and delivery settings.' });
        } finally {
            setSavingKey(null);
        }
    };

    const saveSeoAndSocialSettings = async () => {
        setSavingKey('seo');
        setMessage(null);
        try {
            await saveSettings([
                { key: 'seo_config', value: seo, is_published: true },
                { key: 'social_links', value: social, is_published: true }
            ]);

            await logAuditAction(email, 'UPDATE_SETTINGS', { keys: ['seo_config', 'social_links'], published: true });
            setMessage({ type: 'success', text: 'SEO metadata and social profile links are saved and live.' });
            setTimeout(() => setMessage(null), 5000);
        } catch (err) {
            console.error('SEO and social settings save failed:', err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'SEO and social links could not be saved.' });
        } finally {
            setSavingKey(null);
        }
    };

    const handlePublishAll = async () => {
        if ([shipping.nairobi_cbd, shipping.nairobi_outskirts, shipping.upcountry].some(fee => !Number.isSafeInteger(fee) || fee < 0)) {
            setMessage({ type: 'error', text: 'Enter a whole-number delivery fee of zero or more for each zone before publishing.' });
            return;
        }
        setSavingKey('all');
        try {
            const updatedBrandingLocal = { ...branding };
            const updatedHomepageLocal = { ...homepage };

            if (logoFile) updatedBrandingLocal.logo_url = await uploadAsset(logoFile, 'branding');
            if (faviconFile) updatedBrandingLocal.favicon_url = await uploadAsset(faviconFile, 'branding');
            if (heroFile) updatedHomepageLocal.hero_image_url = await uploadAsset(heroFile, 'homepage');

            const payloads = [
                { key: 'contact', value: contact },
                { key: 'branding', value: updatedBrandingLocal },
                { key: 'homepage', value: updatedHomepageLocal },
                { key: 'theme_config', value: theme },
                { key: 'seo_config', value: seo },
                { key: 'social_links', value: social },
                { key: 'store_info', value: store },
                { key: 'promotions', value: promotions },
                { key: 'shipping', value: shipping },
                { key: 'logistics', value: logistics },
                { key: 'catalog', value: catalog },
                { key: 'onboarding_config', value: onboarding },
                { key: 'features', value: features },
                { key: 'ai_config', value: aiConfig },
            ];

            await saveSettings(payloads.map(setting => ({ ...setting, is_published: true })));

            setBranding(updatedBrandingLocal);
            setHomepage(updatedHomepageLocal);
            setLogoFile(null);
            setFaviconFile(null);
            setHeroFile(null);

            setMessage({ type: 'success', text: "All changes synchronized to the live bar menu." });
        } catch (err: unknown) {
            const error = err as Error;
            setMessage({ type: 'error', text: error.message });
        } finally {
            setSavingKey(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 text-left">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                <p className="font-black text-muted-foreground uppercase tracking-widest text-[10px]">Establishing Secure Uplink...</p>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Bar OS</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Professional Content Management & Cellar Identity Hub.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={fetchSettings} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white text-foreground font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">
                        <RefreshCcw className="h-4 w-4 mr-2" /> Sync Records
                    </Button>
                    <Button
                        disabled={savingKey !== null || activeTab === 'integrations'}
                        onClick={() => {
                            if (activeTab === 'identity') handleSave('branding', branding, true);
                            else if (activeTab === 'homepage') handleSave('homepage', homepage, true);
                            else if (activeTab === 'promotions') handleSave('promotions', promotions, true);
                            else if (activeTab === 'theme') handleSave('theme_config', theme, true);
                            else if (activeTab === 'seo') saveSeoAndSocialSettings();
                            else if (activeTab === 'ops') {
                                saveOperationsSettings();
                            }
                            else if (activeTab === 'catalog') handleSave('catalog', catalog, true);
                            else if (activeTab === 'ai') handleSave('ai_config', aiConfig, true);
                            else if (activeTab === 'onboarding') handleSave('onboarding_config', onboarding, true);
                            else if (activeTab === 'features') handleSave('features', features, true);
                            else if (activeTab === 'advanced') handleSave('theme_config', theme, true);
                        }}
                        className="rounded-xl h-12 px-6 bg-primary text-white font-black uppercase text-[10px] tracking-widest hover:bg-primary/90 transition-all active:scale-95 shadow-xl shadow-primary/20"
                    >
                        {savingKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {savingKey ? 'Saving…' : activeTab === 'integrations' ? 'Setup required' : 'Sync Changes'}
                    </Button>
                </div>
            </header>

            {message && (
                <div className={cn(
                    "p-6 rounded-[2rem] border-2 flex items-start gap-4 animate-in slide-in-from-top-4 duration-500 shadow-xl relative overflow-hidden",
                    message.type === 'success' ? "bg-primary/5 border-primary/20 text-primary" : "bg-rose-50 border-rose-100 text-rose-600"
                )}>
                    {message.type === 'success' ? <CheckCircle2 className="h-6 w-6 shrink-0 mt-0.5" /> : <ShieldAlert className="h-6 w-6 shrink-0 mt-0.5" />}
                    <div className="flex-1">
                        <p className="text-sm font-black uppercase tracking-tight mb-1">{message.type === 'success' ? 'Command Acknowledged' : 'Interference Detected'}</p>
                        <p className="text-xs font-medium leading-relaxed italic">{message.text}</p>
                    </div>
                </div>
            )}

            {/* CMS Tab Navigation */}
            <div className="flex gap-2 p-1 bg-card rounded-2xl border border-border shadow-sm overflow-x-auto no-scrollbar max-w-5xl">
                {[
                    { id: 'identity', label: 'Identity', icon: Info },
                    { id: 'homepage', label: 'Homepage', icon: HomeIcon },
                    { id: 'promotions', label: 'Promotions', icon: Zap },
                    { id: 'theme', label: 'Theme', icon: Palette },
                    { id: 'seo', label: 'SEO & Social', icon: Globe },
                    { id: 'ops', label: 'Operations', icon: Truck },
                    { id: 'catalog', label: 'Menu', icon: Wine },
                    { id: 'ai', label: 'AI Node', icon: Bot },
                    { id: 'onboarding', label: 'Onboarding', icon: UserPlus },
                    { id: 'integrations', label: 'Integrations', icon: Code },
                    { id: 'features', label: 'Features', icon: Zap },
                    { id: 'advanced', label: 'Advanced', icon: Code },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabId)}
                        className={cn(
                            "flex items-center gap-3 px-6 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border-2 border-transparent",
                            activeTab === tab.id ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )}
                    >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-8">

                    {/* IDENTITY TAB */}
                    {activeTab === 'identity' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-slate-100 p-10 bg-white shadow-sm space-y-8 text-left">
                                <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><Info className="h-5 w-5 text-primary" /> Core Identity</h2>
                                <div className="space-y-6">
                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div className="space-y-2 text-left">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground">Owner Name</label>
                                            <Input value={branding.owner_name} onChange={e => setBranding({...branding, owner_name: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground" />
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground">Portfolio URL</label>
                                            <Input value={branding.portfolio_url} onChange={e => setBranding({...branding, portfolio_url: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-xs text-foreground" />
                                        </div>
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div className="space-y-2 text-left">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground">Bar Public Name</label>
                                            <Input value={store.name} onChange={e => setStore({...store, name: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground" />
                                        </div>
                                        <div className="space-y-2 text-left pt-6">
                                            <p className="text-[8px] font-bold text-muted-foreground uppercase italic leading-relaxed">
                                                * Global Brand Metadata. Updates the logo and general bar nomenclature.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <input
                                        type="file"
                                        ref={logoInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setLogoFile(file);
                                                setLogoPreview(URL.createObjectURL(file));
                                            }
                                        }}
                                    />
                                    <input
                                        type="file"
                                        ref={faviconInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setFaviconFile(file);
                                                setFaviconPreview(URL.createObjectURL(file));
                                            }
                                        }}
                                    />

                                    <div
                                        onClick={() => logoInputRef.current?.click()}
                                        className="flex-1 p-8 rounded-3xl bg-secondary border border-border flex flex-col items-center gap-4 group cursor-pointer hover:border-primary/20 transition-all overflow-hidden"
                                    >
                                        {logoPreview ? (
                                            <Image src={logoPreview} width={100} height={40} className="h-10 w-auto object-contain" alt="Bar Logo Preview" />
                                        ) : (
                                            <ImageIcon className="h-10 w-10 text-muted group-hover:text-primary transition-colors" />
                                        )}
                                        <p className="text-[10px] font-black uppercase text-muted-foreground">Upload Bar Logo</p>
                                    </div>

                                    <div
                                        onClick={() => faviconInputRef.current?.click()}
                                        className="flex-1 p-8 rounded-3xl bg-secondary border border-border flex flex-col items-center gap-4 group cursor-pointer hover:border-primary/20 transition-all overflow-hidden"
                                    >
                                        {faviconPreview ? (
                                            <Image src={faviconPreview} width={40} height={40} className="h-10 w-10 object-contain rounded-lg" alt="Favicon Preview" />
                                        ) : (
                                            <div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center text-background font-black group-hover:bg-primary transition-all text-xs">B</div>
                                        )}
                                        <p className="text-[10px] font-black uppercase text-muted-foreground">Upload Favicon</p>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* HOMEPAGE TAB */}
                    {activeTab === 'homepage' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-border p-10 bg-card shadow-sm space-y-8 text-left">
                                <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><HomeIcon className="h-5 w-5 text-primary" /> Hero Configuration</h2>

                                <div className="space-y-6">
                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Main Headline</label>
                                            <Input
                                                value={homepage.hero_title_line1}
                                                onChange={e => setHomepage({...homepage, hero_title_line1: e.target.value})}
                                                className="h-14 rounded-2xl bg-secondary border-border font-black text-lg text-foreground"
                                            />
                                            <p className="text-[7px] font-bold text-primary uppercase italic px-1">First line of the live homepage headline.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Second Headline Line</label>
                                            <Input
                                                value={homepage.hero_title_line2}
                                                onChange={e => setHomepage({...homepage, hero_title_line2: e.target.value})}
                                                className="h-14 rounded-2xl bg-secondary border-border font-black text-lg text-foreground"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Subtitle</label>
                                        <Input
                                            value={homepage.hero_subtitle}
                                            onChange={e => setHomepage({...homepage, hero_subtitle: e.target.value})}
                                            className="h-14 rounded-2xl bg-secondary border-border font-medium text-foreground"
                                        />
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Primary Button Label</label>
                                            <Input value={homepage.primary_cta_label} onChange={e => setHomepage({...homepage, primary_cta_label: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Primary Button Path</label>
                                            <Input value={homepage.primary_cta_href} onChange={e => setHomepage({...homepage, primary_cta_href: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground" placeholder="/shop" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Gift Button Label</label>
                                            <Input value={homepage.secondary_cta_label} onChange={e => setHomepage({...homepage, secondary_cta_label: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Gift Button Path</label>
                                            <Input value={homepage.secondary_cta_href} onChange={e => setHomepage({...homepage, secondary_cta_href: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground" placeholder="/gifting" />
                                        </div>
                                        <div className="space-y-2 sm:col-span-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Browse Categories Link Label</label>
                                            <Input value={homepage.browse_link_label} onChange={e => setHomepage({...homepage, browse_link_label: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground" />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Homepage Category Cards</label>
                                        {homepage.categories.map((category, index) => (
                                            <div key={`${index}-${category.href}`} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                                                <Input aria-label={`Category ${index + 1} label`} value={category.label} onChange={e => setHomepage({...homepage, categories: homepage.categories.map((item, itemIndex) => itemIndex === index ? {...item, label: e.target.value} : item)})} className="h-12 rounded-xl bg-secondary border-border font-bold text-foreground" placeholder="Category label" />
                                                <Input aria-label={`Category ${index + 1} path`} value={category.href} onChange={e => setHomepage({...homepage, categories: homepage.categories.map((item, itemIndex) => itemIndex === index ? {...item, href: e.target.value} : item)})} className="h-12 rounded-xl bg-secondary border-border font-bold text-foreground" placeholder="/shop/category/wine" />
                                                <Button type="button" variant="outline" aria-label={`Remove category ${category.label}`} onClick={() => setHomepage({...homepage, categories: homepage.categories.filter((_, itemIndex) => itemIndex !== index)})} className="h-12 rounded-xl"><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        ))}
                                        <Button type="button" variant="outline" onClick={() => setHomepage({...homepage, categories: [...homepage.categories, { label: '', href: '/shop' }]})} className="rounded-xl"><Plus className="mr-2 h-4 w-4" /> Add Category</Button>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Featured Product</label>
                                        <select
                                            value={homepage.featured_product_id ?? ''}
                                            onChange={e => setHomepage({...homepage, featured_product_id: e.target.value ? Number(e.target.value) : null})}
                                            className="h-14 w-full rounded-2xl border border-border bg-secondary px-4 font-bold text-foreground"
                                        >
                                            <option value="">Automatically feature newest in-stock product</option>
                                            {homepage.featured_product_id !== null && !homepageProducts.some(product => product.id === homepage.featured_product_id) && (
                                                <option value={homepage.featured_product_id} disabled>Selected product is unavailable or out of stock (ID {homepage.featured_product_id})</option>
                                            )}
                                            {homepageProducts.map(product => <option key={product.id} value={product.id}>{product.name} (ID {product.id})</option>)}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Hero Visual Payload (Image)</label>
                                        <input
                                            type="file"
                                            ref={heroInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    setHeroFile(file);
                                                    setHeroPreview(URL.createObjectURL(file));
                                                }
                                            }}
                                        />
                                        <div
                                            onClick={() => heroInputRef.current?.click()}
                                            className="w-full h-64 rounded-[2.5rem] border-2 border-dashed border-border bg-secondary flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary/30 transition-all overflow-hidden group"
                                        >
                                            {heroPreview ? (
                                                <Image src={heroPreview} fill alt="Hero Preview" className="h-full w-full object-cover" />
                                            ) : (
                                                <>
                                                    <ImageIcon className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                                                    <p className="text-[10px] font-black uppercase text-muted-foreground">Select Bar Backdrop</p>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid sm:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Starting Price</label>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    value={homepage.hero_starting_price}
                                                    onChange={e => setHomepage({...homepage, hero_starting_price: Number(e.target.value)})}
                                                    className="h-14 rounded-2xl bg-secondary border-border pl-12 font-black text-lg text-foreground"
                                                />
                                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Top Badge Alert</label>
                                            <Input
                                                value={homepage.hero_badge_text}
                                                onChange={e => setHomepage({...homepage, hero_badge_text: e.target.value})}
                                                className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Visual Series Label</label>
                                            <Input
                                                value={homepage.hero_visual_label || ''}
                                                onChange={e => setHomepage({...homepage, hero_visual_label: e.target.value})}
                                                className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground"
                                                placeholder="e.g. Online Bar Selection"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* PROMOTIONS TAB */}
                    {activeTab === 'promotions' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-border p-10 bg-card shadow-sm space-y-10 text-left">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><Zap className="h-5 w-5 text-primary" /> Happy Hour Configuration</h2>
                                    <button
                                        onClick={() => setPromotions({...promotions, is_active: !promotions.is_active})}
                                        className={cn(
                                            "w-20 h-10 rounded-full transition-all relative p-1 flex items-center shadow-inner",
                                            promotions.is_active ? "bg-emerald-500" : "bg-secondary"
                                        )}
                                    >
                                        <div className={cn(
                                            "h-8 w-8 rounded-full bg-white shadow-xl transition-all flex items-center justify-center",
                                            promotions.is_active ? "translate-x-10" : "translate-x-0"
                                        )}>
                                            {promotions.is_active ? <CheckCircle2 size={16} className="text-emerald-500" /> : <ShieldAlert size={16} className="text-slate-300" />}
                                        </div>
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-2 text-left">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Happy Hour Headline & Subtext</label>
                                        <Input
                                            value={promotions.flash_sale_text}
                                            onChange={e => setPromotions({...promotions, flash_sale_text: e.target.value})}
                                            className="h-14 rounded-2xl bg-secondary border-border font-black text-lg text-foreground"
                                            placeholder="e.g. HAPPY HOUR: 20% OFF PREMIUM SPIRITS!"
                                        />
                                        <p className="text-[7px] font-bold text-primary uppercase italic px-1">* FORMAT: [Headline]: [Subtext] (to match the banner styling)</p>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div className="space-y-2 text-left">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Discount Percent (%)</label>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    value={promotions.discount_percent}
                                                    onChange={e => setPromotions({...promotions, discount_percent: Number(e.target.value)})}
                                                    className="h-14 rounded-2xl bg-secondary border-border pl-12 font-black text-lg text-foreground"
                                                />
                                                <Zap className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                            </div>
                                        </div>
                                        <div className="space-y-2 text-left">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Deal Expiry Date</label>
                                            <div className="relative">
                                                <Input
                                                    type="datetime-local"
                                                    value={promotions.flash_sale_end
                                                        && Number.isFinite(new Date(promotions.flash_sale_end).getTime())
                                                        ? new Date(new Date(promotions.flash_sale_end).getTime() - new Date(promotions.flash_sale_end).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
                                                        : ''}
                                                    onChange={e => setPromotions({...promotions, flash_sale_end: e.target.value ? new Date(e.target.value).toISOString() : ''})}
                                                    className="h-14 rounded-2xl bg-secondary border-border pl-12 font-bold text-foreground"
                                                />
                                                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* BATCH SYNC SALE & OFFERS BUTTON */}
                                    <div className="pt-2">
                                        <Button
                                            type="button"
                                            onClick={async () => {
                                                setPromotionSyncMessage(null);
                                                if (!supabase) {
                                                    setPromotionSyncMessage({ type: 'error', text: 'Product data is unavailable. No discounts were changed.' });
                                                    return;
                                                }
                                                const discount = Number(promotions.discount_percent);
                                                if (!Number.isInteger(discount) || discount < 1 || discount > 99) {
                                                    setPromotionSyncMessage({ type: 'error', text: 'Enter a whole-number spirit discount from 1% to 99%.' });
                                                    return;
                                                }

                                                try {
                                                    const { data: products, error: productsError } = await supabase
                                                        .from('products')
                                                        .select('id, name, category, price, old_price, stock, status, hide_product, is_available_now')
                                                        .or(spiritCategoryPostgrestFilter());
                                                    if (productsError) throw productsError;

                                                    const spirits = (products || []).filter(product =>
                                                        isSpiritProductCategory(product.category)
                                                        && isStorefrontProductVisible(product)
                                                        && Number(product.stock) > 0
                                                    );
                                                    if (spirits.length === 0) {
                                                        setPromotionSyncMessage({ type: 'error', text: 'No in-stock, published spirit products were found. No discounts were changed.' });
                                                        return;
                                                    }

                                                    let updatedCount = 0;
                                                    for (const product of spirits) {
                                                        const currentPrice = Number(product.price);
                                                        const previousPrice = Number(product.old_price);
                                                        const originalPrice = Number.isFinite(previousPrice) && previousPrice > currentPrice
                                                            ? previousPrice
                                                            : currentPrice;
                                                        if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
                                                            throw new Error(`Cannot calculate a valid price for ${product.name || 'a spirit product'}.`);
                                                        }

                                                        const { error: updateError } = await supabase
                                                            .from('products')
                                                            .update({
                                                                is_on_offer: true,
                                                                old_price: originalPrice,
                                                                price: Math.round(originalPrice * (1 - discount / 100))
                                                            })
                                                            .eq('id', product.id);
                                                        if (updateError) {
                                                            throw new Error(
                                                                `Could not update ${product.name || 'a spirit product'}: ${updateError.message}`
                                                                + (updatedCount ? ` ${updatedCount} earlier spirit discounts were already updated.` : '')
                                                            );
                                                        }
                                                        updatedCount += 1;
                                                    }

                                                    setPromotionSyncMessage({
                                                        type: 'success',
                                                        text: `${discount}% discount applied to ${updatedCount} in-stock spirit products. Beer, wine, soft drinks and mixers were not changed.`
                                                    });
                                                } catch (err: unknown) {
                                                    setPromotionSyncMessage({
                                                        type: 'error',
                                                        text: err instanceof Error ? err.message : 'Spirit discounts could not be applied.'
                                                    });
                                                }
                                            }}
                                            className="w-full h-14 rounded-2xl bg-emerald-600 text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Zap size={18} className="fill-current" /> Apply discount to in-stock spirits
                                        </Button>
                                        {promotionSyncMessage && (
                                            <p role={promotionSyncMessage.type === 'error' ? 'alert' : 'status'} className={cn(
                                                'mt-3 rounded-xl border px-4 py-3 text-sm leading-relaxed',
                                                promotionSyncMessage.type === 'error'
                                                    ? 'border-red-200 bg-red-50 text-red-800'
                                                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                            )}>
                                                {promotionSyncMessage.text}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </Card>

                            <div className="p-8 rounded-[3rem] bg-indigo-50 border border-indigo-100 flex items-start gap-4 text-left">
                                <Info className="h-6 w-6 text-indigo-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-xs font-black uppercase text-indigo-700">Dynamic Deal Logic</p>
                                    <p className="text-[10px] text-indigo-600 font-medium leading-relaxed italic">
                                        &quot;When active, this deal will appear on the global homepage and apply automatically to the bar theme. The countdown timer will automatically sync to the Expiry Date provided.&quot;
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* THEME TAB */}
                    {activeTab === 'theme' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-border p-10 bg-card shadow-sm space-y-10 text-left">
                                <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><Palette className="h-5 w-5 text-primary" /> Theme Engine</h2>
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Primary color preset</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">Choose a preset, then select <strong>Sync Changes</strong> to save it to the live storefront.</p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {Object.entries(THEME_PRESETS).map(([presetId, preset]) => {
                                            const selected = theme.primary.toUpperCase() === preset.colors.primary;
                                            return (
                                                <button
                                                    key={presetId}
                                                    type="button"
                                                    aria-pressed={selected}
                                                    onClick={() => setTheme({ ...theme, ...preset.colors })}
                                                    className={cn(
                                                        'flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-left transition',
                                                        selected ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border bg-white hover:border-primary/40'
                                                    )}
                                                >
                                                    <span className="h-10 w-10 shrink-0 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: preset.colors.primary }} />
                                                    <span className="min-w-0">
                                                        <span className="block text-sm font-black text-foreground">{preset.label}</span>
                                                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{preset.description}</span>
                                                        <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{preset.colors.primary}</span>
                                                    </span>
                                                    {selected && <CheckCircle2 aria-label="Selected" className="ml-auto h-5 w-5 shrink-0 text-primary" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="grid sm:grid-cols-3 gap-8">
                                    {[
                                        { id: 'primary', label: 'Primary (Action)', val: theme.primary },
                                        { id: 'secondary', label: 'Secondary (Light)', val: theme.secondary },
                                        { id: 'accent', label: 'Accent (UI)', val: theme.accent },
                                    ].map(color => (
                                        <div key={color.id} className="space-y-4 text-left">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground block ml-1">{color.label}</label>
                                            <div className="flex items-center gap-3">
                                                <div className="h-14 w-14 rounded-2xl shadow-xl border-4 border-background shrink-0 overflow-hidden relative">
                                                    <input
                                                        type="color"
                                                        value={color.val}
                                                        onChange={e => setTheme({...theme, [color.id]: e.target.value})}
                                                        className="absolute inset-0 w-full h-full scale-150 cursor-pointer"
                                                    />
                                                </div>
                                                <Input value={color.val} onChange={e => setTheme({...theme, [color.id]: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-mono text-[10px] text-foreground" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'advanced' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-border p-8 sm:p-10 bg-card shadow-sm space-y-6 text-left">
                                <div>
                                    <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><Palette className="h-5 w-5 text-primary" /> Store Color Preset</h2>
                                    <p className="mt-2 text-sm text-muted-foreground">Switch between the classic yellow and cream/red/green palettes. Use Sync Changes above to publish your selection.</p>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {Object.entries(THEME_PRESETS).map(([presetId, preset]) => {
                                        const selected = theme.primary.toUpperCase() === preset.colors.primary;
                                        return (
                                            <button
                                                key={presetId}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() => setTheme({ ...theme, ...preset.colors })}
                                                className={cn(
                                                    'flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-left transition',
                                                    selected ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border bg-white hover:border-primary/40'
                                                )}
                                            >
                                                <span className="h-10 w-10 shrink-0 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: preset.colors.primary }} />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-black text-foreground">{preset.label}</span>
                                                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{preset.description}</span>
                                                    <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{preset.colors.primary}</span>
                                                </span>
                                                {selected && <CheckCircle2 aria-label="Selected" className="ml-auto h-5 w-5 shrink-0 text-primary" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* SEO & SOCIAL TAB */}
                    {activeTab === 'seo' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-slate-100 p-10 bg-white shadow-sm space-y-8 text-left">
                                <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><Globe className="h-5 w-5 text-primary" /> Search Intelligence</h2>
                                <div className="space-y-6 text-left">
                                    <div className="space-y-2 text-left">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground">Homepage Title Tag</label>
                                        <Input value={seo.title} onChange={e => setSeo({...seo, title: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground" />
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground">Meta Description</label>
                                        <textarea value={seo.description} onChange={e => setSeo({...seo, description: e.target.value})} className="w-full h-24 p-5 rounded-2xl bg-secondary border border-border text-foreground font-medium text-xs resize-none outline-none focus:ring-4 focus:ring-primary/5 transition-all" />
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground">Keywords (Comma Separated)</label>
                                        <Input value={seo.keywords} onChange={e => setSeo({...seo, keywords: e.target.value})} className="h-14 rounded-2xl bg-secondary border-border text-foreground" />
                                    </div>
                                </div>
                            </Card>

                            <Card className="rounded-[3rem] border border-slate-100 p-10 bg-white shadow-sm space-y-8 text-left">
                                <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><Activity className="h-5 w-5 text-primary" /> Social Presence</h2>
                                <div className="grid sm:grid-cols-2 gap-6 text-left">
                                    {[
                                        { id: 'instagram', icon: Camera, label: 'Instagram URL' },
                                        { id: 'tiktok', icon: GlassWater, label: 'TikTok URL' },
                                        { id: 'facebook', icon: Share2, label: 'Facebook Page' },
                                        { id: 'x', icon: Globe, label: 'X (Twitter)' },
                                        { id: 'snapchat', icon: Ghost, label: 'Snapchat URL' },
                                        { id: 'youtube', icon: Play, label: 'YouTube URL' },
                                    ].map(item => (
                                        <div key={item.id} className="space-y-2 text-left">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-2">
                                                <item.icon className="h-3 w-3" /> {item.label}
                                            </label>
                                            <Input value={(social as Record<string, string>)[item.id]} onChange={e => setSocial({...social, [item.id]: e.target.value})} className="h-12 rounded-xl bg-secondary border-border text-[10px] font-bold text-foreground" />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-xs leading-relaxed text-slate-500">Only valid profile URLs are linked on the public footer. Leave a field empty to show it as not configured.</p>
                                    <Button
                                        type="button"
                                        disabled={savingKey !== null}
                                        onClick={saveSeoAndSocialSettings}
                                        className="h-11 shrink-0 rounded-xl bg-primary px-6 text-[9px] font-black uppercase tracking-widest text-white"
                                    >
                                        {savingKey === 'seo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Save Social Links
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* CATALOG TAB */}
                    {activeTab === 'catalog' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-slate-100 p-6 sm:p-10 bg-white shadow-sm space-y-6 text-left">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><Wine className="h-5 w-5 text-primary" /> Storefront Category Bar</h2>
                                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">Control the tabs shown across the top of the shop. Rename them, hide ones you do not need, or move them up and down. The link for each category stays safely connected.</p>
                                    </div>
                                    <Button
                                        type="button"
                                        disabled={savingKey !== null}
                                        onClick={() => handleSave('catalog', catalog, true)}
                                        className="h-11 shrink-0 rounded-xl bg-primary px-5 text-[9px] font-black uppercase tracking-widest text-white"
                                    >
                                        {savingKey === 'catalog' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Save Category Bar
                                    </Button>
                                </div>

                                <div aria-label="Live category bar preview" className="flex gap-1 overflow-x-auto border-y border-slate-100 py-3">
                                    {catalog.navigation.filter(item => item.enabled).map(item => (
                                        <span key={item.id} className="shrink-0 border-b-2 border-rose-600 px-3 py-2 text-xs font-semibold text-slate-800">{item.label}</span>
                                    ))}
                                    {catalog.navigation.every(item => !item.enabled) && <span className="px-3 py-2 text-xs text-slate-400">All category tabs are hidden.</span>}
                                </div>

                                <div className="space-y-2">
                                    {catalog.navigation.map((item, index) => (
                                        <div key={item.id} className={cn(
                                            "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 sm:p-4",
                                            item.enabled ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-70"
                                        )}>
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 text-center text-xs font-bold text-slate-400">{index + 1}</span>
                                                <div className="flex flex-col">
                                                    <button
                                                        type="button"
                                                        aria-label={`Move ${item.label} up`}
                                                        disabled={index === 0}
                                                        onClick={() => setCatalog(current => {
                                                            const navigation = [...current.navigation];
                                                            [navigation[index - 1], navigation[index]] = [navigation[index], navigation[index - 1]];
                                                            return { ...current, navigation };
                                                        })}
                                                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                                                    ><MoveUp size={14} /></button>
                                                    <button
                                                        type="button"
                                                        aria-label={`Move ${item.label} down`}
                                                        disabled={index === catalog.navigation.length - 1}
                                                        onClick={() => setCatalog(current => {
                                                            const navigation = [...current.navigation];
                                                            [navigation[index], navigation[index + 1]] = [navigation[index + 1], navigation[index]];
                                                            return { ...current, navigation };
                                                        })}
                                                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                                                    ><MoveDown size={14} /></button>
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <Input
                                                    aria-label={`${item.id} category tab label`}
                                                    maxLength={40}
                                                    value={item.label}
                                                    onChange={event => setCatalog(current => ({
                                                        ...current,
                                                        navigation: current.navigation.map((entry, entryIndex) => entryIndex === index
                                                            ? { ...entry, label: event.target.value }
                                                            : entry)
                                                    }))}
                                                    className="h-11 rounded-xl bg-slate-50 font-semibold text-foreground"
                                                />
                                                <p className="mt-1 truncate px-1 text-[10px] text-slate-400">{item.href}</p>
                                            </div>
                                            <button
                                                type="button"
                                                aria-pressed={item.enabled}
                                                aria-label={`${item.enabled ? 'Hide' : 'Show'} ${item.label} tab`}
                                                onClick={() => setCatalog(current => ({
                                                    ...current,
                                                    navigation: current.navigation.map((entry, entryIndex) => entryIndex === index
                                                        ? { ...entry, enabled: !entry.enabled }
                                                        : entry)
                                                }))}
                                                className={cn(
                                                    "flex h-10 items-center gap-2 rounded-xl px-3 text-[9px] font-black uppercase tracking-wide transition-colors",
                                                    item.enabled ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                                                )}
                                            >
                                                {item.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
                                                <span className="hidden sm:inline">{item.enabled ? 'Visible' : 'Hidden'}</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-500">Changes appear in the desktop and mobile category bars after you save. Category links are fixed so customers always land on the correct page.</p>
                            </Card>

                            <Card className="rounded-[3rem] border border-slate-100 p-10 bg-white shadow-sm space-y-8 text-left">
                                <div className="flex justify-between items-center text-left">
                                    <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><Wine className="h-5 w-5 text-primary" /> Menu Manager</h2>
                                    <Button onClick={() => setCatalog({ ...catalog, categories: [...catalog.categories, { id: '', label: '' }] })} variant="outline" className="h-10 rounded-xl text-[8px] font-black uppercase"><Plus className="h-3 w-3 mr-2" /> New Category</Button>
                                </div>
                                <div className="space-y-4 text-left">
                                    {catalog.categories.map((cat, idx) => (
                                        <div key={idx} className="flex gap-4 items-end p-6 bg-secondary rounded-3xl border border-border relative group/cat text-left">
                                            <div className="flex-1 space-y-2 text-left">
                                                <label className="text-[8px] font-black uppercase text-muted-foreground ml-1">Label (Visible to patrons)</label>
                                                <Input value={cat.label} onChange={e => {
                                                    const newCats = [...catalog.categories];
                                                    newCats[idx].label = e.target.value;
                                                    setCatalog({ ...catalog, categories: newCats });
                                                }} className="h-12 rounded-xl bg-card border-none font-bold text-foreground" placeholder="e.g. Premium Whiskey" />
                                            </div>
                                            <div className="flex-1 space-y-2 text-left">
                                                <label className="text-[8px] font-black uppercase text-muted-foreground ml-1">Slug/ID (Database tag)</label>
                                                <Input value={cat.id} onChange={e => {
                                                    const newCats = [...catalog.categories];
                                                    newCats[idx].id = e.target.value.toLowerCase().replace(/\s+/g, '-');
                                                    setCatalog({ ...catalog, categories: newCats });
                                                }} className="h-12 rounded-xl bg-card border-none font-mono text-xs text-foreground" placeholder="e.g. whiskey" />
                                            </div>
                                            <button
                                                onClick={() => setCatalog({ ...catalog, categories: catalog.categories.filter((_, i) => i !== idx) })}
                                                className="h-12 w-12 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-rose-500 transition-colors opacity-0 group-hover/cat:opacity-100"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* OPERATIONS TAB */}
                    {activeTab === 'ops' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-left">
                                <div className="bg-card rounded-[2.5rem] border border-border p-10 shadow-sm space-y-8 flex flex-col text-left">
                                    <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3">
                                        <Phone className="h-5 w-5 text-primary" /> Contact Hub
                                    </h2>
                                    <div className="space-y-5 flex-1 text-left">
                                        <div className="space-y-1 text-left">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">WhatsApp Business</label>
                                            <Input value={contact.whatsapp} onChange={e => setContact({...contact, whatsapp: e.target.value})} className="rounded-2xl h-14 bg-secondary border-border font-bold text-foreground" />
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Support Email</label>
                                            <Input value={contact.email} onChange={e => setContact({...contact, email: e.target.value})} className="rounded-2xl h-14 bg-secondary border-border font-bold text-foreground" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-card rounded-[2.5rem] border border-border p-10 shadow-sm space-y-8 flex flex-col text-left">
                                    <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3">
                                        <Truck className="h-5 w-5 text-primary" /> Delivery Prices
                                    </h2>
                                    <p className="text-sm text-muted-foreground">Set the standard transport charge for each checkout region. Saved prices appear in the customer&apos;s order total; a configured free-delivery boundary overrides the charge.</p>
                                    <div className="space-y-4 flex-1 text-left">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Local Zone Label</label>
                                                <Input value={shipping.nairobi_cbd_label} onChange={e => setShipping({...shipping, nairobi_cbd_label: e.target.value})} className="rounded-xl h-12 bg-secondary border-border font-bold text-foreground" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Fee (Ksh)</label>
                                                <Input type="number" min="0" step="1" value={shipping.nairobi_cbd} onChange={e => setShipping({...shipping, nairobi_cbd: Number(e.target.value)})} className="rounded-xl h-12 bg-secondary border-border font-black text-foreground" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Secondary Label</label>
                                                <Input value={shipping.nairobi_outskirts_label} onChange={e => setShipping({...shipping, nairobi_outskirts_label: e.target.value})} className="rounded-xl h-12 bg-secondary border-border font-bold text-foreground" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Fee (Ksh)</label>
                                                <Input type="number" min="0" step="1" value={shipping.nairobi_outskirts} onChange={e => setShipping({...shipping, nairobi_outskirts: Number(e.target.value)})} className="rounded-xl h-12 bg-secondary border-border font-black text-foreground" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Upcountry Label</label>
                                                <Input value={shipping.upcountry_label} onChange={e => setShipping({...shipping, upcountry_label: e.target.value})} className="rounded-xl h-12 bg-secondary border-border font-bold text-foreground" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Fee (Ksh)</label>
                                                <Input type="number" min="0" step="1" value={shipping.upcountry} onChange={e => setShipping({...shipping, upcountry: Number(e.target.value)})} className="rounded-xl h-12 bg-secondary border-border font-black text-foreground" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8">
                                <DeliveryAreaManager />
                            </div>

                            <Card className="rounded-[3rem] border border-border p-10 bg-card shadow-sm space-y-8 mt-8 text-left">
                                <div className="flex justify-between items-center text-left">
                                    <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><MapPin className="h-5 w-5 text-primary" /> Delivery Zones</h2>
                                    <Button onClick={() => setLogistics({ ...logistics, dispatch_zones: [...logistics.dispatch_zones, ''] })} variant="outline" className="h-10 rounded-xl text-[8px] font-black uppercase"><Plus className="h-3 w-3 mr-2" /> Add Zone</Button>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                                    {logistics.dispatch_zones.map((zone, idx) => (
                                        <div key={idx} className="relative group text-left">
                                            <Input
                                                value={zone}
                                                onChange={e => {
                                                    const newZones = [...logistics.dispatch_zones];
                                                    newZones[idx] = e.target.value;
                                                    setLogistics({ ...logistics, dispatch_zones: newZones });
                                                }}
                                                className="h-12 rounded-xl bg-secondary border-border pr-10 font-bold text-[10px] text-foreground"
                                            />
                                            <button
                                                onClick={() => setLogistics({ ...logistics, dispatch_zones: logistics.dispatch_zones.filter((_, i) => i !== idx) })}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* AI NODE TAB */}
                    {activeTab === 'ai' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-slate-100 p-10 bg-white shadow-sm space-y-10 text-left">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-6">
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground uppercase flex items-center gap-3"><Bot className="h-6 w-6 text-primary" /> AI Gateway Linkage Hub</h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configure & Link Generative AI Providers for Bar Copy, Voice & Vision</p>
                                    </div>
                                    <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-200">
                                        GATEWAYS ACTIVE
                                    </span>
                                </div>

                                <div className="space-y-8">
                                    <div className="rounded-3xl border border-primary/15 bg-primary/5 p-6 space-y-5">
                                        <div>
                                            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">AI Concierge behavior</h3>
                                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                Switch back to Classic any time to restore the original recommendation rules and ignore managed settings.
                                            </p>
                                        </div>
                                        <div className="grid gap-5 sm:grid-cols-2">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-muted-foreground">Recommendation mode</label>
                                                <select
                                                    value={aiConfig.concierge_mode}
                                                    onChange={e => setAiConfig({
                                                        ...aiConfig,
                                                        concierge_mode: e.target.value === 'managed' ? 'managed' : 'classic'
                                                    })}
                                                    className="h-14 w-full rounded-2xl border border-border bg-white px-4 text-sm font-bold text-foreground"
                                                >
                                                    <option value="classic">Classic — restore original behavior</option>
                                                    <option value="managed">Managed — use the controls below</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-muted-foreground">Maximum recommendations (1–6)</label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={6}
                                                    value={aiConfig.recommendation_limit}
                                                    disabled={aiConfig.concierge_mode !== 'managed'}
                                                    onChange={e => setAiConfig({ ...aiConfig, recommendation_limit: Number(e.target.value) })}
                                                    className="h-14 rounded-2xl bg-white border-border font-bold text-foreground"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-muted-foreground">House party categories</label>
                                                <Input
                                                    value={aiConfig.party_categories.join(', ')}
                                                    disabled={aiConfig.concierge_mode !== 'managed'}
                                                    onChange={e => setAiConfig({
                                                        ...aiConfig,
                                                        party_categories: e.target.value.split(',').map(category => category.trim().toLowerCase()).filter(Boolean)
                                                    })}
                                                    placeholder="spirits, snacks, mixers"
                                                    className="h-14 rounded-2xl bg-white border-border font-bold text-foreground"
                                                />
                                                <p className="text-[10px] text-muted-foreground">Enter product categories separated by commas.</p>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-muted-foreground">Date night categories</label>
                                                <Input
                                                    value={aiConfig.date_night_categories.join(', ')}
                                                    disabled={aiConfig.concierge_mode !== 'managed'}
                                                    onChange={e => setAiConfig({
                                                        ...aiConfig,
                                                        date_night_categories: e.target.value.split(',').map(category => category.trim().toLowerCase()).filter(Boolean)
                                                    })}
                                                    placeholder="wine, snacks, mixers"
                                                    className="h-14 rounded-2xl bg-white border-border font-bold text-foreground"
                                                />
                                                <p className="text-[10px] text-muted-foreground">Enter product categories separated by commas.</p>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-muted-foreground">Setup / gaming budget cap</label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={aiConfig.build_setup_limit}
                                                    disabled={aiConfig.concierge_mode !== 'managed'}
                                                    onChange={e => setAiConfig({ ...aiConfig, build_setup_limit: Number(e.target.value) })}
                                                    className="h-14 rounded-2xl bg-white border-border font-bold text-foreground"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* AI GATEWAY KEYS SECTION */}
                                    <div className="space-y-6">
                                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Generative API Gateways</h3>

                                        {/* Google Gemini */}
                                        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-3">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-black uppercase text-foreground">Google Gemini</label>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch('/api/admin/ai/verify', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ provider: 'GEMINI' })
                                                            });
                                                            const data = await res.json();
                                                            alert(data.message || `${data.status}`);
                                                        } catch (err) {
                                                            alert(`Gemini Link Test Error: ${err}`);
                                                        }
                                                    }}
                                                    className="h-8 px-3 rounded-xl border-slate-200 text-slate-600 hover:text-primary text-[8px] font-black uppercase"
                                                >
                                                    <Zap size={12} className="mr-1 text-amber-500 fill-current" /> Test Gemini Gateway
                                                </Button>
                                            </div>
                                            <p className="text-xs text-slate-500">The API key is stored only in your server environment as <code>GOOGLE_GEMINI_API_KEY</code>.</p>
                                        </div>

                                        {/* OpenAI GPT-4o */}
                                        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-3">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-black uppercase text-foreground">OpenAI</label>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch('/api/admin/ai/verify', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ provider: 'OPENAI' })
                                                            });
                                                            const data = await res.json();
                                                            alert(data.message || `${data.status}`);
                                                        } catch (err) {
                                                            alert(`OpenAI Link Test Error: ${err}`);
                                                        }
                                                    }}
                                                    className="h-8 px-3 rounded-xl border-slate-200 text-slate-600 hover:text-primary text-[8px] font-black uppercase"
                                                >
                                                    <Zap size={12} className="mr-1 text-emerald-500 fill-current" /> Test OpenAI Gateway
                                                </Button>
                                            </div>
                                            <p className="text-xs text-slate-500">The API key is stored only in your server environment as <code>OPENAI_API_KEY</code>.</p>
                                        </div>

                                        {/* Anthropic Claude */}
                                        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-3">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-black uppercase text-foreground">Anthropic Claude</label>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch('/api/admin/ai/verify', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ provider: 'CLAUDE' })
                                                            });
                                                            const data = await res.json();
                                                            alert(data.message || `${data.status}`);
                                                        } catch (err) {
                                                            alert(`Claude Link Test Error: ${err}`);
                                                        }
                                                    }}
                                                    className="h-8 px-3 rounded-xl border-slate-200 text-slate-600 hover:text-primary text-[8px] font-black uppercase"
                                                >
                                                    <Zap size={12} className="mr-1 text-indigo-500 fill-current" /> Test Claude Gateway
                                                </Button>
                                            </div>
                                            <p className="text-xs text-slate-500">The API key is stored only in your server environment as <code>ANTHROPIC_API_KEY</code>.</p>
                                        </div>
                                    </div>

                                    {/* GENERAL AI SETTINGS */}
                                    <div className="grid sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground">Primary Model Strategy</label>
                                            <select
                                                value={aiConfig.primary_gateway || 'AUTO'}
                                                onChange={e => setAiConfig({...aiConfig, primary_gateway: e.target.value})}
                                                className="w-full h-14 rounded-2xl border border-slate-200 bg-secondary px-4 text-xs font-black uppercase outline-none focus:ring-2 focus:ring-primary"
                                            >
                                                <option value="AUTO">Smart Auto-Failover (Gemini &rarr; OpenAI &rarr; Local)</option>
                                                <option value="GEMINI">Google Gemini 1.5 Flash (Fastest Copy)</option>
                                                <option value="OPENAI">OpenAI GPT-4o (High Precision)</option>
                                                <option value="CLAUDE">Anthropic Claude 3.5 Sonnet (Nuanced)</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground">AI Identity / Persona</label>
                                            <Input
                                                value={aiConfig.assistant_name}
                                                onChange={e => setAiConfig({...aiConfig, assistant_name: e.target.value})}
                                                className="h-14 rounded-2xl bg-secondary border-border font-bold text-foreground"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    onClick={() => handleSave('ai_config', aiConfig, true)}
                                    className="w-full h-16 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 hover:scale-105 transition-all"
                                >
                                    Authorize AI Gateways & Save Configuration
                                </Button>
                            </Card>
                        </div>
                    )}

                    {/* ONBOARDING TAB */}
                    {activeTab === 'onboarding' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-slate-100 p-10 bg-white shadow-sm space-y-10 text-left">
                                <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><UserPlus className="h-5 w-5 text-primary" /> Runner Onboarding Rules</h2>
                                <p className="text-[10px] font-medium text-slate-500 italic max-w-lg">Enable or disable steps in the rider onboarding flow. Changes are reflected in real-time on the Runner Terminal.</p>

                                <div className="space-y-6">
                                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 pb-2">Sequential Steps</h3>
                                    <div className="space-y-4">
                                        {onboarding.rider_steps.map((step, idx) => (
                                            <div key={step.id} className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between group transition-all hover:border-primary/20">
                                                <div className="flex items-center gap-6">
                                                    <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center font-black text-slate-300 text-[10px]">
                                                        {idx + 1}
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <p className="text-xs font-black uppercase text-foreground">{step.label}</p>
                                                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Step ID: {step.id}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newSteps = [...onboarding.rider_steps];
                                                        newSteps[idx].enabled = !newSteps[idx].enabled;
                                                        setOnboarding({ ...onboarding, rider_steps: newSteps });
                                                    }}
                                                    className={cn(
                                                        "w-12 h-6 rounded-full transition-all relative p-1 flex items-center shadow-inner",
                                                        step.enabled ? "bg-emerald-500" : "bg-slate-200"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                                                        step.enabled ? "translate-x-6" : "translate-x-0"
                                                    )} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 pb-2 pt-6">Verification Logic</h3>
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-4">
                                            <p className="text-[10px] font-black uppercase text-slate-400">Min Runner Age</p>
                                            <Input
                                                type="number"
                                                value={onboarding.rules?.min_age || 18}
                                                onChange={e => setOnboarding({...onboarding, rules: { ...onboarding.rules, min_age: Number(e.target.value) }})}
                                                className="h-12 rounded-xl bg-white border-slate-200 font-black"
                                            />
                                        </div>
                                        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-black uppercase text-slate-400">Strict License Check</p>
                                                <p className="text-[8px] font-medium text-slate-500 italic">Force valid license format.</p>
                                            </div>
                                            <button
                                                onClick={() => setOnboarding({...onboarding, rules: { ...onboarding.rules, require_license: !onboarding.rules?.require_license }})}
                                                className={cn(
                                                    "w-12 h-6 rounded-full transition-all relative p-1 flex items-center shadow-inner",
                                                    onboarding.rules?.require_license ? "bg-emerald-500" : "bg-slate-200"
                                                )}
                                            >
                                                <div className={cn(
                                                    "h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                                                    onboarding.rules?.require_license ? "translate-x-6" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <div className="p-8 rounded-[3rem] bg-indigo-50 border border-indigo-100 flex items-start gap-4">
                                <Info className="h-6 w-6 text-indigo-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-xs font-black uppercase text-indigo-700">Onboarding Sequence</p>
                                    <p className="text-[10px] text-indigo-600 font-medium leading-relaxed italic">
                                        &quot;Steps are executed in numerical order. Disabling a step will automatically bypass it in the Runner app. Essential steps like &apos;Phone&apos; should remain active for identity verification.&quot;
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* INTEGRATIONS & PAYMENT GATEWAYS TAB */}
                    {activeTab === 'integrations' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">

                            {/* 1. PAYMENT GATEWAYS HUB (PAYSTACK & M-PESA DARAJA) */}
                            <Card className="p-8 sm:p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-8 text-left">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-6">
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground uppercase flex items-center gap-3">
                                            <Zap className="h-6 w-6 text-emerald-500 fill-current" /> Payment Gateways & Callbacks
                                        </h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configure Paystack (Card/M-Pesa) & M-Pesa Express Daraja Credentials</p>
                                    </div>
                                    <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                        CREDENTIALS REQUIRED
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed">Keys entered here are used only for a connection test and are not saved. Configure server-side environment variables for persistent payment credentials.</p>

                                <div className="grid lg:grid-cols-2 gap-8">
                                    {/* Paystack Node */}
                                    <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-4 text-left">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-sm font-black uppercase text-foreground">Paystack Gateway</h3>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch('/api/admin/integrations/verify', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ nodeId: 'PAYSTACK', secretKey: gatewaysConfig.paystack_secret_key })
                                                        });
                                                        const data = await res.json();
                                                        alert(data.message || data.error || (data.success ? 'Paystack verified.' : 'Paystack connection was not verified.'));
                                                    } catch (err) { alert(`Paystack Error: ${err}`); }
                                                }}
                                                className="h-8 px-3 rounded-xl border-slate-200 text-slate-600 text-[8px] font-black uppercase hover:bg-emerald-50 hover:text-emerald-600"
                                            >
                                                Test Paystack Link
                                            </Button>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black uppercase text-slate-400">Paystack Secret Key</label>
                                                <Input
                                                    type="password"
                                                    placeholder="sk_live_..."
                                                    value={gatewaysConfig.paystack_secret_key}
                                                    onChange={e => setGatewaysConfig({...gatewaysConfig, paystack_secret_key: e.target.value})}
                                                    className="h-12 rounded-xl bg-white border-slate-200 font-mono text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black uppercase text-slate-400">Paystack Public Key</label>
                                                <Input
                                                    placeholder="pk_live_..."
                                                    value={gatewaysConfig.paystack_public_key}
                                                    onChange={e => setGatewaysConfig({...gatewaysConfig, paystack_public_key: e.target.value})}
                                                    className="h-12 rounded-xl bg-white border-slate-200 font-mono text-xs"
                                                />
                                            </div>
                                            <div className="p-3 bg-white rounded-xl border border-slate-100 text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                                                Webhook: <span className="text-emerald-600 font-mono">https://onlinebar.co.ke/api/paystack/webhook</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* M-Pesa Daraja Node */}
                                    <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-4 text-left">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-sm font-black uppercase text-foreground">M-Pesa Daraja STK Push</h3>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch('/api/admin/integrations/verify', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ nodeId: 'MPESA' })
                                                        });
                                                        const data = await res.json();
                                                        alert(data.message || data.error || (data.success ? 'M-Pesa verified.' : 'M-Pesa connection was not verified.'));
                                                    } catch (err) { alert(`M-Pesa Error: ${err}`); }
                                                }}
                                                className="h-8 px-3 rounded-xl border-slate-200 text-slate-600 text-[8px] font-black uppercase hover:bg-emerald-50 hover:text-emerald-600"
                                            >
                                                Test M-Pesa Link
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black uppercase text-slate-400">Shortcode / Till</label>
                                                <Input
                                                    placeholder="174379"
                                                    value={gatewaysConfig.mpesa_shortcode}
                                                    onChange={e => setGatewaysConfig({...gatewaysConfig, mpesa_shortcode: e.target.value})}
                                                    className="h-12 rounded-xl bg-white border-slate-200 font-mono text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black uppercase text-slate-400">Consumer Key</label>
                                                <Input
                                                    type="password"
                                                    placeholder="Daraja Key"
                                                    value={gatewaysConfig.mpesa_consumer_key}
                                                    onChange={e => setGatewaysConfig({...gatewaysConfig, mpesa_consumer_key: e.target.value})}
                                                    className="h-12 rounded-xl bg-white border-slate-200 font-mono text-xs"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black uppercase text-slate-400">M-Pesa Passkey</label>
                                            <Input
                                                type="password"
                                                placeholder="bfb279f..."
                                                value={gatewaysConfig.mpesa_passkey}
                                                onChange={e => setGatewaysConfig({...gatewaysConfig, mpesa_passkey: e.target.value})}
                                                className="h-12 rounded-xl bg-white border-slate-200 font-mono text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            {/* 2. GOOGLE MAPS PLATFORM NODE */}
                            <Card className="p-8 sm:p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-6 text-left">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-500 border border-rose-100" aria-hidden="true" />
                                        <div>
                                            <h3 className="text-lg font-black uppercase text-foreground">Google Maps Platform API</h3>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Powering Live Dispatch Map, Geocoding & Address Autocomplete</p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={async () => {
                                            try {
                                                const res = await fetch('/api/admin/integrations/verify', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ nodeId: 'GOOGLE_MAPS', apiKey: gatewaysConfig.google_maps_api_key })
                                                });
                                                const data = await res.json();
                                                alert(data.message || data.error || (data.success ? 'Google Maps verified.' : 'Google Maps connection was not verified.'));
                                            } catch (err) { alert(`Maps Error: ${err}`); }
                                        }}
                                        className="h-9 px-4 rounded-xl border-slate-200 text-slate-600 text-[9px] font-black uppercase hover:bg-rose-50 hover:text-rose-600"
                                    >
                                        Test Google Maps Key
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Google Maps API Key (Geocoding & JS API)</label>
                                    <Input
                                        type="password"
                                        placeholder="AIzaSy..."
                                        value={gatewaysConfig.google_maps_api_key}
                                        onChange={e => setGatewaysConfig({...gatewaysConfig, google_maps_api_key: e.target.value})}
                                        className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-mono text-xs text-foreground"
                                    />
                                </div>
                            </Card>

                            {/* 3. WHATSAPP & META PROTOCOL CONTROL DRAWERS */}
                            <Card className="p-6 sm:p-8 rounded-[2rem] bg-white border border-slate-100 shadow-sm space-y-5 text-left">
                                <div className="border-b border-slate-100 pb-4">
                                    <div className="flex items-center gap-3">
                                        <MessageSquare className="h-6 w-6 text-emerald-600" />
                                        <div>
                                            <h3 className="text-lg font-black uppercase text-foreground leading-snug">WhatsApp Business Webhook</h3>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Inbound verification endpoint</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid sm:grid-cols-2 gap-4 text-xs font-mono">
                                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <p className="text-[8px] font-black text-slate-400 uppercase font-sans">Supported behavior</p>
                                        <p className="font-bold text-foreground mt-1 leading-relaxed">Webhook verification only</p>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <p className="text-[8px] font-black text-slate-400 uppercase font-sans">Webhook endpoint path</p>
                                        <p className="font-bold text-emerald-600 mt-1 break-all">/api/webhooks/whatsapp</p>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed">Outgoing WhatsApp messages, provider credentials, and delivery testing are not implemented here. No test message has been sent.</p>
                            </Card>

                            {/* 3. SOCIAL & MESSAGING NODES GRID */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                                {[
                                                    { id: 'WHATSAPP', label: 'WhatsApp Business', icon: MessageSquare, type: 'Webhook', note: 'Inbound webhook verification is available. Outbound messaging and credential management are not wired in this admin yet.' },
                                                    { id: 'META', label: 'Meta (IG & FB)', icon: Share2, type: 'OAuth', note: 'Meta OAuth, token storage, and publishing are not configured yet.' },
                                                    { id: 'TIKTOK', label: 'TikTok Creator', icon: Music, type: 'OAuth', note: 'TikTok OAuth, token storage, and publishing are not configured yet.' },
                                                    { id: 'GOOGLE', label: 'YouTube / Google Ads', icon: Mail, type: 'OAuth', note: 'Google OAuth, token storage, and publishing are not configured yet.' },
                                                ].map((node) => (
                                                        <Card key={node.id} className="p-5 sm:p-6 rounded-[2rem] border space-y-5 group shadow-lg transition-all text-left relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border-slate-700 text-slate-100 hover:border-amber-500/50 hover:shadow-amber-950/20">
                                                            <div className="space-y-4 relative z-10 min-w-0">
                                                                <div className="flex items-start gap-3 min-w-0">
                                                                    <div className="h-11 w-11 rounded-2xl flex items-center justify-center bg-slate-800 border border-slate-700 text-amber-400 shadow-inner transition-transform group-hover:scale-110 shrink-0">
                                                                        <node.icon size={21} />
                                                                    </div>
                                                                    <div className="min-w-0 flex-1 pt-0.5">
                                                                        <h3 className="text-sm sm:text-base font-black uppercase tracking-normal leading-snug break-words text-white">{node.label}</h3>
                                                                        <p className="mt-1 text-[9px] font-bold text-slate-400 uppercase tracking-[0.16em]">{node.type} integration</p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <p className="min-w-0 flex-1 text-xs text-slate-300 leading-relaxed">{node.note}</p>
                                                                    <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase border tracking-wider flex items-center gap-1.5 shrink-0 bg-amber-500/10 text-amber-300 border-amber-400/30">
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                                                                        Setup required
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="pt-4 border-t border-slate-700/80 relative z-10">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    aria-expanded={expandedIntegration === node.id}
                                                                    onClick={() => setExpandedIntegration(current => current === node.id ? null : node.id)}
                                                                    className="w-full h-11 rounded-xl border-slate-600 bg-slate-800/70 text-slate-100 font-black uppercase text-[9px] tracking-widest hover:bg-slate-700 hover:text-white"
                                                                >
                                                                    {expandedIntegration === node.id ? 'Hide setup details' : 'View setup details'}
                                                                </Button>
                                                                {expandedIntegration === node.id && (
                                                                    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-300 leading-relaxed animate-in fade-in duration-200">
                                                                        <p className="font-bold text-white">This connection is not active.</p>
                                                                        <p className="mt-1">{node.note} No authorization or successful connection is being reported by this screen.</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </Card>
                                                ))}
                            </div>

                            <div className="p-8 rounded-[3rem] bg-amber-50 border border-amber-100 flex items-start gap-4 text-left">
                                <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-xs font-black uppercase text-amber-700">Credential Hygiene</p>
                                    <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                                        Do not paste provider secrets into this screen. Server-side credential storage and social OAuth flows must be configured before these connections can be activated.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* FEATURES TAB */}
                    {activeTab === 'features' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 text-left">
                            <Card className="rounded-[3rem] border border-slate-100 p-10 bg-white shadow-sm space-y-10 text-left">
                                <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-3"><Zap className="h-5 w-5 text-primary" /> Autonomous Operations</h2>
                                <div className="grid sm:grid-cols-2 gap-8">
                                    {[
                                        { id: 'ai_concierge_enabled', label: 'Mixology AI Concierge', desc: 'Conversational agent for drink recommendations.' },
                                        { id: 'dynamic_pricing_enabled', label: 'Pour Margin Engine', desc: 'Auto-adjust prices based on cellar velocity.' },
                                        { id: 'gamification_enabled', label: 'VIP Club & Rewards', desc: 'Streaks, missions, and patron rewards.' },
                                        { id: 'fraud_shield_enabled', label: 'Bar Fraud Shield', desc: 'Anomaly detection and rapid IP blocking.' },
                                    ].map(feat => (
                                        <div key={feat.id} className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between group transition-all hover:border-primary/20 text-left">
                                            <div className="space-y-1 text-left">
                                                <p className="text-xs font-black uppercase text-foreground">{feat.label}</p>
                                                <p className="text-[10px] text-slate-400 font-medium italic">{feat.desc}</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const key = feat.id as keyof typeof features;
                                                    setFeatures({...features, [key]: !features[key]});
                                                }}
                                                className={cn(
                                                    "w-12 h-6 rounded-full transition-all relative p-1 flex items-center shadow-inner",
                                                    features[feat.id as keyof typeof features] ? "bg-emerald-500" : "bg-slate-200"
                                                )}
                                            >
                                                <div className={cn(
                                                    "h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                                                    features[feat.id as keyof typeof features] ? "translate-x-6" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}
                </div>

                {/* SIDEBAR: LIVE PREVIEW & STATUS */}
                <div className="lg:col-span-4 space-y-10 text-left">

                    {/* STORE PULSE WIDGET */}
                    <Card className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-8 relative overflow-hidden group text-left">
                        <div className="relative z-10 space-y-8 text-left">
                            <div className="flex items-center justify-between text-left">
                                <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.4em]">Bar Pulse</h3>
                                <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-[9px] font-black uppercase border border-primary/20">
                                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Live
                                </div>
                            </div>

                            <div className="space-y-6 text-left">
                                <div className="flex justify-between items-center border-b border-border pb-4 text-left">
                                    <span className="text-[9px] font-black uppercase text-muted-foreground">Version</span>
                                    <span className="text-xs font-black text-foreground">v1.0.0-Bar</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-border pb-4 text-left">
                                    <span className="text-[9px] font-black uppercase text-muted-foreground">Cellar Storage</span>
                                    <span className="text-xs font-black text-foreground">68% Capacity</span>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* LIVE PREVIEW COMPONENT */}
                    <div className="space-y-4 text-left">
                        <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.4em] ml-4 flex items-center gap-2 text-left">
                            <Eye className="h-3 w-3" /> Real-time Menu Simulation
                        </h3>
                        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl overflow-hidden group text-left">
                            {/* Mini Header */}
                            <div className="bg-card p-6 border-b border-border flex justify-between items-center text-left">
                                <div className="flex items-center gap-2 text-left">
                                    <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary shadow-sm overflow-hidden">
                                        {logoPreview ? (
                                            <Image src={logoPreview} width={40} height={40} alt="Logo Preview" className="h-full w-full object-contain" />
                                        ) : (
                                            <Wine className="h-3.5 w-3.5" />
                                        )}
                                    </div>
                                    <span className="text-[9px] font-black uppercase text-foreground tracking-tight">{store.name}</span>
                                </div>
                            </div>
                            {/* Mini Hero */}
                            <div className="p-10 text-center space-y-6 relative overflow-hidden bg-secondary min-h-[350px] flex flex-col justify-center text-left">
                                {heroPreview && (
                                    <Image src={heroPreview} fill alt="Hero Preview" className="absolute inset-0 w-full h-full object-cover opacity-20" />
                                )}
                                <div className="relative z-10 space-y-4 text-left">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-primary">{homepage.hero_badge_text}</p>
                                    <h4 className="text-2xl font-black uppercase tracking-tighter text-foreground leading-[0.9] break-words text-left">
                                        {homepage.hero_title_line1}.<br/>
                                        <span style={{ color: theme.primary }} className="italic">{homepage.hero_title_line2}</span>
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground font-medium leading-relaxed italic line-clamp-2 px-4 text-left">{homepage.hero_subtitle}</p>
                                    <div className="pt-4 text-left">
                                        <button style={{ backgroundColor: theme.primary }} className="px-6 py-2.5 rounded-full text-white font-black uppercase text-[8px] tracking-widest shadow-xl shadow-primary/20">{homepage.primary_cta_label}</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-10 w-full max-w-4xl mx-auto px-4 text-left">
                <div className="bg-background/95 backdrop-blur-xl p-4 rounded-[2rem] shadow-2xl flex items-center gap-3 border border-border text-left">
                    <Button
                        disabled={savingKey !== null}
                        onClick={handlePublishAll}
                        className="flex-1 h-16 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-[0.2em] text-xs hover:bg-primary/90 transition-all active:scale-95 shadow-xl shadow-primary/20 group"
                    >
                        {savingKey === 'all' ? <Loader2 className="h-5 w-5 animate-spin mr-3" /> : <Rocket className="h-5 w-5 mr-3 group-hover:translate-y-[-2px] group-hover:translate-x-[2px] transition-transform" />}
                        Sync All Bar Data
                    </Button>
                </div>
            </div>
        </div>
    );
}
