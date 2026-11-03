import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const tokenPattern = /^[A-Za-z0-9_-]{40,64}$/;
const allowedFields = new Set([
  'businessName', 'tradingName', 'email', 'phone', 'ownerName', 'ownerRole',
  'address', 'county', 'town', 'latitude', 'longitude', 'operatingAreas',
  'cuisineOrCategory', 'preparationCapacity', 'deliveryRadiusKm',
  'collectionAvailable', 'hours', 'selectedGoods', 'offeredGoodsPrices'
]);

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function invalidLink() {
  return NextResponse.json({ error: 'This onboarding link is invalid, expired, or already used.' }, {
    status: 410,
    headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' }
  });
}

function validDraft(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !allowedFields.has(key))) return false;
  for (const [key, field] of Object.entries(data)) {
    if (key === 'collectionAvailable') {
      if (typeof field !== 'boolean') return false;
    } else if (key === 'hours') {
      if (!field || typeof field !== 'object' || Array.isArray(field)
        || JSON.stringify(field).length > 5_000) return false;
    } else if (key === 'selectedGoods') {
      if (!Array.isArray(field) || field.length > 50
        || !field.every(id => Number.isSafeInteger(id) && Number(id) > 0)) return false;
    } else if (key === 'offeredGoodsPrices') {
      if (!field || typeof field !== 'object' || Array.isArray(field)
        || Object.keys(field).length > 50
        || Object.values(field).some(price => typeof price !== 'string' || price.length > 20)) return false;
    } else if (typeof field !== 'string' || field.length > 1_000) {
      return false;
    }
  }
  return JSON.stringify(data).length <= 50_000;
}

async function getActiveInvite(token: string) {
  const database = getDatabase();
  if (!database) return { response: NextResponse.json({ error: 'Shared onboarding is temporarily unavailable.' }, { status: 503 }) };
  if (!tokenPattern.test(token)) return { response: invalidLink() };

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: lead, error } = await database.from('vendor_onboarding_leads')
    .select('id,onboarding_step_owners')
    .eq('invite_token_hash', tokenHash)
    .gt('invite_expires_at', new Date().toISOString())
    .is('invite_used_at', null)
    .is('invite_application_id', null)
    .maybeSingle();
  if (error) {
    console.error('[MerchantOnboardingDraft] Could not verify invitation:', error);
    return { response: NextResponse.json({ error: 'Shared onboarding could not be verified.' }, { status: 503 }) };
  }
  if (!lead) return { response: invalidLink() };
  const cookieStore = await cookies();
  const adminSession = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  return { database, lead, editorRole: adminSession ? 'admin' as const : 'merchant' as const };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Provide a valid onboarding draft.' }, { status: 400 });
  }
  const token = typeof body.token === 'string' ? body.token : '';
  const expectedUpdatedAt = body.expectedUpdatedAt;
  if (!validDraft(body.formData) || !Number.isInteger(body.currentStep)
    || Number(body.currentStep) < 0 || Number(body.currentStep) > 3
    || body.privacyAcknowledged !== true
    || (expectedUpdatedAt !== null && expectedUpdatedAt !== undefined
      && (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))))) {
    return NextResponse.json({
      error: 'Accept the privacy notice and provide a valid, partial onboarding draft before saving.'
    }, { status: 400 });
  }

  const access = await getActiveInvite(token);
  if ('response' in access) return access.response;
  const stageKeys = ['business', 'contact_area', 'operations', 'goods_docs'] as const;
  const stageKey = stageKeys[Number(body.currentStep)];
  const owners = access.lead.onboarding_step_owners as Record<string, unknown> | null;
  if (!stageKey || owners?.[stageKey] !== access.editorRole) {
    return NextResponse.json({
      error: `This step is assigned to ${owners?.[stageKey] === 'admin' ? 'the OnBar team' : 'the merchant'}. Open the link using the assigned person's account.`
    }, { status: 403 });
  }
  const fieldsByStage: Record<typeof stageKeys[number], string[]> = {
    business: ['businessName', 'tradingName'],
    contact_area: ['email', 'phone', 'ownerName', 'ownerRole', 'address', 'county', 'town', 'latitude', 'longitude', 'operatingAreas'],
    operations: ['cuisineOrCategory', 'preparationCapacity', 'deliveryRadiusKm', 'collectionAvailable', 'hours'],
    goods_docs: ['selectedGoods', 'offeredGoodsPrices']
  };
  const formData = Object.fromEntries(
    Object.entries(body.formData as Record<string, unknown>)
      .filter(([key]) => fieldsByStage[stageKey].includes(key))
  );

  const { data: savedDraft, error } = await access.database.rpc('save_vendor_onboarding_draft', {
    p_lead_id: access.lead.id,
    p_form_data: formData,
    p_current_step: body.currentStep,
    p_expected_updated_at: expectedUpdatedAt || null,
    p_actor: access.editorRole
  });
  if (error) {
    if (error.code === '40001') {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[MerchantOnboardingDraft] Could not save shared draft:', error);
    return NextResponse.json({ error: 'Your progress could not be saved. Please try again.' }, { status: 503 });
  }

  const savedRow = Array.isArray(savedDraft) ? savedDraft[0] : savedDraft;
  if (!savedRow || typeof savedRow.updated_at !== 'string') {
    console.error('[MerchantOnboardingDraft] Save function returned no saved timestamp.');
    return NextResponse.json({ error: 'Your progress may not have been saved. Reload the link before continuing.' }, { status: 503 });
  }

  return NextResponse.json({ saved: true, savedAt: savedRow.updated_at }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' }
  });
}
