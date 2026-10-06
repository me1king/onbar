import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;
const ID_BATCH_SIZE = 200;

interface LocationPreference {
  user_id: string | null;
  anonymous_id: string | null;
  country: string;
  county: string;
  city: string;
  area: string;
}

interface WaitlistEntry {
  id: string;
  user_id: string | null;
  email: string;
  phone: string | null;
  country: string;
  county: string;
  city: string;
  area: string;
  notification_consent: boolean;
  source: string;
  status: string;
  created_at: string;
}

interface CustomerSession {
  id: string;
  user_id: string | null;
  anonymous_id: string | null;
  source_channel: string | null;
  last_seen_at: string | null;
  created_at: string;
}

interface Order {
  user_id: string | null;
  session_id: string | null;
  total_price: number | string;
  status: string | null;
  payment_verified_at: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  created_at: string;
}

interface LocationMetrics {
  country: string;
  county: string;
  city: string;
  area: string;
  knownVisitors: number;
  totalUsers: number;
  newSignups: number;
  activeUsers: number;
  waitlistSignups: number;
  recentWaitlistSignups: number;
  previousWaitlistSignups: number;
  orders: number;
  revenue: number;
  conversionRate: number;
  trafficSources: Record<string, number>;
}

interface TrendMetrics {
  date: string;
  activeSessions: number;
  newSignups: number;
  waitlistSignups: number;
}

function areaKey(location: Pick<LocationPreference, 'country' | 'county' | 'city' | 'area'>) {
  return JSON.stringify([location.country, location.county, location.city, location.area]);
}

async function readAllPages<T>(
  readPage: (start: number, end: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await readPage(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function dateKey(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function isPaid(order: Order) {
  return Boolean(order.payment_verified_at)
    || ['paid', 'completed', 'delivered', 'success'].includes((order.status || '').toLowerCase());
}

export async function loadDemandIntelligenceFallback(
  database: SupabaseClient,
  days: number
) {
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousSince = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);
  const trendStart = new Date(now);
  trendStart.setUTCHours(0, 0, 0, 0);
  trendStart.setUTCDate(trendStart.getUTCDate() - days + 1);

  const [preferences, waitlist, sessions, orders] = await Promise.all([
    readAllPages<LocationPreference>((start, end) => database
      .from('customer_location_preferences')
      .select('user_id,anonymous_id,country,county,city,area')
      .order('id')
      .range(start, end)),
    readAllPages<WaitlistEntry>((start, end) => database
      .from('market_waitlist')
      .select('id,user_id,email,phone,country,county,city,area,notification_consent,source,status,created_at')
      .order('created_at', { ascending: false })
      .range(start, end)),
    readAllPages<CustomerSession>((start, end) => database
      .from('customer_sessions')
      .select('id,user_id,anonymous_id,source_channel,last_seen_at,created_at')
      .or(`last_seen_at.gte.${since.toISOString()},created_at.gte.${trendStart.toISOString()}`)
      .order('id')
      .range(start, end)),
    readAllPages<Order>((start, end) => database
      .from('orders')
      .select('user_id,session_id,total_price,status,payment_verified_at,created_at')
      .gte('created_at', since.toISOString())
      .order('created_at')
      .range(start, end))
  ]);

  const userIds = [...new Set(preferences.flatMap((preference) => preference.user_id ? [preference.user_id] : []))];
  const profileBatches = await Promise.all(
    Array.from({ length: Math.ceil(userIds.length / ID_BATCH_SIZE) }, (_, index) =>
      readAllPages<Profile>((start, end) => database
        .from('profiles')
        .select('id,created_at')
        .in('id', userIds.slice(index * ID_BATCH_SIZE, (index + 1) * ID_BATCH_SIZE))
        .order('id')
        .range(start, end))
    )
  );
  const profiles = profileBatches.flat();
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const preferenceByUser = new Map<string, LocationPreference>();
  const preferenceByAnonymous = new Map<string, LocationPreference>();
  const metricsByArea = new Map<string, LocationMetrics>();
  const ensureArea = (location: Pick<LocationPreference, 'country' | 'county' | 'city' | 'area'>) => {
    const key = areaKey(location);
    let metrics = metricsByArea.get(key);
    if (!metrics) {
      metrics = {
        ...location,
        knownVisitors: 0,
        totalUsers: 0,
        newSignups: 0,
        activeUsers: 0,
        waitlistSignups: 0,
        recentWaitlistSignups: 0,
        previousWaitlistSignups: 0,
        orders: 0,
        revenue: 0,
        conversionRate: 0,
        trafficSources: {}
      };
      metricsByArea.set(key, metrics);
    }
    return metrics;
  };

  for (const preference of preferences) {
    ensureArea(preference);
    if (preference.user_id) preferenceByUser.set(preference.user_id, preference);
    if (preference.anonymous_id) preferenceByAnonymous.set(preference.anonymous_id, preference);
  }

  const locationForSession = (session: CustomerSession) =>
    (session.user_id && preferenceByUser.get(session.user_id))
    || (session.anonymous_id && preferenceByAnonymous.get(session.anonymous_id))
    || null;
  const sessionById = new Map(sessions.map((session) => [session.id, session]));

  for (const preference of preferences) {
    const metrics = ensureArea(preference);
    const visitorId = preference.user_id || preference.anonymous_id;
    if (visitorId) metrics.knownVisitors += 1;
    if (preference.user_id) {
      const profile = profileById.get(preference.user_id);
      if (profile) {
        metrics.totalUsers += 1;
        if (new Date(profile.created_at) >= since) metrics.newSignups += 1;
      }
    }
  }

  const activeUsersByArea = new Map<string, Set<string>>();
  const trafficSourcesByArea = new Map<string, Map<string, Set<string>>>();
  const activeSessionsByDay = new Map<string, Set<string>>();
  for (const session of sessions) {
    const preference = locationForSession(session);
    if (!preference) continue;
    const key = areaKey(preference);
    const sessionCreated = new Date(session.created_at);
    if (session.last_seen_at && new Date(session.last_seen_at) >= since) {
      const activeUsers = activeUsersByArea.get(key) || new Set<string>();
      activeUsers.add(session.user_id || session.anonymous_id || session.id);
      activeUsersByArea.set(key, activeUsers);
    }
    if (sessionCreated >= since) {
      const sourceMap = trafficSourcesByArea.get(key) || new Map<string, Set<string>>();
      const source = session.source_channel?.trim() || 'Direct';
      const sourceSessions = sourceMap.get(source) || new Set<string>();
      sourceSessions.add(session.id);
      sourceMap.set(source, sourceSessions);
      trafficSourcesByArea.set(key, sourceMap);
    }
    if (sessionCreated >= trendStart) {
      const day = dateKey(session.created_at);
      const daySessions = activeSessionsByDay.get(day) || new Set<string>();
      daySessions.add(session.id);
      activeSessionsByDay.set(day, daySessions);
    }
  }

  for (const [key, activeUsers] of activeUsersByArea) {
    const metrics = metricsByArea.get(key);
    if (metrics) metrics.activeUsers = activeUsers.size;
  }
  for (const [key, sources] of trafficSourcesByArea) {
    const metrics = metricsByArea.get(key);
    if (metrics) {
      metrics.trafficSources = Object.fromEntries(
        [...sources.entries()].map(([source, sourceSessions]) => [source, sourceSessions.size])
      );
    }
  }

  const convertedCustomersByArea = new Map<string, Set<string>>();
  for (const waitlistEntry of waitlist) ensureArea(waitlistEntry);
  for (const entry of waitlist) {
    const metrics = ensureArea(entry);
    metrics.waitlistSignups += 1;
    const createdAt = new Date(entry.created_at);
    if (createdAt >= since) metrics.recentWaitlistSignups += 1;
    if (createdAt >= previousSince && createdAt < since) metrics.previousWaitlistSignups += 1;
  }
  for (const order of orders) {
    if (!isPaid(order)) continue;
    const session = order.session_id ? sessionById.get(order.session_id) : undefined;
    const preference = (order.user_id && preferenceByUser.get(order.user_id))
      || (session && locationForSession(session));
    if (!preference) continue;
    const key = areaKey(preference);
    const metrics = metricsByArea.get(key);
    if (!metrics) continue;
    metrics.orders += 1;
    metrics.revenue += Number(order.total_price) || 0;
    const converted = convertedCustomersByArea.get(key) || new Set<string>();
    converted.add(order.user_id || session?.anonymous_id || session?.id || order.session_id || '');
    convertedCustomersByArea.set(key, converted);
  }
  for (const [key, customers] of convertedCustomersByArea) {
    const metrics = metricsByArea.get(key);
    if (metrics) metrics.conversionRate = metrics.activeUsers > 0
      ? Math.round((customers.size * 1000) / metrics.activeUsers) / 10
      : 0;
  }

  const signupsByDay = new Map<string, number>();
  for (const profile of profiles) {
    const preference = preferenceByUser.get(profile.id);
    const day = dateKey(profile.created_at);
    if (preference && day >= dateKey(trendStart.toISOString())) {
      signupsByDay.set(day, (signupsByDay.get(day) || 0) + 1);
    }
  }
  const waitlistByDay = new Map<string, number>();
  for (const entry of waitlist) {
    const day = dateKey(entry.created_at);
    if (day >= dateKey(trendStart.toISOString())) {
      waitlistByDay.set(day, (waitlistByDay.get(day) || 0) + 1);
    }
  }

  const dailyTrend: TrendMetrics[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(trendStart);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    dailyTrend.push({
      date: key,
      activeSessions: activeSessionsByDay.get(key)?.size || 0,
      newSignups: signupsByDay.get(key) || 0,
      waitlistSignups: waitlistByDay.get(key) || 0
    });
  }

  const waitlistContacts = waitlist
    .filter((entry) => entry.notification_consent)
    .slice(0, 500)
    .map((entry) => ({
      id: entry.id,
      email: entry.email,
      phone: entry.phone,
      country: entry.country,
      county: entry.county,
      city: entry.city,
      area: entry.area,
      source: entry.source,
      status: entry.status,
      createdAt: entry.created_at
    }));

  return {
    days,
    locations: [...metricsByArea.values()]
      .map((metrics) => ({
        ...metrics,
        revenue: Math.round(metrics.revenue * 100) / 100
      }))
      .sort((left, right) =>
        right.waitlistSignups - left.waitlistSignups || right.orders - left.orders
      ),
    waitlistContacts,
    dailyTrend
  };
}
