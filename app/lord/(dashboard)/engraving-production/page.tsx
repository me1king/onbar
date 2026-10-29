'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Printer, RefreshCw, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const jobStatuses = ['queued', 'engraved', 'quality_checked', 'packed', 'dispatched'] as const;
type JobStatus = typeof jobStatuses[number];

interface ProductionJob {
  id: number;
  orderItemId: number;
  orderId: number;
  quantity: number;
  unitPrice: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  snapshot: {
    productName?: string;
    engravingText?: string;
    font?: string;
    finish?: string;
    giftPackage?: boolean;
    giftMessage?: string | null;
    unitPrice?: number;
  };
  snapshotHash: string;
  status: JobStatus;
  dueDate: string | null;
  approvedAt: string;
  createdAt: string;
  updatedAt: string;
}

function statusLabel(status: JobStatus) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}

export default function EngravingProductionPage() {
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dueAfter, setDueAfter] = useState('');
  const [dueBefore, setDueBefore] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dueAfter) params.set('due_after', dueAfter);
    if (dueBefore) params.set('due_before', dueBefore);
    try {
      const response = await fetch(`/api/admin/engraving-jobs?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json() as { error?: string; jobs?: ProductionJob[] };
      if (!response.ok) throw new Error(result.error || 'Production jobs could not be loaded.');
      setJobs(result.jobs || []);
    } catch (loadFailure) {
      setError(loadFailure instanceof Error ? loadFailure.message : 'Production jobs could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [dueAfter, dueBefore, statusFilter]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const updateJob = async (job: ProductionJob, update: { status?: JobStatus; dueDate?: string | null }) => {
    setSavingId(job.id);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch('/api/admin/engraving-jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, ...update })
      });
      const result = await response.json() as {
        error?: string;
        job?: { id: number; status: JobStatus; due_date: string | null; updated_at: string };
        notification?: { status: string; error?: string };
      };
      if (!response.ok || !result.job) throw new Error(result.error || 'The production job was not updated.');
      setJobs(current => current.map(item => item.id === job.id ? {
        ...item,
        status: result.job!.status,
        dueDate: result.job!.due_date,
        updatedAt: result.job!.updated_at
      } : item));
      if (result.notification?.status === 'failed') {
        setNotice(`Job saved. Customer notification failed: ${result.notification.error || 'Check email configuration and logs.'}`);
      } else if (result.notification?.status === 'sent') {
        setNotice('Job saved and customer notified.');
      } else {
        setNotice('Production job saved.');
      }
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : 'The production job was not updated.');
    } finally {
      setSavingId(null);
    }
  };

  const downloadSvg = async (jobId: number) => {
    setError(null);
    try {
      const response = await fetch(`/api/admin/engraving-jobs/${jobId}/svg`, { cache: 'no-store' });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || 'The SVG file could not be downloaded.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `engraving-job-${jobId}.svg`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadFailure) {
      setError(downloadFailure instanceof Error ? downloadFailure.message : 'The SVG file could not be downloaded.');
    }
  };

  return (
    <main className="min-h-screen space-y-6 p-4 pb-24 text-left sm:p-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Souvenir Forge</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-950 sm:text-4xl">Engraving production</h1>
          <p className="mt-2 text-sm text-slate-600">Approved customer designs, production stages, due dates, and SVG exports.</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button onClick={() => window.print()} variant="outline" className="gap-2"><Printer size={16} /> Print</Button>
          <Button onClick={() => void loadJobs()} variant="outline" className="gap-2"><RefreshCw size={16} /> Refresh</Button>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4 print:hidden">
        <label className="space-y-1 text-xs font-bold text-slate-600">
          Status
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <option value="all">All statuses</option>
            {jobStatuses.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-600">
          Due from
          <Input type="date" value={dueAfter} onChange={event => setDueAfter(event.target.value)} className="h-10" />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-600">
          Due through
          <Input type="date" value={dueBefore} onChange={event => setDueBefore(event.target.value)} className="h-10" />
        </label>
        <Button onClick={() => { setStatusFilter('all'); setDueAfter(''); setDueBefore(''); }} variant="outline" className="self-end">Clear filters</Button>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{notice}</div>}

      {loading ? (
        <div role="status" className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500">
          <Loader2 className="mr-3 animate-spin" size={20} /> Loading production jobs…
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No engraving jobs match these filters.</div>
      ) : (
        <section className="grid gap-5 lg:grid-cols-2">
          {jobs.map(job => {
            const currentIndex = jobStatuses.indexOf(job.status);
            const nextStatus = jobStatuses[currentIndex + 1];
            return (
              <Card key={job.id} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-amber-700">Job #{job.id} · Order #{job.orderId}</p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">{job.snapshot.productName || 'Engraved product'}</h2>
                    <p className="text-sm text-slate-600">{job.customerName} · Qty {job.quantity}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-700">{statusLabel(job.status)}</span>
                </div>

                <div className="rounded-xl bg-slate-950 p-5 text-center text-white">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Customer-approved engraving</p>
                  <p className="mt-2 break-words text-2xl font-bold tracking-widest">{job.snapshot.engravingText}</p>
                  <p className="mt-2 text-xs text-slate-300">{job.snapshot.font} · {job.snapshot.finish?.replaceAll('_', ' ')}</p>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs uppercase text-slate-500">Gift packaging</dt><dd className="font-semibold">{job.snapshot.giftPackage ? 'Yes' : 'No'}</dd></div>
                  <div><dt className="text-xs uppercase text-slate-500">Unit total</dt><dd className="font-semibold">KSh {Number(job.snapshot.unitPrice ?? job.unitPrice).toLocaleString()}</dd></div>
                  {job.snapshot.giftPackage && <div className="col-span-2"><dt className="text-xs uppercase text-slate-500">Gift message</dt><dd className="whitespace-pre-wrap font-medium">{job.snapshot.giftMessage || 'None'}</dd></div>}
                  <div className="col-span-2"><dt className="text-xs uppercase text-slate-500">Approved at</dt><dd className="font-medium">{new Date(job.approvedAt).toLocaleString()}</dd></div>
                </dl>

                <div className="grid gap-3 sm:grid-cols-2 print:hidden">
                  <label className="space-y-1 text-xs font-bold text-slate-600">
                    Due date
                    <Input type="date" value={job.dueDate || ''} onChange={event => setJobs(current => current.map(item => item.id === job.id ? { ...item, dueDate: event.target.value || null } : item))} onBlur={event => {
                      if (event.target.value !== (job.dueDate || '')) void updateJob(job, { dueDate: event.target.value || null });
                    }} className="h-10" />
                  </label>
                  <label className="space-y-1 text-xs font-bold text-slate-600">
                    Advance production
                    <Button disabled={!nextStatus || savingId === job.id} onClick={() => nextStatus && void updateJob(job, { status: nextStatus })} className="h-10 w-full gap-2">
                      {savingId === job.id ? <Loader2 className="animate-spin" size={15} /> : <Wrench size={15} />}
                      {nextStatus ? statusLabel(nextStatus) : 'Production complete'}
                    </Button>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="max-w-full break-all text-[10px] text-slate-400">Snapshot SHA-256: {job.snapshotHash}</p>
                  <Button onClick={() => void downloadSvg(job.id)} variant="outline" className="shrink-0 gap-2 print:hidden"><Download size={15} /> Download SVG</Button>
                </div>
              </Card>
            );
          })}
        </section>
      )}
    </main>
  );
}
