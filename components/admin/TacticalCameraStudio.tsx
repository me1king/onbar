'use client';

import * as React from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import {
    Camera,
    Upload,
    Sparkles,
    MessageCircle,
    Camera as Instagram,
    Share2 as Facebook,
    Video as Youtube,
    Loader2,
    Zap,
    Tag,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice } from '@/lib/utils';

interface ProductNode {
    id: number;
    name: string;
    price: number;
    stock: number;
    image_url: string;
    category?: string;
}

export default function TacticalCameraStudio() {
    const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
    const [detectedProduct, setDetectedProduct] = React.useState<ProductNode | null>(null);
    const [products, setProducts] = React.useState<ProductNode[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [catalogLoading, setCatalogLoading] = React.useState(true);
    const [caption, setCaption] = React.useState('');
    const [hashtags, setHashtags] = React.useState('#OnlineBar #NairobiDispatch #Mixology #CellarVault');
    const [generatingAI, setGeneratingAI] = React.useState(false);

    const [platforms, setPlatforms] = React.useState<Record<string, boolean>>({
        INSTAGRAM: true,
        FACEBOOK: true,
        WHATSAPP: true,
        YOUTUBE: false,
    });

    const [publishing, setPublishing] = React.useState(false);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        async function fetchProducts() {
            if (!supabase) {
                setError('Supabase is not configured. Product selection is unavailable.');
                setCatalogLoading(false);
                return;
            }
            try {
                const { data, error: queryError } = await supabase
                    .from('products')
                    .select('id, name, price, stock, image_url, category')
                    .order('name')
                    .limit(100);
                if (queryError) throw queryError;
                setProducts(data || []);
            } catch (err) {
                console.error('Product catalog fetch error:', err);
                setError(err instanceof Error ? err.message : 'Unable to load products.');
            } finally {
                setCatalogLoading(false);
            }
        }
        fetchProducts();
    }, []);

    const handleImageSelect = (imageUrl: string) => {
        setSelectedImage(imageUrl);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    handleImageSelect(event.target.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const generateAICopy = async (productName?: string, category?: string) => {
        const targetName = productName || detectedProduct?.name;
        if (!targetName) {
            setError('Select a catalog product before generating its description.');
            return;
        }
        setGeneratingAI(true);
        setError(null);

        try {
            const res = await fetch('/api/admin/generate-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: targetName, category: category || 'whiskey' })
            });
            const data = await res.json();
            if (!res.ok || !data.description) {
                throw new Error(data.error || 'AI copy generation failed.');
            }
            setCaption(`${targetName}\n\n${data.description}`);
        } catch (err) {
            console.error('AI copy generation error:', err);
            setError(err instanceof Error ? err.message : 'AI copy generation failed.');
        } finally {
            setGeneratingAI(false);
        }
    };

    const togglePlatform = (p: string) => {
        setPlatforms(prev => ({ ...prev, [p]: !prev[p] }));
    };

    const handlePublishProtocol = async () => {
        const activePlatforms = Object.keys(platforms).filter(k => platforms[k]);
        if (activePlatforms.length === 0) {
            alert('Please select at least one deployment platform.');
            return;
        }

        setPublishing(true);
        setError(null);

        try {
            const res = await fetch('/api/admin/social/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaUrl: selectedImage || detectedProduct?.image_url,
                    caption: `${caption}\n\n${hashtags}`,
                    productId: detectedProduct?.id,
                    platforms: activePlatforms
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Publish failed');
            }
        } catch (err: unknown) {
            console.error('Social publishing error:', err);
            setError(err instanceof Error ? err.message : 'Social publishing failed.');
        } finally {
            setPublishing(false);
        }
    };

    return (
        <div className="space-y-8 text-left selection:bg-primary/20">
            {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                    {error}
                </div>
            )}
            {/* Header Banner */}
            <div className="p-8 rounded-[3rem] bg-white border border-slate-200/80 text-foreground shadow-md relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="relative z-10 space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                        <Camera className="h-5 w-5 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">BAR OS Tactical Camera Engine</span>
                    </div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-foreground">Publish Protocol Studio</h2>
                    <p className="text-xs font-medium text-slate-500 max-w-xl">
                        Upload a photo and manually select a catalog product. AI copy and social publishing require configured provider integrations.
                    </p>
                </div>

                <div className="relative z-10 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-50 text-slate-600 border border-slate-200">
                        Draft mode
                    </span>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* LEFT COL: Camera Capture & Label Analyzer */}
                <div className="lg:col-span-5 space-y-6">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 text-foreground shadow-md space-y-6 relative overflow-hidden text-left">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-primary">
                                    <Camera size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Tactical Lens</h3>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Photo upload</p>
                                </div>
                            </div>

                            <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
                            <Button
                                onClick={() => fileInputRef.current?.click()}
                                variant="outline"
                                className="rounded-xl h-10 px-4 border-slate-200 bg-slate-50 text-foreground font-black uppercase text-[9px] tracking-widest hover:bg-slate-100"
                            >
                                <Upload size={14} className="mr-2" /> Upload Photo
                            </Button>
                        </div>

                        {/* Viewfinder Box */}
                        <div className="relative rounded-[2.5rem] bg-slate-50 border-2 border-dashed border-slate-200 aspect-square overflow-hidden flex flex-col items-center justify-center p-6 text-center group">
                            {selectedImage ? (
                                <div className="relative w-full h-full rounded-2xl overflow-hidden">
                                    <Image src={selectedImage} alt="Captured Bottle" fill className="object-cover" />
                                    <button
                                        onClick={() => setSelectedImage(null)}
                                        className="absolute top-3 right-3 h-8 w-8 rounded-full bg-slate-900/60 text-white flex items-center justify-center hover:bg-slate-900"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                    <div className="h-16 w-16 mx-auto rounded-3xl bg-white border border-slate-200 shadow-md flex items-center justify-center text-primary group-hover:scale-110 transition-all">
                                        <Camera size={28} />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-black uppercase text-foreground">Upload a product photo</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Product matching is selected manually below</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <label htmlFor="campaign-product" className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Link catalog product</label>
                            <select
                                id="campaign-product"
                                value={detectedProduct?.id ?? ''}
                                onChange={event => setDetectedProduct(products.find(product => product.id === Number(event.target.value)) || null)}
                                disabled={catalogLoading || products.length === 0}
                                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-foreground disabled:opacity-60"
                            >
                                <option value="">{catalogLoading ? 'Loading products...' : products.length ? 'Select a product' : 'No products available'}</option>
                                {products.map(product => (
                                    <option key={product.id} value={product.id}>{product.name}</option>
                                ))}
                            </select>
                        </div>

                        {detectedProduct && (
                            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <Tag className="h-5 w-5 text-primary shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-[8px] font-black uppercase text-primary tracking-widest">Linked Cellar Product</p>
                                        <h4 className="text-xs font-black uppercase text-foreground truncate">{detectedProduct.name}</h4>
                                        <p className="text-[10px] font-bold text-emerald-600">{formatPrice(detectedProduct.price)}</p>
                                    </div>
                                </div>
                                <span className="px-3 py-1 rounded-xl bg-white text-emerald-700 text-[9px] font-black uppercase border border-emerald-200 shrink-0">
                                    Stock: {detectedProduct.stock}
                                </span>
                            </div>
                        )}
                    </Card>
                </div>

                {/* RIGHT COL: AI Copy & Omnichannel Dispatch */}
                <div className="lg:col-span-7 space-y-6">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 text-foreground shadow-md space-y-6 text-left">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">AI Copy & Narrative</h3>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Generated from the selected catalog product</p>
                            </div>

                            <Button
                                onClick={() => generateAICopy()}
                                disabled={generatingAI}
                                variant="outline"
                                className="rounded-xl h-10 px-4 border-amber-200 bg-amber-50 text-primary font-black uppercase text-[9px] tracking-widest hover:bg-amber-100"
                            >
                                {generatingAI ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Sparkles size={14} className="mr-2" />}
                                AI Regenerate
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Main Caption</label>
                                <Textarea
                                    value={caption}
                                    onChange={e => setCaption(e.target.value)}
                                    placeholder="Enter a caption or generate one using the selected catalog product..."
                                    className="min-h-[120px] rounded-2xl bg-slate-50 border-slate-200 text-xs font-medium text-foreground leading-relaxed p-4"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Hashtags & Attributions</label>
                                <Input
                                    value={hashtags}
                                    onChange={e => setHashtags(e.target.value)}
                                    className="h-12 rounded-xl bg-amber-50 border-amber-200 text-xs font-mono font-black text-primary p-4"
                                />
                            </div>
                        </div>

                        {/* Platform Target Node Selector */}
                        <div className="space-y-3 pt-2">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Target Social Nodes</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { id: 'INSTAGRAM', label: 'Instagram', icon: Instagram },
                                    { id: 'FACEBOOK', label: 'Facebook', icon: Facebook },
                                    { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle },
                                    { id: 'YOUTUBE', label: 'YouTube Shorts', icon: Youtube }
                                ].map(p => {
                                    const active = platforms[p.id];
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => togglePlatform(p.id)}
                                            className={cn(
                                                "p-4 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 transition-all",
                                                active ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                                            )}
                                        >
                                            <p.icon size={20} />
                                            <span className="text-[10px] font-black uppercase tracking-wider">{p.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Launch Action Button */}
                        <div className="pt-4 border-t border-slate-100">
                            <Button
                                onClick={handlePublishProtocol}
                                disabled={publishing}
                                className="w-full h-16 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 hover:scale-105 transition-all"
                            >
                                {publishing ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Zap size={18} className="mr-2 fill-current" />}
                                {publishing ? 'Checking publishing integrations...' : 'Publish'}
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
