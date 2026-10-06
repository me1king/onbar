'use client';

import { useEffect, useState } from 'react';
import {
  Mail,
  Trash2,
  Calendar,
  RefreshCcw,
  Search,
  ArrowLeft,
  Download,
  UserCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';
import Link from 'next/link';

interface Subscriber {
  id: number;
  email: string;
  created_at: string;
  is_active: boolean;
  consented_at: string | null;
  unsubscribed_at: string | null;
}

export default function AdminSubscribersPage() {
  const { email: adminEmail } = useAdmin();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchSubscribers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/newsletter-subscribers', { cache: 'no-store' });
      const result = await response.json() as { subscribers?: Subscriber[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not load newsletter contacts.');
      setSubscribers(result.subscribers || []);
    } catch (err) {
      console.error('[NewsletterSubscribers] Load failed:', err);
      setError(err instanceof Error ? err.message : 'Could not load newsletter contacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscribers();
  }, []);

  const unsubscribeSubscriber = async (id: number, email: string) => {
      if (!confirm(`Unsubscribe ${email} from marketing emails?`)) return;
      try {
          const response = await fetch(`/api/admin/newsletter-subscribers?id=${id}`, { method: 'DELETE' });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || 'Could not unsubscribe this contact.');
          setSubscribers(current => current.map(sub => sub.id === id
              ? { ...sub, is_active: false, unsubscribed_at: new Date().toISOString() }
              : sub));
          await logAuditAction(adminEmail, 'UNSUBSCRIBE_NEWSLETTER', { id, email });
      } catch (err) {
          console.error('[NewsletterSubscribers] Unsubscribe failed:', err);
          setError(err instanceof Error ? err.message : 'Could not unsubscribe this contact.');
      }
  };

  const filteredSubscribers = subscribers.filter(s =>
      (s.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const exportToCSV = () => {
      const headers = ["Email", "Joined At", "Status", "Consent Recorded"];
      const rows = filteredSubscribers.map(s => [
          s.email,
          new Date(s.created_at).toLocaleString(),
          s.is_active ? 'Subscribed' : 'Unsubscribed',
          s.consented_at ? new Date(s.consented_at).toLocaleString() : ''
      ]);
      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `OB_Subscribers_${new Date().toLocaleDateString()}.csv`);
      link.click();
  };

  return (
    <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
        <div className="space-y-4">
          <Link href="/admin/broadcast" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Broadcast
          </Link>
          <div>
            <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Subscriber Base</h1>
            <p className="text-slate-500 text-sm font-medium mt-2">Manage your community of premium beverage enthusiasts.</p>
          </div>
        </div>
        <div className="flex gap-2">
            <Button onClick={exportToCSV} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">
                <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
            <Button onClick={fetchSubscribers} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest transition-all hover:bg-slate-50">
                <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
            </Button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Find a subscriber by email..."
                className="h-14 rounded-2xl border-slate-100 bg-white pl-12 text-sm font-medium shadow-sm"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
          </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}

      {loading ? (
          <div className="p-32 text-center flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Accessing Audience Data...</p>
          </div>
      ) : filteredSubscribers.length === 0 ? (
          <div className="p-32 text-center flex flex-col items-center gap-6 bg-white rounded-[3rem] border border-slate-100 shadow-sm">
              <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-100"><Mail className="h-10 w-10" /></div>
              <p className="text-lg font-black text-slate-300 uppercase tracking-tight italic">No subscribers detected yet.</p>
          </div>
      ) : (
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                  <thead>
                      <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[9px] tracking-[0.2em] whitespace-nowrap">
                          <th className="px-8 py-6">Identity</th>
                          <th className="px-8 py-6">Joined Date</th>
                          <th className="px-8 py-6">Status</th>
                          <th className="px-8 py-6 text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {filteredSubscribers.map(sub => (
                          <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-8 py-6">
                                  <div className="flex items-center gap-4">
                                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black uppercase text-xs shadow-inner shrink-0">
                                          {sub.email.substring(0, 2).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                          <p className="font-black text-foreground uppercase text-xs tracking-tight truncate whitespace-nowrap">{sub.email}</p>
                                          <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 tracking-widest">
                                              {sub.consented_at ? 'Consent recorded' : 'Legacy subscription'}
                                          </p>
                                      </div>
                                  </div>
                              </td>
                              <td className="px-8 py-6">
                                  <div className="flex items-center gap-2 text-slate-500 font-medium text-xs">
                                      <Calendar className="h-3.5 w-3.5 text-slate-300" />
                                      {new Date(sub.created_at).toLocaleDateString()}
                                  </div>
                              </td>
                              <td className="px-8 py-6">
                                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase border ${sub.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                  {sub.is_active ? <><UserCheck className="h-2.5 w-2.5" /> Subscribed</> : 'Unsubscribed'}
                                  </span>
                              </td>
                              <td className="px-8 py-6 text-right">
                                  <Button
                                    onClick={() => void unsubscribeSubscriber(sub.id, sub.email)}
                                    disabled={!sub.is_active}
                                    aria-label={`Unsubscribe ${sub.email}`}
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-xl text-slate-200 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30"
                                  >
                                      <Trash2 className="h-4 w-4" />
                                  </Button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}
    </div>
  );
}
