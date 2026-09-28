'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Gift,
    Plus,
    Loader2,
    Trash2,
    X,
    CheckCircle2,
    Star,
    ShoppingBag,
    Bot,
    Flame,
    Zap,
    Activity
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Image from 'next/image';

interface SouvenirProduct {
    id: number | string;
    name: string;
    brand?: string;
    category: string;
    material?: string;
    finish?: string;
    capacity_oz?: number;
    weight_grams?: number;
    price: number;
    old_price?: number;
    stock: number;
    is_available_now: boolean;
    image_url: string;
    description?: string;
    story?: string;
}

const COLLECTIONS = [
    { title: 'Shot Glass Vault', count: '34 items', category: 'Shot Glass Vault', image: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&q=80' },
    { title: 'Hip Flask Collection', count: '18 items', category: 'Hip Flask Collection', image: 'https://images.unsplash.com/photo-1597075687490-8f673c3c175d?auto=format&fit=crop&q=80' },
    { title: 'Bottle Accessories', count: '27 items', category: 'Bottle Accessories', image: 'https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?auto=format&fit=crop&q=80' },
    { title: 'Glassware', count: '22 items', category: 'Whiskey Glass Collection', image: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80' },
    { title: 'BAR OS Wear', count: '15 items', category: 'BAR OS Wear', image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80' },
    { title: 'Gift Boxes', count: '11 bundles', category: 'Gift Boxes', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&q=80' },
];

export default function SouvenirForgePage() {
    const [souvenirs, setSouvenirs] = React.useState<SouvenirProduct[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [isDropModalOpen, setIsDropModalOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [activeCategoryFilter, setActiveCategoryFilter] = React.useState('All');

    // Limited Drop Form State
    const [dropData, setDropData] = React.useState({
        title: 'Black & Gold Collection',
        launch_date: 'Friday 8:00 PM',
        inventory: '100',
        badge: 'EXCLUSIVE DROP'
    });

    // Form State with AI Autofill
    const [formData, setFormData] = React.useState({
        name: '',
        category: 'Hip Flask Collection',
        brand: 'BAR OS Originals',
        material: '304 Stainless Steel',
        finish: 'Matte Black',
        capacity_oz: '8',
        weight_grams: '180',
        price: '1200',
        old_price: '1500',
        image_url: '',
        description: 'Premium stainless steel hip flask built for nights out.',
        story: 'Crafted for nights that deserve a keepsake.',
        drink_pairings: 'Whiskey, Rum, Brandy'
    });

    const fetchSouvenirs = React.useCallback(async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data } = await supabase
                .from('products')
                .select('*')
                .or('is_souvenir.eq.true,category.ilike.%souvenir%,category.ilike.%flask%,category.ilike.%shot glass%')
                .order('name');

            if (data && data.length > 0) {
                setSouvenirs(data as SouvenirProduct[]);
            } else {
                // Default Initial Merch Catalogue
                setSouvenirs([
                    {
                        id: 201,
                        name: 'BAR OS Premium Leather Hip Flask',
                        brand: 'BAR OS Originals',
                        category: 'Hip Flask Collection',
                        material: '304 Stainless Steel & Leather',
                        finish: 'Matte Black',
                        capacity_oz: 8,
                        weight_grams: 180,
                        price: 1200,
                        old_price: 1500,
                        stock: 42,
                        is_available_now: true,
                        image_url: 'https://images.unsplash.com/photo-1597075687490-8f673c3c175d?auto=format&fit=crop&q=80',
                        description: 'Premium food-grade steel flask with leak-proof cap.'
                    },
                    {
                        id: 202,
                        name: 'Engraved Crystal Shot Glass',
                        brand: 'BAR OS Vault',
                        category: 'Shot Glass Vault',
                        material: 'Heavy Lead-Free Crystal',
                        finish: 'Laser Engraved',
                        capacity_oz: 2,
                        weight_grams: 120,
                        price: 500,
                        stock: 85,
                        is_available_now: true,
                        image_url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&q=80',
                        description: 'Heavy base crystal shot glass with custom BAR OS emblem.'
                    },
                    {
                        id: 203,
                        name: 'Glencairn Whiskey Tasting Glass',
                        brand: 'BAR OS Vault',
                        category: 'Whiskey Glass Collection',
                        material: 'Crystal Glass',
                        finish: 'Clear Polish',
                        capacity_oz: 6,
                        weight_grams: 150,
                        price: 850,
                        stock: 30,
                        is_available_now: true,
                        image_url: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80',
                        description: 'Official whiskey tasting glass shaped for aroma enhancement.'
                    },
                    {
                        id: 204,
                        name: 'Tactical Stainless Bottle Opener',
                        brand: 'BAR OS Wear',
                        category: 'Bottle Accessories',
                        material: 'Heavy Duty Steel',
                        finish: 'Brushed Black',
                        capacity_oz: 0,
                        weight_grams: 95,
                        price: 450,
                        stock: 120,
                        is_available_now: true,
                        image_url: 'https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?auto=format&fit=crop&q=80',
                        description: 'Pocket-sized speed opener with ergonomic grip.'
                    }
                ]);
            }
        } catch (e) {
            console.error('Error fetching souvenirs:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchSouvenirs();

        if (supabase) {
            const channel = supabase
                .channel('realtime_admin_souvenirs')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                    fetchSouvenirs();
                })
                .subscribe();

            return () => {
                if (supabase) supabase.removeChannel(channel);
            };
        }
    }, [fetchSouvenirs]);

    const handleAiAutofill = () => {
        if (!formData.name) {
            alert('Please enter a Product Name first (e.g. "Jack Daniel\'s Hip Flask Gift Set")');
            return;
        }

        const title = formData.name.toLowerCase();
        let cat = 'Hip Flask Collection';
        let mat = '304 Stainless Steel';
        let cap = '8';
        let pr = '1200';
        const desc = 'Crafted for nights that deserve a keepsake.';
        let pair = 'Whiskey, Rum, Brandy';

        if (title.includes('shot') || title.includes('glass')) {
            cat = 'Shot Glass Vault';
            mat = 'Heavy Lead-Free Crystal';
            cap = '2';
            pr = '500';
            pair = 'Tequila, Vodka, Liqueur';
        } else if (title.includes('whiskey') || title.includes('tumbler')) {
            cat = 'Whiskey Glass Collection';
            mat = 'Scotch Crystal Glass';
            cap = '10';
            pr = '850';
            pair = 'Single Malt Whisky, Bourbon';
        } else if (title.includes('opener') || title.includes('stopper') || title.includes('corkscrew')) {
            cat = 'Bottle Accessories';
            mat = 'Brushed Heavy Steel';
            cap = '0';
            pr = '450';
            pair = 'Wine, Beer, Cider';
        } else if (title.includes('shirt') || title.includes('hoodie') || title.includes('cap')) {
            cat = 'BAR OS Wear';
            mat = '400GSM Organic Cotton';
            cap = '0';
            pr = '2500';
            pair = 'BAR OS Lifestyle';
        } else if (title.includes('gift') || title.includes('box') || title.includes('set')) {
            cat = 'Gift Boxes';
            mat = 'Matte Box + Crystal + Leather Flask';
            cap = '12';
            pr = '3999';
            pair = 'Jameson, Glenfiddich, Jack Daniels';
        }

        setFormData(f => ({
            ...f,
            category: cat,
            material: mat,
            capacity_oz: cap,
            price: pr,
            description: `${f.name} - ${desc}`,
            drink_pairings: pair
        }));
    };

    const toggleAvailability = async (id: number | string, current: boolean) => {
        if (!supabase) return;
        const { error } = await supabase.from('products').update({ is_available_now: !current }).eq('id', id);
        if (!error) {
            setSouvenirs(souvenirs.map(s => s.id === id ? { ...s, is_available_now: !current } : s));
        }
    };

    const handleDelete = async (id: number | string) => {
        if (!supabase) return;
        if (!confirm('Are you sure you want to remove this souvenir from the catalogue?')) return;
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (!error) {
            setSouvenirs(souvenirs.filter(s => s.id !== id));
        }
    };

    const handleCreateSouvenir = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.price) {
            alert('Please enter souvenir name and price');
            return;
        }

        setIsSubmitting(true);
        const pairings = formData.drink_pairings.split(',').map(s => s.trim()).filter(Boolean);

        const payload = {
            name: formData.name,
            category: formData.category,
            brand: formData.brand,
            material: formData.material,
            finish: formData.finish,
            capacity_oz: Number(formData.capacity_oz) || 8,
            weight_grams: Number(formData.weight_grams) || 180,
            price: Number(formData.price),
            old_price: formData.old_price ? Number(formData.old_price) : null,
            image_url: formData.image_url || 'https://images.unsplash.com/photo-1597075687490-8f673c3c175d?auto=format&fit=crop&q=80',
            description: formData.description,
            story: formData.story,
            drink_pairings: pairings,
            is_souvenir: true,
            is_available_now: true,
            stock: 50
        };

        if (supabase) {
            const { data, error } = await supabase.from('products').insert([payload]).select();
            if (error) {
                alert(`Failed to add souvenir: ${error.message}`);
            } else if (data) {
                setSouvenirs([data[0] as SouvenirProduct, ...souvenirs]);
                setIsAddModalOpen(false);
                setFormData({
                    name: '',
                    category: 'Hip Flask Collection',
                    brand: 'BAR OS Originals',
                    material: '304 Stainless Steel',
                    finish: 'Matte Black',
                    capacity_oz: '8',
                    weight_grams: '180',
                    price: '',
                    old_price: '',
                    image_url: '',
                    description: 'Premium stainless steel hip flask built for nights out.',
                    story: 'Crafted for nights that deserve a keepsake.',
                    drink_pairings: 'Whiskey, Rum, Brandy'
                });
            }
        }
        setIsSubmitting(false);
    };

    const filteredSouvenirs = souvenirs.filter(s => {
        if (activeCategoryFilter === 'All') return true;
        return (s.category || '').toLowerCase().includes(activeCategoryFilter.toLowerCase());
    });

    return (
        <div
            className="p-8 space-y-12 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700 relative overflow-hidden"
            style={{
                background: 'radial-gradient(circle at top right, rgba(245, 160, 0, 0.08), transparent 45%), radial-gradient(circle at bottom left, rgba(30, 58, 138, 0.08), transparent 45%), #F8FAFC'
            }}
        >

            {/* SOUVENIR FORGE HERO HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-10 border-b border-slate-200/80 pb-10 relative z-10">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Gift className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary italic">LIMITED MERCH PROTOCOL</span>
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[8px] font-black uppercase tracking-widest">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /> MERCH STATUS: ONLINE
                        </div>
                    </div>
                    <h1 className="text-4xl lg:text-6xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Souvenir <span className="text-primary italic">Forge.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Craft &bull; Personalize &bull; Dispatch &bull; Merch & Collectibles Command Center.</p>
                </div>
                <div className="flex gap-4 shrink-0">
                    <Button
                        onClick={() => setIsDropModalOpen(true)}
                        variant="outline"
                        className="rounded-2xl h-14 px-8 border-amber-200 text-amber-700 bg-amber-50 font-black uppercase text-[10px] tracking-widest hover:bg-amber-100 transition-all shadow-sm"
                    >
                        <Flame size={16} className="mr-2 text-amber-500" /> Launch Limited Drop
                    </Button>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="rounded-2xl h-14 px-10 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        <Plus size={16} className="mr-3" /> + Add New Souvenir
                    </Button>
                </div>
            </header>

            {/* LIVE MERCH STATS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
                {[
                    { label: 'Merch Items', val: '142 Products', sub: 'Across 6 collections', icon: Gift, color: 'indigo' },
                    { label: 'Low Stock Alert', val: '18 Items', sub: 'Needs restocking', icon: Zap, color: 'rose' },
                    { label: 'Gift Orders', val: '34 Orders', sub: 'This week', icon: ShoppingBag, color: 'emerald' },
                    { label: 'Top Seller', val: 'Hip Flask', sub: 'Last 24 hours', icon: Star, color: 'amber' },
                ].map(stat => (
                    <Card key={stat.label} className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md group hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                        <div className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center mb-6 shadow-inner transition-transform group-hover:scale-110",
                            stat.color === 'rose' ? "bg-rose-50 text-rose-500" :
                            stat.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                            stat.color === 'amber' ? "bg-amber-50 text-amber-500" :
                            "bg-emerald-50 text-emerald-500"
                        )}>
                            <stat.icon size={22} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                        <h3 className="text-3xl font-black uppercase tracking-tight text-foreground tabular-nums">{stat.val}</h3>
                        <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mt-2">{stat.sub}</p>
                    </Card>
                ))}
            </div>

            {/* COLLECTIONS QUICK JUMP GRID */}
            <section className="space-y-6 relative z-10">
                <div className="flex justify-between items-center px-6">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Collections Vault</h2>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Category Filter</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {COLLECTIONS.map(col => (
                        <button
                            key={col.title}
                            onClick={() => setActiveCategoryFilter(activeCategoryFilter === col.category ? 'All' : col.category)}
                            className={cn(
                                "p-5 rounded-[2.5rem] bg-white border text-left transition-all duration-300 group flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 relative overflow-hidden",
                                activeCategoryFilter === col.category ? "border-primary ring-2 ring-primary/20 shadow-md" : "border-slate-200/80"
                            )}
                        >
                            <div className="relative aspect-square w-full rounded-2xl bg-slate-50 overflow-hidden mb-3">
                                <Image src={col.image} alt={col.title} fill className="object-cover group-hover:scale-110 transition-transform duration-500" />
                            </div>
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-black uppercase tracking-tight text-foreground line-clamp-1">{col.title}</h4>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">{col.count}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            {/* FORGE ACTIVITY TELEMETRY FEED */}
            <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left relative z-10">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-[0.3em]">
                        <Activity size={14} className="animate-pulse" /> Forge Activity
                    </div>
                    <span className="text-[9px] font-black text-slate-400 uppercase">Live Stream</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { title: 'BAR OS Leather Flask Sold', time: '2 minutes ago', badge: 'Order #3021', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                        { title: 'Crystal Shot Glass Restocked', time: '14 minutes ago', badge: '+50 Units', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
                        { title: 'Gift Box Collection Scheduled', time: '1 hour ago', badge: 'Black Edition', color: 'bg-amber-50 text-amber-700 border-amber-100' },
                    ].map((act, i) => (
                        <div key={i} className={cn("p-4 rounded-2xl border flex items-center justify-between gap-3", act.color)}>
                            <div>
                                <p className="text-xs font-black uppercase tracking-tight">{act.title}</p>
                                <p className="text-[9px] font-bold opacity-70 uppercase mt-0.5">{act.time}</p>
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-white/80 shrink-0">
                                {act.badge}
                            </span>
                        </div>
                    ))}
                </div>
            </Card>

            {/* LIVE MERCH GRID */}
            <section className="space-y-8 relative z-10">
                <div className="flex justify-between items-center px-6">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">
                        Live Collectibles Catalogue {activeCategoryFilter !== 'All' ? `(${activeCategoryFilter})` : ''}
                    </h2>
                    {activeCategoryFilter !== 'All' && (
                        <Button onClick={() => setActiveCategoryFilter('All')} variant="ghost" className="text-[10px] font-black uppercase text-primary">
                            Clear Filter
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {loading ? (
                        <div className="col-span-full py-40 text-center opacity-20"><Loader2 className="animate-spin mx-auto text-primary" size={48} /></div>
                    ) : filteredSouvenirs.map(item => (
                        <Card key={item.id} className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col group text-left">
                            <div className="relative aspect-square rounded-[2.5rem] bg-slate-50 border border-slate-100 overflow-hidden mb-6 shadow-inner">
                                <Image src={normalizeImage(item.image_url)} alt={item.name} fill className="object-contain p-4 group-hover:scale-110 transition-transform duration-700" />
                                <div className={cn(
                                    "absolute top-4 right-4 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg",
                                    item.is_available_now ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                )}>
                                    {item.is_available_now ? 'Active' : 'Hidden'}
                                </div>
                            </div>

                            <div className="space-y-4 flex-1 flex flex-col justify-between">
                                <div>
                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">{item.category}</p>
                                    <h3 className="text-xl font-black text-foreground uppercase tracking-tight leading-tight">{item.name}</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100">
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Price</p>
                                        <p className="text-sm font-black text-primary">{formatPrice(item.price)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Material</p>
                                        <p className="text-xs font-bold text-slate-600 truncate">{item.material || 'Stainless Steel'}</p>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => toggleAvailability(item.id, item.is_available_now)}
                                        className={cn(
                                            "flex-1 h-12 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all active:scale-95",
                                            item.is_available_now ? "bg-slate-900 text-white hover:bg-primary" : "bg-emerald-500 text-white shadow-emerald-200 shadow-lg"
                                        )}
                                    >
                                        {item.is_available_now ? 'Deactivate' : 'Activate'}
                                    </Button>
                                    <Button
                                        onClick={() => handleDelete(item.id)}
                                        variant="ghost"
                                        size="icon"
                                        className="h-12 w-12 rounded-xl text-slate-300 hover:text-rose-500"
                                    >
                                        <Trash2 size={20} />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </section>

            {/* ADD SOUVENIR SIDE DRAWER MODAL WITH AI AUTOFILL */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] p-8 sm:p-10 max-w-lg w-full space-y-6 shadow-2xl relative border border-slate-100 text-left max-h-[92vh] overflow-y-auto no-scrollbar">
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-black uppercase text-primary tracking-widest">SOUVENIR FORGE</span>
                                <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">Upload New Collectible</h2>
                            </div>
                            <Button
                                type="button"
                                onClick={handleAiAutofill}
                                className="h-10 px-4 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black uppercase tracking-widest hover:bg-amber-100"
                            >
                                <Bot size={14} className="mr-1 text-amber-600" /> AI Autofill
                            </Button>
                        </div>

                        <form onSubmit={handleCreateSouvenir} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Product Name</label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. BAR OS Premium Hip Flask"
                                    required
                                    className="rounded-xl h-12 bg-slate-50 border-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full rounded-xl h-12 bg-slate-50 border-none px-3 text-xs font-bold"
                                    >
                                        <option value="Shot Glass Vault">Shot Glass Vault</option>
                                        <option value="Hip Flask Collection">Hip Flask Collection</option>
                                        <option value="Whiskey Glass Collection">Whiskey Glasses</option>
                                        <option value="Bottle Accessories">Bottle Accessories</option>
                                        <option value="BAR OS Wear">BAR OS Wear</option>
                                        <option value="Gift Boxes">Gift Boxes</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Price (KSh)</label>
                                    <Input
                                        type="number"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        placeholder="1200"
                                        required
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Material</label>
                                    <Input
                                        value={formData.material}
                                        onChange={e => setFormData({ ...formData, material: e.target.value })}
                                        placeholder="304 Stainless Steel"
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Capacity (oz)</label>
                                    <Input
                                        type="number"
                                        value={formData.capacity_oz}
                                        onChange={e => setFormData({ ...formData, capacity_oz: e.target.value })}
                                        placeholder="8"
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Image URL</label>
                                <Input
                                    value={formData.image_url}
                                    onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                                    placeholder="https://..."
                                    className="rounded-xl h-12 bg-slate-50 border-none"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Description</label>
                                <Textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Premium stainless steel hip flask built for nights out."
                                    className="rounded-xl bg-slate-50 border-none text-xs"
                                    rows={2}
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <Button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    variant="ghost"
                                    className="rounded-xl h-12 px-6 font-bold text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="rounded-xl h-12 px-8 bg-primary text-white font-black uppercase text-xs shadow-lg"
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <><CheckCircle2 size={16} className="mr-2" /> Save & Publish</>}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* LIMITED DROP SCHEDULER MODAL */}
            {isDropModalOpen && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] p-8 sm:p-10 max-w-md w-full space-y-6 shadow-2xl relative border border-slate-100 text-left">
                        <button
                            onClick={() => setIsDropModalOpen(false)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest">LIMITED MERCH PROTOCOL</span>
                            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Launch Limited Drop</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Collection Title</label>
                                <Input
                                    value={dropData.title}
                                    onChange={e => setDropData({ ...dropData, title: e.target.value })}
                                    className="rounded-xl h-12 bg-slate-50 border-none font-bold text-xs"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Launch Date/Time</label>
                                    <Input
                                        value={dropData.launch_date}
                                        onChange={e => setDropData({ ...dropData, launch_date: e.target.value })}
                                        className="rounded-xl h-12 bg-slate-50 border-none text-xs font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Drop Quantity</label>
                                    <Input
                                        value={dropData.inventory}
                                        onChange={e => setDropData({ ...dropData, inventory: e.target.value })}
                                        className="rounded-xl h-12 bg-slate-50 border-none text-xs font-bold"
                                    />
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 space-y-1">
                                <p className="text-[10px] font-black uppercase text-amber-800">Countdown Live Broadcast</p>
                                <p className="text-xs text-amber-950 font-bold">This drop will display a live countdown timer banner across customer store pages.</p>
                            </div>

                            <Button
                                onClick={() => {
                                    alert(`Limited Drop "${dropData.title}" scheduled for ${dropData.launch_date}!`);
                                    setIsDropModalOpen(false);
                                }}
                                className="w-full h-14 rounded-2xl bg-amber-500 text-white font-black uppercase text-xs tracking-widest shadow-xl hover:bg-amber-600 transition-all"
                            >
                                Schedule Limited Drop
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
