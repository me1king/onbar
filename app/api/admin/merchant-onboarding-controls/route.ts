import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

async function authorize() {
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_settings')) {
    return { response: NextResponse.json({ error: 'Merchant onboarding settings access is required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Merchant operations database access is not configured.' }, { status: 503 }) };
  }
  return { database, actor: session.email || session.role };
}

export async function GET() {
  const access = await authorize();
  if ('response' in access) return access.response;
  const { data, error } = await access.database.from('merchant_onboarding_controls')
    .select('allow_document_deferral, updated_at, updated_by')
    .eq('id', true)
    .maybeSingle();
  if (error || !data) {
    console.error('[MerchantOnboardingControls] Could not load controls:', error);
    return NextResponse.json({ error: 'Merchant onboarding controls are unavailable. Apply the onboarding experience migration.' }, { status: 503 });
  }
  return NextResponse.json({ controls: data }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { allowDocumentDeferral?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid merchant onboarding setting is required.' }, { status: 400 });
  }
  if (typeof body.allowDocumentDeferral !== 'boolean') {
    return NextResponse.json({ error: 'Choose whether applicants may defer document uploads.' }, { status: 400 });
  }

  const { data, error } = await access.database.from('merchant_onboarding_controls')
    .update({
      allow_document_deferral: body.allowDocumentDeferral,
      updated_by: access.actor,
      updated_at: new Date().toISOString()
    })
    .eq('id', true)
    .select('allow_document_deferral, updated_at, updated_by')
    .single();
  if (error) {
    console.error('[MerchantOnboardingControls] Could not update controls:', error);
    return NextResponse.json({ error: 'Merchant onboarding controls could not be saved.' }, { status: 503 });
  }
  return NextResponse.json({ controls: data });
}
