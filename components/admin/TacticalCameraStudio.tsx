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
import { cn, formatPrice, normalizeImage } from '@/lib/utils';

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
    const [isCapturing, setIsCapturing] = React.useState(false);
    const [analyzingLabel, setAnalyzingLabel] = React.useState(false);
    const [detectedProduct, setDetectedProduct] = React.useState<ProductNode | null>(null);
    const [products, setProducts] = React.useState<ProductNode[]>([]);
    const [caption, setCaption] = React.useState('');
    const [hashtags, setHashtags] = React.useState('#OnlineBar #NairobiDispatch #Mixology #CellarVault');
    const [generatingAI, setGeneratingAI] = React.useState(false);

    // Platform selections
    const [platforms, setPlatforms] = React.useState<Record<string, boolean>>({
        INSTAGRAM: true,
        FACEBOOK: true,
        WHATSAPP: true,
        YOUTUBE: false,
    });

    // Timing
    const [timing, setTiming] = React.useState<'NOW' | 'SCHEDULED'>('NOW');
    const [scheduleTime, setScheduleTime] = React.useState('21:00');

    // Launch sequence state
    const [publishing, setPublishing] = React.useState(false);
    const [publishProgress, setPublishProgress] = React.useState(0);
    const [publishedSuccess, setPublishedSuccess] = React.useState(false);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Fetch Cellar Hub catalog on mount
    React.useEffect(() => {
        async function fetchProducts() {
            if (!supabase) return;
            const { data } = await supabase.from('products').select('id, name, price, stock, image_url, category').limit(12);
            if (data && data.length > 0) {
                setProducts(data as ProductNode[]);
                // Default product link
                setDetectedProduct(data[0] as ProductNode);
            }
        }
        fetchProducts();
    }, []);

    // Simulated Image Analysis (OCR & Vision Label Matching)
    const handleImageSelect = (imageUrl: string) => {
        setSelectedImage(imageUrl);
        setAnalyzingLabel(true);

        setTimeout(() => {
            setAnalyzingLabel(false);
            if (products.length > 0) {
                // Pick a matching or random product from inventory
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

    // AI Copy Generator (Gemini AI API or fallback template)
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

    // Execute Omnichannel Launch Protocol
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

            // Call Backend Omnichannel Publish API
            const res = await fetch('/api/admin/social/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaUrl: selectedImage || detectedProduct?.image_url || 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&q=80',
                    caption: `${caption}\n\n${hashtags}`,
                    productId: detectedProduct?.id,
                    platforms: activePlatforms,
                    timing,
                    scheduleTime
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
            <div className="p-8 rounded-[3rem] bg-slate-950 border border-slate-800 text-slate-100 shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="relative z-10 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400">
                        <Camera className="h-5 w-5 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">BAR OS Tactical Camera Engine</span>
                    </div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-100">Publish Protocol Studio</h2>
                    <p className="text-xs font-medium text-slate-400 max-w-xl">
                        Capture bottle label &rarr; AI links Cellar Hub product &rarr; Generates copy &rarr; Single-tap publish to Instagram, Facebook, WhatsApp & YouTube.
                    </p>
                </div>

                <div className="relative z-10 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                        SYSTEM READY
                    </span>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* LEFT COL: Camera Capture & Label Analyzer */}
                <div className="lg:col-span-5 space-y-6">
                    <Card className="p-8 rounded-[3.5rem] bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl space-y-6 relative overflow-hidden text-left">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                                    <Camera size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-100">Tactical Lens</h3>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Bottle & Label Recognition</p>
                                </div>
                            </div>

                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                            />

                            <Button
                                onClick={() => fileInputRef.current?.click()}
                                variant="outline"
                                className="h-9 px-3 rounded-xl border-slate-700 bg-slate-800 text-slate-200 text-[9px] font-black uppercase hover:bg-slate-700 hover:text-white"
                            >
                                <Upload size={12} className="mr-1.5" /> Upload Photo
                            </Button>
                        </div>

                        {/* Image Preview Box */}
                        <div className="aspect-[4/3] rounded-[2.5rem] bg-slate-950 border-2 border-dashed border-slate-800 relative overflow-hidden flex flex-col items-center justify-center group hover:border-amber-500/50 transition-all">
                            {selectedImage ? (
                                <>
                                    <Image src={selectedImage} alt="Bottle capture" fill className="object-cover" />
                                    <button
                                        onClick={() => setSelectedImage(null)}
                                        className="absolute top-4 right-4 h-9 w-9 rounded-full bg-slate-950/80 text-rose-400 border border-slate-800 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all z-20"
                                    >
                                        <X size={16} />
                                    </button>
                                </>
                            ) : (
                                <div className="text-center p-6 space-y-4">
                                    <div className="h-16 w-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-amber-400 shadow-inner group-hover:scale-110 transition-transform">
                                        <Camera size={32} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black uppercase text-slate-200">Point Camera at Bottle</p>
                                        <p className="text-[9px] font-medium text-slate-500 mt-1">Tap below to capture live frame or select from phone gallery</p>
                                    </div>
                                    <Button
                                        onClick={() => {
                                            // Simulated capture of a high-res whiskey bottle
                                            const demoImages = [
                                                'https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&q=80',
                                                'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?auto=format&fit=crop&q=80',
                                                'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&q=80'
                                            ];
                                            const picked = demoImages[Math.floor(Math.random() * demoImages.length)];
                                            handleImageSelect(picked);
                                        }}
                                        className="h-10 px-6 rounded-xl bg-amber-500 text-slate-950 font-black uppercase text-[9px] tracking-widest hover:bg-amber-400 shadow-lg shadow-amber-500/20"
                                    >
                                        <Zap size={14} className="mr-1.5 fill-current" /> Snap Bottle Frame
                                    </Button>
                                </div>
                            )}

                            {analyzingLabel && (
                                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 space-y-3 z-30 animate-in fade-in">
                                    <Loader2 className="h-10 w-10 text-amber-400 animate-spin" />
                                    <p className="text-xs font-black uppercase text-amber-400 tracking-widest animate-pulse">Analyzing Bottle Label & OCR...</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Matching with Cellar Hub Database</p>
                                </div>
                            )}
                        </div>

                        {/* Cellar Hub Matched Product Node */}
                        <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                                    <Tag size={12} /> Linked Cellar Product
                                </span>
                                {detectedProduct && (
                                    <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                        IN STOCK ({detectedProduct.stock} Left)
                                    </span>
                                )}
                            </div>

                            {detectedProduct ? (
                                <div className="flex items-center justify-between gap-4 pt-1">
                                    <div>
                                        <p className="text-sm font-black uppercase text-slate-100">{detectedProduct.name}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{formatPrice(detectedProduct.price)}</p>
                                    </div>
                                    <Button
                                        onClick={() => {
                                            // Cycle to next product in list
                                            const nextIdx = (products.findIndex(p => p.id === detectedProduct.id) + 1) % products.length;
                                            if (products[nextIdx]) {
                                                setDetectedProduct(products[nextIdx]);
                                                generateAICopy(products[nextIdx].name, products[nextIdx].category);
                                            }
                                        }}
                                        variant="ghost"
                                        className="h-8 text-[9px] font-black uppercase text-slate-400 hover:text-white"
                                    >
                                        Switch Item &rarr;
                                    </Button>
                                </div>
                            ) : (
                                <p className="text-[10px] font-medium text-slate-500 italic">No bottle captured yet. Capture or upload a photo to auto-link product.</p>
                            )}
                        </div>
                    </Card>
                </div>

                {/* RIGHT COL: AI Copy Assistant & Omnichannel Deployment */}
                <div className="lg:col-span-7 space-y-6">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-6 text-left">
                        {/* Copy Editor */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-tighter text-foreground">AI Copy & Narrative</h3>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Kenya Nightlife & Bar Conversion Copy</p>
                                </div>

                                <Button
                                    onClick={() => generateAICopy()}
                                    disabled={generatingAI}
                                    className="h-9 px-4 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white text-[9px] font-black uppercase transition-all"
                                >
                                    {generatingAI ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                                    AI Regenerate
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Main Caption</label>
                                <Textarea
                                    value={caption}
                                    onChange={e => setCaption(e.target.value)}
                                    className="min-h-[110px] rounded-2xl bg-slate-50 border-slate-200 p-4 font-medium text-xs resize-none text-slate-800"
                                    placeholder="Caption will be auto-generated upon capturing bottle image..."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Hashtags & Attributions</label>
                                <Input
                                    value={hashtags}
                                    onChange={e => setHashtags(e.target.value)}
                                    className="h-11 rounded-xl bg-slate-50 border-slate-200 font-bold text-xs text-primary"
                                />
                            </div>
                        </div>

                        {/* Deployment Channels Selectors */}
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Target Social Nodes</label>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { id: 'INSTAGRAM', label: 'Instagram', icon: Instagram, color: 'rose' },
                                    { id: 'FACEBOOK', label: 'Facebook', icon: Facebook, color: 'indigo' },
                                    { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, color: 'emerald' },
                                    { id: 'YOUTUBE', label: 'YouTube Shorts', icon: Youtube, color: 'red' },
                                ].map(ch => {
                                    const active = platforms[ch.id];
                                    return (
                                        <button
                                            key={ch.id}
                                            onClick={() => togglePlatform(ch.id)}
                                            className={cn(
                                                "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 text-center group",
                                                active
                                                    ? "bg-slate-900 border-primary text-white shadow-xl"
                                                    : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200"
                                            )}
                                        >
                                            <ch.icon className={cn("h-6 w-6", active ? "text-primary" : "text-slate-400")} />
                                            <span className="text-[9px] font-black uppercase tracking-widest">{ch.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Timing Selector */}
                        <div className="space-y-3 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <label className="text-[9px] font-black uppercase text-slate-400">Deployment Timing</label>
                                <p className="text-[10px] font-bold text-slate-600 uppercase">
                                    {timing === 'NOW' ? 'Immediate Execution' : `Scheduled for ${scheduleTime}`}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setTiming('NOW')}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                                        timing === 'NOW' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-slate-100 text-slate-500"
                                    )}
                                >
                                    Publish Now
                                </button>
                                <button
                                    onClick={() => setTiming('SCHEDULED')}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                                        timing === 'SCHEDULED' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-slate-100 text-slate-500"
                                    )}
                                >
                                    <Clock size={12} /> Schedule
                                </button>
                            </div>
                        </div>

                        {/* Master Launch Button */}
                        <div className="pt-4 border-t border-slate-100">
                            {publishing ? (
                                <div className="p-6 rounded-[2rem] bg-slate-950 text-white space-y-3 text-center animate-in zoom-in-95">
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase text-amber-400">
                                        <span className="flex items-center gap-2">
                                            <Loader2 size={14} className="animate-spin" />
                                            EXECUTING PUBLISH PROTOCOL
                                        </span>
                                        <span>{publishProgress}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-300"
                                            style={{ width: `${publishProgress}%` }}
                                        />
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">
                                        Dispatching payload across Instagram, Facebook, WhatsApp & YouTube...
                                    </p>
                                </div>
                            ) : publishedSuccess ? (
                                <div className="p-6 rounded-[2rem] bg-emerald-500 text-white flex items-center justify-center gap-3 font-black uppercase text-xs tracking-widest shadow-xl animate-in fade-in">
                                    <CheckCircle2 size={24} />
                                    <span>OMNICHANNEL LAUNCH COMPLETE! 🚀</span>
                                </div>
                            ) : (
                                <Button
                                    onClick={handlePublishProtocol}
                                    className="w-full h-16 rounded-[2rem] bg-primary text-white font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                                >
                                    <Zap size={20} className="fill-current" />
                                    PUBLISH PROTOCOL (SINGLE-TAP)
                                </Button>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
