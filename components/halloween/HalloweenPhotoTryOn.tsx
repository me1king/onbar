'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ImagePlus, Sparkles, Wand2 } from 'lucide-react';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';

export function HalloweenPhotoTryOn({ productName, onClose }: { productName: string; onClose?: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP photo.');
      event.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Choose a photo smaller than 8 MB.');
      event.target.value = '';
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setActive(false);
  };

  const overlayStyle = useMemo(
    () => ({
      background: 'linear-gradient(135deg, rgba(168,85,247,0.66), rgba(244,114,182,0.38), rgba(15,23,42,0.35))'
    }),
    []
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[2rem] border border-violet-200 bg-slate-950 p-5 text-white shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-violet-300">Photo style preview</p>
            <h3 className="mt-2 text-xl font-black uppercase tracking-tighter">Photo preview</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.22em] text-violet-200">
              Preview demo
            </span>
            {onClose && (
              <button onClick={onClose} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white hover:bg-white/10">
                Close
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-gradient-to-br from-violet-900 via-slate-900 to-slate-950">
          {preview ? (
            <div className="relative aspect-[4/5] overflow-hidden">
              <Image src={preview} alt="Uploaded photo preview" width={800} height={1000} unoptimized className="h-full w-full object-cover" />
              {active && (
                <div style={overlayStyle} className="absolute inset-0 flex items-end justify-center p-5">
                  <div className="w-full rounded-[1.2rem] border border-white/20 bg-slate-950/20 px-4 py-3 text-center backdrop-blur-sm">
                    <p className="text-[8px] font-black uppercase tracking-[0.28em] text-violet-100">Preview</p>
                    <p className="mt-1 text-lg font-black uppercase tracking-tighter text-white">{productName}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 bg-slate-900/60 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-200">
                <ImagePlus size={22} />
              </div>
              <p className="text-base font-black uppercase tracking-tighter text-white">Upload your selfie</p>
              <p className="text-sm text-slate-300">Upload a photo for a color-style preview. No photo is sent to a try-on service.</p>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[9px] font-black uppercase tracking-[0.24em] text-white hover:bg-white/10">
            <ImagePlus size={14} />
            Upload photo
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} className="hidden" />
          </label>

          {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
          <Button
            className="rounded-2xl bg-violet-500 hover:bg-violet-400 text-white font-black uppercase tracking-[0.22em] text-[9px]"
            onClick={() => setActive((current) => !current)}
            disabled={!preview}
          >
            <Wand2 size={14} className="mr-2" /> {active ? 'Remove style overlay' : 'Apply style overlay'}
          </Button>
        </div>

        <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-3 text-sm text-violet-100/80">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-violet-200">
            <Sparkles size={12} /> Fit guidance
          </div>
          <p className="mt-2">This demo applies a visual overlay only; it does not generate a garment fit or AI try-on result. Keep shoulders visible and stand straight for the 3D preview.</p>
        </div>
      </div>
    </div>
  );
}
