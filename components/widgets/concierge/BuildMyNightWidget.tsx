'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Heart,
    Minus,
    Moon,
    Package,
    Plus,
    ShoppingBag,
    Sparkles,
    Users,
    Wine,
    Zap
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import DecodedImage from '@/components/ui/DecodedImage';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { OB_OS } from '@/lib/onlineBarOS';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

const PREFERENCES_KEY = 'build_my_night_preferences';
const STEPS = ['Occasion', 'Guests', 'Budget', 'Taste', 'Your night'] as const;
const TASTES = ['Beer', 'Wine', 'Spirits', 'Mocktails', 'Snacks', 'Street food', 'No alcohol'] as const;
type Taste = typeof TASTES[number];
type PlannerStep = 0 | 1 | 2 | 3 | 4;
type BuildMode = 'essential' | 'value' | 'premium';

const OCCASIONS = [
    { id: 'CELEBRATION', label: 'Celebration', icon: Sparkles, color: 'bg-amber-50 text-amber-700' },
    { id: 'DATE_NIGHT', label: 'Date night', icon: Heart, color: 'bg-rose-50 text-rose-600' },
    { id: 'PARTY', label: 'House party', icon: Users, color: 'bg-indigo-50 text-indigo-600' },
    { id: 'DINNER', label: 'Dinner tonight', icon: Wine, color: 'bg-emerald-50 text-emerald-700' },
    { id: 'CHILL', label: 'Chill night', icon: Moon, color: 'bg-slate-100 text-slate-700' },
    { id: 'GIFT', label: 'Premium gift', icon: Zap, color: 'bg-orange-50 text-orange-700' },
];

interface BuildResult {
    id: number;
    name: string;
    price: number;
    image_url: string;
    category: string;
    stock: number;
    is_available_now: boolean | null;
    is_souvenir: boolean | null;
    hide_product?: boolean | null;
    status?: string | null;
    sizes?: string[] | null;
    size?: string;
    variant_prices?: Record<string, number | string> | null;
    variant_stock?: Record<string, number> | null;
    beverage_specs?: { variant_prices?: Record<string, number | string> | null } | null;
}

interface PlanItem {
    product: BuildResult;
    quantity: number;
}

interface NightPlan {
    id: BuildMode;
    label: string;
    description: string;
    items: PlanItem[];
}

interface Preferences {
    occasion: string | null;
    guests: number;
    budget: number;
    tastes: Taste[];
}

const defaultPreferences: Preferences = {
    occasion: null,
    guests: 4,
    budget: 8000,
    tastes: ['Mocktails', 'Snacks']
};

function isNonAlcoholic(product: BuildResult) {
    return /\b(non[- ]?alcoholic|alcohol[- ]free|mocktail|juice|water|soda|soft drink|cola|coke|fanta|sprite|lemonade|mixer)\b/i
        .test(`${product.name} ${product.category}`);
}

function matchesTaste(product: BuildResult, tastes: Taste[]) {
    const text = `${product.name} ${product.category}`.toLowerCase();
    if (tastes.includes('No alcohol')) return isNonAlcoholic(product) || /\b(snack|bite|food|chips|crisps|nuts|fries|burger|pizza|wing|grill)\b/i.test(text);
    if (tastes.length === 0) return !/\b(souvenir|merchandise|flask|shot glass)\b/i.test(text);

    return tastes.some(taste => {
        if (taste === 'Beer') return /\b(beer|lager|stout|ale|pilsner)\b/i.test(text);
        if (taste === 'Wine') return /\b(wine|prosecco|champagne|sparkling)\b/i.test(text);
        if (taste === 'Spirits') return /\b(spirit|gin|vodka|whisk?y|rum|tequila|brandy|cognac)\b/i.test(text);
        if (taste === 'Mocktails') return isNonAlcoholic(product);
        if (taste === 'Snacks') return /\b(snack|bite|food|chips|crisps|nuts|munch)\b/i.test(text);
        return /\b(street food|nyama|grill|burger|pizza|fries|wings|chapati)\b/i.test(text);
    });
}

function buildPlan(
    products: BuildResult[],
    budget: number,
    mode: BuildMode
): NightPlan {
    const definitions: Record<BuildMode, Omit<NightPlan, 'id' | 'items'>> = {
        essential: { label: 'Essential', description: 'A lighter, simple set for sharing.' },
        value: { label: 'Best value', description: 'A balanced mix for your plans.' },
        premium: { label: 'Premium', description: 'More choice for a fuller celebration.' }
    };
    const candidates = [...products];
    if (mode === 'essential') candidates.sort((a, b) => a.price - b.price);
    if (mode === 'premium') candidates.sort((a, b) => b.price - a.price);

    const itemLimit = mode === 'essential' ? 2 : mode === 'value' ? 4 : 5;
    const items: PlanItem[] = [];
    let total = 0;
    for (const product of candidates) {
        if (items.length >= itemLimit) break;
        if (total + product.price > budget) continue;
        items.push({ product, quantity: 1 });
        total += product.price;
    }

    return { id: mode, ...definitions[mode], items };
}

function planTotal(plan: NightPlan) {
    return plan.items.reduce((total, item) => total + item.product.price * item.quantity, 0);
}

function chooseInStockVariant(product: BuildResult): BuildResult | null {
    const variantPrices = product.variant_prices || product.beverage_specs?.variant_prices || {};
    const variants = (product.sizes || [])
        .map(size => ({
            size,
            price: Number(variantPrices[size] ?? product.price),
            stock: Number(product.variant_stock?.[size] ?? product.stock)
        }))
        .filter(variant => Number.isFinite(variant.price) && variant.price > 0
            && Number.isFinite(variant.stock) && variant.stock > 0)
        .sort((first, second) => first.price - second.price);
    if (variants.length) {
        return { ...product, ...variants[0] };
    }

    const price = Number(product.price);
    const stock = Number(product.stock);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(stock) || stock <= 0) return null;
    return { ...product, price, stock };
}

export default function BuildMyNightWidget({ compact = false }: { compact?: boolean }) {
    const [step, setStep] = React.useState<PlannerStep>(0);
    const [occasion, setOccasion] = React.useState<string | null>(defaultPreferences.occasion);
    const [guests, setGuests] = React.useState(defaultPreferences.guests);
    const [budget, setBudget] = React.useState(defaultPreferences.budget);
    const [tastes, setTastes] = React.useState<Taste[]>(defaultPreferences.tastes);
    const [plans, setPlans] = React.useState<NightPlan[]>([]);
    const [selectedPlan, setSelectedPlan] = React.useState<BuildMode>('value');
    const [catalog, setCatalog] = React.useState<BuildResult[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [addedToCart, setAddedToCart] = React.useState(false);
    const [ageConfirmed, setAgeConfirmed] = React.useState(false);
    const [preferencesLoaded, setPreferencesLoaded] = React.useState(false);
    const { addBundleToCart } = useCart();

    React.useEffect(() => {
        try {
            const saved = localStorage.getItem(PREFERENCES_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as Partial<Preferences>;
                if (typeof parsed.occasion === 'string' || parsed.occasion === null) setOccasion(parsed.occasion);
                if (typeof parsed.guests === 'number' && parsed.guests >= 1 && parsed.guests <= 30) setGuests(parsed.guests);
                if (typeof parsed.budget === 'number' && parsed.budget >= 500 && parsed.budget <= 50000) setBudget(parsed.budget);
                if (Array.isArray(parsed.tastes)) setTastes(parsed.tastes.filter((taste): taste is Taste => TASTES.includes(taste as Taste)));
            }
        } catch (storageError) {
            console.warn('[BuildMyNight] Could not restore planner preferences:', storageError);
        } finally {
            setPreferencesLoaded(true);
        }
    }, []);

    React.useEffect(() => {
        if (!preferencesLoaded) return;
        const preferences: Preferences = { occasion, guests, budget, tastes };
        try {
            localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
        } catch (storageError) {
            console.warn('[BuildMyNight] Could not save planner preferences:', storageError);
        }
    }, [occasion, guests, budget, tastes, preferencesLoaded]);

    const handleGenerate = async (preferences: Preferences = { occasion, guests, budget, tastes }) => {
        if (!preferences.occasion) {
            setError('Choose an occasion to get started.');
            return;
        }
        if (preferences.tastes.some(taste => ['Beer', 'Wine', 'Spirits'].includes(taste)) && !ageConfirmed) {
            setError('Confirm that you are 18 or older before viewing alcohol recommendations.');
            return;
        }
        setLoading(true);
        setError(null);
        setAddedToCart(false);
        try {
            const response = await fetch('/api/catalog/products?limit=500', { cache: 'no-store' });
            const result = await response.json() as { error?: string; products?: BuildResult[] };
            if (!response.ok) throw new Error(result.error || 'Product recommendations could not be loaded.');

            const eligible = (result.products || [])
                .filter(product => product.is_available_now !== false
                    && product.is_souvenir !== true
                    && isStorefrontProductVisible(product))
                .map(product => chooseInStockVariant({
                    ...product,
                    image_url: product.image_url || '',
                    category: product.category || 'Products'
                }))
                .filter((product): product is BuildResult => product !== null)
                .sort((first, second) => first.price - second.price) as BuildResult[];
            const matched = eligible.filter(product => matchesTaste(product, preferences.tastes));
            if (matched.length === 0) {
                setCatalog([]);
                setPlans([]);
                setError('No in-stock products match those tastes right now. Go back to adjust your picks.');
                return;
            }

            setCatalog(matched);
            const generated = (['essential', 'value', 'premium'] as const)
                .map(mode => buildPlan(matched, preferences.budget, mode))
                .filter(plan => plan.items.length > 0);
            if (generated.length === 0) {
                setPlans([]);
                setError(`No matching products fit under ${formatPrice(preferences.budget)}. Try raising your budget.`);
                return;
            }
            setPlans(generated);
            setSelectedPlan(generated.find(plan => plan.id === 'value')?.id || generated[0].id);
            setStep(4);
            void OB_OS.track('UI_INTERACTION', {
                details: {
                    id: 'concierge.plan_generated',
                    value: { occasion: preferences.occasion, guests: preferences.guests, budget: preferences.budget, tastes: preferences.tastes }
                }
            });
        } catch (requestError) {
            console.error('[BuildMyNight] Could not generate recommendations:', requestError);
            setError(requestError instanceof Error
                ? `Could not load recommendations: ${requestError.message}`
                : 'Could not load recommendations. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const selected = plans.find(plan => plan.id === selectedPlan);
    const total = selected ? planTotal(selected) : 0;
    const itemCount = selected?.items.reduce((count, item) => count + item.quantity, 0) || 0;

    const handleAddAll = () => {
        if (!selected || selected.items.length === 0) {
            setError('Choose a plan with at least one product before adding it to your bag.');
            return;
        }
        addBundleToCart(selected.items.map(({ product, quantity }) => ({
            id: product.id,
            name: product.name,
            price: product.price,
            base_price: product.price,
            image: normalizeImage(product.image_url),
            quantity,
            category: product.category,
            ...(product.size ? { size: product.size } : {})
        })));
        setAddedToCart(true);
        setError(null);
        void OB_OS.track('UI_INTERACTION', {
            details: { id: 'concierge.plan_added_to_cart', value: { plan: selected.id, itemCount, total } }
        });
    };

    const updatePlanItem = (planId: BuildMode, productId: number, change: 'remove' | 'decrease' | 'increase' | 'swap') => {
        const plan = plans.find(item => item.id === planId);
        const currentItem = plan?.items.find(item => item.product.id === productId);
        if (!plan || !currentItem) return;
        if (change === 'increase' && planTotal(plan) + currentItem.product.price > budget) {
            setError('That quantity would go over your budget. Increase your budget or choose another item.');
            return;
        }
        if (change === 'increase' && currentItem.quantity >= currentItem.product.stock) {
            setError(`Only ${currentItem.product.stock} of this item are currently in stock.`);
            return;
        }
        const existingIds = new Set(plan.items.map(item => item.product.id));
        const otherTotal = planTotal(plan) - currentItem.product.price * currentItem.quantity;
        const replacement = change === 'swap'
            ? catalog.find(product =>
                !existingIds.has(product.id)
                && otherTotal + product.price * currentItem.quantity <= budget
            )
            : undefined;
        if (change === 'swap' && !replacement) {
            setError('There is no in-stock alternative in this taste and budget range right now.');
            return;
        }
        setError(null);
        setPlans(current => current.map(plan => {
            if (plan.id !== planId) return plan;
            if (change === 'remove') {
                return { ...plan, items: plan.items.filter(item => item.product.id !== productId) };
            }
            if (change === 'decrease') {
                const item = plan.items.find(value => value.product.id === productId);
                if (!item) return plan;
                return {
                    ...plan,
                    items: item.quantity <= 1
                        ? plan.items.filter(item => item.product.id !== productId)
                        : plan.items.map(item => item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item)
                };
            }
            if (change === 'increase') {
                return { ...plan, items: plan.items.map(item => item.product.id === productId ? { ...item, quantity: item.quantity + 1 } : item) };
            }
            if (!replacement) return plan;
            return {
                ...plan,
                items: plan.items.map(item => item.product.id === productId
                    ? { ...item, product: replacement }
                    : item)
            };
        }));
        setAddedToCart(false);
    };

    const toggleTaste = (taste: Taste) => {
        setTastes(current => {
            if (taste === 'No alcohol') return current.includes(taste) ? [] : [taste];
            const withoutNoAlcohol = current.filter(value => value !== 'No alcohol');
            return withoutNoAlcohol.includes(taste)
                ? withoutNoAlcohol.filter(value => value !== taste)
                : [...withoutNoAlcohol, taste];
        });
        setError(null);
    };

    const surpriseMe = () => {
        const randomOccasion = OCCASIONS[Math.floor(Math.random() * OCCASIONS.length)].id;
        const randomGuests = 2 + Math.floor(Math.random() * 11);
        const randomBudget = 5000 + Math.floor(Math.random() * 16) * 1000;
        const randomTastes: Taste[] = Math.random() > 0.5 ? ['Mocktails', 'Snacks'] : ['Snacks', 'Street food'];
        const preferences = { occasion: randomOccasion, guests: randomGuests, budget: randomBudget, tastes: randomTastes };
        setOccasion(preferences.occasion);
        setGuests(preferences.guests);
        setBudget(preferences.budget);
        setTastes(preferences.tastes);
        setError(null);
        void OB_OS.track('UI_INTERACTION', { details: { id: 'concierge.surprise_me' } });
        void handleGenerate(preferences);
    };

    const nextStep = () => {
        setError(null);
        if (step === 0 && !occasion) {
            setError('Choose an occasion to continue.');
            return;
        }
        if (step < 3) {
            setStep((step + 1) as PlannerStep);
            void OB_OS.track('UI_INTERACTION', { details: { id: `concierge.step_${step + 1}_complete` } });
            return;
        }
        void handleGenerate();
    };

    return (
        <section className={cn(
            'w-full bg-[#faf9f6] px-4 py-6 text-slate-900 sm:px-7',
            compact ? 'min-h-full' : 'min-h-[calc(100dvh-5rem)] py-8 sm:py-12'
        )}>
            <div className="mx-auto w-full max-w-6xl">
                <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
                    <div className="max-w-2xl">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800">
                            <Sparkles size={13} aria-hidden="true" /> Your night, thoughtfully planned
                        </div>
                        <h1 className="font-sans text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Build my night</h1>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                            Tell us the occasion and your budget. We’ll find in-stock picks for your plans.
                        </p>
                    </div>
                    <Button
                        type="button"
                        onClick={surpriseMe}
                        disabled={loading}
                        variant="outline"
                        className="h-11 shrink-0 rounded-xl border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
                    >
                        <Sparkles size={16} className="mr-2" aria-hidden="true" /> Surprise me
                    </Button>
                </header>

                <div className="mb-6" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>Step {step + 1} of {STEPS.length}</span>
                        <span>{STEPS[step]}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                            className="h-full rounded-full bg-amber-500 transition-[width] duration-500 motion-reduce:transition-none"
                            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                        />
                    </div>
                    <ol className="mt-3 hidden grid-cols-5 gap-2 sm:grid">
                        {STEPS.map((label, index) => (
                            <li key={label} className={cn('text-xs font-medium', index <= step ? 'text-amber-900' : 'text-slate-400')}>
                                {index + 1}. {label}
                            </li>
                        ))}
                    </ol>
                </div>

                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(250px,0.75fr)]">
                    <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
                        <div key={step} className="animate-in fade-in slide-in-from-right-2 duration-300 motion-reduce:animate-none">
                            {step === 0 && (
                                <div>
                                    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">What are you planning?</h2>
                                    <p className="mt-1 text-sm text-slate-600">Pick an occasion to get started.</p>
                                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        {OCCASIONS.map(option => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                aria-pressed={occasion === option.id}
                                                onClick={() => { setOccasion(option.id); setError(null); }}
                                                className={cn(
                                                    'group relative flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none',
                                                    occasion === option.id ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-slate-200 bg-white'
                                                )}
                                            >
                                                <span className={cn('flex h-12 w-12 items-center justify-center rounded-xl', option.color)}>
                                                    <option.icon size={24} aria-hidden="true" />
                                                </span>
                                                <span className="text-sm font-semibold">{option.label}</span>
                                                {occasion === option.id && <Check size={16} className="absolute right-3 top-3 text-amber-700" aria-hidden="true" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {step === 1 && (
                                <div>
                                    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">How many guests?</h2>
                                    <p className="mt-1 text-sm text-slate-600">We’ll use this to shape a sensible mix.</p>
                                    <div className="mt-8 flex items-center justify-center gap-6">
                                        <button
                                            type="button"
                                            aria-label="Remove one guest"
                                            onClick={() => setGuests(value => Math.max(1, value - 1))}
                                            disabled={guests <= 1}
                                            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 text-slate-800 transition hover:border-amber-500 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-40"
                                        ><Minus size={18} aria-hidden="true" /></button>
                                        <div className="min-w-24 text-center" aria-live="polite">
                                            <span className="block text-5xl font-semibold tracking-tight tabular-nums">{guests}</span>
                                            <span className="mt-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">{guests === 1 ? 'guest' : 'guests'}</span>
                                        </div>
                                        <button
                                            type="button"
                                            aria-label="Add one guest"
                                            onClick={() => setGuests(value => Math.min(30, value + 1))}
                                            disabled={guests >= 30}
                                            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 text-slate-800 transition hover:border-amber-500 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-40"
                                        ><Plus size={18} aria-hidden="true" /></button>
                                    </div>
                                    <input
                                        aria-label="Number of guests"
                                        type="range"
                                        min="1"
                                        max="30"
                                        value={guests}
                                        onChange={event => setGuests(Number(event.target.value))}
                                        className="mt-8 w-full accent-amber-600"
                                    />
                                    <div className="mt-1 flex justify-between text-xs text-slate-500"><span>1</span><span>30 guests</span></div>
                                </div>
                            )}

                            {step === 2 && (
                                <div>
                                    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Set your budget</h2>
                                    <p className="mt-1 text-sm text-slate-600">Your plan will stay within this amount.</p>
                                    <p className="mt-8 text-center text-3xl font-semibold tracking-tight text-slate-900" aria-live="polite">
                                        {formatPrice(budget)}
                                        <span className="mt-2 block text-sm font-medium text-slate-500">for about {guests} {guests === 1 ? 'guest' : 'guests'}</span>
                                    </p>
                                    <input
                                        aria-label="Budget in Kenyan shillings"
                                        type="range"
                                        min="500"
                                        max="50000"
                                        step="500"
                                        value={budget}
                                        onChange={event => setBudget(Number(event.target.value))}
                                        className="mt-8 w-full accent-amber-600"
                                    />
                                    <div className="mt-1 flex justify-between text-xs text-slate-500"><span>KES 500</span><span>KES 50,000</span></div>
                                </div>
                            )}

                            {step === 3 && (
                                <div>
                                    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">What sounds good?</h2>
                                    <p className="mt-1 text-sm text-slate-600">Choose a few tastes. Non-alcoholic options are included too.</p>
                                    <div className="mt-5 flex flex-wrap gap-2">
                                        {TASTES.map(taste => (
                                            <button
                                                key={taste}
                                                type="button"
                                                aria-pressed={tastes.includes(taste)}
                                                onClick={() => toggleTaste(taste)}
                                                className={cn(
                                                    'min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2',
                                                    tastes.includes(taste) ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-amber-50'
                                                )}
                                            >
                                                {tastes.includes(taste) && <Check size={14} className="mr-1 inline" aria-hidden="true" />}{taste}
                                            </button>
                                        ))}
                                    </div>
                                    {tastes.some(taste => ['Beer', 'Wine', 'Spirits'].includes(taste)) && (
                                        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-950">
                                            <input
                                                type="checkbox"
                                                checked={ageConfirmed}
                                                onChange={event => { setAgeConfirmed(event.target.checked); setError(null); }}
                                                className="mt-1 accent-amber-700"
                                            />
                                            <span>I confirm I am 18 or older. Alcohol recommendations will only be shown after this confirmation.</span>
                                        </label>
                                    )}
                                </div>
                            )}

                            {step === 4 && (
                                <div>
                                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Your night, {occasion?.toLowerCase().replace('_', ' ')}</h2>
                                            <p className="mt-1 text-sm text-slate-600">{guests} {guests === 1 ? 'guest' : 'guests'} · up to {formatPrice(budget)}</p>
                                        </div>
                                        <button type="button" onClick={() => { setStep(0); setPlans([]); setAddedToCart(false); }} className="text-sm font-semibold text-amber-800 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
                                            Start over
                                        </button>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        {plans.map(plan => (
                                            <button
                                                key={plan.id}
                                                type="button"
                                                aria-pressed={selectedPlan === plan.id}
                                                onClick={() => { setSelectedPlan(plan.id); setAddedToCart(false); setError(null); }}
                                                className={cn(
                                                    'rounded-2xl border-2 p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none',
                                                    selectedPlan === plan.id ? 'border-amber-500 bg-amber-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                                                )}
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-semibold">{plan.label}</span>
                                                    {selectedPlan === plan.id && <Check size={16} className="text-amber-800" aria-hidden="true" />}
                                                </span>
                                                <span className="mt-1 block min-h-10 text-xs leading-5 text-slate-600">{plan.description}</span>
                                                <span className="mt-2 block text-lg font-semibold tabular-nums">{formatPrice(planTotal(plan))}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {selected && (
                                        <div className="mt-5 space-y-3">
                                            {selected.items.map(({ product, quantity }) => (
                                                <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                                                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                                                        {product.image_url
                                                            ? <DecodedImage src={normalizeImage(product.image_url)} alt="" fill sizes="56px" className="object-contain p-1" />
                                                            : <Package size={20} className="text-slate-400" aria-hidden="true" />}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                                                        <p className="text-xs text-slate-500">{product.category}{product.size ? ` · ${product.size}` : ''} · {formatPrice(product.price)} each</p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button type="button" aria-label={`Decrease ${product.name} quantity`} onClick={() => updatePlanItem(selected.id, product.id, 'decrease')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"><Minus size={14} aria-hidden="true" /></button>
                                                        <span className="w-6 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                                                        <button type="button" aria-label={`Increase ${product.name} quantity`} onClick={() => updatePlanItem(selected.id, product.id, 'increase')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"><Plus size={14} aria-hidden="true" /></button>
                                                    </div>
                                                    <div className="hidden min-w-20 text-right text-sm font-semibold tabular-nums sm:block">{formatPrice(product.price * quantity)}</div>
                                                    <button type="button" onClick={() => updatePlanItem(selected.id, product.id, 'swap')} aria-label={`Swap ${product.name}`} className="rounded-lg px-2 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">Swap</button>
                                                    <button type="button" onClick={() => updatePlanItem(selected.id, product.id, 'remove')} aria-label={`Remove ${product.name}`} className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">Remove</button>
                                                </div>
                                            ))}
                                            {selected.items.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This plan is empty. Choose another option or go back to adjust your tastes.</p>}
                                        </div>
                                    )}
                                    <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                                        Only available, in-stock items are suggested. Delivery coverage and arrival time are confirmed after you enter your address at checkout.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                            {step > 0 ? (
                                <Button type="button" variant="outline" onClick={() => { setStep((step - 1) as PlannerStep); setError(null); }} className="h-11 rounded-xl border-slate-300 px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-amber-600">
                                    <ChevronLeft size={16} className="mr-1" aria-hidden="true" /> Back
                                </Button>
                            ) : <span />}
                            {step < 4 ? (
                                <Button type="button" onClick={nextStep} disabled={loading} className="h-11 rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
                                    {step === 3 ? 'Build my night' : 'Continue'} <ChevronRight size={16} className="ml-1" aria-hidden="true" />
                                </Button>
                            ) : (
                                <Button type="button" onClick={handleAddAll} disabled={!selected || selected.items.length === 0 || addedToCart} className="h-11 rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 disabled:bg-emerald-700">
                                    {addedToCart ? <><Check size={16} className="mr-2" aria-hidden="true" /> Added to bag</> : <>Add plan to bag <ShoppingBag size={16} className="ml-2" aria-hidden="true" /></>}
                                </Button>
                            )}
                        </div>
                        {loading && <p className="mt-3 text-sm text-slate-600" role="status">Finding available picks for your night…</p>}
                        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}
                        {addedToCart && (
                            <Link href="/cart" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 underline underline-offset-4">
                                Your plan is in the bag. Review cart <ArrowRight size={15} aria-hidden="true" />
                            </Link>
                        )}
                    </Card>

                    <aside className="lg:sticky lg:top-6">
                        <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-800"><ShoppingBag size={19} aria-hidden="true" /></div>
                                <div>
                                    <h2 className="text-sm font-semibold">Your night at a glance</h2>
                                    <p className="text-xs text-slate-500">Updates as you make choices</p>
                                </div>
                            </div>
                            <dl className="mt-5 space-y-3 text-sm">
                                <div className="flex justify-between gap-3"><dt className="text-slate-500">Occasion</dt><dd className="text-right font-medium">{occasion ? occasion.replace('_', ' ').toLowerCase() : 'Not chosen'}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-slate-500">Guests</dt><dd className="font-medium">{guests}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-slate-500">Budget</dt><dd className="font-medium">{formatPrice(budget)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-slate-500">Taste</dt><dd className="max-w-[65%] text-right font-medium">{tastes.length ? tastes.join(', ') : 'Any'}</dd></div>
                            </dl>
                            <div className="mt-5 border-t border-slate-100 pt-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500">{step === 4 ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'Plan total'}</span>
                                    <span className="font-semibold tabular-nums">{step === 4 ? formatPrice(total) : '—'}</span>
                                </div>
                                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
                                    <Clock3 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                                    Delivery time is shown once your address is checked at checkout.
                                </p>
                            </div>
                            <p className="mt-4 text-xs leading-5 text-slate-500">You can change quantities or remove any pick before adding the plan to your bag.</p>
                        </Card>
                        <Link href="/shop" className="mt-4 inline-flex items-center gap-2 px-2 text-sm font-medium text-slate-600 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
                            Just browsing? Open the menu <ArrowRight size={15} aria-hidden="true" />
                        </Link>
                        {tastes.some(taste => ['Beer', 'Wine', 'Spirits'].includes(taste)) && (
                            <p className="mt-4 px-2 text-xs text-slate-500">Alcohol products are for adults 18+ only.</p>
                        )}
                    </aside>
                </div>
            </div>
        </section>
    );
}
