import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorize() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_settings')) {
    return { response: NextResponse.json({ error: 'Concierge settings management access is required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) return { response: NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 }) };
  return { session, database };
}

export async function GET() {
  const access = await authorize();
  if ('response' in access) return access.response;

  const [scenarioResult, unmatchedResult] = await Promise.all([
    access.database.from('concierge_scenarios').select('*').order('updated_at', { ascending: false }).limit(200),
    access.database.from('concierge_unmatched_questions').select('id,message,status,created_at').order('created_at', { ascending: false }).limit(100)
  ]);
  const error = scenarioResult.error || unmatchedResult.error;
  if (error) {
    console.error('[ConciergeTrainer] Could not load the scenario library:', error.message);
    const migrationMissing = ['42P01', 'PGRST205'].includes(error.code || '');
    return NextResponse.json({
      error: migrationMissing
        ? 'The scenario library is not installed yet. Run supabase/CONCIERGE_SCENARIOS_MIGRATION.sql in the Supabase SQL Editor.'
        : 'The concierge library could not be loaded.'
    }, { status: 503 });
  }

  const versionsResult = await access.database.from('concierge_scenario_versions')
    .select('id,scenario_id,version,snapshot,updated_by,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (versionsResult.error) {
    console.error('[ConciergeTrainer] Could not load scenario history:', versionsResult.error.message);
    return NextResponse.json({ error: 'Scenario version history could not be loaded.' }, { status: 503 });
  }

  return NextResponse.json({
    scenarios: scenarioResult.data || [],
    unmatched: unmatchedResult.data || [],
    versions: versionsResult.data || []
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid scenario update.' }, { status: 400 });
  }

  if (body.action === 'delete') {
    if (typeof body.id !== 'string' || !uuidPattern.test(body.id)) {
      return NextResponse.json({ error: 'Choose a valid scenario to delete.' }, { status: 400 });
    }
    const { error } = await access.database.from('concierge_scenarios').delete().eq('id', body.id);
    if (error) {
      console.error('[ConciergeTrainer] Could not delete scenario:', error.message);
      return NextResponse.json({ error: 'The scenario could not be deleted.' }, { status: 503 });
    }
    return NextResponse.json({ saved: true });
  }

  const id = body.id === undefined || body.id === '' ? undefined : body.id;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const triggers = Array.isArray(body.triggers)
    ? body.triggers.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean)
    : [];
  const replies = body.replies && typeof body.replies === 'object' && !Array.isArray(body.replies)
    ? body.replies as Record<string, unknown>
    : {};
  const action = body.scenarioAction === 'support' ? 'support' : body.scenarioAction === 'none' ? 'none' : null;
  const status = body.status === 'live' || body.status === 'testing' || body.status === 'draft' ? body.status : null;
  const mode = body.mode === 'exact' || body.mode === 'guided' ? body.mode : null;
  const chips = Array.isArray(body.chips)
    ? body.chips.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean)
    : [];
  const conditions = body.conditions && typeof body.conditions === 'object' && !Array.isArray(body.conditions)
    ? body.conditions
    : {};

  if ((id !== undefined && (typeof id !== 'string' || !uuidPattern.test(id)))
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(body.scenario_key || ''))
    || String(body.scenario_key).length > 80
    || name.length < 2 || name.length > 100
    || triggers.length < 1 || triggers.length > 30
    || triggers.some(trigger => trigger.length > 160)
    || !['en', 'sw', 'sheng'].some(language => typeof replies[language] === 'string' && (replies[language] as string).trim())
    || Object.entries(replies).some(([language, reply]) => !['en', 'sw', 'sheng'].includes(language) || typeof reply !== 'string' || reply.length > 1200)
    || !action || !status || !mode
    || chips.length > 8 || chips.some(chip => chip.length > 60)
    || JSON.stringify(conditions).length > 3000
    || JSON.stringify(body).length > 20000) {
    return NextResponse.json({ error: 'Check the scenario name, key, triggers, replies, mode, action and chips.' }, { status: 400 });
  }

  const payload = {
    scenario_key: String(body.scenario_key),
    name,
    triggers,
    replies,
    mode,
    action,
    conditions,
    chips,
    status,
    updated_by: access.session.email || access.session.role
  };
  const result = id
    ? await access.database.from('concierge_scenarios').update(payload).eq('id', id).select('id,version').maybeSingle()
    : await access.database.from('concierge_scenarios').insert(payload).select('id,version').single();
  if (result.error || !result.data) {
    console.error('[ConciergeTrainer] Could not save scenario:', result.error?.message);
    return NextResponse.json({
      error: result.error?.code === '23505'
        ? 'That scenario key is already in use.'
        : 'The scenario could not be saved.'
    }, { status: result.error?.code === '23505' ? 409 : 503 });
  }
  return NextResponse.json({ saved: true, id: result.data.id, version: result.data.version });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Choose a question to update.' }, { status: 400 });
  }
  if (!Number.isSafeInteger(body.id) || !['reviewed', 'converted'].includes(String(body.status))) {
    return NextResponse.json({ error: 'Choose a valid question status.' }, { status: 400 });
  }
  const { error } = await access.database.from('concierge_unmatched_questions')
    .update({ status: body.status })
    .eq('id', Number(body.id));
  if (error) {
    console.error('[ConciergeTrainer] Could not update unanswered question:', error.message);
    return NextResponse.json({ error: 'The unanswered question could not be updated.' }, { status: 503 });
  }
  return NextResponse.json({ saved: true });
}
