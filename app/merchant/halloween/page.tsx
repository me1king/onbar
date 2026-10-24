'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ImagePlus, Package, Sparkles, Store } from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  HALLOWEEN_LISTINGS_STORAGE_KEY,
  HALLOWEEN_LISTINGS_UPDATED_EVENT,
  HalloweenMerchantListing,
  parseHalloweenMerchantListings
} from '@/lib/halloweenCatalog';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_IMAGE_BYTES = 320 * 1024;

function resizeProductImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const imageElement = new window.Image();
    imageElement.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 1000 / Math.max(imageElement.naturalWidth, imageElement.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(imageElement.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(imageElement.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('This browser could not prepare the uploaded image.'));
        return;
      }
      context.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('The uploaded image could not be processed.'));
          return;
        }
        if (blob.size > MAX_STORED_IMAGE_BYTES) {
          reject(new Error('This image is too large after compression. Choose a smaller image.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('The processed image could not be read.'));
        reader.readAsDataURL(blob);
      }, 'image/webp', 0.78);
    };
    imageElement.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected file is not a readable image.'));
    };
    imageElement.src = objectUrl;
  });
}

export default function MerchantHalloweenPage() {
  const [listings, setListings] = useState<HalloweenMerchantListing[]>([]);
  const [form, setForm] = useState({
    name: '',
    category: 'Witch',
    size: 'M',
    price: '3200',
    stock: '10',
    description: ''
  });
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const loadListings = () => {
      try {
        setListings(parseHalloweenMerchantListings(localStorage.getItem(HALLOWEEN_LISTINGS_STORAGE_KEY)));
      } catch (cause) {
        console.error('[HalloweenMerchant] Could not restore costume listings:', cause);
        setError('Saved listings could not be read in this browser. Export or clear the invalid browser data before continuing.');
      }
    };
    loadListings();
    window.addEventListener('storage', loadListings);
    return () => window.removeEventListener('storage', loadListings);
  }, []);

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use a JPEG, PNG, or WebP product image.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Choose a product image smaller than 8 MB.');
      event.target.value = '';
      return;
    }
    try {
      setImage(await resizeProductImage(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The product image could not be prepared.');
      event.target.value = '';
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const name = form.name.trim();
    const description = form.description.trim();
    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!name || !description || !image || !Number.isSafeInteger(price) || price < 1
      || !Number.isSafeInteger(stock) || stock < 0) {
      setError('Add a name, description, product photo, whole-KES price, and valid stock quantity.');
      return;
    }

    const nextListing: HalloweenMerchantListing = {
      id: Date.now(),
      name,
      category: form.category,
      size: form.size,
      price,
      stock,
      description,
      image,
      createdAt: new Date().toISOString()
    };

    const next = [nextListing, ...listings];
    try {
      localStorage.setItem(HALLOWEEN_LISTINGS_STORAGE_KEY, JSON.stringify(next));
      setListings(next);
      window.dispatchEvent(new Event(HALLOWEEN_LISTINGS_UPDATED_EVENT));
    } catch (cause) {
      console.error('[HalloweenMerchant] Could not save costume listing:', cause);
      setError('This browser could not save the listing. Remove older listings or use a smaller product photo.');
      return;
    }
    setForm({ name: '', category: 'Witch', size: 'M', price: '3200', stock: '10', description: '' });
    setImage(null);
    setNotice('Listing published to the Halloween shop in this browser.');
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
            Browser demo
          </div>
        </div>
      </div>
      <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Merchant Studio preview: listings are saved only in this browser and appear in its Halloween shop. This demo is not connected to shared seller accounts, server storage, or marketplace payouts.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-violet-700">
            <Sparkles size={12} /> New listing
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Costume name
              <input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none" />
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
                <input type="number" min="1" step="1" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none" />
              </label>

              <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Stock
                <input type="number" min="0" step="1" required value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none" />
              </label>
            </div>

            <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Description
              <textarea required maxLength={600} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-2 min-h-[100px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none" />
            </label>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50 px-4 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-violet-700">
              <ImagePlus size={14} /> {image ? 'Replace product image' : 'Upload product image'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageUpload} />
            </label>

            {image && (
              <div className="overflow-hidden rounded-[1.4rem] border border-slate-200">
                <Image src={image} alt="Selected costume preview" width={800} height={400} unoptimized className="h-40 w-full object-cover" />
              </div>
            )}

            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

            <Button type="submit" className="w-full rounded-2xl bg-slate-950 text-white hover:bg-slate-800 font-black uppercase tracking-[0.2em] text-[9px]">
              Publish listing
            </Button>
          </form>
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
                      <Image src={listing.image} alt={listing.name} width={80} height={80} unoptimized className="h-full w-full object-cover" />
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
