import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type LocationPayload = {
  action?: unknown;
  anonymousId?: unknown;
  country?: unknown;
  county?: unknown;
  city?: unknown;
  area?: unknown;
  source?: unknown;
  email?: unknown;
  phone?: unknown;
  notificationConsent?: unknown;
  locationConsent?: unknown;
  preciseLocationConsent?: unknown;
  preciseLatitude?: unknown;
  preciseLongitude?: unknown;
  preciseAccuracyM?: unknown;
};

const requests = new Map<string, { startedAt: number; count: number }>();
const WINDOW_MS = 15 * 60 * 1000;

function cleanText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isMissingDemandSchema(error: { code?: string; message?: string }) {
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || /customer_location_preferences|market_waitlist|link_customer_location_preference/i.test(error.message || '');
}

function locationSetupError() {
  return NextResponse.json({
    error: 'Area saving is not set up on this database yet. Run supabase/DEMAND_INTELLIGENCE_MIGRATION.sql in the Supabase SQL Editor, then try again.'
  }, { status: 503 });
}

function allowRequest(request: Request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const now = Date.now();
  const current = requests.get(key);
  if (current && now - current.startedAt < WINDOW_MS && current.count >= 10) return false;
  if (!current || now - current.startedAt >= WINDOW_MS) requests.set(key, { startedAt: now, count: 1 });
  else current.count += 1;
  if (requests.size > 1000) {
    for (const [ip, entry] of requests) {
      if (now - entry.startedAt >= WINDOW_MS) requests.delete(ip);
    }
  }
  return true;
}

async function verifyUser(request: Request, url: string): Promise<string | null | false> {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !anonKey) return false;
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return false;
  return data.user.id;
}

export async function POST(request: Request) {
  if (!allowRequest(request)) {
    return NextResponse.json({ error: 'Too many location requests. Please try again later.' }, { status: 429 });
  }

  const database = getClient();
  if (!database) return NextResponse.json({ error: 'Location storage is not configured.' }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();

  let body: LocationPayload;
  try {
    body = await request.json() as LocationPayload;
  } catch {
    return NextResponse.json({ error: 'Location details were invalid.' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'save' && action !== 'link' && action !== 'waitlist' && action !== 'withdraw') {
    return NextResponse.json({ error: 'Choose a valid location action.' }, { status: 400 });
  }

  if (action === 'waitlist') {
    const email = cleanText(body.email, 254).toLowerCase();
    const phone = cleanText(body.phone, 32);
    const country = cleanText(body.country, 80) || 'Kenya';
    const county = cleanText(body.county, 80) || 'Unspecified';
    const city = cleanText(body.city, 100);
    const area = cleanText(body.area, 100);
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const phoneValid = !phone || /^\+?[0-9 ()-]{7,20}$/.test(phone);
    if (!emailValid) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    if (!phoneValid) return NextResponse.json({ error: 'Enter a valid phone number or leave it blank.' }, { status: 400 });
    if (!city || !area) return NextResponse.json({ error: 'Enter the city and area you want Onbar to serve.' }, { status: 400 });
    if (body.notificationConsent !== true) {
      return NextResponse.json({ error: 'Please confirm that we may contact you about availability in this area.' }, { status: 400 });
    }
    let preciseLocation: { latitude: number; longitude: number; accuracyM: number } | null = null;
    if (body.preciseLocationConsent === true) {
      const latitude = Number(body.preciseLatitude);
      const longitude = Number(body.preciseLongitude);
      const accuracyM = Number(body.preciseAccuracyM);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
        || !Number.isFinite(accuracyM) || accuracyM <= 0 || accuracyM > 250) {
        return NextResponse.json({ error: 'A reliable precise location is required for the optional demand-map opt-in. Turn that option off to join without sharing GPS.' }, { status: 400 });
      }
      preciseLocation = {
        latitude: Math.round(latitude * 1000) / 1000,
        longitude: Math.round(longitude * 1000) / 1000,
        accuracyM
      };
    }
    const waitlistUserId = await verifyUser(request, url);
    if (waitlistUserId === false) return NextResponse.json({ error: 'Your sign-in could not be verified.' }, { status: 401 });

    const { data: existing, error: lookupError } = await database.from('market_waitlist')
      .select('id,user_id,city,area')
      .eq('email', email)
      .limit(100);
    if (lookupError) {
      console.error('[LocationWaitlist] Could not check for an existing signup:', lookupError);
      return NextResponse.json({ error: 'The area waitlist is temporarily unavailable.' }, { status: 503 });
    }
    const existingSignup = existing?.find((signup) =>
      signup.city.toLowerCase() === city.toLowerCase()
      && signup.area.toLowerCase() === area.toLowerCase()
    );
    const values = {
      email,
      phone: phone || null,
      country,
      county,
      city,
      area,
      notification_consent: true,
      source: /^[a-z0-9 _-]{1,60}$/i.test(cleanText(body.source, 60)) ? cleanText(body.source, 60) : 'direct',
      user_id: waitlistUserId || existingSignup?.user_id || null,
      status: 'WAITLIST',
      notified_at: null,
      updated_at: new Date().toISOString()
    };
    const result = existingSignup
      ? await database.from('market_waitlist').update(values).eq('id', existingSignup.id).select('id').single()
      : await database.from('market_waitlist').insert(values).select('id').single();
    if (result.error) {
      console.error('[LocationWaitlist] Could not save signup:', result.error);
      return NextResponse.json({ error: 'Your waitlist signup could not be saved. Please try again.' }, { status: 503 });
    }
    if (body.preciseLocationConsent === true && preciseLocation) {
      const { error } = await database.from('waitlist_demand_locations').upsert({
        waitlist_id: result.data.id,
        latitude: preciseLocation.latitude,
        longitude: preciseLocation.longitude,
        accuracy_m: preciseLocation.accuracyM,
        consented_at: new Date().toISOString()
      }, { onConflict: 'waitlist_id' });
      if (error) {
        console.error('[LocationWaitlist] Signup saved but opted-in demand location could not be recorded:', error);
        return NextResponse.json({
          error: 'Your waitlist signup was saved, but the optional map location could not be recorded. Ask an admin to apply WAITLIST_DEMAND_GPS_MIGRATION.sql, then retry.'
        }, { status: 503 });
      }
    } else if (body.preciseLocationConsent === false && existingSignup?.id) {
      const { error } = await database.from('waitlist_demand_locations').delete().eq('waitlist_id', existingSignup.id);
      if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
        console.error('[LocationWaitlist] Could not remove a withdrawn demand-map location:', error);
        return NextResponse.json({ error: 'Your signup was updated, but its saved map location could not be removed. Please contact support.' }, { status: 503 });
      }
    }
    return NextResponse.json({ success: true, preciseLocationCaptured: preciseLocation !== null });
  }

  const anonymousId = cleanText(body.anonymousId, 80);
  if (!/^anon-[a-zA-Z0-9-]{8,72}$/.test(anonymousId)) {
    return NextResponse.json({ error: 'A valid anonymous session is required to save this preference.' }, { status: 400 });
  }

  const userId = await verifyUser(request, url);
  if (userId === false) return NextResponse.json({ error: 'Your sign-in could not be verified.' }, { status: 401 });

  if (action === 'withdraw') {
    const { data: preference, error: lookupError } = await database.from('customer_location_preferences')
      .select('id,user_id')
      .eq('anonymous_id', anonymousId)
      .maybeSingle();
    if (lookupError) {
      console.error('[Location] Could not find the saved area preference to withdraw:', lookupError);
      return NextResponse.json({ error: 'Your saved area could not be removed.' }, { status: 503 });
    }
    let preferenceId = preference?.id;
    let preferenceUserId = preference?.user_id;
    if (!preferenceId) {
      const { data: sessions, error: sessionLookupError } = await database.from('customer_sessions')
        .select('location_preference_id')
        .eq('anonymous_id', anonymousId)
        .not('location_preference_id', 'is', null)
        .limit(1);
      if (sessionLookupError) {
        console.error('[Location] Could not find the linked area preference to withdraw:', sessionLookupError);
        return NextResponse.json({ error: 'Your saved area could not be removed.' }, { status: 503 });
      }
      preferenceId = sessions?.[0]?.location_preference_id || undefined;
      if (preferenceId) {
        const { data: linkedPreference, error: linkedLookupError } = await database.from('customer_location_preferences')
          .select('user_id')
          .eq('id', preferenceId)
          .maybeSingle();
        if (linkedLookupError) {
          console.error('[Location] Could not verify the linked area preference:', linkedLookupError);
          return NextResponse.json({ error: 'Your saved area could not be removed.' }, { status: 503 });
        }
        preferenceUserId = linkedPreference?.user_id;
      }
    }
    if (preferenceUserId && preferenceUserId !== userId) {
      return NextResponse.json({ error: 'Sign in to the account that saved this area to remove it.' }, { status: 403 });
    }
    if (preferenceId) {
      const { error: linkedSessionError } = await database.from('customer_sessions')
        .update({
          location_preference_id: null,
          location_country: null,
          location_county: null,
          location_city: null,
          location_area: null
        })
        .eq('location_preference_id', preferenceId);
      if (linkedSessionError) {
        console.error('[Location] Could not remove the area from linked sessions:', linkedSessionError);
        return NextResponse.json({ error: 'Your area could not be removed from analytics sessions.' }, { status: 503 });
      }
      const { error: sessionError } = await database.from('customer_sessions')
        .update({
          location_preference_id: null,
          location_country: null,
          location_county: null,
          location_city: null,
          location_area: null
        })
        .eq('anonymous_id', anonymousId);
      if (sessionError) {
        console.error('[Location] Could not remove area from active sessions:', sessionError);
        return NextResponse.json({ error: 'Your area could not be removed from analytics sessions.' }, { status: 503 });
      }
      const { error } = await database.from('customer_location_preferences').delete().eq('id', preferenceId);
      if (error) {
        console.error('[Location] Could not withdraw saved area preference:', error);
        return NextResponse.json({ error: 'Your saved area could not be removed.' }, { status: 503 });
      }
    }
    return NextResponse.json({ success: true });
  }

  const country = cleanText(body.country, 80);
  const county = cleanText(body.county, 80);
  const city = cleanText(body.city, 100);
  const area = cleanText(body.area, 100);
  if (!country || !county || !city || !area) {
    return NextResponse.json({ error: 'Choose a country, county, city, and area.' }, { status: 400 });
  }
  if (body.locationConsent !== true) {
    return NextResponse.json({ error: 'Location preference requires explicit consent.' }, { status: 400 });
  }

  if (action === 'link') {
    if (!userId) return NextResponse.json({ error: 'Sign in before linking an area to your account.' }, { status: 401 });
    const { error } = await database.rpc('link_customer_location_preference', {
      p_anonymous_id: anonymousId,
      p_user_id: userId
    });
    if (error) {
      console.error('[Location] Could not link opted-in area to signed-in account:', error);
      return NextResponse.json({ error: 'Your saved area could not be linked.' }, { status: 503 });
    }
    return NextResponse.json({ success: true });
  }

  const { data: existing, error: lookupError } = await database.from('customer_location_preferences')
    .select('id,user_id')
    .eq('anonymous_id', anonymousId)
    .maybeSingle();
  if (lookupError) {
    console.error('[Location] Could not check for an existing preference:', lookupError);
    if (isMissingDemandSchema(lookupError)) return locationSetupError();
    return NextResponse.json({ error: 'Your area preference could not be saved.' }, { status: 503 });
  }

  const values = {
    user_id: userId || existing?.user_id || null,
    anonymous_id: anonymousId,
    country,
    county,
    city,
    area,
    location_source: body.source === 'manual' ? 'user_selected' : 'approximate_browser_location',
    consented_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const result = existing
    ? await database.from('customer_location_preferences').update(values).eq('id', existing.id)
    : await database.from('customer_location_preferences').insert(values);
  if (result.error) {
    console.error('[Location] Could not save opted-in area preference:', result.error);
    if (isMissingDemandSchema(result.error)) return locationSetupError();
    return NextResponse.json({ error: 'Your area preference could not be saved.' }, { status: 503 });
  }

  const { data: preference } = await database.from('customer_location_preferences')
    .select('id')
    .eq('anonymous_id', anonymousId)
    .maybeSingle();
  if (preference?.id) {
    const { error: sessionError } = await database.from('customer_sessions')
      .update({
        location_preference_id: preference.id,
        location_country: country,
        location_county: county,
        location_city: city,
        location_area: area
      })
      .eq('anonymous_id', anonymousId);
    if (sessionError) console.error('[Location] Saved preference, but active sessions could not be updated:', sessionError);
  }

  return NextResponse.json({ success: true });
}
