'use client';

import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { HalloweenTheme, halloweenCatalog, halloweenCategories } from '@/lib/halloweenCatalog';
import { HalloweenTryOnStudio } from '@/components/tryon/HalloweenTryOnStudio';
import { HalloweenFitQuiz } from '@/components/halloween/HalloweenFitQuiz';
import { HalloweenPhotoTryOn } from '@/components/halloween/HalloweenPhotoTryOn';
import { ArrowRight, Sparkles, Tag, Wand2, Shirt, Camera } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export function HalloweenShop() {
  const { addToCart } = useCart();
  const [activeTheme, setActiveTheme] = useState<HalloweenTheme>('All');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [showFitQuiz, setShowFitQuiz] = useState(false);
  const [showPhotoTryOn, setShowPhotoTryOn] = useState(false);

  const filteredProducts = useMemo(() => {
    const list = activeTheme === 'All' ? halloweenCatalog : halloweenCatalog.filter((item) => item.theme === activeTheme);
    return list;
  }, [activeTheme]);

  const selectedProduct = halloweenCatalog.find((item) => item.id === selectedProductId) ?? null;

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-[2.5rem] border border-violet-200 bg-gradient-to-br from-violet-950 via-slate-950 to-rose-950 p-6 shadow-[0_30px_80px_-54px_rgba(168,85,247,0.85)] sm:p-8 lg:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.28em] text-violet-200">
              <Sparkles size={12} /> Halloween drop
            </p>
            <h1 className="mt-4 text-4xl font-black uppercase leading-[0.9] tracking-[-0.06em] text-white sm:text-5xl lg:text-6xl">
              Costume store <span className="text-violet-300">for the season</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-violet-100/80 sm:text-lg">
              Discover ready-to-wear looks, custom party fits, and a 3D virtual try-on preview before you add it to cart.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/shop" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-900 transition hover:bg-violet-100">
              Full store <ArrowRight size={14} />
            </Link>
            <Link href="/merchant/halloween" className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-violet-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-violet-100 transition hover:bg-violet-500/20">
              Merchant portal
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-violet-200">
              <Tag size={12} /> 7-day countdown
            </span>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap gap-2">
          {halloweenCategories.map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => setActiveTheme(theme)}
              className={`rounded-full border px-4 py-2 text-[9px] font-black uppercase tracking-[0.24em] transition ${
                activeTheme === theme
                  ? 'border-violet-300 bg-violet-400 text-slate-950 shadow-lg shadow-violet-500/20'
                  : 'border-white/10 bg-white/5 text-violet-100 hover:bg-white/10'
              }`}
            >
              {theme}
            </button>
          ))}
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-3">
          <button onClick={() => setShowFitQuiz(true)} className="rounded-[1.5rem] border border-violet-400/30 bg-white/5 p-4 text-left text-white hover:bg-white/10">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-violet-300"><Shirt size={12} /> Size guide</div>
            <div className="mt-3 text-xl font-black uppercase tracking-tighter">Find your fit</div>
          </button>

          <button onClick={() => setShowPhotoTryOn(true)} className="rounded-[1.5rem] border border-violet-400/30 bg-white/5 p-4 text-left text-white hover:bg-white/10">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-violet-300"><Camera size={12} /> Photo try-on</div>
            <div className="mt-3 text-xl font-black uppercase tracking-tighter">Upload your selfie</div>
          </button>

          <Link href="/checkout" className="rounded-[1.5rem] border border-violet-400/30 bg-violet-500/10 p-4 text-left text-white hover:bg-violet-500/20">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-violet-200"><ArrowRight size={12} /> Checkout</div>
            <div className="mt-3 text-xl font-black uppercase tracking-tighter">M-Pesa + cards</div>
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredProducts.map((product) => (
          <article key={product.id} className="group overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="relative h-72 overflow-hidden bg-gradient-to-br" style={{ backgroundImage: `linear-gradient(135deg, ${product.palette[0]}, ${product.palette[1]}, ${product.palette[2]})` }}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.5),transparent_40%)]" />
              <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                {product.badges.map((badge) => (
                  <span key={badge} className="rounded-full border border-white/40 bg-slate-950/20 px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white">
                    {badge}
                  </span>
                ))}
              </div>

              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/80">{product.category}</p>
                  <h2 className="mt-2 text-2xl font-black uppercase tracking-tighter text-white">{product.name}</h2>
                </div>
                <div className="rounded-full border border-white/30 bg-black/15 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white">
                  {product.sizes.length} sizes
                </div>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <p className="text-sm leading-relaxed text-slate-600">{product.description}</p>

              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black tracking-tighter text-slate-900">KSh {product.price.toLocaleString()}</span>
                    {product.oldPrice && (
                      <span className="text-sm font-semibold text-slate-400 line-through">KSh {product.oldPrice.toLocaleString()}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600">Fit note: {product.fitNote}</p>
                </div>
                <div className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-violet-700">
                  3D trial
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <span key={size} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
                    {size}
                  </span>
                ))}
              </div>

              <div className="flex gap-3">
                <Button
                  className="flex-1 rounded-2xl bg-slate-950 text-white hover:bg-slate-800 font-black uppercase tracking-[0.22em] text-[9px]"
                  onClick={() => {
                    addToCart({
                      id: product.id,
                      name: product.name,
                      price: product.price,
                      base_price: product.price,
                      image: '',
                      quantity: 1,
                      category: product.category,
                      size: product.sizes[0]
                    });
                  }}
                >
                  Add to cart
                </Button>
                <Button
                  variant="outline"
                  className="rounded-2xl border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 font-black uppercase tracking-[0.2em] text-[9px]"
                  onClick={() => setSelectedProductId(product.id)}
                >
                  <Wand2 size={14} className="mr-2" /> Try it on
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {selectedProduct && (
        <HalloweenTryOnStudio
          product={selectedProduct}
          onClose={() => setSelectedProductId(null)}
        />
      )}

      {showFitQuiz && <HalloweenFitQuiz onClose={() => setShowFitQuiz(false)} />}
      {showPhotoTryOn && <HalloweenPhotoTryOn productName={filteredProducts[0]?.name ?? 'Halloween costume'} onClose={() => setShowPhotoTryOn(false)} />}
    </div>
  );
}
