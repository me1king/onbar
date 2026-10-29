'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Clock3, Eye, FilePlus2, MessageSquareText, Save, Trash2 } from 'lucide-react';

type ScenarioStatus = 'draft' | 'testing' | 'live';
type Scenario = {
  id: string;
  scenario_key: string;
  name: string;
  triggers: string[];
  replies: { en?: string; sw?: string; sheng?: string };
  mode: 'exact' | 'guided';
  action: 'none' | 'support';
  conditions: Record<string, unknown>;
  chips: string[];
  status: ScenarioStatus;
  version: number;
  used_count: number;
  updated_at: string;
};
type UnmatchedQuestion = { id: number; message: string; status: string; created_at: string };
type ScenarioVersion = {
  id: number;
  scenario_id: string;
  version: number;
  snapshot: Scenario;
  updated_by: string | null;
  created_at: string;
};
type TrainerData = { scenarios: Scenario[]; unmatched: UnmatchedQuestion[]; versions: ScenarioVersion[] };

const blankScenario = (): Omit<Scenario, 'id' | 'version' | 'used_count' | 'updated_at'> => ({
  scenario_key: '',
  name: '',
  triggers: [],
  replies: { en: '', sw: '', sheng: '' },
  mode: 'exact',
  action: 'none',
  conditions: {},
  chips: [],
  status: 'draft'
});

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function splitLines(value: string) {
  return [...new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
}

export default function ConciergeTrainer() {
  const [data, setData] = useState<TrainerData>({ scenarios: [], unmatched: [], versions: [] });
  const [draft, setDraft] = useState<ReturnType<typeof blankScenario> & { id?: string }> (blankScenario());
  const [preview, setPreview] = useState('');
  const [previewReply, setPreviewReply] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/concierge', { cache: 'no-store' });
      const result = await response.json() as TrainerData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'The concierge library could not be loaded.');
      setData(result);
    } catch (cause) {
      console.error('[ConciergeTrainer] Could not load the trainer:', cause);
      setError(cause instanceof Error ? cause.message : 'The concierge library could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const versionsForDraft = useMemo(
    () => draft.id ? data.versions.filter(version => version.scenario_id === draft.id) : [],
    [data.versions, draft.id]
  );

  function editScenario(scenario: Scenario) {
    setDraft({
      ...scenario,
      triggers: [...scenario.triggers],
      chips: [...scenario.chips],
      replies: { en: scenario.replies.en || '', sw: scenario.replies.sw || '', sheng: scenario.replies.sheng || '' }
    });
    setPreviewReply('');
    setNotice('');
  }

  async function saveScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const scenarioKey = draft.scenario_key.trim() || slugify(draft.name);
    try {
      const response = await fetch('/api/admin/concierge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          scenario_key: scenarioKey,
          triggers: Array.isArray(draft.triggers) ? draft.triggers : splitLines(String(draft.triggers)),
          chips: Array.isArray(draft.chips) ? draft.chips : splitLines(String(draft.chips))
        })
      });
      const result = await response.json() as { error?: string; id?: string };
      if (!response.ok) throw new Error(result.error || 'The scenario could not be saved.');
      await refresh();
      const saved = result.id ? data.scenarios.find(scenario => scenario.id === result.id) : null;
      setDraft(current => ({ ...current, id: result.id, scenario_key: scenarioKey }));
      setNotice(saved ? 'Scenario saved.' : 'Scenario saved. It will only answer customers when its status is Live.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The scenario could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteScenario() {
    if (!draft.id || !window.confirm('Delete this scenario and its saved version history?')) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/concierge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: draft.id })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The scenario could not be deleted.');
      setDraft(blankScenario());
      setNotice('Scenario deleted.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The scenario could not be deleted.');
    } finally {
      setSaving(false);
    }
  }

  async function updateQuestion(id: number, status: 'reviewed' | 'converted') {
    setError('');
    try {
      const response = await fetch('/api/admin/concierge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The unanswered question could not be updated.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The unanswered question could not be updated.');
    }
  }

  function runPreview() {
    if (!preview.trim()) {
      setPreviewReply('Enter a sample customer message to test live trigger matching.');
      return;
    }
    const query = preview.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const match = data.scenarios
      .filter(scenario => scenario.status === 'live')
      .flatMap(scenario => scenario.triggers.map(trigger => ({ scenario, trigger: trigger.toLowerCase() })))
      .filter(item => item.trigger.length >= 3 && query.includes(item.trigger))
      .sort((left, right) => right.trigger.length - left.trigger.length)[0];
    setPreviewReply(match
      ? `${match.scenario.name} · ${match.scenario.mode} · matched “${match.trigger}”\n\n${match.scenario.replies.en || 'No English reply is configured.'}`
      : 'No live scenario matched. The customer will get a safe live-catalog fallback and an optional anonymous unanswered-question log.');
  }

  const fieldClass = 'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600';
  const labelClass = 'block text-xs font-bold text-slate-700';

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Customer experience · support quality</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Concierge Trainer</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Write and review the saved answers customers receive. Draft and testing replies are private; only Live scenarios can match. Matching uses trigger phrases and the live catalog—there is no generative language model connected yet. Use exact scripts for payments, refunds, age and safety.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Scenario library</h2>
              <p className="mt-1 text-xs text-slate-500">{data.scenarios.length} replies · edits keep a version history</p>
            </div>
            <button type="button" onClick={() => { setDraft(blankScenario()); setNotice(''); setPreviewReply(''); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-slate-950 hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">
              <FilePlus2 size={16} /> New
            </button>
          </div>
          {loading ? <p className="animate-pulse py-8 text-sm text-slate-500">Loading saved scenarios…</p> : data.scenarios.length ? (
            <div className="max-h-[28rem] space-y-2 overflow-auto">
              {data.scenarios.map(scenario => (
                <button key={scenario.id} type="button" onClick={() => editScenario(scenario)} className={`w-full rounded-xl border p-3 text-left transition hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${draft.id === scenario.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-slate-900">{scenario.name}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${scenario.status === 'live' ? 'bg-emerald-100 text-emerald-800' : scenario.status === 'testing' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{scenario.status}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>{scenario.triggers.length} triggers</span><span>{scenario.used_count} matches</span><span>v{scenario.version}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : !loading && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No scenarios yet. Run the concierge scenario migration to load starter templates, then edit and publish them here.</p>}
        </section>

        <form onSubmit={saveScenario} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-black text-slate-950">{draft.id ? 'Edit scenario' : 'Create scenario'}</h2><p className="mt-1 text-xs text-slate-500">Write short, factual replies. Customer/order facts are never supplied by a script.</p></div>
            <div className="flex gap-2">
              {draft.id && <button type="button" onClick={() => setShowHistory(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><Clock3 size={15} /> History</button>}
              {draft.id && <button type="button" onClick={() => void deleteScenario()} disabled={saving} aria-label="Delete scenario" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-200 px-3 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} /></button>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Scenario name<input required minLength={2} maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value, scenario_key: draft.id ? draft.scenario_key : slugify(event.target.value) })} className={fieldClass} placeholder="Payment prompt not received" /></label>
            <label className={labelClass}>Key<input required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.scenario_key} onChange={event => setDraft({ ...draft, scenario_key: event.target.value })} className={fieldClass} placeholder="payment-prompt" /></label>
          </div>
          <label className={labelClass}>Trigger examples <span className="font-normal text-slate-500">(one per line; include real customer wording and Swahili/Sheng)</span><textarea required value={draft.triggers.join('\n')} onChange={event => setDraft({ ...draft, triggers: splitLines(event.target.value) })} className={`${fieldClass} min-h-28`} placeholder={'stk not arriving\nmpesa prompt missing\nsijapata prompt'} /></label>

          <div className="grid gap-4 lg:grid-cols-3">
            {(['en', 'sw', 'sheng'] as const).map(language => (
              <label key={language} className={labelClass}>{language === 'en' ? 'English reply' : language === 'sw' ? 'Swahili reply' : 'Sheng reply'}<textarea maxLength={1200} value={draft.replies[language] || ''} onChange={event => setDraft({ ...draft, replies: { ...draft.replies, [language]: event.target.value } })} className={`${fieldClass} min-h-32`} placeholder="Write the concise customer response." /></label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>Reply mode<select value={draft.mode} onChange={event => setDraft({ ...draft, mode: event.target.value as Scenario['mode'] })} className={fieldClass}><option value="exact">Exact · use wording as written</option><option value="guided">Guided · saved wording (LLM not connected)</option></select></label>
            <label className={labelClass}>Action<select value={draft.action} onChange={event => setDraft({ ...draft, action: event.target.value as Scenario['action'] })} className={fieldClass}><option value="none">No handoff</option><option value="support">Offer human support</option></select></label>
            <label className={labelClass}>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as ScenarioStatus })} className={fieldClass}><option value="draft">Draft · private</option><option value="testing">Testing · private</option><option value="live">Live · customer-facing</option></select></label>
          </div>
          <label className={labelClass}>Follow-up chips <span className="font-normal text-slate-500">(one per line, up to 8)</span><textarea value={draft.chips.join('\n')} onChange={event => setDraft({ ...draft, chips: splitLines(event.target.value) })} className={`${fieldClass} min-h-20`} placeholder={'Talk to support\nBrowse current stock'} /></label>
          <label className={labelClass}>Test a customer message<input value={preview} onChange={event => setPreview(event.target.value)} className={fieldClass} placeholder="Example: my M-Pesa prompt is not arriving" /></label>

          {showHistory && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-bold text-slate-900">Saved versions</h3>{versionsForDraft.length ? versionsForDraft.map(version => <details key={version.id} className="mt-2 rounded-lg border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Version {version.version} · {new Date(version.created_at).toLocaleString()} · {version.updated_by || 'Admin'}</summary><pre className="mt-3 whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(version.snapshot, null, 2)}</pre></details>) : <p className="mt-2 text-xs text-slate-500">This scenario has no earlier saved versions.</p>}</div>}

          <div className="flex flex-wrap gap-3">
            <button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"><Save size={16} />{saving ? 'Saving…' : draft.status === 'live' ? 'Save and publish' : 'Save scenario'}</button>
            <button type="button" onClick={runPreview} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"><Eye size={16} /> Test a message</button>
          </div>
          {previewReply && <pre role="status" className="whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-slate-800">{previewReply}</pre>}
          {versionsForDraft.length > 0 && <p className="text-[11px] leading-5 text-slate-500">Edits are kept as a read-only history so you can review prior wording. Publishing remains an admin action.</p>}
        </form>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2"><MessageSquareText size={18} className="text-amber-600" /><h2 className="text-lg font-black text-slate-950">Unanswered questions</h2></div>
        <p className="mt-1 text-xs leading-5 text-slate-500">Only messages customers explicitly opted in to share appear here. Emails and phone numbers are redacted; no account or order identifiers are collected.</p>
        <div className="mt-4 divide-y divide-slate-100">
          {data.unmatched.filter(item => item.status === 'new').length ? data.unmatched.filter(item => item.status === 'new').map(item => (
            <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm text-slate-900">{item.message}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p></div>
              <div className="flex shrink-0 gap-2"><button type="button" onClick={() => void updateQuestion(item.id, 'reviewed')} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">Mark reviewed</button><button type="button" onClick={() => { setDraft({ ...blankScenario(), name: item.message.slice(0, 80), triggers: [item.message] }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-700">Create scenario</button></div>
            </div>
          )) : <p className="py-6 text-sm text-slate-500">No unanswered questions shared yet.</p>}
        </div>
      </section>
      <p className="inline-flex items-start gap-2 text-xs leading-5 text-slate-500"><Activity size={15} className="mt-0.5 shrink-0" />Live answer matching is exact trigger matching only. Guided mode does not override the saved reply, catalog price, stock, refund rules, age requirements, or support handoff.</p>
    </main>
  );
}
