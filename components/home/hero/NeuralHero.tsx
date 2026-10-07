'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Gift, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice, normalizeImage } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useSettings } from '@/lib/useSettings';

interface FeaturedProduct {
    id: number;
    name: string;
    price: number;
    image_url: string | null;
    category: string | null;
}

export default function NeuralHero() {
    const [featured, setFeatured] = React.useState<FeaturedProduct | null>(null);
    const [imageFailed, setImageFailed] = React.useState(false);
    const { settings, loading: settingsLoading } = useSettings();
    const homepage = settings.homepage;

    React.useEffect(() => {
        let active = true;
        async function loadFeaturedProduct() {
            if (settingsLoading) return;
            setFeatured(null);
            setImageFailed(false);
            if (!supabase) return;
            let query = supabase
                .from('products')
                .select('id, name, price, image_url, category')
                .gt('stock', 0);
            if (homepage.featured_product_id) {
                query = query.eq('id', homepage.featured_product_id);
            } else {
                query = query.order('created_at', { ascending: false }).limit(1);
            }
            const { data, error } = await query.maybeSingle();
            if (error) {
                console.error('Could not load the homepage product feature:', error);
                return;
            }
            if (active && data) setFeatured(data as FeaturedProduct);
        }
        void loadFeaturedProduct();
        return () => { active = false; };
    }, [homepage.featured_product_id, settingsLoading]);

    const imageUrl = homepage.hero_image_url
        ? normalizeImage(homepage.hero_image_url)
        : featured?.image_url ? normalizeImage(featured.image_url) : '';
    const categories = homepage.categories ?? [
            { label: 'Spirits', href: '/shop/category/spirits' },
            { label: 'Wine', href: '/shop/category/wine' },
            { label: 'Beer', href: '/shop/category/beer' },
            { label: 'Snacks', href: '/bites' }
        ];

    return (
        <div className="overflow-hidden">
            <section className="relative isolate overflow-hidden bg-[#fff8ec] px-4 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
                <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 -z-10 h-80 w-80 rounded-full bg-amber-300/40 blur-3xl sm:h-[32rem] sm:w-[32rem]" />
                <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-0 -z-10 h-72 w-72 rounded-full bg-orange-200/50 blur-3xl" />

                <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
                    <div className="min-w-0 space-y-7 sm:space-y-9">
                        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-amber-300/70 bg-white/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-800 shadow-sm sm:text-xs sm:tracking-[0.22em]">
                            <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-500" />
                            {homepage.hero_badge_text || 'Nairobi drinks, snacks & gifting'}
                        </div>

                        <div className="max-w-3xl">
                            <h1 className="text-pretty break-words text-5xl font-black uppercase leading-[0.94] tracking-[-0.055em] text-slate-950 sm:text-6xl md:text-7xl xl:text-8xl">
                                {homepage.hero_title_line1 || 'Make tonight'}
                                <span className="mt-1 block text-primary">{homepage.hero_title_line2 || 'a good one.'}</span>
                            </h1>
                            <p className="mt-6 max-w-xl text-pretty text-base font-medium leading-relaxed text-slate-600 sm:text-lg md:text-xl">
                                {homepage.hero_subtitle || 'Find something for the table, the celebration, or a gift worth sending. Browse the live menu and choose what suits your night.'}
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <Link href={homepage.primary_cta_href || '/shop'} className="w-full sm:w-auto">
                                <Button className="h-14 w-full rounded-2xl bg-slate-950 px-7 text-sm font-black uppercase tracking-wider text-white hover:bg-primary sm:h-16 sm:px-9">
                                    {homepage.primary_cta_label || 'Explore the menu'} <ArrowRight className="ml-3 h-5 w-5" />
                                </Button>
                            </Link>
                            <Link href={homepage.secondary_cta_href || '/gifting'} className="w-full sm:w-auto">
                                <Button variant="outline" className="h-14 w-full rounded-2xl border-slate-300 bg-white/80 px-7 text-sm font-black uppercase tracking-wider text-slate-800 hover:border-primary hover:text-primary sm:h-16 sm:px-8">
                                    <Gift className="mr-2 h-4 w-4" /> {homepage.secondary_cta_label || 'Send a gift'}
                                </Button>
                            </Link>
                        </div>

                        <a href="#home-categories" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-primary">
                            {homepage.browse_link_label || 'Find your kind of night'} <ArrowDown aria-hidden="true" className="h-4 w-4" />
                        </a>
                    </div>

                    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
                        <div className="relative min-h-[19rem] overflow-hidden rounded-[2rem] border border-white/80 bg-gradient-to-br from-orange-200 via-orange-100 to-amber-50 p-5 shadow-[0_30px_80px_-36px_rgba(124,45,18,0.45)] sm:min-h-[27rem] sm:rounded-[2.75rem] sm:p-8">
                            <div aria-hidden="true" className="absolute -right-10 -top-10 h-48 w-48 rounded-full border-[28px] border-white/30 sm:h-64 sm:w-64" />
                            <div aria-hidden="true" className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-orange-400/20 blur-2xl sm:h-72 sm:w-72" />

                            {imageUrl && !imageFailed ? (
                                <Image
                                    src={imageUrl}
                                    alt={featured?.name || 'Featured menu item'}
                                    fill
                                    unoptimized
                                    sizes="(max-width: 1024px) 100vw, 50vw"
                                    onError={() => setImageFailed(true)}
                                    className="object-contain p-8 drop-shadow-[0_28px_28px_rgba(60,30,10,0.22)] sm:p-12"
                                    priority
                                />
                            ) : (
                                <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                                    <div className="h-40 w-40 rounded-full border border-white/70 bg-white/35 shadow-[0_20px_70px_-20px_rgba(120,53,15,0.3)] backdrop-blur-sm sm:h-60 sm:w-60" />
                                    <div className="absolute h-28 w-20 rounded-[1.25rem] border border-white/80 bg-gradient-to-br from-white/80 to-amber-100/80 shadow-xl rotate-[-8deg] sm:h-40 sm:w-28 sm:rounded-[1.75rem]" />
                                    <Sparkles aria-hidden="true" className="absolute right-[17%] top-[17%] h-8 w-8 text-white sm:h-12 sm:w-12" />
                                </div>
                            )}

                            <div className="absolute inset-x-4 bottom-4 z-10 flex min-w-0 items-end justify-between gap-3 rounded-2xl border border-white/60 bg-white/90 p-4 shadow-xl backdrop-blur-md sm:inset-x-6 sm:bottom-6 sm:p-5">
                                <div className="min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary sm:text-[10px] sm:tracking-[0.22em]">
                                        {featured?.category || 'From the live menu'}
                                    </p>
                                    <h2 className="mt-1 truncate text-base font-black leading-tight text-slate-900 sm:text-xl">
                                        {featured?.name || 'Explore the menu'}
                                    </h2>
                                    {featured && <p className="mt-1 text-sm font-bold text-slate-600">{formatPrice(featured.price)}</p>}
                                </div>
                                <Link href={featured ? `/shop/${featured.id}` : '/shop'} aria-label={featured ? `View ${featured.name}` : 'Browse the menu'} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white transition hover:bg-primary">
                                    <ArrowRight aria-hidden="true" className="h-5 w-5" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <nav id="home-categories" aria-label="Shop by category" className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-7 sm:gap-4 sm:px-8 sm:py-10 lg:grid-cols-4 lg:px-12">
                {categories.map(category => (
                    <Link key={category.label} href={category.href} className="group flex min-h-24 min-w-0 items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition lg:hover:-translate-y-1 lg:hover:border-primary/40 lg:hover:shadow-lg sm:min-h-28 sm:gap-3 sm:rounded-3xl sm:p-6">
                        <span className="break-words text-lg font-black uppercase leading-tight tracking-tight text-slate-900 sm:text-xl">{category.label}</span>
                        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-50 text-primary transition sm:h-9 sm:w-9 lg:group-hover:bg-primary lg:group-hover:text-white">
                            <ArrowRight className="h-4 w-4" />
                        </span>
                    </Link>
                ))}
            </nav>
        </div>
    );
}
