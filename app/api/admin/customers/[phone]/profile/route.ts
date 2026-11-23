import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

type CustomerOrderItem = {
  id: number;
  product_name: string;
  quantity: number;
  size: string | null;
  unit_price: number;
};

type CustomerOrder = {
  id: number;
  created_at: string;
  status: string;
  total_price: number;
  payment_method: string | null;
  note: string | null;
  referred_by_code: string | null;
  order_items: CustomerOrderItem[];
};

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

function phoneVariants(value: string) {
  const digits = value.replace(/\D/g, '');
  const variants = new Set([value.trim(), digits]);
  if (digits.startsWith('0') && digits.length === 10) {
    variants.add(`254${digits.slice(1)}`);
    variants.add(`+254${digits.slice(1)}`);
  } else if (digits.startsWith('254') && digits.length === 12) {
    variants.add(`0${digits.slice(3)}`);
    variants.add(`+${digits}`);
  }
  return Array.from(variants).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function relationName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  return isRecord(relation) && typeof relation.name === 'string' ? relation.name : null;
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || 'N/A';
}

function boundedScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : null;
}

function schemaUnavailable(error: { code?: string; message?: string }) {
  return ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(error.code || '')
    || /relation .* does not exist|column .* does not exist|schema cache/i.test(error.message || '');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Only senior management can access customer profiles.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Customer profile database access is not configured.' }, { status: 503 });
  }

  try {
    const { phone } = await params;
    const phoneKey = normalizePhone(phone);
    if (phoneKey.length < 7 || phoneKey.length > 15) {
      return NextResponse.json({ error: 'A valid customer phone number is required.' }, { status: 400 });
    }

    const variants = phoneVariants(phone);
    const { data: profiles, error: profileError } = await database
      .from('profiles')
      .select('*')
      .in('phone_number', variants);
    if (profileError) throw profileError;
    const profile = (profiles || []).find(candidate =>
      candidate.phone_number && normalizePhone(candidate.phone_number) === phoneKey
    ) || null;

    const orderPhones = new Set(variants);
    if (profile?.phone_number) {
      for (const variant of phoneVariants(profile.phone_number)) orderPhones.add(variant);
    }

    const orders = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await database
        .from('orders')
        .select('id,user_id,session_id,customer_name,customer_phone,customer_email,total_price,status,payment_method,note,referred_by_code,created_at')
        .in('customer_phone', Array.from(orderPhones))
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const matching = (data || []).filter(order =>
        normalizePhone(order.customer_phone || '') === phoneKey
      );
      orders.push(...matching);
      if (!data || data.length < pageSize) break;
    }

    if (!profile && orders.length === 0) {
      return NextResponse.json({ error: 'No customer profile or orders were found for this phone number.' }, { status: 404 });
    }

    const recentOrders = orders.slice(0, 100);
    const itemsByOrder = new Map<number, CustomerOrderItem[]>();
    for (let offset = 0; offset < orders.length; offset += 100) {
      const orderBatch = orders.slice(offset, offset + 100);
      const { data: orderItems, error: orderItemsError } = await database.from('order_items')
        .select('id,order_id,product_id,quantity,unit_price,size,products(name)')
        .in('order_id', orderBatch.map(order => order.id));
      if (orderItemsError) throw orderItemsError;
      for (const item of orderItems || []) {
        const productName = relationName(item.products)
          || (item.product_id ? `Product #${item.product_id}` : 'Product unavailable');
        const normalizedItem: CustomerOrderItem = {
          id: item.id,
          product_name: productName,
          quantity: Math.max(1, Number(item.quantity) || 1),
          size: item.size || null,
          unit_price: Number(item.unit_price) || 0
        };
        const orderItemsForOrder = itemsByOrder.get(item.order_id) || [];
        orderItemsForOrder.push(normalizedItem);
        itemsByOrder.set(item.order_id, orderItemsForOrder);
      }
    }

    const displayedOrders: CustomerOrder[] = recentOrders.map(order => ({
      id: order.id,
      created_at: order.created_at,
      status: order.status || 'Unknown',
      total_price: Number(order.total_price) || 0,
      payment_method: order.payment_method || null,
      note: order.note || null,
      referred_by_code: order.referred_by_code || null,
      order_items: itemsByOrder.get(order.id) || []
    }));

    const qualifyingOrders = orders.filter(order =>
      ['paid', 'delivered', 'completed'].includes(String(order.status || '').toLowerCase())
    );
    const lifetimeValue = qualifyingOrders.reduce((total, order) => total + (Number(order.total_price) || 0), 0);
    const chronologicalPurchases = qualifyingOrders
      .map(order => new Date(order.created_at).getTime())
      .filter(timestamp => Number.isFinite(timestamp))
      .sort((left, right) => left - right);
    const averageGapDays = chronologicalPurchases.length > 1
      ? chronologicalPurchases.slice(1).reduce((total, timestamp, index) =>
        total + (timestamp - chronologicalPurchases[index]) / 86_400_000, 0
      ) / (chronologicalPurchases.length - 1)
      : 0;
    const lastPurchaseAt = qualifyingOrders[0]?.created_at || null;
    const daysSinceLastOrder = lastPurchaseAt
      ? Math.max(0, (Date.now() - new Date(lastPurchaseAt).getTime()) / 86_400_000)
      : null;
    const churnRisk = averageGapDays > 0 && daysSinceLastOrder !== null
      ? Math.min(100, Math.max(0, Math.round((daysSinceLastOrder / averageGapDays - 1) * 50)))
      : null;
    const segment = qualifyingOrders.length === 0 ? 'New'
      : qualifyingOrders.length >= 5 && (daysSinceLastOrder || 0) <= 60 ? 'VIP'
        : (daysSinceLastOrder || 0) <= 30 ? 'Active'
          : (daysSinceLastOrder || 0) <= 60 ? 'At risk' : 'Lapsed';

    const warnings: string[] = [];
    const linkedSessionIds = [...new Set(orders
      .map(order => order.session_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const sessionQueries = [];
    if (profile?.id) {
      sessionQueries.push(database.from('customer_sessions')
        .select('id,user_id,anonymous_id,source_channel,entry_page,current_page,last_seen_at,total_active_time_sec,device_info,created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(100));
    }
    for (let index = 0; index < linkedSessionIds.length; index += 100) {
      sessionQueries.push(database.from('customer_sessions')
        .select('id,user_id,anonymous_id,source_channel,entry_page,current_page,last_seen_at,total_active_time_sec,device_info,created_at')
        .in('id', linkedSessionIds.slice(index, index + 100))
        .order('created_at', { ascending: false }));
    }
    const sessionResults = await Promise.all(sessionQueries);
    const sessionRows = sessionResults.flatMap(result => {
      if (result.error) {
        console.error('[CustomerProfile] Could not load linked customer sessions:', result.error);
        warnings.push('Some visit analytics could not be loaded.');
        return [];
      }
      return result.data || [];
    });
    const sessionsById = new Map(sessionRows.map(row => [row.id, row] as const));
    for (const order of orders) {
      if (!order.session_id || sessionsById.has(order.session_id)) continue;
      sessionsById.set(order.session_id, {
        id: order.session_id,
        user_id: order.user_id,
        anonymous_id: null,
        source_channel: null,
        entry_page: null,
        current_page: null,
        last_seen_at: order.created_at,
        total_active_time_sec: 0,
        device_info: null,
        created_at: order.created_at
      });
    }
    const uniqueSessions = [...sessionsById.values()]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    const sessionIds = [...new Set([...uniqueSessions.map(row => row.id), ...linkedSessionIds])];
    const eventSessionBatches = Array.from({ length: Math.ceil(sessionIds.length / 100) }, (_, index) =>
      sessionIds.slice(index * 100, index * 100 + 100)
    );
    const eventResults = await Promise.all(eventSessionBatches.map(batch => database.from('analytics_events')
      .select('event_name,session_id,page_url,payload,created_at')
      .in('session_id', batch)
      .order('created_at', { ascending: false })
      .limit(10000)));
    const eventsError = eventResults.find(result => result.error)?.error || null;
    if (eventsError) {
      console.error('[CustomerProfile] Could not load linked customer events:', eventsError);
      warnings.push('Some visit analytics could not be loaded.');
    }

    const eventRows = eventResults.flatMap(result => result.error ? [] : result.data || []);
    const eventPayload = (event: (typeof eventRows)[number]) =>
      isRecord(event.payload) ? event.payload : {};
    const eventCount = (name: string) => eventRows.filter(event =>
      String(event.event_name).toUpperCase() === name
    ).length;
    const pageEvents = eventRows.filter(event => String(event.event_name).toUpperCase() === 'PAGE_VIEW');
    const categoryValues = pageEvents.map(event => {
      const payload = eventPayload(event);
      return typeof payload.category === 'string' ? payload.category : '';
    });
    const searchEvents = eventRows.filter(event =>
      ['SEARCH', 'SEARCH_SUBMITTED'].includes(String(event.event_name).toUpperCase())
    );
    const searchTerms = searchEvents.map(event => {
      const payload = eventPayload(event);
      const term = payload.searchTerm || payload.search_term || payload.query;
      return typeof term === 'string' ? term.trim() : '';
    });
    const zeroResultEvents = eventRows.filter(event =>
      ['ZERO_RESULTS', 'HALLOWEEN_ZERO_RESULTS'].includes(String(event.event_name).toUpperCase())
    );
    const zeroResultTerms = zeroResultEvents.map(event => {
      const payload = eventPayload(event);
      const term = payload.query || payload.searchTerm || payload.search_term;
      return typeof term === 'string' ? term.trim() : '';
    });
    const scrollDepths = eventRows.flatMap(event => {
      const payload = eventPayload(event);
      const eventName = String(event.event_name).toUpperCase();
      const depth = Number(payload.max_scroll ?? payload.scrollDepth ?? payload.scroll_depth);
      if (Number.isFinite(depth)) return [Math.min(100, Math.max(0, depth))];
      const milestone = /^SCROLL_(25|50|75|90|100)$/.exec(eventName);
      return milestone ? [Number(milestone[1])] : [];
    });
    const deviceNames = uniqueSessions.map(session => {
      const deviceInfo = isRecord(session.device_info) ? session.device_info : {};
      const device = deviceInfo.device || deviceInfo.type;
      return typeof device === 'string' ? device : '';
    });
    const eventsBySession = new Map<string, typeof eventRows>();
    for (const event of eventRows) {
      if (!event.session_id) continue;
      const sessionEvents = eventsBySession.get(event.session_id) || [];
      sessionEvents.push(event);
      eventsBySession.set(event.session_id, sessionEvents);
    }
    const displayedSessions = uniqueSessions.slice(0, 5).map(session => {
      const eventsForSession = eventsBySession.get(session.id) || [];
      return {
        id: session.id,
        created_at: session.created_at,
        source_channel: session.source_channel || 'Checkout session',
        total_active_time_sec: Number(session.total_active_time_sec) || 0,
        pages_viewed: eventsForSession.filter(event => String(event.event_name).toUpperCase() === 'PAGE_VIEW').length,
        clicks_count: eventsForSession.filter(event => String(event.event_name).toUpperCase() === 'UI_INTERACTION').length
      };
    });

    const allOrderIds = orders.map(order => Number(order.id)).filter(Number.isSafeInteger);
    const orderIdBatches = Array.from({ length: Math.ceil(allOrderIds.length / 100) }, (_, index) =>
      allOrderIds.slice(index * 100, index * 100 + 100)
    );
    const [complaintResults, productReviewResults] = await Promise.all([
      Promise.all(orderIdBatches.map(orderIds => database.from('customer_order_complaints')
        .select('id', { count: 'exact', head: true }).in('order_id', orderIds))),
      profile?.id
        ? Promise.all(orderIdBatches.map(orderIds => database.from('reviews').select('rating,verified_order_id')
          .eq('customer_user_id', profile.id).eq('is_hidden', false).in('verified_order_id', orderIds)))
        : Promise.resolve([])
    ]);
    const complaintError = complaintResults.find(result => result.error)?.error;
    const productReviewError = productReviewResults.find(result => result.error)?.error;
    if (complaintError) {
      console.error('[CustomerProfile] Could not load customer complaint count:', complaintError);
      warnings.push('Complaint totals could not be loaded.');
    }
    if (productReviewError) {
      console.error('[CustomerProfile] Could not load customer product review scores:', productReviewError);
      warnings.push('Product review scores could not be loaded.');
    }
    const complaintCount = complaintError ? null : complaintResults.reduce((total, result) => total + (result.count || 0), 0);
    const productReviewRows = productReviewError ? [] : productReviewResults.flatMap(result => result.data || []);

    const anonymousIds = [...new Set(uniqueSessions
      .map(row => row.anonymous_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const consentResult = profile?.id
      ? await database.from('user_consent')
        .select('analytics,marketing,in_app_marketing,personalization,updated_at')
        .eq('user_id', profile.id).maybeSingle()
      : anonymousIds.length
        ? await database.from('user_consent')
          .select('analytics,marketing,in_app_marketing,personalization,updated_at')
          .in('anonymous_id', anonymousIds)
          .order('updated_at', { ascending: false }).limit(1)
        : { data: [], error: null };
    if (consentResult.error) {
      console.error('[CustomerProfile] Could not load customer consent:', consentResult.error);
      warnings.push('Consent preferences could not be loaded.');
    }

    const referralResult = profile?.id
      ? await database.from('loyalty_referrals')
        .select('referred_profile_id', { count: 'exact', head: true })
        .eq('referrer_profile_id', profile.id)
      : { count: null, error: null };
    if (referralResult.error) {
      console.error('[CustomerProfile] Could not load referral count:', referralResult.error);
      warnings.push('Referral totals could not be loaded.');
    }

    const idCheckResults = await Promise.all(orderIdBatches.map(orderIds =>
      database.from('orders').select('customer_id_checked_at').in('id', orderIds)
    ));
    const idCheckError = idCheckResults.find(result => result.error)?.error;
    if (idCheckError) {
      console.error('[CustomerProfile] Could not load delivery ID-check history:', idCheckError);
      warnings.push('Delivery ID-check history could not be loaded.');
    }

    const [intelligenceResult, preferencesResult, aggregateResult] = profile?.id
      ? await Promise.all([
        database.from('customer_intelligence').select('intent_score,churn_risk_score,predicted_next_action')
          .eq('user_id', profile.id).maybeSingle(),
        database.from('customer_product_preferences').select('category_id,affinity_score')
          .eq('user_id', profile.id),
        database.from('customer_aggregate_metrics').select('*').eq('user_id', profile.id).maybeSingle()
      ])
      : [{ data: null, error: null }, { data: [], error: null }, { data: null, error: null }];
    if (intelligenceResult.error || preferencesResult.error || aggregateResult.error) {
      const optionalError = intelligenceResult.error || preferencesResult.error || aggregateResult.error;
      console.error('[CustomerProfile] Could not load saved customer insights:', optionalError);
      warnings.push('Some saved customer insights could not be loaded.');
    }
    const savedAggregate = aggregateResult.data;
    const aggregateCount = (value: unknown, fallback: number) => {
      const savedValue = Number(value);
      return Number.isFinite(savedValue) ? Math.max(fallback, savedValue) : fallback;
    };

    const intentEvents = eventRows.filter(event => {
      const timestamp = new Date(event.created_at).getTime();
      const age = Date.now() - timestamp;
      return Number.isFinite(timestamp) && age >= 0 && age <= 48 * 60 * 60 * 1000;
    });
    const derivedIntent = Math.min(100,
      intentEvents.filter(event => String(event.event_name).toUpperCase() === 'ADD_TO_CART').length * 20
      + intentEvents.filter(event => String(event.event_name).toUpperCase() === 'CHECKOUT_START').length * 35
      + intentEvents.filter(event => String(event.event_name).toUpperCase() === 'PRODUCT_VIEW').length * 5
    );
    const savedIntent = boundedScore(intelligenceResult.data?.intent_score);
    const savedChurn = boundedScore(intelligenceResult.data?.churn_risk_score);
    const predictedNextAction = typeof intelligenceResult.data?.predicted_next_action === 'string'
      ? intelligenceResult.data.predicted_next_action.trim()
      : '';
    const recentSessionIds = new Set(uniqueSessions.slice(0, 5).map(session => session.id));
    const recentEvents = eventRows.filter(event => recentSessionIds.has(event.session_id || ''));
    const recentEventCount = (...names: string[]) => recentEvents.filter(event =>
      names.includes(String(event.event_name).toUpperCase())
    ).length;
    const frustrationCounts = {
      rage_clicks: recentEventCount('RAGE_CLICK'),
      dead_clicks: recentEventCount('DEAD_CLICK'),
      errors: recentEventCount('FORM_VALIDATION_FAILED', 'PAYMENT_FAIL', 'MPESA_TIMEOUT')
    };
    const frustrationScore = eventsError || !sessionIds.length || !recentEvents.length
      ? null
      : Math.min(100, frustrationCounts.rage_clicks * 10
        + frustrationCounts.dead_clicks * 5
        + frustrationCounts.errors * 15);

    const eventName = (event: (typeof eventRows)[number]) => String(event.event_name).toUpperCase();
    const eventDetail = (event: (typeof eventRows)[number]) => eventPayload(event);
    const orderSessionIds = new Set(qualifyingOrders
      .map(order => order.session_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0));
    const checkoutStartEvents = recentEvents.filter(event => eventName(event) === 'CHECKOUT_START');
    const latestIncompleteCheckout = checkoutStartEvents.find(event =>
      event.session_id && !orderSessionIds.has(event.session_id)
    );
    const checkoutStepLabels: Record<string, string> = {
      'checkout.customer_name': 'Customer details',
      'checkout.customer_phone': 'Customer details',
      'checkout.customer_email': 'Customer details',
      'checkout.delivery_region': 'Delivery area',
      'checkout.delivery_building': 'Delivery address',
      'checkout.delivery_landmark': 'Delivery address',
      'checkout.payment_method': 'Payment selection',
      'checkout.place_order': 'Payment / order submission'
    };
    const focusedCheckoutEvent = latestIncompleteCheckout?.session_id
      ? [...recentEvents].reverse().find(event =>
        event.session_id === latestIncompleteCheckout.session_id
        && ['FORM_FIELD_FOCUSED', 'FORM_VALIDATION_FAILED', 'PAYMENT_FAIL', 'MPESA_TIMEOUT'].includes(eventName(event))
      )
      : null;
    const focusedCheckoutId = focusedCheckoutEvent
      ? eventDetail(focusedCheckoutEvent).id || eventDetail(focusedCheckoutEvent).field
      : null;
    const checkoutDropOffStep = latestIncompleteCheckout
      ? focusedCheckoutEvent && ['PAYMENT_FAIL', 'MPESA_TIMEOUT'].includes(eventName(focusedCheckoutEvent))
        ? 'Payment prompt'
        : focusedCheckoutEvent && ['FORM_VALIDATION_FAILED'].includes(eventName(focusedCheckoutEvent))
          ? 'Customer details validation'
          : typeof focusedCheckoutId === 'string'
            ? checkoutStepLabels[focusedCheckoutId] || focusedCheckoutId
            : 'Checkout started; last step not captured'
      : null;

    const issueEvents = recentEvents.filter(event =>
      ['PAYMENT_FAIL', 'MPESA_TIMEOUT', 'FORM_VALIDATION_FAILED', 'RAGE_CLICK', 'DEAD_CLICK'].includes(eventName(event))
    );
    const latestIssue = issueEvents[0];
    const latestIssuePayload = latestIssue ? eventDetail(latestIssue) : {};
    const issueDetail = [latestIssuePayload.message, latestIssuePayload.reason, latestIssuePayload.step]
      .find(value => typeof value === 'string' && value.trim());
    const lastSessionIssue = latestIssue
      ? eventName(latestIssue) === 'MPESA_TIMEOUT' ? 'M-Pesa prompt timed out'
        : eventName(latestIssue) === 'PAYMENT_FAIL' ? 'Payment attempt failed'
          : eventName(latestIssue) === 'FORM_VALIDATION_FAILED' ? 'Checkout form validation failed'
            : eventName(latestIssue) === 'RAGE_CLICK' ? 'Repeated clicks detected'
              : 'Unresponsive click detected'
      : latestIncompleteCheckout ? 'Checkout started without a completed order'
        : null;

    const sessionStartTimes = new Map(sessionRows.map(session => [
      session.id,
      new Date(session.created_at).getTime()
    ] as const));
    const timeToOrderSeconds = qualifyingOrders.flatMap(order => {
      if (!order.session_id) return [];
      const sessionStartedAt = sessionStartTimes.get(order.session_id);
      const orderCreatedAt = new Date(order.created_at).getTime();
      if (!sessionStartedAt || !Number.isFinite(orderCreatedAt) || orderCreatedAt < sessionStartedAt) return [];
      return [(orderCreatedAt - sessionStartedAt) / 1000];
    });
    const averageTimeToOrderSeconds = timeToOrderSeconds.length
      ? Math.round(timeToOrderSeconds.reduce((total, seconds) => total + seconds, 0) / timeToOrderSeconds.length)
      : null;
    const paymentMethods = new Map<string, number>();
    for (const order of qualifyingOrders) {
      const method = typeof order.payment_method === 'string' ? order.payment_method.trim() : '';
      if (method) paymentMethods.set(method, (paymentMethods.get(method) || 0) + 1);
    }
    const preferredPaymentMethodRaw = [...paymentMethods.entries()]
      .sort((left, right) => right[1] - left[1])[0]?.[0] || null;
    const preferredPaymentMethod = preferredPaymentMethodRaw === 'Paystack'
      ? 'M-Pesa (Paystack)'
      : preferredPaymentMethodRaw;
    const paymentFailureEvents = eventRows.filter(event =>
      ['PAYMENT_FAIL', 'MPESA_TIMEOUT'].includes(eventName(event))
    );
    const failedOrders = orders.filter(order =>
      ['payment_failed', 'payment failed', 'failed'].includes(String(order.status || '').toLowerCase())
    );
    const paymentFailureSessions = new Set(paymentFailureEvents
      .map(event => event.session_id)
      .filter((id): id is string => Boolean(id)));
    const paymentFailureCount = paymentFailureEvents.length + failedOrders.filter(order =>
      !order.session_id || !paymentFailureSessions.has(order.session_id)
    ).length;
    const zeroResultCounts = new Map<string, number>();
    for (const term of zeroResultTerms) {
      if (term) zeroResultCounts.set(term, (zeroResultCounts.get(term) || 0) + 1);
    }
    const topSearchCounts = new Map<string, number>();
    for (const term of searchTerms) {
      if (term) topSearchCounts.set(term, (topSearchCounts.get(term) || 0) + 1);
    }
    const topSearchTerms = [...topSearchCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([term, count]) => ({ term, count }));
    const zeroResultSearchTerms = [...zeroResultCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([term, count]) => ({ term, count }));
    const consent = Array.isArray(consentResult.data) ? consentResult.data[0] || null : consentResult.data;
    const idChecks = (idCheckError ? [] : idCheckResults.flatMap(result => result.data || []))
      .map(order => order.customer_id_checked_at)
      .filter((value): value is string => typeof value === 'string')
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());
    const discountedOrderCount = qualifyingOrders.filter(order => /\bCoupon\s*:/i.test(order.note || '')).length;
    const productReviewRatings = productReviewRows
      .map(review => Number(review.rating))
      .filter(rating => Number.isFinite(rating) && rating >= 1 && rating <= 5);
    const averageBasket = qualifyingOrders.length ? lifetimeValue / qualifyingOrders.length : 0;
    const itemCounts = new Map<string, { name: string; quantity: number }>();
    const orderPatterns = new Map<string, { label: string; count: number }>();
    for (const order of qualifyingOrders) {
      const orderItems = itemsByOrder.get(Number(order.id)) || [];
      const patternParts = orderItems.map(item =>
        `${item.quantity}x ${item.product_name}${item.size ? ` (${item.size})` : ''}`
      );
      if (patternParts.length) {
        const pattern = patternParts.sort().join(', ');
        const previousPattern = orderPatterns.get(pattern);
        orderPatterns.set(pattern, { label: pattern, count: (previousPattern?.count || 0) + 1 });
      }
      for (const item of orderItems) {
        const previousItem = itemCounts.get(item.product_name);
        itemCounts.set(item.product_name, {
          name: item.product_name,
          quantity: (previousItem?.quantity || 0) + item.quantity
        });
      }
    }
    const topItems = [...itemCounts.values()].sort((left, right) => right.quantity - left.quantity).slice(0, 3);
    const usualOrder = [...orderPatterns.values()].sort((left, right) => right.count - left.count)[0]?.label || '';

    let loyalty: {
      balance: number;
      totalEarned: number;
      totalRedeemed: number;
      ledger: { id: number; amount: number; description: string; created_at: string }[];
      dailyRewards: { id: number; reward_type: string; reward_label: string; reward_value: number; created_at: string }[];
      gifts: { id: number; code: string; discount_percent: number; discount_amount: number; is_active: boolean; created_at: string }[];
      rewardOptions: {
        box: { label: string; chance: number; value: number; type: string }[];
        spin: { label: string; chance: number; value: number; type: string }[];
      };
    } | null = null;
    if (profile?.id) {
      const [ledgerResult, dailyRewardsResult, giftsResult, loyaltyConfigResult] = await Promise.all([
        database.from('loyalty_ledger')
          .select('id,amount,description,created_at')
          .eq('profile_id', profile.id)
          .order('created_at', { ascending: false })
          .range(0, 999),
        database.from('daily_rewards_log')
          .select('id,reward_type,reward_label,reward_value,created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(100),
        database.from('coupons')
          .select('id,code,discount_percent,discount_amount,is_active,created_at')
          .eq('owner_profile_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(100),
        database.from('loyalty_config')
          .select('value')
          .eq('id', true)
          .maybeSingle()
      ]);
      const entries = [...(ledgerResult.data || [])];
      let ledgerPaginationError = null;
      if (!ledgerResult.error) {
        for (let offset = 1000; ; offset += 1000) {
          const { data: nextEntries, error } = await database.from('loyalty_ledger')
            .select('id,amount,description,created_at')
            .eq('profile_id', profile.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + 999);
          if (error) {
            ledgerPaginationError = error;
            break;
          }
          entries.push(...(nextEntries || []));
          if (!nextEntries || nextEntries.length < 1000) break;
        }
      }
      const loyaltyError = ledgerResult.error || ledgerPaginationError
        || dailyRewardsResult.error || giftsResult.error || loyaltyConfigResult.error;
      if (loyaltyError) {
        console.error('[CustomerProfile] Could not load customer loyalty details:', loyaltyError);
        warnings.push('Customer loyalty history, rewards, or gifts could not be loaded. Verify the loyalty database migration.');
      } else {
        const rewardConfig = loyaltyConfigResult.data?.value?.rewards;
        const rewardOptions = (value: unknown) => Array.isArray(value)
          ? value.filter((reward): reward is { label: string; chance: number; value: number; type: string } =>
              typeof reward === 'object' && reward !== null
              && typeof reward.label === 'string'
              && typeof reward.chance === 'number'
              && typeof reward.value === 'number'
              && typeof reward.type === 'string')
          : [];
        loyalty = {
          balance: Number(profile.loyalty_points || 0),
          totalEarned: entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0),
          totalRedeemed: Math.abs(entries.reduce((sum, entry) => sum + Math.min(0, Number(entry.amount) || 0), 0)),
          ledger: entries.slice(0, 100).map(entry => ({
            id: Number(entry.id),
            amount: Number(entry.amount) || 0,
            description: entry.description,
            created_at: entry.created_at
          })),
          dailyRewards: (dailyRewardsResult.data || []).map(reward => ({
            id: Number(reward.id),
            reward_type: reward.reward_type,
            reward_label: reward.reward_label,
            reward_value: Number(reward.reward_value) || 0,
            created_at: reward.created_at
          })),
          gifts: (giftsResult.data || []).map(gift => ({
            id: Number(gift.id),
            code: gift.code,
            discount_percent: Number(gift.discount_percent) || 0,
            discount_amount: Number(gift.discount_amount) || 0,
            is_active: Boolean(gift.is_active),
            created_at: gift.created_at
          })),
          rewardOptions: {
            box: rewardOptions(rewardConfig?.crate_probabilities),
            spin: rewardOptions(rewardConfig?.spin_probabilities)
          }
        };
      }
    }

    return NextResponse.json({
      customer: {
        isRegistered: Boolean(profile),
        profile: {
          id: profile?.id || '',
          public_id: profile?.public_id || (profile ? 'CUSTOMER' : 'GUEST'),
          full_name: profile?.full_name || orders[0]?.customer_name || `Guest ${phone}`,
          phone_number: profile?.phone_number || orders[0]?.customer_phone || phone,
          email: profile?.email || orders[0]?.customer_email || '',
          address: profile?.address || '',
          latitude: profile?.latitude !== null && profile?.latitude !== undefined && Number.isFinite(Number(profile.latitude))
            ? Number(profile.latitude)
            : null,
          longitude: profile?.longitude !== null && profile?.longitude !== undefined && Number.isFinite(Number(profile.longitude))
            ? Number(profile.longitude)
            : null,
          created_at: profile?.created_at || orders[orders.length - 1]?.created_at || new Date().toISOString(),
          status_flag: segment,
          lifetime_value: lifetimeValue,
          total_orders: qualifyingOrders.length,
          loyalty_points: Number(profile?.loyalty_points || 0)
        },
        loyalty,
        aggregate: {
          total_sessions: aggregateCount(savedAggregate?.total_sessions, uniqueSessions.length),
          total_active_time_sec: aggregateCount(
            savedAggregate?.total_active_time_sec,
            uniqueSessions.reduce((total, row) => total + (Number(row.total_active_time_sec) || 0), 0)
          ),
          total_pages_viewed: aggregateCount(savedAggregate?.total_pages_viewed, eventCount('PAGE_VIEW')),
          total_products_viewed: aggregateCount(savedAggregate?.total_products_viewed, eventCount('PRODUCT_VIEW')),
          total_clicks: aggregateCount(savedAggregate?.total_clicks, eventCount('UI_INTERACTION')),
          avg_scroll_depth: scrollDepths.length
            ? scrollDepths.reduce((total, value) => total + value, 0) / scrollDepths.length
            : 0,
          total_cart_additions: aggregateCount(savedAggregate?.total_cart_additions, eventCount('ADD_TO_CART')),
          total_cart_removals: aggregateCount(savedAggregate?.total_cart_removals, eventCount('REMOVE_FROM_CART')),
          total_checkouts_started: aggregateCount(savedAggregate?.total_checkouts_started, eventCount('CHECKOUT_START')),
          total_rage_clicks: aggregateCount(savedAggregate?.total_rage_clicks, eventCount('RAGE_CLICK')),
          total_dead_clicks: aggregateCount(savedAggregate?.total_dead_clicks, eventCount('DEAD_CLICK')),
          top_traffic_source: countBy(uniqueSessions.map(row => row.source_channel || '')) === 'N/A'
            ? savedAggregate?.top_traffic_source || 'N/A'
            : countBy(uniqueSessions.map(row => row.source_channel || '')),
          preferred_device: countBy(deviceNames) === 'N/A'
            ? savedAggregate?.preferred_device || 'N/A'
            : countBy(deviceNames),
          most_visited_category: countBy(categoryValues) === 'N/A'
            ? savedAggregate?.most_visited_category || 'N/A'
            : countBy(categoryValues),
          most_searched_term: countBy(searchTerms) === 'N/A'
            ? savedAggregate?.most_searched_term || 'N/A'
            : countBy(searchTerms)
        },
        intelligence: {
          intent_score: savedIntent ?? derivedIntent,
          churn_risk_score: savedChurn ?? churnRisk,
          predicted_next_action: predictedNextAction || (averageGapDays > 0
            ? `Usually orders every ${Math.max(1, Math.round(averageGapDays))} days. Last qualifying order was ${Math.round(daysSinceLastOrder || 0)} days ago.`
            : 'More completed orders are needed to identify a reliable ordering rhythm.')
        },
        sessions: displayedSessions,
        orders: displayedOrders,
        preferences: preferencesResult.error ? [] : preferencesResult.data || [],
        summary: {
          total_orders: qualifyingOrders.length,
          lifetime_value: lifetimeValue,
          average_basket: averageBasket,
          last_order_at: lastPurchaseAt,
          days_since_last_order: daysSinceLastOrder === null ? null : Math.floor(daysSinceLastOrder),
          average_gap_days: averageGapDays ? Math.round(averageGapDays) : null,
          segment,
          churn_risk_available: savedChurn !== null || averageGapDays > 0,
          usual_order: usualOrder,
          top_items: topItems
        },
        experience: {
          frustration_score: frustrationScore,
          frustration_counts: frustrationCounts,
          last_session_issue: lastSessionIssue
            ? issueDetail ? `${lastSessionIssue}: ${String(issueDetail).slice(0, 120)}` : lastSessionIssue
            : null,
          average_time_to_order_seconds: averageTimeToOrderSeconds,
          average_scroll_depth: scrollDepths.length
            ? Math.round(scrollDepths.reduce((total, depth) => total + depth, 0) / scrollDepths.length)
            : null,
          top_search_terms: topSearchTerms,
          zero_result_search_count: zeroResultEvents.length,
          zero_result_search_terms: zeroResultSearchTerms,
          checkout_drop_off_step: checkoutDropOffStep,
          preferred_payment_method: preferredPaymentMethod,
          payment_failure_count: paymentFailureCount,
          consent: consent ? {
            analytics: consent.analytics === true,
            marketing: consent.marketing === true,
            in_app_marketing: consent.in_app_marketing === true,
            personalization: consent.personalization === true,
            updated_at: typeof consent.updated_at === 'string' ? consent.updated_at : null
          } : null,
          age_verification_status: idCheckError ? 'Unavailable'
            : idChecks.length ? 'Verified at delivery'
              : profile?.birth_date ? 'Date of birth on file; ID not checked at delivery'
                : 'No delivery ID check recorded',
          last_id_check_at: idChecks[0] || null,
          rider_rating_given: null,
          complaint_count: complaintCount,
          average_product_rating: productReviewError ? null : productReviewRatings.length
            ? productReviewRatings.reduce((total, rating) => total + rating, 0) / productReviewRatings.length
            : null,
          discounted_order_count: discountedOrderCount,
          promo_dependency_percent: qualifyingOrders.length
            ? Math.round(discountedOrderCount / qualifyingOrders.length * 100)
            : null,
          referral_count: profile?.id && !referralResult.error ? referralResult.count || 0 : null
        },
        warnings: [...new Set(warnings)]
      }
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('[CustomerProfile] Could not load customer profile:', error);
    const databaseError = isRecord(error)
      ? { code: typeof error.code === 'string' ? error.code : '', message: typeof error.message === 'string' ? error.message : '' }
      : {};
    if (schemaUnavailable(databaseError)) {
      return NextResponse.json({
        error: 'Customer profile tables are not ready. Apply the required Supabase schema migrations, then retry.'
      }, { status: 503 });
    }
    return NextResponse.json({ error: 'Customer profile data could not be loaded.' }, { status: 500 });
  }
}
