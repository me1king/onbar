import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { getTransactionalEmailConfig } from '@/lib/jmsurfMail.server';
import { isWebPushConfigured } from '@/lib/webPush.server';
import {
  CUSTOMER_NOTIFICATION_CHANNELS,
  CUSTOMER_NOTIFICATION_STATUSES,
  normalizeCustomerNotificationConfig
} from '@/lib/customerMessaging';

export const dynamic = 'force-dynamic';

type EventStatus = 'success' | 'pending' | 'failed' | 'info';
type FlowStage = 'order' | 'payment' | 'merchant' | 'dispatch' | 'delivery' | 'customer_notification' | 'merchant_notification';
type FlowEvent = {
  id: string;
  orderId: number;
  stage: FlowStage;
  title: string;
  detail: string;
  status: EventStatus;
  occurredAt: string;
};
type OrderFlow = {
  id: number;
  status: string;
  createdAt: string;
  stages: {
    order: { status: EventStatus; label: string };
    payment: { status: EventStatus; label: string };
    merchant: { status: EventStatus; label: string };
    dispatch: { status: EventStatus; label: string };
    delivery: { status: EventStatus; label: string };
    notifications: { status: EventStatus; label: string };
    merchantNotifications: { status: EventStatus; label: string };
  };
};

function failureStatus(value: string) {
  return /failed|missed|no_device|rejected|exception|cancelled/i.test(value);
}

function deliveryStatus(value: string): EventStatus {
  if (value === 'sent' || value === 'delivered' || value === 'opened' || value === 'accepted') return 'success';
  if (value === 'failed' || value === 'missed' || value === 'no_device') return 'failed';
  if (value === 'sending') return 'pending';
  return 'info';
}

function notificationSummary(rows: Array<{ delivery_status: string; error_message: string | null }>) {
  if (!rows.length) return { status: 'pending' as const, label: 'No customer delivery recorded' };
  const sent = rows.filter(row => row.delivery_status === 'sent').length;
  const failed = rows.filter(row => row.delivery_status === 'failed' || Boolean(row.error_message)).length;
  const sending = rows.filter(row => row.delivery_status === 'sending').length;
  if (failed) return { status: 'failed' as const, label: `${sent} sent · ${failed} failed` };
  if (sending) return { status: 'pending' as const, label: `${sent} sent · ${sending} sending` };
  return { status: 'success' as const, label: `${sent} customer notification${sent === 1 ? '' : 's'} sent` };
}

function merchantNotificationSummary(rows: Array<{ status: string }>) {
  if (!rows.length) return { status: 'pending' as const, label: 'No merchant alert recorded' };
  const sent = rows.filter(row => ['sent', 'delivered', 'opened', 'accepted'].includes(row.status)).length;
  const failed = rows.filter(row => failureStatus(row.status)).length;
  if (failed) return { status: 'failed' as const, label: `${sent} sent · ${failed} failed` };
  if (sent) return { status: 'success' as const, label: `${sent} merchant alert${sent === 1 ? '' : 's'} sent` };
  return { status: 'pending' as const, label: 'Merchant alert is pending' };
}

function migrationWarning(source: string) {
  switch (source) {
    case 'order history': return 'Order history is unavailable; apply ORDER_FLOW_VISIBILITY_MIGRATION.sql.';
    case 'merchant fulfillment': return 'Merchant events are unavailable; apply MERCHANT_OPERATIONS_MIGRATION.sql.';
    case 'payment verification': return 'Payment confirmations are unavailable; apply DISPATCH_MIGRATION.sql.';
    case 'dispatch decisions': return 'Dispatch history is unavailable; apply DISPATCH_MIGRATION.sql.';
    case 'automatic dispatch queue': return 'Automatic dispatch queue is unavailable; apply ORDER_DISPATCH_AUTOMATION_MIGRATION.sql.';
    case 'customer notifications': return 'Customer delivery logs are unavailable; apply CUSTOMER_NOTIFICATION_AUTOMATION_MIGRATION.sql.';
    case 'merchant alerts and worker status': return 'Merchant alert history is unavailable; apply MERCHANT_ORDER_ALERTS_MIGRATION.sql.';
    default: return `${source} is unavailable.`;
  }
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (
    !hasAdminPermission(session, 'can_manage_orders')
    && !hasAdminPermission(session, 'can_manage_communications')
  ) {
    return NextResponse.json({ error: 'Order or communications access is required.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 });
  }

  try {
    const ordersResult = await database
      .from('orders')
      .select('id,status,payment_method,payment_verified_at,created_at,rider_name,rider_phone')
      .order('created_at', { ascending: false })
      .limit(20)
      .abortSignal(AbortSignal.timeout(8000));
    if (ordersResult.error) {
      console.error('[OperationsFlow] Could not load recent orders:', ordersResult.error);
      return NextResponse.json({ error: 'Recent order flow could not be loaded.' }, { status: 503 });
    }

    type OrderRow = {
      id: number;
      status: string | null;
      payment_method: string | null;
      payment_verified_at: string | null;
      created_at: string;
      rider_name: string | null;
      rider_phone: string | null;
    };
    type StatusRow = { id: number; order_id: number; from_status: string | null; to_status: string; actor_type: string; created_at: string };
    type MerchantEventRow = { id: number; order_id: number; event_type: string; occurred_at: string };
    type PaymentRow = { id: number; order_id: number; provider: string; verified_at: string };
    type DispatchRow = { id: number; order_id: number; selected_rider_name: string | null; decision_type: string; created_at: string };
    type DispatchJobRow = { order_id: number; status: string; attempt_count: number; last_error: string | null; updated_at: string };
    type NotificationRow = { id: number; order_id: number; notification_status: string; channel: string; delivery_status: string; error_message: string | null; created_at: string };
    type MerchantAlertRow = { id: number; order_id: number | null; channel: string; step: string; status: string; created_at: string };
    type HeartbeatRow = { worker_key: string; last_seen_at: string };

    const orders = (ordersResult.data || []) as OrderRow[];
    const orderIds = orders.map(order => order.id);
    const warnings: string[] = [];
    let statusRows: StatusRow[] = [];
    let merchantRows: MerchantEventRow[] = [];
    let paymentRows: PaymentRow[] = [];
    let dispatchRows: DispatchRow[] = [];
    let dispatchJobRows: DispatchJobRow[] = [];
    let notificationRows: NotificationRow[] = [];
    let merchantAlertRows: MerchantAlertRow[] = [];

    if (orderIds.length) {
      const [
        statusResult,
        merchantResult,
        paymentResult,
        dispatchResult,
        dispatchJobsResult,
        notificationResult,
        merchantAlertsResult
      ] = await Promise.all([
        database.from('order_status_events')
          .select('id,order_id,from_status,to_status,actor_type,created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false })
          .limit(500)
          .abortSignal(AbortSignal.timeout(8000)),
        database.from('merchant_fulfillment_events')
          .select('id,order_id,event_type,occurred_at')
          .in('order_id', orderIds)
          .order('occurred_at', { ascending: false })
          .limit(500)
          .abortSignal(AbortSignal.timeout(8000)),
        database.from('payment_confirmations')
          .select('id,order_id,provider,verified_at')
          .in('order_id', orderIds)
          .order('verified_at', { ascending: false })
          .limit(100)
          .abortSignal(AbortSignal.timeout(8000)),
        database.from('dispatch_decisions')
          .select('id,order_id,selected_rider_name,decision_type,created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false })
          .limit(100)
          .abortSignal(AbortSignal.timeout(8000)),
        database.from('order_dispatch_automation_jobs')
          .select('order_id,status,attempt_count,last_error,updated_at')
          .in('order_id', orderIds)
          .abortSignal(AbortSignal.timeout(8000)),
        database.from('customer_notification_deliveries')
          .select('id,order_id,notification_status,channel,delivery_status,error_message,created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false })
          .limit(300)
          .abortSignal(AbortSignal.timeout(8000)),
        database.from('merchant_order_alert_log')
          .select('id,order_id,channel,step,status,created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false })
          .limit(300)
          .abortSignal(AbortSignal.timeout(8000))
      ]);

      const optionalResults = [
        { name: 'order history', result: statusResult },
        { name: 'merchant fulfillment', result: merchantResult },
        { name: 'payment verification', result: paymentResult },
        { name: 'dispatch decisions', result: dispatchResult },
        { name: 'automatic dispatch queue', result: dispatchJobsResult },
        { name: 'customer notifications', result: notificationResult },
        { name: 'merchant alerts and worker status', result: merchantAlertsResult }
      ];
      for (const { name, result } of optionalResults) {
        if (result.error) {
          console.error(`[OperationsFlow] ${name} query failed:`, result.error);
          warnings.push(migrationWarning(name));
        }
      }

      statusRows = (statusResult.data || []) as StatusRow[];
      merchantRows = (merchantResult.data || []) as MerchantEventRow[];
      paymentRows = (paymentResult.data || []) as PaymentRow[];
      dispatchRows = (dispatchResult.data || []) as DispatchRow[];
      dispatchJobRows = (dispatchJobsResult.data || []) as DispatchJobRow[];
      notificationRows = (notificationResult.data || []) as NotificationRow[];
      merchantAlertRows = (merchantAlertsResult.data || []) as MerchantAlertRow[];
    }

    const [heartbeatResult, messagingSettingsResult] = await Promise.all([
      database.from('merchant_alert_worker_heartbeats')
        .select('worker_key,last_seen_at')
        .in('worker_key', ['default', 'order-dispatch'])
        .abortSignal(AbortSignal.timeout(8000)),
      database.from('settings')
        .select('value')
        .eq('key', 'customer_messaging')
        .abortSignal(AbortSignal.timeout(8000))
        .maybeSingle()
    ]);
    if (heartbeatResult.error) {
      console.error('[OperationsFlow] Worker heartbeat query failed:', heartbeatResult.error);
      if (!warnings.includes(migrationWarning('merchant alerts and worker status'))) {
        warnings.push(migrationWarning('merchant alerts and worker status'));
      }
    }
    if (messagingSettingsResult.error) {
      console.error('[OperationsFlow] Customer notification rules query failed:', messagingSettingsResult.error);
      warnings.push('Customer notification rules are unavailable; check the customer messaging settings table.');
    }

    const latestByOrder = <T extends { order_id: number }>(rows: T[]) => {
      const map = new Map<number, T>();
      for (const row of rows) if (!map.has(row.order_id)) map.set(row.order_id, row);
      return map;
    };
    const latestMerchant = latestByOrder(merchantRows);
    const latestPayment = latestByOrder(paymentRows);
    const latestDispatch = latestByOrder(dispatchRows);
    const dispatchJobs = new Map(dispatchJobRows.map(row => [row.order_id, row]));
    const notificationsByOrder = new Map<number, NotificationRow[]>();
    for (const row of notificationRows) {
      const current = notificationsByOrder.get(row.order_id) || [];
      current.push(row);
      notificationsByOrder.set(row.order_id, current);
    }
    const merchantAlertsByOrder = new Map<number, MerchantAlertRow[]>();
    for (const row of merchantAlertRows) {
      if (row.order_id === null) continue;
      const current = merchantAlertsByOrder.get(row.order_id) || [];
      current.push(row);
      merchantAlertsByOrder.set(row.order_id, current);
    }

    const timeline: FlowEvent[] = [];
    const addEvent = (event: FlowEvent) => timeline.push(event);
    for (const order of orders) {
      const orderStatus = order.status || 'Unknown';
      addEvent({
        id: `order-${order.id}`,
        orderId: order.id,
        stage: 'order',
        title: `Order #${order.id} placed`,
        detail: `Current status: ${orderStatus}`,
        status: orderStatus === 'Cancelled' ? 'failed' : 'success',
        occurredAt: order.created_at
      });
    }
    for (const event of statusRows) {
      addEvent({
        id: `status-${event.id}`,
        orderId: event.order_id,
        stage: ['Paid', 'Payment Failed', 'Refunded'].includes(event.to_status)
          || event.to_status.toLowerCase().includes('payment')
          ? 'payment'
          : 'order',
        title: `${event.from_status || 'Order created'} → ${event.to_status}`,
        detail: `Recorded by ${event.actor_type}`,
        status: failureStatus(event.to_status) ? 'failed' : 'success',
        occurredAt: event.created_at
      });
    }
    for (const payment of paymentRows) {
      addEvent({
        id: `payment-${payment.id}`,
        orderId: payment.order_id,
        stage: 'payment',
        title: `Payment verified · ${payment.provider}`,
        detail: 'Provider confirmation recorded',
        status: 'success',
        occurredAt: payment.verified_at
      });
    }
    for (const event of merchantRows) {
      const failed = failureStatus(event.event_type);
      addEvent({
        id: `merchant-${event.id}`,
        orderId: event.order_id,
        stage: 'merchant',
        title: `Merchant ${event.event_type.replaceAll('_', ' ')}`,
        detail: 'Fulfillment event recorded',
        status: failed ? 'failed' : 'success',
        occurredAt: event.occurred_at
      });
    }
    for (const decision of dispatchRows) {
      addEvent({
        id: `dispatch-${decision.id}`,
        orderId: decision.order_id,
        stage: 'dispatch',
        title: decision.selected_rider_name ? `Rider assigned · ${decision.selected_rider_name}` : 'Dispatch decision recorded',
        detail: decision.decision_type === 'admin_override' ? 'Admin override' : 'Automatic recommendation',
        status: decision.selected_rider_name ? 'success' : 'pending',
        occurredAt: decision.created_at
      });
    }
    for (const job of dispatchJobRows) {
      const jobStatus = job.status.toLowerCase();
      addEvent({
        id: `dispatch-job-${job.order_id}-${job.updated_at}`,
        orderId: job.order_id,
        stage: 'dispatch',
        title: `Automatic dispatch ${jobStatus.replaceAll('_', ' ')}`,
        detail: jobStatus === 'manual_review'
          ? job.last_error || 'Automatic retries exhausted; operator review is required.'
          : `${job.attempt_count} attempt${job.attempt_count === 1 ? '' : 's'} recorded`,
        status: jobStatus === 'assigned' || jobStatus === 'completed'
          ? 'success'
          : jobStatus === 'manual_review'
            ? 'failed'
            : 'pending',
        occurredAt: job.updated_at
      });
    }
    for (const notification of notificationRows) {
      addEvent({
        id: `customer-notification-${notification.id}`,
        orderId: notification.order_id,
        stage: 'customer_notification',
        title: `${notification.channel.toUpperCase()} ${notification.delivery_status} · ${notification.notification_status}`,
        detail: 'Customer delivery attempt',
        status: deliveryStatus(notification.delivery_status),
        occurredAt: notification.created_at
      });
    }
    for (const alert of merchantAlertRows) {
      if (alert.order_id === null) continue;
      addEvent({
        id: `merchant-alert-${alert.id}`,
        orderId: alert.order_id,
        stage: 'merchant_notification',
        title: `Merchant ${alert.channel} alert ${alert.status}`,
        detail: alert.step.replaceAll('_', ' '),
        status: deliveryStatus(alert.status),
        occurredAt: alert.created_at
      });
    }

    const flows: OrderFlow[] = orders.map(order => {
      const payment = latestPayment.get(order.id);
      const merchant = latestMerchant.get(order.id);
      const dispatchJob = dispatchJobs.get(order.id);
      const dispatchDecision = latestDispatch.get(order.id);
      const orderNotifications = notificationsByOrder.get(order.id) || [];
      const merchantAlerts = merchantAlertsByOrder.get(order.id) || [];
      const paymentVerified = Boolean(payment || order.payment_verified_at);
      const isCash = (order.payment_method || '').toLowerCase() === 'cod';
      const merchantEvent = merchant?.event_type || null;
      const hasRider = Boolean(order.rider_name || order.rider_phone);
      const orderStatus = order.status || 'Unknown';
      const notification = notificationSummary(orderNotifications);
      const merchantNotification = merchantNotificationSummary(merchantAlerts);
      const dispatchLabel = hasRider
        ? `Assigned${order.rider_name ? ` · ${order.rider_name}` : ''}`
        : dispatchJob
          ? `${dispatchJob.status.replaceAll('_', ' ')}${dispatchJob.status === 'retry' ? ` · attempt ${dispatchJob.attempt_count}` : ''}`
          : dispatchDecision
            ? 'Decision recorded · rider not on order'
            : 'Waiting for merchant readiness';

      return {
        id: order.id,
        status: orderStatus,
        createdAt: order.created_at,
        stages: {
          order: { status: 'success', label: `Placed ${new Date(order.created_at).toLocaleTimeString()}` },
          payment: paymentVerified
            ? { status: 'success', label: `Verified${payment?.provider ? ` · ${payment.provider}` : ''}` }
            : isCash
              ? { status: 'info', label: 'Cash due on delivery' }
              : orderStatus === 'Payment Failed'
                ? { status: 'failed', label: 'Payment failed' }
                : { status: 'pending', label: 'Awaiting payment' },
          merchant: merchantEvent
            ? { status: failureStatus(merchantEvent) ? 'failed' : 'success', label: merchantEvent.replaceAll('_', ' ') }
            : { status: 'pending', label: 'Awaiting merchant' },
          dispatch: hasRider
            ? { status: 'success', label: dispatchLabel }
            : ['manual_review', 'assigned', 'completed'].includes(dispatchJob?.status || '') || dispatchDecision
              ? { status: 'failed', label: dispatchLabel }
              : dispatchJob
                ? { status: 'pending', label: dispatchLabel }
                : { status: 'pending', label: dispatchLabel },
          delivery: ['Delivered', 'Completed'].includes(orderStatus)
            ? { status: 'success', label: orderStatus }
            : orderStatus === 'Cancelled' || orderStatus === 'Refunded'
              ? { status: 'failed', label: orderStatus }
              : { status: 'pending', label: orderStatus },
          notifications: notification,
          merchantNotifications: merchantNotification
        }
      };
    });

    const heartbeatRows = (heartbeatResult.data || []) as HeartbeatRow[];
    const now = Date.now();
    const workers = ['default', 'order-dispatch'].map(workerKey => {
      const heartbeat = heartbeatRows.find(row => row.worker_key === workerKey);
      const ageMs = heartbeat ? now - new Date(heartbeat.last_seen_at).getTime() : null;
      return {
        key: workerKey,
        status: ageMs === null ? 'unavailable' : ageMs > 90_000 ? 'stale' : 'online',
        lastSeenAt: heartbeat?.last_seen_at || null
      };
    });
    const providerReadiness = {
      email: getTransactionalEmailConfig().configured,
      sms: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && process.env.TWILIO_PHONE_NUMBER?.trim()),
      whatsapp: Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_ID?.trim()),
      push: isWebPushConfigured()
    };
    const notificationConfig = normalizeCustomerNotificationConfig(messagingSettingsResult.data?.value);
    const enabledNotificationStatuses = messagingSettingsResult.error
      ? []
      : CUSTOMER_NOTIFICATION_STATUSES.filter(status => notificationConfig[status].enabled);
    const enabledNotificationChannels = CUSTOMER_NOTIFICATION_CHANNELS.filter(channel =>
      enabledNotificationStatuses.some(status => notificationConfig[status].channels.includes(channel))
    );
    const flowsNeedingAttention = flows.filter(flow =>
      flow.stages.dispatch.status === 'failed'
      || flow.stages.notifications.status === 'failed'
      || flow.stages.merchant.status === 'failed'
      || flow.stages.merchantNotifications.status === 'failed'
    ).length;

    timeline.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      summary: {
        recentOrders: flows.length,
        paymentsVerified: flows.filter(flow => flow.stages.payment.status === 'success').length,
        merchantsReady: flows.filter(flow => ['ready', 'handed to rider', 'collected', 'delivered'].includes(
          (latestMerchant.get(flow.id)?.event_type || '').replaceAll('_', ' ')
        )).length,
        ridersAssigned: flows.filter(flow => flow.stages.dispatch.status === 'success').length,
        dispatchManualReview: flows.filter(flow => flow.stages.dispatch.status === 'failed').length,
        customerNotificationsSent: notificationRows.filter(row => row.delivery_status === 'sent').length,
        customerNotificationsFailed: notificationRows.filter(row => row.delivery_status === 'failed' || Boolean(row.error_message)).length,
        merchantNotificationsSent: merchantAlertRows.filter(row => ['sent', 'delivered', 'opened', 'accepted'].includes(row.status)).length,
        merchantNotificationsFailed: merchantAlertRows.filter(row => failureStatus(row.status)).length,
        flowsNeedingAttention
      },
      orders: flows,
      timeline: timeline.slice(0, 60),
      workers,
      providers: providerReadiness,
      internalNotificationBridge: Boolean(process.env.INTERNAL_API_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim()),
      notificationRules: {
        enabledStatuses: enabledNotificationStatuses.length,
        totalStatuses: CUSTOMER_NOTIFICATION_STATUSES.length,
        enabledChannels: enabledNotificationChannels,
        available: !messagingSettingsResult.error
      },
      warnings
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('[OperationsFlow] Could not assemble order-to-notification flow:', error);
    return NextResponse.json({ error: 'Order-to-notification flow could not be loaded.' }, { status: 503 });
  }
}
