'use client';

import { useEffect, useState } from 'react';
import {
  History,
  Search,
  RefreshCcw,
  ShieldCheck,
  Activity,
  Package,
  Shield,
  Trash,
  PlusCircle,
  Truck,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPrice, cn } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';

interface AuditLog {
  id: string;
  staff_email: string;
  actor_type?: string | null;
  actor_label?: string | null;
  actor_role?: string | null;
  action: string;
  outcome?: string | null;
  details: Record<string, unknown> | null;
  resource_type?: string | null;
  resource_id?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  event_hash?: string | null;
  ip_address?: string;
  device_info?: string;
  created_at: string;
}

function elapsedSincePreviousEvent(current: AuditLog, previous?: AuditLog) {
  if (
    !previous
    || current.resource_type !== 'order'
    || current.resource_id !== previous.resource_id
  ) return null;

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.parse(current.created_at) - Date.parse(previous.created_at)) / 1000)
  );
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

interface LogDetails {
  name?: string;
  title?: string;
  platform?: string;
  stock?: number;
  price?: number;
  initial_stock?: number;
  id?: number | string;
  newStatus?: string;
  count?: number;
  rider?: string;
  current_location?: string;
  email?: string;
  role?: string;
  field?: string;
  value?: unknown;
}

function DetailRenderer({ log }: { log: AuditLog }) {
    const d = log.details as LogDetails;
    if (!d) return null;

    switch (log.action) {
        case 'UPDATE_PRODUCT':
            return (
                <div className="flex flex-col gap-1">
                    <p className="text-xs font-black text-foreground uppercase">Restocked: {d.name}</p>
                    <div className="flex gap-4">
                        <span className="text-[10px] font-bold text-primary uppercase">Stock: {d.stock} Units</span>
                        <span className="text-[10px] font-bold text-primary uppercase">Price: {formatPrice(d.price)}</span>
                    </div>
                </div>
            );
        case 'CREATE_PRODUCT':
            return (
                <div className="flex flex-col gap-1">
                    <p className="text-xs font-black text-primary uppercase">New Inventory: {d.name}</p>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Initial: {d.initial_stock} Bottles @ {formatPrice(d.price)}</span>
                </div>
            );
        case 'DELETE_PRODUCT':
            return (
                <div className="flex items-center gap-2 text-rose-500">
                    <Trash className="h-3 w-3" />
                    <p className="text-xs font-black uppercase">Product Node Expelled: ID #{d.id}</p>
                </div>
            );
        case 'CREATE_BLOG':
            return (
                <div className="flex flex-col gap-1">
                    <p className="text-xs font-black text-foreground uppercase">Manuscript Authorized: {d.title}</p>
                    <span className="text-[10px] font-bold text-primary uppercase">Library ID: #{d.id}</span>
                </div>
            );
        case 'UPDATE_BLOG':
            return (
                <div className="flex flex-col gap-1">
                    <p className="text-xs font-black text-foreground uppercase">Manuscript Refined: {d.title}</p>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Version Synced</span>
                </div>
            );
        case 'DELETE_BLOG':
            return (
                <div className="flex items-center gap-2 text-rose-500">
                    <Trash className="h-3 w-3" />
                    <p className="text-xs font-black uppercase">Manuscript Expunged: ID #{d.id}</p>
                </div>
            );
        case 'UPDATE_PROFILE':
            return (
                <div className="flex flex-col gap-1">
                    <p className="text-xs font-black text-foreground uppercase">Identity Updated: {d.name}</p>
                    <span className="text-[10px] font-bold text-primary uppercase">Security Sync Complete</span>
                </div>
            );
        case 'SOCIAL_ACCOUNT_CONNECTED':
            return (
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    <p className="text-xs font-bold text-foreground uppercase">Channel Linked: <span className="text-primary font-black">{d.platform}</span></p>
                </div>
            );
        case 'SOCIAL_ACCOUNT_DISCONNECTED':
            return (
                <div className="flex items-center gap-2 text-rose-500">
                    <XCircle className="h-3 w-3" />
                    <p className="text-xs font-black uppercase">Channel Severed: {d.platform}</p>
                </div>
            );
        case 'UPDATE_ORDER_STATUS':
            return (
                <div className="flex items-center gap-2">
                    <Package className="h-3 w-3 text-slate-400" />
                    <p className="text-xs font-bold text-foreground uppercase">Order #{d.id} set to <span className="text-primary font-black">{d.newStatus}</span></p>
                </div>
            );
        case 'BULK_UPDATE_ORDERS':
            return (
                <div className="flex items-center gap-2">
                    <History className="h-3 w-3 text-primary" />
                    <p className="text-xs font-bold text-foreground uppercase">Bulk Updated <span className="text-primary font-black">{d.count} Orders</span> to {d.newStatus}</p>
                </div>
            );
        case 'ASSIGN_RIDER':
            return (
                <div className="flex items-center gap-2">
                    <Activity className="h-3 w-3 text-primary" />
                    <p className="text-xs font-bold text-foreground uppercase">Rider <span className="text-foreground font-black">{d.rider}</span> assigned to #{d.id}</p>
                </div>
            );
        case 'UPDATE_RIDER_STATUS':
            return (
                <div className="flex items-center gap-2">
                    <Truck className="h-3 w-3 text-primary" />
                    <p className="text-xs font-bold text-foreground uppercase">Rider <span className="text-foreground font-black">{d.rider}</span> moved to <span className="text-primary font-black">{d.current_location}</span></p>
                </div>
            );
        case 'ADD_STAFF':
            return (
                <div className="flex items-center gap-2">
                    <PlusCircle className="h-3 w-3 text-primary" />
                    <p className="text-xs font-bold text-foreground uppercase">Authorized <span className="text-foreground font-black">{d.email}</span> as {d.role}</p>
                </div>
            );
        case 'UPDATE_PERMISSION':
            return (
                <div className="flex items-center gap-2">
                    <Shield className="h-3 w-3 text-amber-500" />
                    <p className="text-xs font-bold text-foreground uppercase">Toggle <span className="text-amber-600 font-black">{d.field}</span> to {String(d.value)}</p>
                </div>
            );
        case 'REMOVE_STAFF':
            return (
                <div className="flex items-center gap-2 text-rose-600">
                    <Trash className="h-3 w-3" />
                    <p className="text-xs font-black uppercase tracking-tighter italic">Revoked access for {d.email}</p>
                </div>
            );
        default:
            return (
                <p className="text-[10px] font-medium text-slate-400 font-mono truncate">
                    {typeof d === 'object' ? JSON.stringify(d) : String(d)}
                </p>
            );
    }
}

export default function AdminAuditPage() {
  const { role, permissions } = useAdmin();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async (query = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      const suffix = params.size ? `?${params.toString()}` : '';
      const response = await fetch(`/api/admin/audit-logs${suffix}`, { cache: 'no-store' });
      const result = await response.json() as { logs?: AuditLog[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Audit logs could not be loaded.');
      setLogs(result.logs || []);
    } catch (err: unknown) {
      const error = err as { message?: string, stack?: string };
      console.error("[OB_OS] Audit Fetch Failure:", error);

      const isFetchError = error.message?.toLowerCase().includes('failed to fetch') || !error.message;
      const alertMsg = isFetchError
        ? "Cannot connect to Supabase. Verify the project URL and Supabase publishable/anon key in your environment settings."
        : error.message;

      alert(alertMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const runNuclearPing = async () => {
      try {
          const response = await fetch('/api/admin/audit-logs', { method: 'POST' });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || 'Audit log health check failed.');
          alert("Grid Uplink: HEALTHY. Audit node is online.");
      } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error.';
          alert(`Grid Uplink: FAILED.\nMessage: ${message}`);
      }
  };

  const verifyAuditChain = async () => {
      try {
          const response = await fetch('/api/admin/audit-logs?verify=true', { cache: 'no-store' });
          const result = await response.json() as {
            integrity?: { valid?: boolean; checked_events?: number; broken_event_id?: string | null };
            error?: string;
          };
          if (!response.ok) throw new Error(result.error || 'Audit integrity check failed.');
          if (!result.integrity) throw new Error('The integrity check returned no result.');
          if (result.integrity.valid) {
            alert(`Audit chain verified: ${result.integrity.checked_events ?? 0} events checked.`);
          } else {
            alert(`Audit chain integrity failure after ${result.integrity.checked_events ?? 0} events. First broken event: ${result.integrity.broken_event_id || 'unknown'}.`);
          }
      } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error.';
          alert(`Audit integrity check failed.\nMessage: ${message}`);
      }
  };

  const filteredLogs = logs.filter(l =>
    (l.staff_email || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
    (l.action || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
    (l.resource_id || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );
  const orderTimeline = filteredLogs.length > 0
    && filteredLogs.every(log =>
      log.resource_type === 'order'
      && log.resource_id === filteredLogs[0].resource_id
    );

  if (role !== 'owner' && !permissions.can_view_audit_logs) {
      return (
          <div className="p-24 flex flex-col items-center justify-center text-center">
              <Shield className="h-16 w-16 text-rose-500 mb-6" />
              <h2 className="text-2xl font-black uppercase text-foreground">Access Denied</h2>
              <p className="text-slate-500 mt-2">Only the Master Admin can review system audit logs.</p>
          </div>
      );
  }

  return (
    <div className="p-8 space-y-8 bg-slate-50 min-h-screen text-left selection:bg-primary/20">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary italic">Protocol Integrity Monitor</span>
          </div>
          <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter">Security <span className="text-primary">Audit.</span></h1>
          <p className="text-slate-500 text-sm font-medium mt-1 italic">&quot;Review administrative maneuvers and maintain the bar&apos;s digital sovereignty.&quot;</p>
        </div>
        <div className="flex gap-2">
            <Button onClick={runNuclearPing} variant="outline" className="rounded-xl h-12 px-6 border-primary/20 bg-primary/5 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm">
                Test Uplink
            </Button>
            <Button onClick={verifyAuditChain} variant="outline" className="rounded-xl h-12 px-6 border-emerald-200 bg-emerald-50 text-emerald-700 font-black uppercase text-[10px] tracking-widest">
                <ShieldCheck className="h-4 w-4 mr-2" /> Verify Chain
            </Button>
            <Button onClick={() => fetchLogs(searchQuery)} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest">
                <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Sync Node
            </Button>
        </div>
      </header>

      <div className="relative">
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') fetchLogs(searchQuery);
            }}
            placeholder="Investigate by order ID, staff email, or action..."
            className="h-14 rounded-2xl border-slate-100 bg-white pl-12 text-sm font-medium shadow-sm"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
          <Button
            onClick={() => fetchLogs(searchQuery)}
            disabled={loading}
            className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-xl px-5 text-[10px] font-black uppercase tracking-widest"
          >
            Investigate
          </Button>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <Activity className="h-6 w-6 text-primary" />
                  <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter">Activity Stream</h2>
              </div>
              <span className="text-[10px] font-black uppercase text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">{filteredLogs.length} Events</span>
          </div>

          {loading ? (
              <div className="p-32 text-center flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Retrieving Logs...</p>
              </div>
          ) : filteredLogs.length === 0 ? (
              <div className="p-32 text-center flex flex-col items-center gap-6">
                  <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-100"><ShieldCheck className="h-10 w-10" /></div>
                  <div className="space-y-2">
                      <p className="text-lg font-black text-slate-300 uppercase tracking-tight italic">
                        {searchQuery ? 'No matching activity found.' : 'No activity recorded yet.'}
                      </p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                        {searchQuery ? 'Try a different order ID, staff email, or action.' : 'If you have performed actions, check your Uplink Status.'}
                      </p>
                  </div>
              </div>
          ) : (
              <>
              <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[980px] text-left">
                      <thead>
                          <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[9px] tracking-[0.2em]">
                              <th className="whitespace-nowrap px-6 py-6">Admin</th>
                              <th className="whitespace-nowrap px-6 py-6">Action</th>
                              <th className="px-6 py-6">Details</th>
                              <th className="whitespace-nowrap px-6 py-6 text-right">Time</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                          {filteredLogs.map((log, index) => {
                            const elapsed = orderTimeline
                              ? elapsedSincePreviousEvent(log, filteredLogs[index + 1])
                              : null;
                            return (
                              <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                                  <td className="whitespace-nowrap px-6 py-8">
                                      <div className="flex items-center gap-4">
                                          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white font-black text-[10px] shadow-lg shadow-primary/20 transition-transform group-hover:scale-110">
                                              {(log?.actor_label?.substring(0, 2) || log?.staff_email?.substring(0, 2) || 'AD').toUpperCase()}
                                          </div>
                                          <div>
                                              <span className="font-black text-foreground uppercase text-[11px] block whitespace-nowrap">{log.actor_label || log.staff_email || log.actor_type || 'System'}</span>
                                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 block whitespace-nowrap">
                                                  {log.actor_type || 'staff'} · {log.ip_address || '0.0.0.0'} &bull; {log.device_info || 'Unknown'}
                                              </span>
                                          </div>
                                      </div>
                                  </td>
                                  <td className="whitespace-nowrap px-6 py-8">
                                      <span className="text-[10px] font-black text-primary uppercase bg-primary/5 px-4 py-2 rounded-xl border border-primary/10 whitespace-nowrap shadow-sm">
                                          {(log?.action || 'ACTIVITY').replace(/_/g, ' ')}
                                      </span>
                                      <span className="mt-2 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                          {log.actor_role || 'staff'} · {log.outcome || 'SUCCESS'}
                                      </span>
                                  </td>
                                  <td className="px-6 py-8 min-w-[300px]">
                                      <div className="max-w-md break-words">
                                          <DetailRenderer log={log} />
                                          {log.resource_id && (
                                            <p className="mt-2 text-[10px] font-bold uppercase text-slate-500">
                                              {log.resource_type || 'Resource'} #{log.resource_id}
                                            </p>
                                          )}
                                          {(log.old_value !== null && log.old_value !== undefined
                                            || log.new_value !== null && log.new_value !== undefined) && (
                                            <p className="mt-1 break-words text-[10px] text-slate-500">
                                              Before: {JSON.stringify(log.old_value)} → After: {JSON.stringify(log.new_value)}
                                            </p>
                                          )}
                                          <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-emerald-600">
                                            {log.event_hash ? `Hash chained · ${log.event_hash.slice(0, 12)}` : 'Legacy event · no hash'}
                                          </p>
                                      </div>
                                  </td>
                                  <td className="whitespace-nowrap px-6 py-8 text-right">
                                      <p className="text-xs font-black text-foreground uppercase tracking-tighter">{log?.created_at ? new Date(log.created_at).toLocaleTimeString() : 'N/A'}</p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase">{log?.created_at ? new Date(log.created_at).toLocaleDateString() : 'N/A'}</p>
                                      {elapsed && <p className="mt-1 text-[9px] font-bold text-amber-600">Elapsed: {elapsed}</p>}
                                  </td>
                              </tr>
                            );
                          })}
                      </tbody>
                  </table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                  {filteredLogs.map((log, index) => {
                    const elapsed = orderTimeline
                      ? elapsedSincePreviousEvent(log, filteredLogs[index + 1])
                      : null;
                    return (
                      <article key={log.id} className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-[10px] font-black text-white">
                                      {(log.actor_label?.substring(0, 2) || log.staff_email?.substring(0, 2) || 'AD').toUpperCase()}
                                  </div>
                                  <p className="min-w-0 break-words text-xs font-black text-foreground">{log.actor_label || log.staff_email || log.actor_type || 'System'}</p>
                              </div>
                              <time className="shrink-0 text-right text-[10px] font-bold leading-relaxed text-slate-400">
                                  {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                              </time>
                          </div>
                          <p className="mt-3 inline-flex max-w-full rounded-lg border border-primary/10 bg-primary/5 px-3 py-1.5 text-[10px] font-black uppercase text-primary">
                              {(log.action || 'ACTIVITY').replace(/_/g, ' ')}
                          </p>
                          <p className="mt-1 text-[9px] font-bold uppercase text-slate-400">
                              {log.actor_type || log.actor_role || 'staff'} · {log.outcome || 'SUCCESS'}
                              {log.resource_id ? ` · ${log.resource_type || 'resource'} #${log.resource_id}` : ''}
                          </p>
                          {elapsed && <p className="mt-2 text-[10px] font-bold text-amber-600">Elapsed since previous event: {elapsed}</p>}
                          <div className="mt-3 min-w-0 break-words">
                              <DetailRenderer log={log} />
                              {(log.old_value !== null && log.old_value !== undefined
                                || log.new_value !== null && log.new_value !== undefined) && (
                                <p className="mt-2 break-words text-[10px] text-slate-500">
                                  Before: {JSON.stringify(log.old_value)} → After: {JSON.stringify(log.new_value)}
                                </p>
                              )}
                          </div>
                          <p className="mt-2 font-mono text-[8px] uppercase tracking-wider text-emerald-600">
                            {log.event_hash ? `Hash chained · ${log.event_hash.slice(0, 12)}` : 'Legacy event · no hash'}
                          </p>
                          <p className="mt-3 break-words text-[9px] font-medium text-slate-400">
                              {log.ip_address || '0.0.0.0'} · {log.device_info || 'Unknown'}
                          </p>
                      </article>
                    );
                  })}
              </div>
              </>
          )}
      </div>
    </div>
  );
}
