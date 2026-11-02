'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, FileText, Loader2, ShieldCheck, Store, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  compressMerchantDocumentIfNeeded,
  MAX_MERCHANT_DOCUMENT_FILE_SIZE,
  MAX_MERCHANT_DOCUMENT_TOTAL_SIZE
} from '@/lib/merchantDocuments';

interface RequiredDocument {
  type: string;
  label: string;
  requiresExpiry: boolean;
}

interface UploadChecklist {
  businessName: string;
  requirements: RequiredDocument[];
  expiresAt: string;
}

export default function MerchantDocumentsPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [checklist, setChecklist] = useState<UploadChecklist | null>(null);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!token) {
      setError('This document upload link is missing its secure token.');
      setLoading(false);
      return;
    }
    let active = true;
    fetch(`/api/merchant-applications/documents?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    }).then(async response => {
      const result = await response.json() as UploadChecklist & { error?: string };
      if (!response.ok) throw new Error(result.error || 'The document checklist could not be loaded.');
      if (active) {
        setChecklist(result);
        if (!result.requirements.length) setComplete(true);
      }
    }).catch(loadError => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'The document checklist could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  const selectFile = async (type: string, file?: File) => {
    setError('');
    if (!file) {
      setFiles(current => {
        const next = { ...current };
        delete next[type];
        return next;
      });
      return;
    }
    const candidate = await compressMerchantDocumentIfNeeded(file);
    const total = Object.entries({ ...files, [type]: candidate })
      .reduce((sum, [, item]) => sum + item.size, 0);
    if (candidate.size > MAX_MERCHANT_DOCUMENT_FILE_SIZE || total > MAX_MERCHANT_DOCUMENT_TOTAL_SIZE) {
      setError('Each file must be 5 MB or less and the combined upload must stay under 15 MB.');
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(candidate.type)) {
      setError('Choose a PDF, JPG, or PNG document.');
      return;
    }
    setFiles(current => ({ ...current, [type]: candidate }));
  };

  const uploadDocuments = async () => {
    if (!token || !checklist) return;
    if (!Object.keys(files).length) {
      setError('Choose at least one document to upload.');
      return;
    }
    if (checklist.requirements.some(item => item.requiresExpiry && files[item.type]
      && (!expiries[item.type] || expiries[item.type] < new Date().toISOString().slice(0, 10)))) {
      setError('Enter a current expiry date for each alcohol licence you upload.');
      return;
    }
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const payload = new FormData();
      payload.set('token', token);
      for (const [type, file] of Object.entries(files)) {
        payload.set(`document:${type}`, file);
        if (expiries[type]) payload.set(`expiry:${type}`, expiries[type]);
      }
      const response = await fetch('/api/merchant-applications/documents', { method: 'POST', body: payload });
      const result = await response.json() as { success?: boolean; complete?: boolean; remainingCount?: number; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || 'Documents could not be uploaded.');
      if (result.complete) {
        setComplete(true);
        setFiles({});
        return;
      }
      setFiles({});
      setNotice(`Upload received. ${result.remainingCount || 0} required document(s) still need attention.`);
      const checklistResponse = await fetch(`/api/merchant-applications/documents?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
        referrerPolicy: 'no-referrer'
      });
      const nextChecklist = await checklistResponse.json() as UploadChecklist & { error?: string };
      if (!checklistResponse.ok) throw new Error(nextChecklist.error || 'Remaining document requirements could not be refreshed.');
      setChecklist(nextChecklist);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Documents could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-8">
      <meta name="referrer" content="no-referrer" />
      <Card className="w-full max-w-2xl rounded-3xl border-0 p-6 shadow-xl sm:p-10">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Store size={23} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">OnBar Merchant Network</p>
            <h1 className="text-2xl font-black text-slate-900">Complete your documents</h1>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm font-semibold text-slate-500"><Loader2 className="mr-2 animate-spin" />Checking your secure link...</div>
        ) : complete ? (
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-700" />
            <h2 className="mt-3 text-lg font-black text-emerald-950">Documents received</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-900">Your files are attached to {checklist?.businessName || 'your application'} for the OnBar team to review. Your merchant account will not be activated until verification is complete.</p>
          </div>
        ) : (
          <>
            <p className="text-sm leading-6 text-slate-600">
              Upload the remaining compliance documents for <strong className="text-slate-900">{checklist?.businessName}</strong>. This private link expires {checklist?.expiresAt ? new Date(checklist.expiresAt).toLocaleDateString() : 'soon'}.
            </p>
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs leading-5 text-sky-950">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Files are stored privately and only authorized reviewers can open them. PDF, JPG, and PNG are accepted; 5 MB each and 15 MB total per upload.</p>
            </div>
            <div className="mt-5 space-y-3">
              {checklist?.requirements.map(item => (
                <div key={item.type} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="flex cursor-pointer items-center gap-3">
                    <FileText className={files[item.type] ? 'text-emerald-600' : 'text-slate-400'} size={19} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-800">{item.label}{item.requiresExpiry ? ' *' : ''}</span>
                      <span className="block truncate text-xs text-slate-500">{files[item.type]?.name || 'Choose a PDF, JPG, or PNG'}</span>
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="sr-only"
                      onChange={event => selectFile(item.type, event.target.files?.[0])}
                    />
                    <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Choose file</span>
                  </label>
                  {item.requiresExpiry && files[item.type] && (
                    <label className="mt-3 block text-xs font-semibold text-slate-600">
                      Licence expiry date *
                      <Input type="date" min={new Date().toISOString().slice(0, 10)} value={expiries[item.type] || ''} onChange={event => setExpiries(current => ({ ...current, [item.type]: event.target.value }))} className="mt-1 h-10 rounded-lg" />
                    </label>
                  )}
                </div>
              ))}
            </div>
            {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
            <Button type="button" onClick={() => void uploadDocuments()} disabled={uploading || !Object.keys(files).length} className="mt-5 h-12 w-full rounded-xl font-black uppercase">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {uploading ? 'Uploading securely...' : 'Upload selected documents'}
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}
