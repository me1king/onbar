import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const stages = ['business', 'contact_area', 'operations', 'goods_docs'] as const;
const allowedEvents = [
  'onboarding_stage_entered',
  'onboarding_stage_exited',
  'onboarding_rage_click',
  'onboarding_application_submitted',
  'onboarding_analytics_consent'
] as const;
const recentEventCounts = new Map<string, { count: number; resetAt: number }>();

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  let body: { token?: unknown; eventType?: unknown; stage?: unknown; durationMs?: unknown; controlType?: unknown; sessionId?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid onboarding event is required.' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const eventType = body.eventType;
  const stage = body.stage;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const durationMs = body.durationMs;
  const controlType = body.controlType;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)
    || !allowedEvents.includes(eventType as typeof allowedEvents[number])
    || !stages.includes(stage as typeof stages[number])
    || !/^[0-9a-f-]{36}$/i.test(sessionId)
    || (eventType === 'onboarding_stage_exited'
      && (typeof durationMs !== 'number' || !Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > 86_400_000))
    || (eventType === 'onboarding_rage_click' && !['button', 'input', 'select', 'textarea'].includes(String(controlType)))) {
    return NextResponse.json({ error: 'The onboarding event contains invalid fields.' }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Onboarding analytics are not configured.' }, { status: 503 });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = Date.now();

  const { data: lead, error: leadError } = await database.from('vendor_onboarding_leads')
    .select('id, invite_expires_at, invite_used_at')
    .eq('invite_token_hash', tokenHash)
    .maybeSingle();
  if (leadError) {
    console.error('[MerchantOnboardingAnalytics] Could not verify onboarding invitation:', leadError);
    return NextResponse.json({ error: 'Onboarding analytics could not be verified.' }, { status: 503 });
  }
  if (!lead || (!lead.invite_used_at && (!lead.invite_expires_at || new Date(lead.invite_expires_at).getTime() <= now))) {
    return NextResponse.json({ error: 'This onboarding link is invalid or expired.' }, { status: 410 });
  }

  if (recentEventCounts.size > 1_000) {
    for (const [hash, entry] of recentEventCounts) {
      if (entry.resetAt <= now) recentEventCounts.delete(hash);
    }
  }
  const recent = recentEventCounts.get(tokenHash);
  if (!recent && recentEventCounts.size >= 10_000) {
    let oldestHash: string | null = null;
    let oldestResetAt = Number.POSITIVE_INFINITY;
    for (const [hash, entry] of recentEventCounts) {
      if (entry.resetAt < oldestResetAt) {
        oldestHash = hash;
        oldestResetAt = entry.resetAt;
      }
    }
    if (oldestHash) recentEventCounts.delete(oldestHash);
  }
  if (recent && recent.resetAt > now && recent.count >= 120) {
    return NextResponse.json({ error: 'Too many onboarding analytics events were sent.' }, { status: 429 });
  }
  recentEventCounts.set(tokenHash, recent && recent.resetAt > now
    ? { count: recent.count + 1, resetAt: recent.resetAt }
    : { count: 1, resetAt: now + 60 * 60 * 1000 });

  const details: Record<string, unknown> = {
    session_id: sessionId,
    stage
  };
  if (typeof durationMs === 'number') details.duration_ms = durationMs;
  if (typeof controlType === 'string') details.control_type = controlType;
  const { error } = await database.from('vendor_onboarding_events').insert({
    lead_id: lead.id,
    event_type: eventType,
    actor: 'applicant',
    details
  });
  if (error) {
    console.error('[MerchantOnboardingAnalytics] Could not record onboarding event:', error);
    return NextResponse.json({ error: 'Onboarding analytics could not be saved.' }, { status: 503 });
  }
  return NextResponse.json({ success: true }, { status: 202 });
}
