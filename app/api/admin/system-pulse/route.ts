import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

type ProbeStatus = 'online' | 'slow' | 'unavailable';
type Probe = {
  status: ProbeStatus;
  latencyMs: number | null;
  detail: string;
};

const SLOW_THRESHOLD_MS = 1500;
const PROBE_TIMEOUT_MS = 8000;

function probeStatus(latencyMs: number): ProbeStatus {
  return latencyMs > SLOW_THRESHOLD_MS ? 'slow' : 'online';
}

function failedProbe(detail: string): Probe {
  return { status: 'unavailable', latencyMs: null, detail };
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });

  const database = createServerSupabaseClient();
  if (!database) {
    const unavailable = failedProbe('Supabase server credentials are not configured.');
    return NextResponse.json({
      database: unavailable,
      runners: unavailable,
      dispatch: unavailable,
      checkedAt: new Date().toISOString()
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }

  const databaseProbe = async (): Promise<Probe> => {
    const startedAt = performance.now();
    try {
      const { error } = await database
        .from('settings')
        .select('key')
        .limit(1)
        .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));
      const latencyMs = Math.round(performance.now() - startedAt);
      if (error) console.error('[SystemPulse] Database probe failed:', error);
      return error
        ? failedProbe('Supabase settings query failed.')
        : { status: probeStatus(latencyMs), latencyMs, detail: 'Connection query succeeded.' };
    } catch (error) {
      console.error('[SystemPulse] Database probe did not complete:', error);
      return failedProbe('Supabase database request failed.');
    }
  };

  const runnersProbe = async (): Promise<Probe> => {
    const startedAt = performance.now();
    try {
      const { count, error } = await database
        .from('rider_status')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'Offline')
        .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));
      const latencyMs = Math.round(performance.now() - startedAt);
      if (error) {
        console.error('[SystemPulse] Runner monitoring query failed:', error);
        return failedProbe(/rider_status|schema cache|does not exist/i.test(error.message)
          ? 'Rider database migration is missing.'
          : 'Rider status could not be queried.');
      }
      return {
        status: probeStatus(latencyMs),
        latencyMs,
        detail: `${count || 0} runner${count === 1 ? '' : 's'} online.`
      };
    } catch (error) {
      console.error('[SystemPulse] Runner monitoring request failed:', error);
      return failedProbe('Rider status request failed.');
    }
  };

  const dispatchProbe = async (): Promise<Probe> => {
    const startedAt = performance.now();
    try {
      const checks = await Promise.all([
        database.from('orders')
        .select('id,status,payment_method,payment_verified_at,checkout_request_id,customer_name,customer_email,total_price,latitude,longitude,note,created_at,rider_name,rider_phone')
        .limit(1)
        .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS)),
        database.from('rider_status')
        .select('id,rider_name,rider_phone,status,verification_status,area_zone,current_location,last_known_lat,last_known_lng,max_deliveries,health_score,location_updated_at,updated_at,battery_level,battery_updated_at,total_deliveries,rating,plate_number,vehicle_type,vehicle_reg,weekly_salary,runner_xp,runner_level,acceptance_rate,can_accept_orders,can_reject_orders,can_view_earnings')
        .limit(1)
        .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS)),
        database.from('rider_wallets')
        .select('balance,total_earned')
        .limit(1)
        .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS)),
        database.from('dispatch_decisions')
        .select('id,order_id,selected_rider_name,selected_rider_phone,selected_vendor_ids,decision_type,criteria,chosen_by,override_reason,created_at')
        .limit(1)
        .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS)),
        database.from('payment_confirmations')
        .select('order_id,provider,reference,amount_kobo,currency')
        .limit(1)
        .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS))
      ]);

      const migrationFailures = checks.flatMap((check, index) => {
        if (!check.error) return [];
        const messages = ['orders', 'rider status', 'rider wallets', 'dispatch decisions', 'payment confirmations'];
        console.error(`[SystemPulse] Dispatch ${messages[index]} probe failed:`, check.error);
        return [messages[index]];
      });
      const latencyMs = Math.round(performance.now() - startedAt);
      if (migrationFailures.length) {
        return failedProbe(`Dispatch dependencies unavailable: ${migrationFailures.join(', ')}.`);
      }
      return {
        status: probeStatus(latencyMs),
        latencyMs,
        detail: 'Order, rider, payment, and assignment data are reachable.'
      };
    } catch (error) {
      console.error('[SystemPulse] Dispatch monitoring request failed:', error);
      return failedProbe('Dispatch prerequisite check failed.');
    }
  };

  const [databaseStatus, runners, dispatch] = await Promise.all([
    databaseProbe(),
    runnersProbe(),
    dispatchProbe()
  ]);
  const databaseStatusWithContext = databaseStatus.status === 'unavailable'
    ? { ...databaseStatus, detail: 'Supabase database is unavailable.' }
    : databaseStatus;

  return NextResponse.json({
    database: databaseStatusWithContext,
    runners,
    dispatch,
    checkedAt: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
