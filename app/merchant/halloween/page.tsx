'use client';

import { Button } from '@/components/ui/button';
import { ImagePlus, Package, Sparkles, Store } from 'lucide-react';
import { ChangeEvent, useEffect, useState } from 'react';

interface CostumeListing {
  id: number;
  name: string;
  category: string;
  size: string;
  price: number;
  stock: number;
  description: string;
  image: string;
  createdAt: string;
}

const STORAGE_KEY = 'halloween_merchant_listings';

const initialListings: CostumeListing[] = [
  {
    id: 1,
    name: 'Midnight Witch Set',
    category: 'Witch',
    size: 'M',
    price: 3200,
    stock: 12,
    description: 'Velvet witch look with cape and wide-brim hat.',
    image: '',
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    name: 'Blood Moon Vampire',
    category: 'Vampire',
    size: 'L',
    price: 3600,
    stock: 8,
    description: 'Classic satin vampire look with tailored cape and collar.',
    image: '',
    createdAt: new Date().toISOString()
  }
];

export default function MerchantHalloweenPage() {
  const [listings, setListings] = useState<CostumeListing[]>(initialListings);
  const [form, setForm] = useState({
    name: '',
    category: 'Witch',
    size: 'M',
    price: '3200',
    stock: '10',
    description: ''
  });
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as CostumeListing[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setListings(parsed);
      }
    } catch (error) {
      console.warn('Could not restore costume listings:', error);
    }
  }, []);

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    const nextListing: CostumeListing = {
      id: Date.now(),
      name: form.name || 'New Halloween fit',
      category: form.category,
      size: form.size,
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
      description: form.description || 'Fresh seasonal drop.',
      image: image || '',
      createdAt: new Date().toISOString()
    };

    const next = [nextListing, ...listings];
    setListings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setForm({ name: '', category: 'Witch', size: 'M', price: '3200', stock: '10', description: '' });
    setImage(null);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-[2.5rem] border border-violet-200 bg-gradient-to-br from-violet-950 via-slate-950 to-rose-950 p-6 text-white shadow-[0_30px_80px_-45px_rgba(168,85,247,0.9)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.28em] text-violet-200">
              <Store size={12} /> Merchant studio
            </p>
            <h1 className="mt-4 text-4xl font-black uppercase tracking-[-0.06em] sm:text-5xl">Halloween costume seller</h1>
          </div>
          <div className="rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-violet-200">
            Multi-vendor ready
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-violet-700">
            <Sparkles size={12} /> New listing
          </div>

          <div className="space-y-4">
            <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Costume name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none" />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Category
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none">
                  <option value="Witch">Witch</option>
                  <option value="Vampire">Vampire</option>
                  <option value="Space">Space</option>
                  <option value="Masquerade">Masquerade</option>
                  <option value="Hero">Hero</option>
                  <option value="Classic">Classic</option>
                </select>
              </label>

              <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Size
                <select value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none">
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Price (KES)
                <input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none" />
              </label>

              <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Stock
                <input type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none" />
              </label>
            </div>

            <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Description
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-2 min-h-[100px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none" />
            </label>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50 px-4 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-violet-700">
              <ImagePlus size={14} /> Upload product image
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>

            {image && (
              <div className="overflow-hidden rounded-[1.4rem] border border-slate-200">
                <img src={image} alt="Selected costume preview" className="h-40 w-full object-cover" />
              </div>
            )}

            <Button className="w-full rounded-2xl bg-slate-950 text-white hover:bg-slate-800 font-black uppercase tracking-[0.2em] text-[9px]" onClick={handleSubmit}>
              Publish listing
            </Button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-slate-700">
            <Package size={12} /> Active costume drops
          </div>

          <div className="space-y-3">
            {listings.map((listing) => (
              <div key={listing.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3">
                <div className="flex gap-3">
                  <div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-200">
                    {listing.image ? (
                      <img src={listing.image} alt={listing.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">No image</div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black uppercase tracking-tighter text-slate-900">{listing.name}</p>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-600">{listing.category}</p>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-emerald-700">{listing.stock} in stock</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{listing.description}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-lg font-black tracking-tighter text-slate-900">KSh {listing.price.toLocaleString()}</span>
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{listing.size}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
