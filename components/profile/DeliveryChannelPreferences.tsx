'use client';

import { useEffect, useState } from 'react';
import { Mail, MessageCircle, MessageSquareText, Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'sms', label: 'SMS', icon: MessageSquareText },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }
] as const;
type Channel = typeof CHANNELS[number]['id'];

export default function DeliveryChannelPreferences() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [savedChannels, setSavedChannels] = useState<Channel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        setError('Notification preferences are unavailable.');
        setLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sign in again to manage delivery messages.');
        setLoading(false);
        return;
      }
      const response = await fetch('/api/customer/notification-preferences', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });
      const result = await response.json() as { channels?: string[]; saved?: boolean; error?: string };
      if (!active) return;
      if (!response.ok) throw new Error(result.error || 'Delivery message preferences could not be loaded.');
      const selected = (result.channels || []).filter((channel): channel is Channel =>
        CHANNELS.some(option => option.id === channel));
      setChannels(selected);
      setSavedChannels(result.saved ? selected : null);
      setLoading(false);
    }
    void load().catch(loadError => {
      if (!active) return;
      setError(loadError instanceof Error ? loadError.message : 'Delivery message preferences could not be loaded.');
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (!supabase) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in again to save delivery message preferences.');
      const response = await fetch('/api/customer/notification-preferences', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ channels })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Delivery message preferences could not be saved.');
      setSavedChannels(channels);
      setNotice(channels.length ? 'Your delivery message channels are saved.' : 'Delivery email, SMS, and WhatsApp messages are turned off.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Delivery message preferences could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const changed = savedChannels === null
    ? !loading
    : CHANNELS.some(channel =>
      channels.includes(channel.id) !== savedChannels.includes(channel.id));

  return (
    <Card className="mb-5 space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Delivery message preferences</h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose which channels may send transactional order updates. Push alerts are managed separately below. Promotional messages have separate consent.
        </p>
        {savedChannels === null && !loading && (
          <p className="mt-2 text-xs text-amber-700">You are currently using the channels selected by Online Bar for each order status.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-4">
        {CHANNELS.map(channel => {
          const Icon = channel.icon;
          return (
            <label key={channel.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={channels.includes(channel.id)}
                disabled={loading || saving}
                onChange={event => setChannels(current => event.target.checked
                  ? [...current, channel.id]
                  : current.filter(item => item !== channel.id))}
              />
              <Icon className="h-4 w-4 text-slate-600" />
              {channel.label}
            </label>
          );
        })}
      </div>
      {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
      {notice && <p role="status" className="text-xs font-semibold text-emerald-700">{notice}</p>}
      <Button type="button" onClick={() => void save()} disabled={loading || saving || !changed} variant="outline" className="h-10 rounded-xl">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save preferences
      </Button>
    </Card>
  );
}
