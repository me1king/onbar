'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Zap,
    Save,
    Loader2,
    LayoutGrid,
    ImageIcon,
    DollarSign,
    ChevronRight,
    Search,
    ShieldCheck,
    Info,
    Plus,
    Trash2,
    Database,
    Globe,
    Share2,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import ProductCard from '@/components/home/ProductCard';
import Image from 'next/image';

type StudioSection = 'basic' | 'media' | 'pricing' | 'inventory' | 'display' | 'intelligence' | 'search';

interface ForgeProductData {
    [key: string]: string | number | boolean | string[] | number[] | Record<string, number> | Array<{ q: string, a: string }> | Array<{ key: string, value: string }> | undefined;
    id: number;
    name: string;
    brand: string;
    category: string;
    size_label: string;
    origin: string;
    price: number;
    old_price?: number;
    cost_price: number;
    stock: number;
    stock_threshold_low: number;
    stock_threshold_critical: number;
    is_new: boolean;
    is_featured: boolean;
    is_on_offer: boolean;
    is_bite: boolean;
    description: string;
    image_url: string;
    image_gallery: string[];
    specifications: Array<{ key: string, value: string }>;
    search_keywords: string[];
    search_aliases: string[];
    status: string;
    manufacturer: string;
    ingredients: string[];
    abv_label?: string;

    // Linked Intelligence (V33)
    sensory_metrics: Record<string, number>;
    pairing_suggestions: string[];
    faq_data: Array<{ q: string, a: string }>;
    bought_together_ids: number[];
}

interface CatalogSuggestion {
    name: string;
    brand?: string;
    category?: string;
    abv?: number;
    country?: string;
    manufacturer?: string;
    ingredients?: string[];
    serving_size_ml?: number;
    description?: string;
}

interface CatalogSuggestion {
    name: string;
    brand?: string;
    category?: string;
    abv?: number;
    country?: string;
    manufacturer?: string;
    ingredients?: string[];
    serving_size_ml?: number;
    description?: string;
}

export default function ProductStudioTerminal() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [activeSection, setActiveSection] = React.useState<StudioSection>('basic');

    // Autofill State
    const [searchQuery, setSearchQuery] = React.useState('');
    const [suggestions, setSuggestions] = React.useState<CatalogSuggestion[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);

    // Comprehensive Form State
    const [form, setForm] = React.useState<ForgeProductData>({
        id: 0,
        name: '',
        brand: '',
        category: '',
        size_label: '',
        origin: '',
        price: 0,
        old_price: undefined,
        cost_price: 0,
        stock: 0,
        stock_threshold_low: 5,
        stock_threshold_critical: 2,
        is_new: true,
        is_featured: false,
        is_on_offer: false,
        is_bite: false,
        description: '',
        image_url: '',
        image_gallery: [],
        specifications: [],
        search_keywords: [],
        search_aliases: [],
        status: 'Live',
        manufacturer: '',
        ingredients: [],
        sensory_metrics: { body: 60, sweet: 60, smoke: 20, spice: 40 },
        pairing_suggestions: [],
        faq_data: [],
        bought_together_ids: []
    });

    React.useEffect(() => {
        async function loadProduct() {
            if (!supabase || !id) return;
            setLoading(true);
            try {
                const { data } = await supabase.from('products').select('*').eq('id', id).single();
                if (data) setForm({
                    ...data,
                    ingredients: data.ingredients || [],
                    sensory_metrics: data.sensory_metrics || { body: 60, sweet: 60, smoke: 20, spice: 40 },
                    pairing_suggestions: data.pairing_suggestions || [],
                    faq_data: data.faq_data || [],
                    bought_together_ids: data.bought_together_ids || []
                });
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        loadProduct();
    }, [id]);

    const handleAutofillSearch = async (val: string) => {
        setSearchQuery(val);
        if (val.length < 2) {
            setSuggestions([]);
            return;
        }
        setIsSearching(true);
        try {
            const res = await fetch(`/api/admin/products/autofill?q=${encodeURIComponent(val)}`);
            const data = await res.json();
            setSuggestions(data.suggestions || []);
        } catch (err) {
            console.error("Autofill failure:", err);
        } finally {
            setIsSearching(false);
        }
    };

    const applyAutofill = (item: CatalogSuggestion) => {
        setForm({
            ...form,
            name: item.name,
            brand: item.brand || form.brand,
            category: item.category || form.category,
            size_label: item.serving_size_ml ? `${item.serving_size_ml}ml` : form.size_label,
            origin: item.country || form.origin,
            manufacturer: item.manufacturer || form.manufacturer,
            ingredients: item.ingredients || [],
            abv_label: item.abv ? `${item.abv}%` : form.abv_label,
            description: item.description || form.description
        });
        setSuggestions([]);
        setSearchQuery('');
    };

    const handleSave = async () => {
        if (!supabase || !id) return;
        setSaving(true);
        try {
            // High-fidelity sync including new V33 intelligence nodes
            const { error } = await supabase.from('products').update({
                name: form.name,
                brand: form.brand,
                category: form.category,
                size_label: form.size_label,
                origin: form.origin,
                price: Number(form.price),
                old_price: form.old_price ? Number(form.old_price) : null,
                cost_price: Number(form.cost_price),
                stock: Number(form.stock),
                stock_threshold_low: Number(form.stock_threshold_low),
                stock_threshold_critical: Number(form.stock_threshold_critical),
                is_new: form.is_new,
                is_featured: form.is_featured,
                is_on_offer: form.is_on_offer,
                is_bite: form.is_bite,
                description: form.description,
                image_url: form.image_url,
                image_gallery: form.image_gallery,
                specifications: form.specifications,
                search_keywords: form.search_keywords,
                search_aliases: form.search_aliases,
                status: form.status,
                manufacturer: form.manufacturer,
                ingredients: form.ingredients,
                abv_label: form.abv_label,
                beverage_specs: {
                    abv: form.abv_label,
                    origin: form.origin
                },
                sensory_metrics: form.sensory_metrics,
                pairing_suggestions: form.pairing_suggestions,
                faq_data: form.faq_data,
                bought_together_ids: form.bought_together_ids
            }).eq('id', id);

            if (error) throw error;
            alert("Product Node Synchronized. 🛰️");
        } catch (err: unknown) {
            const error = err as Error;
            alert(`Sync Failure: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'number' ? Number(value) : value;
        setForm({ ...form, [name]: val });
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Establishing Studio Connection...</p>
        </div>
    );

    const sections = [
        { id: 'basic', label: 'Basic Info', icon: Info },
        { id: 'media', label: 'Media Hub', icon: ImageIcon },
        { id: 'pricing', label: 'Economics', icon: DollarSign },
        { id: 'inventory', label: 'Logistics', icon: Database },
        { id: 'display', label: 'Visual Display', icon: LayoutGrid },
        { id: 'intelligence', label: 'Intelligence', icon: Zap },
        { id: 'search', label: 'Discovery', icon: Search },
    ];

    return (
        <div className="p-8 space-y-12 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700">

            {/* STUDIO HEADER */}
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-10 border-b border-slate-200 pb-10">
                <div className="flex items-center gap-8">
                    <button onClick={() => router.back()} className="h-14 w-14 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 hover:text-primary transition-all shadow-sm">
                        <ArrowLeft size={28} />
                    </button>
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <Zap className="h-4 w-4 text-primary" fill="currentColor" />
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary italic">Product Studio Terminal v3.0</span>
                        </div>
                        <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                            Edit: <span className="text-primary">{form.name}</span>
                        </h1>
                    </div>
                </div>
                <div className="flex gap-4">
                    <Button onClick={handleSave} disabled={saving} className="rounded-2xl h-16 px-10 bg-slate-900 text-white font-black uppercase text-xs tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                        {saving ? <Loader2 className="animate-spin mr-3" /> : <Save className="h-5 w-5 mr-3" />} Sync & Publish
                    </Button>
                </div>
            </header>

            <div className="grid xl:grid-cols-12 gap-12">

                {/* LEFT: LIVE PREVIEW STAGE */}
                <div className="xl:col-span-4 space-y-10 order-2 xl:order-1">
                    <div className="sticky top-10 space-y-10">
                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-slate-400 px-6 italic">Live Grid Preview</h3>
                            <div className="max-w-[340px] mx-auto xl:mx-0 transform-gpu rotate-[-1deg] hover:rotate-0 transition-transform duration-700">
                                <ProductCard product={form} />
                            </div>
                        </div>

                        <Card className="p-10 rounded-[4rem] bg-slate-900 text-white border-none shadow-2xl relative overflow-hidden group">
                            <div className="relative z-10 space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20"><ShieldCheck size={20} /></div>
                                    <h4 className="text-xl font-black uppercase tracking-tight italic">Studio Protocol</h4>
                                </div>
                                <p className="text-[11px] font-medium opacity-80 leading-relaxed italic">
                                    &quot;Real-time rendering node active. Every micro-adjustment is visualized instantly. Use this stage to ensure perfect patron presentation.&quot;
                                </p>
                            </div>
                            <Zap className="absolute -bottom-10 -right-10 h-64 w-64 text-white/5 rotate-12 -z-0" />
                        </Card>
                    </div>
                </div>

                {/* RIGHT: CONFIGURATION HUB */}
                <div className="xl:col-span-8 space-y-10 order-1 xl:order-2">

                    {/* Navigation Nodes */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                        {sections.map(sec => (
                            <button
                                key={sec.id}
                                onClick={() => setActiveSection(sec.id as StudioSection)}
                                className={cn(
                                    "flex items-center gap-3 h-14 px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shrink-0",
                                    activeSection === sec.id ? "bg-white border-primary text-primary shadow-lg" : "bg-slate-50 text-slate-400 border-transparent hover:bg-white hover:border-slate-200"
                                )}
                            >
                                <sec.icon size={16} /> {sec.label}
                            </button>
                        ))}
                    </div>

                    <Card className="p-10 rounded-[4rem] bg-white border border-slate-100 shadow-sm animate-in slide-in-from-right-4 duration-500 min-h-[600px] text-left">

                        {activeSection === 'basic' && (
                            <div className="space-y-10 animate-in fade-in duration-500">
                                {/* NEURAL AUTOFILL NODE */}
                                <div className="p-8 rounded-[2.5rem] bg-primary/5 border border-primary/10 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <Globe className="h-4 w-4 text-primary" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Neural Product Autofill</span>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            value={searchQuery}
                                            onChange={e => handleAutofillSearch(e.target.value)}
                                            placeholder="Search Global Master Catalog (e.g. Tusker, JW Black)..."
                                            className="h-14 rounded-2xl bg-white border-slate-200 pl-12 font-bold shadow-sm"
                                        />
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                            {isSearching ? <Loader2 size={18} className="animate-spin text-primary" /> : <Search size={18} className="text-slate-300" />}
                                        </div>

                                        {suggestions.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-300">
                                                {suggestions.map((item, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => applyAutofill(item)}
                                                        className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-all border-b border-slate-50 last:border-none group"
                                                    >
                                                        <div className="text-left">
                                                            <p className="text-xs font-black text-foreground uppercase tracking-tight">{item.name}</p>
                                                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.brand} &bull; {item.abv}% ABV &bull; {item.country}</p>
                                                        </div>
                                                        <ChevronRight size={14} className="text-slate-200 group-hover:text-primary transition-colors" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner"><Info size={24} /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Basic Information</h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Core Catalogue Node Details</p>
                                    </div>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Product Name</label>
                                        <Input name="name" value={String(form.name || '')} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Brand Identifier</label>
                                        <Input name="brand" value={String(form.brand || '')} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Origin Node</label>
                                        <Input name="origin" value={String(form.origin || '')} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100" placeholder="e.g. South Africa" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Volume/Size</label>
                                        <Input name="size_label" value={String(form.size_label || '')} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100" placeholder="e.g. 750ml" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Manufacturer</label>
                                        <Input name="manufacturer" value={String(form.manufacturer || '')} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">ABV (%)</label>
                                        <Input name="abv_label" value={String(form.abv_label || '')} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Component Profile (Ingredients CSV)</label>
                                    <Input
                                        value={(form.ingredients as string[])?.join(', ')}
                                        onChange={e => setForm({...form, ingredients: e.target.value.split(',').map(s => s.trim())})}
                                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Neural Narrative (Description)</label>
                                    <Textarea name="description" value={String(form.description || '')} onChange={handleInputChange} className="min-h-[150px] rounded-3xl bg-slate-50 border-slate-100 p-6 font-medium italic resize-none" />
                                </div>
                                <div className="space-y-6 text-left">
                                    <div className="flex justify-between items-center text-left">
                                        <h3 className="text-xs font-black uppercase text-foreground">Patron FAQs</h3>
                                        <Button type="button" onClick={() => setForm({...form, faq_data: [...form.faq_data, { q: '', a: '' }]})} variant="outline" className="h-8 w-8 rounded-lg border-slate-100 p-0"><Plus size={14} /></Button>
                                    </div>
                                    <div className="grid gap-3">
                                        {form.faq_data.map((f: { q: string, a: string }, i: number) => (
                                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 relative group">
                                                <Input
                                                    value={f.q}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].q = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="h-10 rounded-xl bg-white border-slate-100 text-[10px] font-black uppercase"
                                                    placeholder="Question"
                                                />
                                                <Textarea
                                                    value={f.a}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].a = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="min-h-[80px] rounded-xl bg-white border-slate-100 text-[10px] font-medium"
                                                    placeholder="Answer"
                                                />
                                                <button type="button" onClick={() => setForm({...form, faq_data: form.faq_data.filter((_, idx) => idx !== i)})} className="absolute top-2 right-2 h-8 w-8 text-slate-300 hover:text-rose-500"><X size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'media' && (
                            <div className="space-y-10 animate-in fade-in duration-500">
                                <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 shadow-inner"><ImageIcon size={24} /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Media Assets</h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">High-Fidelity Visual Hub</p>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Primary Image URL</label>
                                    <div className="flex gap-4">
                                        <Input name="image_url" value={form.image_url} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100" />
                                        <Button variant="outline" className="h-14 w-14 rounded-2xl border-slate-100"><Share2 size={18} /></Button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-[10px] font-black uppercase text-slate-400 ml-1">Gallery Node (Secondary Assets)</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        {form.image_gallery?.map((url: string, i: number) => (
                                            <div key={i} className="aspect-square rounded-3xl bg-slate-50 border border-slate-100 relative group overflow-hidden">
                                                <Image src={url} alt="" fill className="object-cover" />
                                                <button className="absolute top-2 right-2 h-8 w-8 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                                            </div>
                                        ))}
                                        <button className="aspect-square rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:text-primary transition-all"><Plus size={32} /></button>
                                    </div>
                                </div>
                                <div className="space-y-6 text-left">
                                    <div className="flex justify-between items-center text-left">
                                        <h3 className="text-xs font-black uppercase text-foreground">Patron FAQs</h3>
                                        <Button type="button" onClick={() => setForm({...form, faq_data: [...form.faq_data, { q: '', a: '' }]})} variant="outline" className="h-8 w-8 rounded-lg border-slate-100 p-0"><Plus size={14} /></Button>
                                    </div>
                                    <div className="grid gap-3">
                                        {form.faq_data.map((f, i) => (
                                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 relative group">
                                                <Input
                                                    value={f.q}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].q = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="h-10 rounded-xl bg-white border-slate-100 text-[10px] font-black uppercase"
                                                    placeholder="Question"
                                                />
                                                <Textarea
                                                    value={f.a}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].a = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="min-h-[80px] rounded-xl bg-white border-slate-100 text-[10px] font-medium"
                                                    placeholder="Answer"
                                                />
                                                <button type="button" onClick={() => setForm({...form, faq_data: form.faq_data.filter((_, idx) => idx !== i)})} className="absolute top-2 right-2 h-8 w-8 text-slate-300 hover:text-rose-500"><X size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'pricing' && (
                            <div className="space-y-10 animate-in fade-in duration-500">
                                <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-inner"><DollarSign size={24} /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Economics Terminal</h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Margins & Tactical Pricing</p>
                                    </div>
                                </div>
                                <div className="grid sm:grid-cols-3 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Grid Price (Selling)</label>
                                        <Input type="number" name="price" value={form.price} onChange={handleInputChange} className="h-14 rounded-2xl bg-primary/5 border-primary/20 text-primary font-black text-xl pl-6" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Old Price (Anchor)</label>
                                        <Input type="number" name="old_price" value={form.old_price || ''} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" placeholder="Optional" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Acquisition Cost</label>
                                        <Input type="number" name="cost_price" value={form.cost_price} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                                    </div>
                                </div>
                                <div className="space-y-6 text-left">
                                    <div className="flex justify-between items-center text-left">
                                        <h3 className="text-xs font-black uppercase text-foreground">Patron FAQs</h3>
                                        <Button type="button" onClick={() => setForm({...form, faq_data: [...form.faq_data, { q: '', a: '' }]})} variant="outline" className="h-8 w-8 rounded-lg border-slate-100 p-0"><Plus size={14} /></Button>
                                    </div>
                                    <div className="grid gap-3">
                                        {form.faq_data.map((f, i) => (
                                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 relative group">
                                                <Input
                                                    value={f.q}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].q = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="h-10 rounded-xl bg-white border-slate-100 text-[10px] font-black uppercase"
                                                    placeholder="Question"
                                                />
                                                <Textarea
                                                    value={f.a}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].a = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="min-h-[80px] rounded-xl bg-white border-slate-100 text-[10px] font-medium"
                                                    placeholder="Answer"
                                                />
                                                <button type="button" onClick={() => setForm({...form, faq_data: form.faq_data.filter((_, idx) => idx !== i)})} className="absolute top-2 right-2 h-8 w-8 text-slate-300 hover:text-rose-500"><X size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'inventory' && (
                            <div className="space-y-10 animate-in fade-in duration-500">
                                <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 shadow-inner"><Database size={24} /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Logistics Node</h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Integrity & Thresholds</p>
                                    </div>
                                </div>
                                <div className="grid sm:grid-cols-3 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Current Stock</label>
                                        <Input type="number" name="stock" value={form.stock} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-black text-lg" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Low Warning</label>
                                        <Input type="number" name="stock_threshold_low" value={form.stock_threshold_low} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nuclear Limit</label>
                                        <Input type="number" name="stock_threshold_critical" value={form.stock_threshold_critical} onChange={handleInputChange} className="h-14 rounded-2xl bg-slate-50 border-slate-100" />
                                    </div>
                                </div>
                                <div className="space-y-6 text-left">
                                    <div className="flex justify-between items-center text-left">
                                        <h3 className="text-xs font-black uppercase text-foreground">Patron FAQs</h3>
                                        <Button type="button" onClick={() => setForm({...form, faq_data: [...form.faq_data, { q: '', a: '' }]})} variant="outline" className="h-8 w-8 rounded-lg border-slate-100 p-0"><Plus size={14} /></Button>
                                    </div>
                                    <div className="grid gap-3">
                                        {form.faq_data.map((f, i) => (
                                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 relative group">
                                                <Input
                                                    value={f.q}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].q = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="h-10 rounded-xl bg-white border-slate-100 text-[10px] font-black uppercase"
                                                    placeholder="Question"
                                                />
                                                <Textarea
                                                    value={f.a}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].a = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="min-h-[80px] rounded-xl bg-white border-slate-100 text-[10px] font-medium"
                                                    placeholder="Answer"
                                                />
                                                <button type="button" onClick={() => setForm({...form, faq_data: form.faq_data.filter((_, idx) => idx !== i)})} className="absolute top-2 right-2 h-8 w-8 text-slate-300 hover:text-rose-500"><X size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'display' && (
                            <div className="space-y-10 animate-in fade-in duration-500">
                                <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner"><LayoutGrid size={24} /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Display Protocol</h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grid Visibility Control</p>
                                    </div>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    {[
                                        { k: 'is_featured', l: '⭐ Featured Selection' },
                                        { k: 'is_new', l: '✨ Marked as New' },
                                        { k: 'is_on_offer', l: '🏷️ Strategic Offer' },
                                        { k: 'is_bite', l: '🥘 Night Bite Logic' },
                                    ].map(flag => (
                                        <button
                                            key={flag.k}
                                            onClick={() => setForm({ ...form, [flag.k]: !form[flag.k] })}
                                            className={cn(
                                                "p-6 rounded-3xl border transition-all text-left flex items-center justify-between group/flag",
                                                form[flag.k] ? "bg-slate-900 text-white border-slate-900 shadow-xl" : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-white"
                                            )}
                                        >
                                            <span className="text-[11px] font-black uppercase tracking-widest">{flag.l}</span>
                                            <div className={cn("h-6 w-12 rounded-full relative transition-colors p-1", form[flag.k] ? "bg-primary" : "bg-slate-200")}>
                                                <div className={cn("h-4 w-4 rounded-full bg-white transition-all", form[flag.k] ? "translate-x-6" : "translate-x-0")} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Badge Override Node</label>
                                    <Input
                                        name="badge_override"
                                        value={String(form.badge_override || '')}
                                        onChange={handleInputChange}
                                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold"
                                        placeholder="e.g. VVIP ONLY"
                                    />
                                </div>
                                <div className="space-y-6 text-left">
                                    <div className="flex justify-between items-center text-left">
                                        <h3 className="text-xs font-black uppercase text-foreground">Patron FAQs</h3>
                                        <Button type="button" onClick={() => setForm({...form, faq_data: [...form.faq_data, { q: '', a: '' }]})} variant="outline" className="h-8 w-8 rounded-lg border-slate-100 p-0"><Plus size={14} /></Button>
                                    </div>
                                    <div className="grid gap-3">
                                        {form.faq_data.map((f, i) => (
                                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 relative group">
                                                <Input
                                                    value={f.q}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].q = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="h-10 rounded-xl bg-white border-slate-100 text-[10px] font-black uppercase"
                                                    placeholder="Question"
                                                />
                                                <Textarea
                                                    value={f.a}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].a = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="min-h-[80px] rounded-xl bg-white border-slate-100 text-[10px] font-medium"
                                                    placeholder="Answer"
                                                />
                                                <button type="button" onClick={() => setForm({...form, faq_data: form.faq_data.filter((_, idx) => idx !== i)})} className="absolute top-2 right-2 h-8 w-8 text-slate-300 hover:text-rose-500"><X size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'intelligence' && (
                            <div className="space-y-10 animate-in fade-in duration-500">
                                <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 shadow-inner"><Zap size={24} /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Grid Intelligence</h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sensory & Behavioral Linkage</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-xs font-black uppercase text-foreground">Sensory DNA (0-100)</h3>
                                    <div className="grid sm:grid-cols-2 gap-6">
                                        {['body', 'sweet', 'smoke', 'spice'].map(key => (
                                            <div key={key} className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{key}</label>
                                                <Input
                                                    type="number"
                                                    min="0" max="100"
                                                    value={form.sensory_metrics[key] || 0}
                                                    onChange={e => setForm({
                                                        ...form,
                                                        sensory_metrics: { ...form.sensory_metrics, [key]: Number(e.target.value) }
                                                    })}
                                                    className="h-12 rounded-xl bg-slate-50 border-slate-100 font-bold"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Pairing Suggestions (CSV)</label>
                                    <Input
                                        value={form.pairing_suggestions?.join(', ')}
                                        onChange={e => setForm({...form, pairing_suggestions: e.target.value.split(',').map(s => s.trim())})}
                                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold"
                                        placeholder="e.g. Nyama Choma, Dark Chocolate..."
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Bought Together IDs (CSV)</label>
                                    <Input
                                        value={form.bought_together_ids?.join(', ')}
                                        onChange={e => setForm({...form, bought_together_ids: e.target.value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))})}
                                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-mono text-xs"
                                        placeholder="12, 45, 98"
                                    />
                                </div>
                                <div className="space-y-6 text-left">
                                    <div className="flex justify-between items-center text-left">
                                        <h3 className="text-xs font-black uppercase text-foreground">Patron FAQs</h3>
                                        <Button type="button" onClick={() => setForm({...form, faq_data: [...form.faq_data, { q: '', a: '' }]})} variant="outline" className="h-8 w-8 rounded-lg border-slate-100 p-0"><Plus size={14} /></Button>
                                    </div>
                                    <div className="grid gap-3">
                                        {form.faq_data.map((f, i) => (
                                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 relative group">
                                                <Input
                                                    value={f.q}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].q = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="h-10 rounded-xl bg-white border-slate-100 text-[10px] font-black uppercase"
                                                    placeholder="Question"
                                                />
                                                <Textarea
                                                    value={f.a}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].a = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="min-h-[80px] rounded-xl bg-white border-slate-100 text-[10px] font-medium"
                                                    placeholder="Answer"
                                                />
                                                <button type="button" onClick={() => setForm({...form, faq_data: form.faq_data.filter((_, idx) => idx !== i)})} className="absolute top-2 right-2 h-8 w-8 text-slate-300 hover:text-rose-500"><X size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'search' && (
                             <div className="space-y-10 animate-in fade-in duration-500">
                                <div className="flex items-center gap-4 border-b border-slate-50 pb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 shadow-inner"><Search size={24} /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter italic">Discovery Intelligence</h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Neural Search Aliases</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Search Keywords (CSV)</label>
                                    <Input
                                        value={form.search_keywords?.join(', ')}
                                        onChange={e => setForm({...form, search_keywords: e.target.value.split(',').map(s => s.trim())})}
                                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-mono text-xs"
                                        placeholder="premium, whiskey, smooth..."
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Alias Signals (CSV)</label>
                                    <Input
                                        value={form.search_aliases?.join(', ')}
                                        onChange={e => setForm({...form, search_aliases: e.target.value.split(',').map(s => s.trim())})}
                                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-mono text-xs"
                                        placeholder="JW Black, Black Label..."
                                    />
                                </div>
                                <div className="space-y-6 text-left">
                                    <div className="flex justify-between items-center text-left">
                                        <h3 className="text-xs font-black uppercase text-foreground">Patron FAQs</h3>
                                        <Button type="button" onClick={() => setForm({...form, faq_data: [...form.faq_data, { q: '', a: '' }]})} variant="outline" className="h-8 w-8 rounded-lg border-slate-100 p-0"><Plus size={14} /></Button>
                                    </div>
                                    <div className="grid gap-3">
                                        {form.faq_data.map((f, i) => (
                                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 relative group">
                                                <Input
                                                    value={f.q}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].q = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="h-10 rounded-xl bg-white border-slate-100 text-[10px] font-black uppercase"
                                                    placeholder="Question"
                                                />
                                                <Textarea
                                                    value={f.a}
                                                    onChange={e => {
                                                        const newFaq = [...form.faq_data];
                                                        newFaq[i].a = e.target.value;
                                                        setForm({...form, faq_data: newFaq});
                                                    }}
                                                    className="min-h-[80px] rounded-xl bg-white border-slate-100 text-[10px] font-medium"
                                                    placeholder="Answer"
                                                />
                                                <button type="button" onClick={() => setForm({...form, faq_data: form.faq_data.filter((_, idx) => idx !== i)})} className="absolute top-2 right-2 h-8 w-8 text-slate-300 hover:text-rose-500"><X size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                    </Card>

                </div>

            </div>

        </div>
    );
}
