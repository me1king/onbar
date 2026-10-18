'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Layout, Plus, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Image from 'next/image';

interface ProductNode {
    id: number;
    name: string;
    price: number;
    image_url: string;
}

export default function ContentCommandStudio() {
    const [step, setStep] = React.useState(1);
    const [title, setTitle] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [selectedProduct, setSelectedProduct] = React.useState<ProductNode | null>(null);
    const [products, setProducts] = React.useState<ProductNode[]>([]);
    const [productsLoading, setProductsLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [saved, setSaved] = React.useState(false);

    React.useEffect(() => {
        async function fetchProducts() {
            if (!supabase) {
                setError('Product data is unavailable because the database is not connected.');
                setProductsLoading(false);
                return;
            }

            try {
                const { data, error: queryError } = await supabase
                    .from('products')
                    .select('id, name, price, image_url')
                    .limit(6);

                if (queryError) {
                    setError(`Could not load products: ${queryError.message}`);
                } else if (data) {
                    setProducts(data as ProductNode[]);
                }
            } catch (queryError) {
                console.error('Unable to load products:', queryError);
                setError(queryError instanceof Error ? queryError.message : 'Unable to load products from the database.');
            } finally {
                setProductsLoading(false);
            }
        }

        void fetchProducts();
    }, []);

    const draftDescription = description.trim() || (selectedProduct
        ? `${selectedProduct.name}${Number.isFinite(selectedProduct.price) ? ` — listed price: ${formatPrice(selectedProduct.price)}` : ''}.`
        : '');
    const draftTitle = title.trim() || selectedProduct?.name || '';

    const handlePreview = () => {
        setError('');
        setSaved(false);
        if (!selectedProduct) {
            setError('Select a product loaded from the database before previewing a draft.');
            return;
        }

        setStep(2);
    };

    const handleSaveDraft = async () => {
        if (!supabase) {
            setError('Cannot save this draft because the database is not connected.');
            return;
        }
        if (!selectedProduct) {
            setError('Select a database product before saving this draft.');
            return;
        }

        setSaving(true);
        setError('');
        setSaved(false);
        try {
            const { error: insertError } = await supabase.from('content_master').insert([{
                title: draftTitle,
                base_description: draftDescription,
                media_urls: [],
                product_ids: [selectedProduct.id],
                status: 'DRAFT'
            }]);

            if (insertError) throw insertError;
            setSaved(true);
        } catch (saveError) {
            console.error('Unable to save content draft:', saveError);
            setError(saveError instanceof Error ? saveError.message : 'Unable to save the content draft.');
        } finally {
            setSaving(false);
        }
    };

    const resetDraft = () => {
        setStep(1);
        setTitle('');
        setDescription('');
        setSelectedProduct(null);
        setError('');
        setSaved(false);
    };

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Layout className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">BAR OS CONTENT STUDIO</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Content Draft Studio</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Prepare and save content drafts using product data from the database.</p>
                </div>

                <Button onClick={resetDraft} className="rounded-2xl h-12 px-8 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">
                    <Plus className="h-4 w-4 mr-2" /> New Draft
                </Button>
            </header>

            {error && (
                <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
                    {error}
                </div>
            )}
            {saved && (
                <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
                    Draft saved to the database. It has not been scheduled or published.
                </div>
            )}

            <div className="grid lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8">
                    {step === 1 ? (
                        <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-8">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Select a database product</p>
                                    {productsLoading && <span className="text-xs text-slate-500">Loading products…</span>}
                                </div>
                                {!productsLoading && products.length === 0 && !error && (
                                    <p className="text-sm text-slate-500">No products are available to select.</p>
                                )}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {products.map(product => (
                                        <button
                                            key={product.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedProduct(product);
                                                if (!title.trim()) setTitle(product.name);
                                                setSaved(false);
                                            }}
                                            className={cn(
                                                "p-4 rounded-2xl border-2 transition-all text-left flex items-center gap-3 group shadow-sm",
                                                selectedProduct?.id === product.id ? "border-primary bg-primary/5" : "border-slate-100 bg-slate-50 hover:border-slate-200"
                                            )}
                                        >
                                            <div className="h-12 w-12 rounded-xl bg-white border border-slate-200 relative overflow-hidden shrink-0">
                                                <Image src={normalizeImage(product.image_url)} alt={product.name} fill className="object-contain p-1" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-black uppercase text-foreground truncate">{product.name}</p>
                                                <p className="text-[9px] font-bold text-primary">{formatPrice(product.price)}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label htmlFor="draft-title" className="text-[10px] font-black uppercase text-slate-400">Draft title</label>
                                    <Input
                                        id="draft-title"
                                        value={title}
                                        onChange={event => setTitle(event.target.value)}
                                        placeholder="Enter a draft title"
                                        className="h-14 rounded-2xl bg-slate-50 border-none font-black text-base uppercase"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="draft-description" className="text-[10px] font-black uppercase text-slate-400">Draft copy</label>
                                    <Textarea
                                        id="draft-description"
                                        value={description}
                                        onChange={event => setDescription(event.target.value)}
                                        placeholder="Write draft copy. Leave blank to use the selected product name and listed price."
                                        className="min-h-[120px] rounded-2xl bg-slate-50 border-none text-xs"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-end">
                                <Button
                                    onClick={handlePreview}
                                    disabled={productsLoading || !selectedProduct}
                                    className="h-14 px-10 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest flex items-center gap-3"
                                >
                                    <Sparkles size={18} /> Review Draft
                                </Button>
                            </div>
                        </Card>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between px-4">
                                <h2 className="text-2xl font-black uppercase tracking-tight text-foreground">Draft Preview</h2>
                                <button onClick={() => setStep(1)} className="text-[10px] font-black text-primary uppercase underline">Back to Editor</button>
                            </div>
                            <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-5">
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400">Title</p>
                                    <h3 className="mt-1 text-xl font-black text-foreground">{draftTitle}</h3>
                                </div>
                                {selectedProduct && (
                                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm">
                                        <p className="font-bold text-foreground">Selected database product: {selectedProduct.name}</p>
                                        {Number.isFinite(selectedProduct.price) && (
                                            <p className="text-slate-600">Listed price: {formatPrice(selectedProduct.price)}</p>
                                        )}
                                    </div>
                                )}
                                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 text-sm text-slate-700 whitespace-pre-line">
                                    {draftDescription}
                                </div>
                                <div className="pt-4 border-t border-slate-100 flex justify-end">
                                    <Button
                                        onClick={handleSaveDraft}
                                        disabled={saving}
                                        className="h-14 px-10 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest flex items-center gap-3"
                                    >
                                        {saving ? <Loader2 className="animate-spin" /> : null}
                                        {saving ? 'Saving Draft' : 'Save Draft'}
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>

                <aside className="lg:col-span-4">
                    <Card className="p-8 rounded-[3rem] bg-slate-950 text-white shadow-2xl space-y-4">
                        <h3 className="text-lg font-black uppercase text-slate-100">Publishing status</h3>
                        <p className="text-sm text-slate-300">Publishing is not connected. This page saves drafts to the database only; it does not create publishing jobs or send content to external platforms.</p>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
