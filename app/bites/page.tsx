'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Utensils,
    Flame,
    Clock,
    ArrowLeft,
    CheckCircle2,
    Loader2,
    Coffee,
    X,
    Sparkles,
    Plus
} from 'lucide-react';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';

interface BiteItem {
    id: number | string;
    name: string;
    price: number;
    image_url: string;
    category: string;
    description?: string;
    prep_time?: number;
    spice_level?: number;
    drink_pairings?: string[];
    popular?: boolean;
}

interface AddOnOption {
    id: string;
    name: string;
    price: number;
}

const ADD_ONS_LIST: AddOnOption[] = [
    { id: 'ketchup', name: 'House Ketchup', price: 0 },
    { id: 'pilipili', name: 'Pili Pili / Hot Sauce', price: 20 },
    { id: 'cheese', name: 'Extra Cheese', price: 40 },
    { id: 'kachumbari', name: 'Fresh Kachumbari', price: 30 },
    { id: 'sauce', name: 'Extra House Sauce', price: 20 },
    { id: 'avocado', name: 'Creamy Avocado', price: 50 },
];

const SIZES_LIST = [
    { id: 'Regular', label: 'Regular', extraPrice: 0 },
    { id: 'Large', label: 'Large (+KSh 70)', extraPrice: 70 },
    { id: 'Double', label: 'Double (+KSh 140)', extraPrice: 140 },
];

const DEFAULT_BITES: BiteItem[] = [
    {
        id: 101,
        name: 'Smocha Deluxe',
        price: 180,
        category: 'Street Bites',
        description: 'Sausage wrapped in chapati with vegetables, house sauce, and kachumbari.',
        prep_time: 15,
        spice_level: 2,
        drink_pairings: ['Amarula 750ml', 'Coca-Cola', 'Tusker Cider'],
        image_url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&q=80',
        popular: true
    },
    {
        id: 102,
        name: 'Chips Masala',
        price: 250,
        category: 'Hot Right Now',
        description: 'Crispy golden fries tossed in rich spicy tomato garlic masala and fresh cilantro.',
        prep_time: 12,
        spice_level: 3,
        drink_pairings: ['Heineken 500ml', 'KC Pineapple', 'Amarula'],
        image_url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&q=80',
        popular: true
    },
    {
        id: 103,
        name: 'BBQ Chicken Wings (6pcs)',
        price: 450,
        category: 'Burgers & Wings',
        description: 'Juicy fire-grilled wings glazed in sweet smoky BBQ pepper glaze.',
        prep_time: 18,
        spice_level: 1,
        drink_pairings: ['Jameson Black Barrel', 'Guinness Stout', 'Coca-Cola'],
        image_url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&q=80',
        popular: true
    },
    {
        id: 104,
        name: 'Double Smash Cheeseburger',
        price: 520,
        category: 'Burgers & Wings',
        description: 'Double beef patties, melted cheddar, caramelized onions, and house special sauce.',
        prep_time: 15,
        spice_level: 1,
        drink_pairings: ['Tusker Lager', 'Jack Daniels', 'Sprite'],
        image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80',
        popular: true
    },
    {
        id: 105,
        name: 'Ugandan Rolex Special',
        price: 220,
        category: 'Street Bites',
        description: 'Fluffy 2-egg omelette with cabbage, tomato, and onion rolled inside hot chapati.',
        prep_time: 10,
        spice_level: 1,
        drink_pairings: ['KC Pineapple', 'Minute Maid', 'Heineken'],
        image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&q=80',
        popular: false
    },
    {
        id: 106,
        name: 'Pork Ribs Platter',
        price: 750,
        category: 'Hot Right Now',
        description: 'Slow-cooked tender pork ribs basted in sticky honey chilli sauce with potato wedges.',
        prep_time: 20,
        spice_level: 2,
        drink_pairings: ['Captain Morgan', 'Tusker Cider', 'Red Bull'],
        image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80',
        popular: true
    }
];

const CATEGORIES = ['All', 'Hot Right Now', 'Street Bites', 'Burgers & Wings', 'Drink Pairings'];

export default function BiteCommandPage() {
    const [bites, setBites] = useState<BiteItem[]>(DEFAULT_BITES);
    const [loading, setLoading] = useState(true);
    const [activeCat, setActiveCat] = useState('All');
    const [addedId, setAddedId] = useState<number | string | null>(null);

    // Customization Modal State
    const [selectedItem, setSelectedItem] = useState<BiteItem | null>(null);
    const [selectedSize, setSelectedSize] = useState('Regular');
    const [selectedAddOns, setSelectedAddOns] = useState<string[]>(['ketchup']);

    const { addToCart } = useCart();

    useEffect(() => {
        async function fetchBites() {
            setLoading(true);
            if (!supabase) {
                setLoading(false);
                return;
            }
            try {
                const { data } = await supabase
                    .from('products')
                    .select('*')
                    .or('is_snack.eq.true,is_bite.eq.true');

                if (data && data.length > 0) {
                    const dbItems = (data as unknown as BiteItem[]).map((d, i) => ({
                        ...d,
                        prep_time: d.prep_time || 12 + (i % 8),
                        spice_level: d.spice_level || ((i % 3) + 1),
                        drink_pairings: d.drink_pairings || ['Amarula', 'Coca-Cola', 'Tusker Cider'],
                        popular: i % 2 === 0
                    }));
                    setBites(dbItems);
                }
            } catch (e) {
                console.error('Error loading bites:', e);
            } finally {
                setLoading(false);
            }
        }
        fetchBites();

        if (supabase) {
            const channel = supabase
                .channel('realtime_storefront_bites')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                    fetchBites();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, []);

    const openCustomizeModal = (item: BiteItem) => {
        setSelectedItem(item);
        setSelectedSize('Regular');
        setSelectedAddOns(['ketchup']);
    };

    const toggleAddOn = (id: string) => {
        if (selectedAddOns.includes(id)) {
            setSelectedAddOns(selectedAddOns.filter(a => a !== id));
        } else {
            setSelectedAddOns([...selectedAddOns, id]);
        }
    };

    const handleConfirmCustomAdd = () => {
        if (!selectedItem) return;

        const sizeOption = SIZES_LIST.find(s => s.id === selectedSize) || SIZES_LIST[0];
        const addOnsTotal = selectedAddOns.reduce((sum, addId) => {
            const add = ADD_ONS_LIST.find(a => a.id === addId);
            return sum + (add ? add.price : 0);
        }, 0);

        const totalPrice = selectedItem.price + sizeOption.extraPrice + addOnsTotal;
        const addOnNames = selectedAddOns
            .map(id => ADD_ONS_LIST.find(a => a.id === id)?.name)
            .filter(Boolean)
            .join(', ');

        const variantLabel = `${selectedSize}${addOnNames ? ` (${addOnNames})` : ''}`;

        addToCart({
            id: Number(selectedItem.id) || Date.now(),
            name: selectedItem.name,
            price: totalPrice,
            base_price: selectedItem.price,
            image: normalizeImage(selectedItem.image_url),
            quantity: 1,
            category: selectedItem.category || 'Night Bites',
            size: variantLabel
        });

        setAddedId(selectedItem.id);
        setSelectedItem(null);
        setTimeout(() => setAddedId(null), 2000);
    };

    const filteredBites = bites.filter(b => {
        if (activeCat === 'All') return true;
        return (b.category || '').toLowerCase().includes(activeCat.toLowerCase());
    });

    return (
        <div className="min-h-screen bg-slate-50 text-foreground text-left selection:bg-primary/20 pb-40">
            {/* HERO SECTION */}
            <header className="bg-white border-b border-slate-200/80 py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden shadow-sm">
                <div className="max-w-7xl mx-auto relative z-10 space-y-6">
                    <Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 hover:text-primary transition-colors">
                        <ArrowLeft size={16} /> Return to Main Menu
                    </Link>

                    <div className="max-w-2xl space-y-3">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[9px] font-black uppercase tracking-[0.3em]">
                            <Flame size={14} className="fill-current animate-pulse text-amber-500" /> Live Kitchen Radar Active
                        </div>
                        <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none italic text-foreground">
                            Bite <span className="text-primary italic">Command.</span>
                        </h1>
                        <p className="text-slate-500 font-medium text-base sm:text-lg italic leading-relaxed">
                            &quot;Fresh hot bites & street food. Customized with house sauces and delivered in 20 minutes.&quot;
                        </p>
                    </div>

                    {/* LIVE KITCHEN RADAR HUD */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-100">
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/60">
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Grill Station</p>
                            <p className="text-xl font-black text-emerald-600">2 Orders Active</p>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/60">
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Fryer Station</p>
                            <p className="text-xl font-black text-primary">Ready in 4 min</p>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/60">
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Dispatch Runner</p>
                            <p className="text-xl font-black text-amber-600">Departing in 3 min</p>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/60">
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Average Prep</p>
                            <p className="text-xl font-black text-foreground">12-15 Minutes</p>
                        </div>
                    </div>
                </div>

                <Utensils className="absolute -bottom-10 -right-10 h-72 w-72 text-slate-900/5 rotate-12 pointer-events-none" />
            </header>

            {/* CATEGORY TABS */}
            <div className="sticky top-16 bg-white/95 backdrop-blur-xl z-40 border-b border-slate-200/80 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex gap-3 overflow-x-auto no-scrollbar">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCat(cat)}
                            className={cn(
                                "px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                                activeCat === cat ? "bg-primary text-white font-black shadow-lg shadow-primary/30 scale-105" : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-slate-200/60"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* BITES GRID */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {loading ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="animate-spin text-primary" size={48} />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Deploying 20-Minute Fast Food Menu...</p>
                    </div>
                ) : filteredBites.length === 0 ? (
                    <div className="py-32 text-center text-slate-400 space-y-4">
                        <Utensils size={56} className="mx-auto opacity-30" />
                        <p className="text-sm font-black uppercase tracking-widest italic">&quot;Kitchen refueling in progress. Select All.&quot;</p>
                        <Button onClick={() => setActiveCat('All')} className="rounded-xl bg-primary text-white font-black uppercase text-xs px-6 py-3">
                            Show All Bites
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredBites.map((item) => (
                            <Card key={item.id} className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md hover:shadow-xl transition-all group flex flex-col justify-between text-left relative overflow-hidden">
                                <div className="relative z-10 space-y-5">
                                    {/* Image Stage */}
                                    <div className="aspect-[4/3] rounded-[2.5rem] bg-slate-50/80 border border-slate-100 relative overflow-hidden flex items-center justify-center p-6 shadow-inner group-hover:scale-105 transition-transform duration-700">
                                        <Image src={normalizeImage(item.image_url)} alt={item.name} fill className="object-cover p-2 rounded-[2rem]" />

                                        {/* Top Badges */}
                                        <div className="absolute top-4 left-4 flex gap-2">
                                            <div className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200/80 shadow-sm flex items-center gap-1.5">
                                                <Clock size={12} className="text-primary" />
                                                <span className="text-[9px] font-black uppercase text-foreground">{item.prep_time || 15} min</span>
                                            </div>
                                            {item.popular && (
                                                <div className="bg-amber-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md flex items-center gap-1">
                                                    🔥 Popular
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Item Details */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-start">
                                            <h3 className="text-xl font-black text-foreground uppercase tracking-tight leading-tight">{item.name}</h3>
                                            <p className="text-2xl font-black text-primary tracking-tighter shrink-0 ml-2">{formatPrice(item.price)}</p>
                                        </div>
                                        <p className="text-xs font-medium text-slate-500 italic leading-relaxed">
                                            {item.description}
                                        </p>
                                    </div>

                                    {/* Spice Level & Prep Time */}
                                    <div className="flex items-center gap-4 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                                        <span>Spice Level: {'🌶️'.repeat(item.spice_level || 1)}</span>
                                        <span>&bull;</span>
                                        <span>Fresh & Hot</span>
                                    </div>

                                    {/* Suggested Pairings */}
                                    {item.drink_pairings && item.drink_pairings.length > 0 && (
                                        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/60 space-y-1.5">
                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase text-amber-800 tracking-wider">
                                                <Coffee size={12} className="text-amber-600" /> Pair with
                                            </div>
                                            <p className="text-[10px] font-extrabold text-amber-900 uppercase">
                                                {item.drink_pairings.join(' • ')}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8 pt-6 border-t border-slate-100 relative z-10 flex gap-3">
                                    <Button
                                        onClick={() => openCustomizeModal(item)}
                                        className={cn(
                                            "w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-md transition-all",
                                            addedId === item.id
                                                ? "bg-emerald-500 text-white"
                                                : "bg-slate-900 text-white hover:bg-primary transition-colors active:scale-95"
                                        )}
                                    >
                                        {addedId === item.id ? (
                                            <><CheckCircle2 size={16} className="mr-2" /> Added to Order!</>
                                        ) : (
                                            <><Plus size={16} className="mr-2" /> Customize & Add</>
                                        )}
                                    </Button>
                                </div>

                                <Sparkles className="absolute -bottom-6 -right-6 h-32 w-32 text-slate-900/5 rotate-12 -z-0" />
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* CUSTOMIZATION MODAL DIALOG */}
            {selectedItem && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] p-6 sm:p-10 max-w-lg w-full space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto no-scrollbar border border-slate-100 text-left">
                        {/* Close Button */}
                        <button
                            onClick={() => setSelectedItem(null)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        {/* Title Header */}
                        <div className="space-y-2">
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">Custom Fast Food Order</span>
                            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">{selectedItem.name}</h2>
                            <p className="text-xs text-slate-500 font-medium italic">{selectedItem.description}</p>
                        </div>

                        {/* Portion Sizes */}
                        <div className="space-y-3 pt-2">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Select Portion Size</label>
                            <div className="grid grid-cols-3 gap-2">
                                {SIZES_LIST.map(s => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => setSelectedSize(s.id)}
                                        className={cn(
                                            "py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-wider border transition-all text-center",
                                            selectedSize === s.id
                                                ? "bg-primary text-white border-primary shadow-md"
                                                : "bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100"
                                        )}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Sauces & Add-ons */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">House Sauces & Add-ons</label>
                            <div className="grid grid-cols-2 gap-2.5">
                                {ADD_ONS_LIST.map(add => {
                                    const isSelected = selectedAddOns.includes(add.id);
                                    return (
                                        <button
                                            key={add.id}
                                            type="button"
                                            onClick={() => toggleAddOn(add.id)}
                                            className={cn(
                                                "p-3 rounded-2xl text-left border text-[10px] font-black uppercase tracking-wider flex items-center justify-between transition-all",
                                                isSelected
                                                    ? "bg-amber-500/10 border-amber-500/40 text-amber-900"
                                                    : "bg-slate-50 border-slate-200/60 text-slate-600 hover:bg-slate-100"
                                            )}
                                        >
                                            <span>{add.name}</span>
                                            <span className="text-[9px] font-extrabold text-amber-700">
                                                {add.price === 0 ? 'Free' : `+KSh ${add.price}`}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Drink Pairing Recommendation */}
                        {selectedItem.drink_pairings && (
                            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 space-y-1">
                                <p className="text-[9px] font-black uppercase text-amber-800 tracking-wider">Suggested Drink Pairing</p>
                                <p className="text-xs font-black text-amber-950 uppercase">{selectedItem.drink_pairings.join(' • ')}</p>
                            </div>
                        )}

                        {/* Total Price & Add Button */}
                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-[9px] font-black uppercase text-slate-400">Total Price</p>
                                <p className="text-3xl font-black text-primary tracking-tight">
                                    {formatPrice(
                                        selectedItem.price +
                                        (SIZES_LIST.find(s => s.id === selectedSize)?.extraPrice || 0) +
                                        selectedAddOns.reduce((sum, addId) => sum + (ADD_ONS_LIST.find(a => a.id === addId)?.price || 0), 0)
                                    )}
                                </p>
                            </div>
                            <Button
                                onClick={handleConfirmCustomAdd}
                                className="h-16 px-8 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl hover:bg-primary/90 transition-all"
                            >
                                Add to Bag
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
