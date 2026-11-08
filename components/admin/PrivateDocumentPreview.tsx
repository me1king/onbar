'use client';

import Image from 'next/image';
import { ExternalLink, X } from 'lucide-react';

interface PrivateDocumentPreviewProps {
  name: string;
  url: string;
  contentType: string;
  onClose: () => void;
}

export default function PrivateDocumentPreview({
  name,
  url,
  contentType,
  onClose
}: PrivateDocumentPreviewProps) {
  const isImage = contentType.startsWith('image/');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Preview ${name}`}>
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-bold text-slate-900">{name}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <ExternalLink size={14} /> Open file
            </a>
            <button type="button" onClick={onClose} aria-label="Close document preview" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
              <X size={17} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-5">
          {isImage ? (
            <div className="relative mx-auto min-h-[50vh] w-full max-w-4xl">
              <Image src={url} alt={name} fill unoptimized sizes="(max-width: 768px) 100vw, 896px" className="object-contain" />
            </div>
          ) : contentType === 'application/pdf' ? (
            <iframe title={name} src={url} className="h-[75vh] w-full rounded-lg bg-white" />
          ) : (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-slate-600">This file type cannot be previewed here.</p>
              <a href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Open file securely</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
