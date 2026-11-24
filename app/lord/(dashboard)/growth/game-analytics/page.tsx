'use client';

import * as React from 'react';
import {
  Activity,
  BarChart3,
  CircleDot,
  Gamepad2,
  Loader2,
  RefreshCcw,
  Target,
  Users,
  Wifi
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface GameNightMetrics {
  totals: {
    page_views: number;
    unique_visitors: number;
    visitor_sessions: number;
    game_starts: number;
    started_sessions: number;
    started_visitors: number;
    start_conversion_rate: number;
    game_actions: number;
    active_players: number;
    rooms_created: number;
    rooms_joined: number;
    online_players: number;
    games_ended: number;
  };
  daily: Array<{
    date: string;
    page_views: number;
    game_starts: number;
    game_actions: number;
  }>;
  modes: Array<{
    mode: string;
    selections: number;
    starts: number;
    actions: number;
    rooms_created: number;
    rooms_joined: number;
  }>;
  actions: Array<{ action: string; count: number }>;
}

interface AnalyticsResponse {
  data?: GameNightMetrics;
  range?: { days: number; from: string; to: string };
  error?: string;
}

const metricCards = [
  { key: 'opens', label: 'Game page opens', icon: BarChart3 },
  { key: 'visitors', label: 'Unique visitors', icon: Users },
  { key: 'starts', label: 'Started playing', icon: Gamepad2 },
  { key: 'conversion', label: 'Visitor → play conversion', icon: Target },
  { key: 'active', label: 'Active play sessions', icon: Activity },
  { key: 'actions', label: 'Gameplay actions', icon: Activity },
  { key: 'online', label: 'Online participants', icon: Wifi },
  { key: 'ends', label: 'Game end events', icon: Target }
] as const;

export default function GameNightAnalyticsPage() {
  const [days, setDays] = React.useState(30);
  const [metrics, setMetrics] = React.useState<GameNightMetrics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/game-night/analytics?days=${days}`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json() as AnalyticsResponse;
        if (!response.ok) throw new Error(result.error || 'Unable to load Game Night analytics.');
        if (!result.data) throw new Error('The analytics response did not include metrics.');
        if (active) setMetrics(result.data);
      })
      .catch(error => {
        if (!active) return;
        console.error('[GameNightAnalytics] Could not load metrics:', error);
        setError(error instanceof Error ? error.message : 'Unable to load Game Night analytics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [days, refreshKey]);

  const totals = metrics?.totals;
  const maxDaily = Math.max(1, ...(metrics?.daily.map(item => item.page_views) || []));
  const cardValues = {
    opens: totals?.page_views,
    visitors: totals?.unique_visitors,
    starts: totals?.started_visitors,
    conversion: totals ? `${totals.start_conversion_rate.toFixed(1)}%` : undefined,
    active: totals?.active_players,
    actions: totals?.game_actions,
    online: totals?.online_players,
    ends: totals?.games_ended
  };
  const modeNames: Record<string, string> = {
    bottle: 'Spin the Bottle',
    'truth-or-dare': 'Truth or Dare',
    cards: 'Date-night Cards'
  };
  const modeName = (value: string) => modeNames[value] || value;
  const hasDailyActivity = Boolean(totals && (totals.page_views || totals.game_starts || totals.game_actions));

  return (
    <div className="min-h-screen space-y-8 bg-slate-50 p-4 pb-40 text-left selection:bg-primary/20 sm:p-8">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <CircleDot className="h-5 w-5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Game Night · Performance</span>
          </div>
          <h1 className="text-4xl font-black uppercase leading-none tracking-tighter text-foreground">Game Analytics</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-muted-foreground">
            See who opens Game Night, who starts playing, what gets played, and how often online rooms are used.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map(range => (
            <Button
              key={range}
              type="button"
              variant={days === range ? 'default' : 'outline'}
              onClick={() => setDays(range)}
              className="h-10 rounded-xl px-4 text-xs font-black"
            >
              {range} days
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setRefreshKey(value => value + 1)}
            disabled={loading}
            className="h-10 rounded-xl px-4"
            aria-label="Refresh analytics"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(item => (
          <Card key={item.key} className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</p>
              <item.icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-black tabular-nums text-foreground">
              {loading && !metrics ? <Loader2 className="h-7 w-7 animate-spin text-slate-300" /> : cardValues[item.key] ?? '—'}
            </p>
            {item.key === 'starts' && totals && (
              <p className="mt-1 text-xs text-slate-500">{totals.game_starts.toLocaleString()} start events · unique visitors counted above</p>
            )}
            {item.key === 'online' && totals && (
              <p className="mt-1 text-xs text-slate-500">{totals.rooms_created.toLocaleString()} rooms created · {totals.rooms_joined.toLocaleString()} joins</p>
            )}
          </Card>
        ))}
      </section>

      <Card className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-foreground">Opens and starts by day</h2>
            <p className="mt-1 text-xs text-slate-500">Daily game-page views compared with sessions that started playing.</p>
          </div>
          <div className="flex gap-4 text-[10px] font-bold uppercase text-slate-500">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Opens</span>
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-primary" /> Starts</span>
          </div>
        </div>
        {metrics?.daily.length && hasDailyActivity ? (
          <div className="mt-6 flex h-52 items-end gap-1 overflow-x-auto border-b border-slate-100 pb-2">
            {metrics.daily.map(item => {
              const openHeight = Math.max(3, item.page_views / maxDaily * 150);
              const startHeight = Math.max(0, item.game_starts / maxDaily * 150);
              return (
                <div key={item.date} title={`${item.date}: ${item.page_views} opens, ${item.game_starts} starts, ${item.game_actions} actions`} className="flex h-full min-w-5 flex-1 items-end justify-center gap-0.5">
                  <div className="w-2 rounded-t bg-slate-300" style={{ height: `${openHeight}px` }} />
                  <div className="w-2 rounded-t bg-primary" style={{ height: `${startHeight}px` }} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
            {loading ? 'Loading daily activity…' : 'No game-night activity recorded in this period yet.'}
          </p>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-black uppercase tracking-tight text-foreground">Game modes</h2>
          <p className="mt-1 text-xs text-slate-500">Selections, starts, and turns by game mode.</p>
          {metrics?.modes.length ? (
            <div className="mt-5 space-y-3">
              {metrics.modes.map(item => (
                <div key={item.mode} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
                  <p className="font-black text-foreground">{modeName(item.mode)}</p>
                  <div className="flex gap-4 text-xs text-slate-600">
                    <span><strong>{item.selections}</strong> selections</span>
                    <span><strong>{item.starts}</strong> starts</span>
                    <span><strong>{item.actions}</strong> moves</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="mt-5 text-sm text-slate-500">{loading ? 'Loading…' : 'No game mode data yet.'}</p>}
        </Card>

        <Card className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-black uppercase tracking-tight text-foreground">What players do</h2>
          <p className="mt-1 text-xs text-slate-500">Recorded gameplay moves. No names or invite codes are stored.</p>
          {metrics?.actions.length ? (
            <div className="mt-5 space-y-3">
              {metrics.actions.map(item => (
                <div key={item.action} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <span className="text-sm font-bold capitalize text-slate-700">{item.action.replace(/-/g, ' ')}</span>
                  <span className="text-sm font-black tabular-nums text-foreground">{item.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-5 text-sm text-slate-500">{loading ? 'Loading…' : 'No gameplay actions recorded yet.'}</p>}
        </Card>
      </div>

      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
        Analytics respects each visitor’s analytics-consent setting, so people who decline analytics are not counted. Visitors are measured with the existing pseudonymous app session; player names and room invite codes are never sent.
      </p>
    </div>
  );
}
