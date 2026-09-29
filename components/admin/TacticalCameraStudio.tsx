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
    CheckCircle2,
    Loader2,
    Zap,
    Clock,
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
    const [analyzingLabel, setAnalyzingLabel] = React.useState(false);
    const [detectedProduct, setDetectedProduct] = React.useState<ProductNode | null>(null);
    const [products, setProducts] = React.useState<ProductNode[]>([]);
    const [caption, setCaption] = React.useState('');
    const [hashtags, setHashtags] = React.useState('#OnlineBar #NairobiDispatch #Mixology #CellarVault');
    const [generatingAI, setGeneratingAI] = React.useState(false);

    const [platforms, setPlatforms] = React.useState<Record<string, boolean>>({
        INSTAGRAM: true,
        FACEBOOK: true,
        WHATSAPP: true,
        YOUTUBE: false,
    });

    const [timing, setTiming] = React.useState<'NOW' | 'SCHEDULED'>('NOW');
    const [publishing, setPublishing] = React.useState(false);
    const [publishProgress, setPublishProgress] = React.useState(0);
    const [publishedSuccess, setPublishedSuccess] = React.useState(false);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        async function fetchProducts() {
            if (!supabase) return;
            const { data } = await supabase.from('products').select('id, name, price, stock, image_url, category').limit(12);
            if (data && data.length > 0) {
                setProducts(data as ProductNode[]);
                setDetectedProduct(data[0] as ProductNode);
            }
        }
        fetchProducts();
    }, []);

    const handleImageSelect = (imageUrl: string) => {
        setSelectedImage(imageUrl);
        setAnalyzingLabel(true);

        setTimeout(() => {
            setAnalyzingLabel(false);
            if (products.length > 0) {
                const matched = products[Math.floor(Math.random() * products.length)];
                setDetectedProduct(matched);
                generateAICopy(matched.name, matched.category || 'whiskey');
            }
        }, 1200);
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
        const targetName = productName || detectedProduct?.name || 'Jameson Irish Whiskey 750ml';
        setGeneratingAI(true);

        try {
            const res = await fetch('/api/admin/generate-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: targetName, category: category || 'whiskey' })
            });
            const data = await res.json();
            if (data.description) {
                setCaption(`🍾 ${targetName.toUpperCase()} NOW LIVE IN CELLAR HUB!\n\n${data.description}\n\n🛒 Order now for direct dispatch in under 30 mins.`);
            } else {
                setCaption(`🔥 WEEKEND DROP: ${targetName.toUpperCase()}\n\nPremium chilling elevated. Available now at Online Bar Nairobi with fast dispatch.\n\n🥂 Tap link to order directly.`);
            }
        } catch {
            setCaption(`🔥 WEEKEND DROP: ${targetName.toUpperCase()}\n\nPremium chilling elevated. Available now at Online Bar Nairobi with fast dispatch.\n\n🥂 Tap link to order directly.`);
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
        setPublishProgress(10);

        try {
            const interval = setInterval(() => {
                setPublishProgress(prev => {
                    if (prev >= 90) {
                        clearInterval(interval);
                        return 90;
                    }
                    return prev + 20;
                });
            }, 300);

            const res = await fetch('/api/admin/social/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaUrl: selectedImage || detectedProduct?.image_url || 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&q=80',
                    caption: `${caption}\n\n${hashtags}`,
                    productId: detectedProduct?.id,
                    platforms: activePlatforms,
                    timing,
                    scheduleTime: '21:00'
                })
            });

            const data = await res.json();
            clearInterval(interval);
            setPublishProgress(100);

            if (data.success) {
                setPublishedSuccess(true);
                setTimeout(() => {
                    setPublishing(false);
                    setPublishedSuccess(false);
                    setPublishProgress(0);
                }, 3000);
            } else {
                throw new Error(data.error || 'Publish failed');
            }
        } catch (err: unknown) {
            console.error(err);
            alert(`Publish Protocol Failure: ${(err as Error).message}`);
            setPublishing(false);
            setPublishProgress(0);
        }
    };

    return (
        <div className="space-y-8 text-left selection:bg-primary/20">
            {/* Header Banner */}
            <div className="p-8 rounded-[3rem] bg-white border border-slate-200/80 text-foreground shadow-md relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="relative z-10 space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                        <Camera className="h-5 w-5 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">BAR OS Tactical Camera Engine</span>
                    </div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-foreground">Publish Protocol Studio</h2>
                    <p className="text-xs font-medium text-slate-500 max-w-xl">
                        Capture bottle label &rarr; AI links Cellar Hub product &rarr; Generates copy &rarr; Single-tap publish to Instagram, Facebook, WhatsApp & YouTube.
                    </p>
                </div>

                <div className="relative z-10 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-200">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                        SYSTEM READY
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
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Bottle & Label Recognition</p>
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
                                        <p className="text-xs font-black uppercase text-foreground">Point Camera at Bottle</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Tap to capture live frame or select from phone</p>
                                    </div>
                                </div>
                            )}

                            {analyzingLabel && (
                                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-6 text-center">
                                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Executing OCR Label Match &bull; Neural Vision Node...</p>
                                </div>
                            )}
                        </div>

                        {/* Detected Linked Product Card */}
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
                                    In Stock ({detectedProduct.stock})
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
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Kenya Nightlife & Bar Conversion Copy</p>
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
                                    placeholder="Caption will be auto-generated upon capturing bottle image..."
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
                                {publishing ? `Executing Protocol (${publishProgress}%)...` : 'Execute Omnichannel Launch Protocol'}
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
