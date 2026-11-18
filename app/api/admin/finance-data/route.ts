import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { findPaymentReviewCases } from '@/lib/paymentReview';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_view_revenue') && !hasAdminPermission(session, 'can_execute_payouts')) {
    return NextResponse.json({ error: 'Financial data access is required.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Server-side financial database access is not configured.' }, { status: 503 });

  const [ledger, products, taxEntries, reconciliation, onlineOrders] = await Promise.all([
    database.from('financial_ledger')
      .select('id, order_id, entry_type, amount, description, is_reconciled, created_at')
      .order('created_at', { ascending: false })
      .limit(1000),
    database.from('products').select('stock, cost_price, price').limit(5000),
    database.from('ledger_entries').select('amount, account_id').or('account_id.eq.2100,account_id.eq.2200').limit(5000),
    database.from('reconciliation_staging').select('is_matched, amount').limit(5000),
    database.from('orders')
      .select('id,status,payment_method,total_price,created_at')
      .in('payment_method', ['Paystack', 'PayHero', 'Daraja'])
      .order('created_at', { ascending: false })
      .limit(500)
  ]);

  const migrationHint = (error: { code?: string; message: string } | null, migration: string) => {
    if (!error) return null;
    const absent = error.code === '42P01' || error.code === 'PGRST205';
    return absent ? `Required table is missing; apply ${migration}.` : error.message;
  };

  let paymentReview: ReturnType<typeof findPaymentReviewCases> = [];
  let paymentReviewError = migrationHint(onlineOrders.error, 'supabase/FINAL_ESTABLISHMENT_SQL.sql');
  if (!onlineOrders.error && onlineOrders.data?.length) {
    const { data: confirmations, error: confirmationsError } = await database
      .from('payment_confirmations')
      .select('order_id,provider,amount_kobo,currency')
      .in('order_id', onlineOrders.data.map(order => order.id));
    paymentReviewError = migrationHint(confirmationsError, 'supabase/DISPATCH_MIGRATION.sql');
    if (!confirmationsError) {
      paymentReview = findPaymentReviewCases(onlineOrders.data, confirmations || []).slice(0, 100);
    }
  }

  return NextResponse.json({
    ledger: ledger.data || [],
    inventory: products.data || [],
    taxEntries: taxEntries.data || [],
    reconciliation: reconciliation.data || [],
    paymentReview,
    errors: {
      ledger: migrationHint(ledger.error, 'supabase/ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql'),
      inventory: migrationHint(products.error, 'supabase/FINAL_ESTABLISHMENT_SQL.sql'),
      tax: migrationHint(taxEntries.error, 'supabase/ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql'),
      reconciliation: migrationHint(reconciliation.error, 'supabase/ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql'),
      paymentReview: paymentReviewError
    }
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
