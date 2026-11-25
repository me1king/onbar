'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SpinBottlePrompt } from '@/lib/spinBottlePrompts';

const PAGE_SIZE = 12;

function hasDeckCoverage(prompts: SpinBottlePrompt[]) {
  return [1, 2, 3, 4].every(level =>
    prompts.some(prompt => prompt.l === level && prompt.k === 'truth')
    && prompts.some(prompt => prompt.l === level && prompt.k === 'dare')
  );
}

function promptIsValid(prompt: SpinBottlePrompt) {
  return prompt.q.trim().length > 0
    && prompt.q.trim().length <= 300
    && Number.isInteger(prompt.s)
    && prompt.s >= 0
    && prompt.s <= 180;
}

export default function SpinBottlePromptManager() {
  const [prompts, setPrompts] = React.useState<SpinBottlePrompt[]>([]);
  const [savedPrompts, setSavedPrompts] = React.useState<SpinBottlePrompt[]>([]);
  const [filterKind, setFilterKind] = React.useState<'all' | 'truth' | 'dare'>('dare');
  const [filterLevel, setFilterLevel] = React.useState<'all' | '1' | '2' | '3' | '4'>('all');
  const [filterTimer, setFilterTimer] = React.useState<'all' | 'timed' | 'untimed'>('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPrompts = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/spin-the-bottle-prompts', { cache: 'no-store' });
      const result = await response.json() as { prompts?: SpinBottlePrompt[]; error?: string };
      if (!response.ok || !Array.isArray(result.prompts)) {
        throw new Error(result.error || 'Game prompts could not be loaded.');
      }
      setPrompts(result.prompts);
      setSavedPrompts(result.prompts);
      setMessage(null);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Game prompts could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void loadPrompts(); }, [loadPrompts]);

  const updatePrompt = (id: string, patch: Partial<SpinBottlePrompt>) => {
    setPrompts(current => current.map(prompt => prompt.id === id ? { ...prompt, ...patch } : prompt));
  };

  const addPrompt = (kind: 'truth' | 'dare') => {
    const prompt: SpinBottlePrompt = {
      id: `custom-${crypto.randomUUID()}`,
      k: kind,
      l: 1,
      q: '',
      s: 0
    };
    setPrompts(current => [...current, prompt]);
    setFilterKind(kind);
    setFilterLevel('all');
    setSearch('');
    setPage(Math.floor(prompts.filter(item => item.k === kind).length / PAGE_SIZE));
  };

  const query = search.trim().toLowerCase();
  const filtered = prompts.filter(prompt =>
    (filterKind === 'all' || prompt.k === filterKind)
    && (filterLevel === 'all' || prompt.l === Number(filterLevel))
    && (filterTimer === 'all' || (filterTimer === 'timed' ? prompt.s > 0 : prompt.s === 0))
    && (!query || prompt.q.toLowerCase().includes(query))
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visiblePrompts = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const dirty = JSON.stringify(prompts) !== JSON.stringify(savedPrompts);
  const deckValid = prompts.length >= 8
    && prompts.length <= 300
    && prompts.every(prompt => promptIsValid(prompt)
      && /^[a-z0-9_-]{1,80}$/i.test(prompt.id)
      && (prompt.k !== 'truth' || prompt.s === 0))
    && hasDeckCoverage(prompts);

  const savePrompts = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/spin-the-bottle-prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts })
      });
      const result = await response.json() as { prompts?: SpinBottlePrompt[]; error?: string };
      if (!response.ok || !Array.isArray(result.prompts)) {
        throw new Error(result.error || 'Prompt changes could not be saved.');
      }
      setPrompts(result.prompts);
      setSavedPrompts(result.prompts);
      setMessage({ type: 'success', text: 'Prompt deck saved. New games will use these prompts.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Prompt changes could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-slate-500">Loading the prompt deck…</p></div>;
  }

  return (
    <main className="min-h-screen space-y-6 bg-slate-50 p-4 pb-32 text-left sm:p-8">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <Link href="/lord/spin-campaign" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950">
            <ArrowLeft size={16} /> Back to Spin Campaign
          </Link>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Game night controls</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Truth &amp; dare prompt deck</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Edit, remove, or add prompts at any difficulty. Changes are published to newly started local and online games when you save.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => void loadPrompts()} variant="outline" className="h-10 rounded-lg">Refresh</Button>
          <Button type="button" onClick={() => void savePrompts()} disabled={!dirty || saving || !deckValid} className="h-10 rounded-lg">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving…' : 'Save and publish'}
          </Button>
        </div>
      </header>

      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {message.type === 'success' && <CheckCircle2 className="mr-2 inline h-4 w-4" />}{message.text}
        </div>
      )}

      <Card className="space-y-4 rounded-2xl border-slate-200 p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Prompt library <span className="text-sm font-semibold text-slate-500">({prompts.length})</span></h2>
            <p className="mt-1 text-sm text-slate-500">{prompts.filter(prompt => prompt.k === 'dare').length} dares · {prompts.filter(prompt => prompt.k === 'truth').length} truths</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => addPrompt('dare')} className="h-10 rounded-lg"><Plus className="mr-1 h-4 w-4" />Add dare</Button>
            <Button type="button" variant="outline" onClick={() => addPrompt('truth')} className="h-10 rounded-lg"><Plus className="mr-1 h-4 w-4" />Add truth</Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_150px_150px]">
          <label className="relative block">
            <span className="sr-only">Search prompts</span>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search truths and dares" className="h-10 rounded-lg pl-9" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Type
            <select value={filterKind} onChange={event => { setFilterKind(event.target.value as typeof filterKind); setPage(0); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="dare">Dares</option><option value="truth">Truths</option><option value="all">All prompts</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Difficulty
            <select value={filterLevel} onChange={event => { setFilterLevel(event.target.value as typeof filterLevel); setPage(0); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="all">All levels</option><option value="1">1 · Chill</option><option value="2">2 · Spicy</option><option value="3">3 · Wild</option><option value="4">4 · Naughty (adults)</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Timer
            <select value={filterTimer} onChange={event => { setFilterTimer(event.target.value as typeof filterTimer); setPage(0); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="all">Any timer</option><option value="timed">Timed dares</option><option value="untimed">No timer</option>
            </select>
          </label>
        </div>

        <p className="text-xs text-slate-500" aria-live="polite">
          Showing {filtered.length ? currentPage * PAGE_SIZE + 1 : 0}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} matching prompts.
        </p>

        <div className="space-y-3">
          {visiblePrompts.map(prompt => (
            <article key={prompt.id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_145px_145px_120px_42px] sm:items-end">
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {prompt.id.startsWith('base-') ? 'Built-in prompt' : 'Custom prompt'}
                <Textarea
                  aria-label={`Prompt text (${prompt.k}, level ${prompt.l})`}
                  value={prompt.q}
                  maxLength={300}
                  rows={2}
                  onChange={event => updatePrompt(prompt.id, { q: event.target.value })}
                  className="min-h-16 rounded-lg text-sm normal-case"
                />
              </label>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Type
                <select value={prompt.k} onChange={event => {
                  const kind = event.target.value as SpinBottlePrompt['k'];
                  updatePrompt(prompt.id, { k: kind, s: kind === 'truth' ? 0 : prompt.s });
                }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm normal-case">
                  <option value="dare">Dare</option><option value="truth">Truth</option>
                </select>
              </label>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Level
                <select value={prompt.l} onChange={event => updatePrompt(prompt.id, { l: Number(event.target.value) as SpinBottlePrompt['l'] })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm normal-case">
                  <option value={1}>1 · Chill</option><option value={2}>2 · Spicy</option><option value={3}>3 · Wild</option><option value={4}>4 · Naughty</option>
                </select>
              </label>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {prompt.k === 'dare' ? 'Timer seconds' : 'No timer'}
                <Input type="number" min={0} max={180} step={1} value={prompt.k === 'dare' ? prompt.s : 0} disabled={prompt.k === 'truth'} onChange={event => updatePrompt(prompt.id, { s: Number(event.target.value) })} className="h-10 rounded-lg text-sm" />
              </label>
              <button type="button" onClick={() => setPrompts(current => current.filter(item => item.id !== prompt.id))} aria-label={`Remove prompt: ${prompt.q.slice(0, 60)}`} title="Remove prompt" className="flex h-10 items-center justify-center rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50">
                <Trash2 size={16} />
              </button>
            </article>
          ))}
          {!visiblePrompts.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No prompts match those filters.</p>}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={currentPage === 0} className="h-9 rounded-lg">Previous</Button>
            <span className="text-xs text-slate-500">Page {currentPage + 1} of {pageCount}</span>
            <Button type="button" variant="outline" onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))} disabled={currentPage >= pageCount - 1} className="h-9 rounded-lg">Next</Button>
          </div>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          Dares must be optional, safe, and comfortable for the group. Players can always pass; provide alcohol-free alternatives. Keep at least one truth and one dare at each level. {dirty ? 'Unsaved edits are not live yet.' : 'The saved deck is used when a game starts.'}
          {!deckValid && <span className="mt-1 block font-bold">Resolve empty prompts, invalid timers, or missing truth/dare coverage before saving.</span>}
        </div>
      </Card>
    </main>
  );
}
