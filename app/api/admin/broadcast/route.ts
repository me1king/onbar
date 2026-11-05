import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { verifySessionCookie } from "@/lib/adminAuth";
import { cookies } from "next/headers";
import { createMarketingUnsubscribeToken } from '@/lib/marketingUnsubscribe';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';

async function getAdminSession() {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    return session && ['owner', 'admin'].includes(session.role) ? session : null;
}

function getAdminDatabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceKey) return null;
    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

export async function GET() {
    if (!await getAdminSession()) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }
    const adminDatabase = getAdminDatabase();
    if (!adminDatabase) {
        return NextResponse.json({ error: 'CRM database access is not configured on the server.' }, { status: 503 });
    }

    const [
        { data: segments, error: segmentError },
        { data: allReach, error: allReachError },
        { count: newsletterCount, error: newsletterError },
        { count: waitlistEmailCount, error: waitlistEmailError }
    ] = await Promise.all([
        adminDatabase.from('audience_segments').select('id, name').order('name'),
        adminDatabase.rpc('count_crm_marketing_recipients', { p_audience_segment_id: null }),
        adminDatabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('is_active', true),
        adminDatabase.from('market_waitlist').select('id', { count: 'exact', head: true })
            .eq('email_updates_consent', true).neq('status', 'UNSUBSCRIBED').is('unsubscribed_at', null)
    ]);
    const audienceLoadError = segmentError || allReachError || newsletterError || waitlistEmailError;
    if (audienceLoadError) {
        const error = audienceLoadError;
        console.error('[AdminBroadcast] Could not load consented audiences:', error);
        return NextResponse.json({
            error: `Could not load CRM audiences: ${error.message}`
        }, { status: 500 });
    }

    const segmentAudiences = await Promise.all((segments || []).map(async segment => {
        const { data, error } = await adminDatabase.rpc('count_crm_marketing_recipients', {
            p_audience_segment_id: segment.id
        });
        if (error) throw error;
        return { id: segment.id, name: segment.name, estimated_reach: Number(data) };
    })).catch(error => {
        console.error('[AdminBroadcast] Could not calculate segment reach:', error);
        return null;
    });
    if (!segmentAudiences) {
        return NextResponse.json({ error: 'Could not calculate consented audience reach.' }, { status: 500 });
    }

    return NextResponse.json({
        audiences: [
            { id: 'all', name: 'All opted-in customers', estimated_reach: Number(allReach) },
            ...segmentAudiences
        ],
        newsletter_count: newsletterCount || 0,
        waitlist_email_count: waitlistEmailCount || 0
    });
}

export async function POST(request: Request) {
    try {
        // SECURITY: Verify authorized admin session
        const session = await getAdminSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized Access Detected" }, { status: 401 });
        }

        const body = await request.json() as {
            channel?: unknown;
            subject?: unknown;
            message?: unknown;
            audience?: unknown;
            emailAudience?: unknown;
            schedule?: unknown;
        };
        const channel = body.channel;
        const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        const audience = typeof body.audience === 'string' ? body.audience : 'all';
        const emailAudience = body.emailAudience === 'waitlist' ? 'waitlist' : 'newsletter';

        if (
            typeof channel !== 'string'
            || !['email', 'whatsapp', 'in_app'].includes(channel)
            || !message
            || message.length > 5000
            || subject.length > 200
        ) {
            return NextResponse.json({ error: "Choose a delivery channel and enter a message under 5,000 characters." }, { status: 400 });
        }
        if (
            audience !== 'all'
            && (channel !== 'in_app' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(audience))
        ) {
            return NextResponse.json({ error: "Choose a supported in-app customer segment." }, { status: 400 });
        }

        if (body.schedule === 'later') {
            return NextResponse.json({ error: "Scheduled campaigns are not available yet. Select Instant to send now." }, { status: 400 });
        }

        if (channel === 'whatsapp') {
            return NextResponse.json({ error: "WhatsApp delivery is not configured. Choose In-App or Email instead." }, { status: 501 });
        }

        if (channel === 'in_app') {
            const adminDatabase = getAdminDatabase();
            if (!adminDatabase) {
                return NextResponse.json({ error: "CRM database access is not configured on the server." }, { status: 503 });
            }

            const { data: recipientCount, error: countError } = await adminDatabase.rpc('count_crm_marketing_recipients', {
                p_audience_segment_id: audience === 'all' ? null : audience
            });
            if (countError) throw countError;
            const totalRecipients = Number(recipientCount) || 0;
            if (!totalRecipients) {
                return NextResponse.json({ error: 'No customers in this audience have opted in to promotional in-app notifications.' }, { status: 409 });
            }
            const recipients: { user_id: string }[] = [];
            for (let offset = 0; offset < totalRecipients; offset += 500) {
                const { data, error } = await adminDatabase.rpc('crm_marketing_recipients', {
                    p_audience_segment_id: audience === 'all' ? null : audience
                }).range(offset, offset + 499);
                if (error) throw error;
                recipients.push(...(data || []));
            }
            if (recipients.length !== totalRecipients) {
                throw new Error(`Recipient query returned ${recipients.length} of ${totalRecipients} opted-in customers.`);
            }

            const campaignName = subject || 'Onbar in-app campaign';
            const { data: campaign, error: campaignError } = await adminDatabase
                .from('message_campaigns')
                .insert({
                    name: campaignName,
                    status: 'Sending',
                    sent_count: 0,
                    open_count: 0,
                    attributed_revenue: 0,
                    channel: 'in_app',
                    message,
                    audience_segment_id: audience === 'all' ? null : audience,
                    sent_by: session.email || 'owner'
                })
                .select('id')
                .single();
            if (campaignError) throw campaignError;

            let delivered = 0;
            let failed = 0;
            let deliveryAuditError: string | null = null;
            const recipientChunks = Array.from({ length: Math.ceil(recipients.length / 300) }, (_, index) =>
                recipients.slice(index * 300, (index + 1) * 300)
            );

            for (const chunk of recipientChunks) {
                const notifications = chunk.map((recipient: { user_id: string }) => ({
                    user_id: recipient.user_id,
                    title: campaignName,
                    message,
                    icon: 'Bell',
                    style: 'info'
                }));
                const { data: insertedNotifications, error: notificationError } = await adminDatabase
                    .from('user_notifications')
                    .insert(notifications)
                    .select('id, user_id');
                if (notificationError) {
                    failed += chunk.length;
                    deliveryAuditError = notificationError.message;
                    console.error('[AdminBroadcast] In-app campaign delivery failed:', notificationError);
                    break;
                }

                delivered += insertedNotifications?.length || 0;
                const deliveryRows = (insertedNotifications || []).map(notification => ({
                    campaign_id: campaign.id,
                    user_id: notification.user_id,
                    notification_id: notification.id,
                    status: 'sent'
                }));
                if (deliveryRows.length) {
                    const { error: auditError } = await adminDatabase
                        .from('message_campaign_deliveries')
                        .insert(deliveryRows);
                    if (auditError) {
                        deliveryAuditError = auditError.message;
                        console.error('[AdminBroadcast] In-app delivery audit failed:', auditError);
                        break;
                    }
                }
            }

            if (deliveryAuditError && delivered + failed < totalRecipients) {
                failed += totalRecipients - delivered - failed;
            }
            const campaignStatus = failed === 0 && !deliveryAuditError
                ? 'Sent'
                : delivered > 0 ? 'Partial' : 'Failed';
            const { error: updateError } = await adminDatabase
                .from('message_campaigns')
                .update({
                    status: campaignStatus,
                    sent_count: delivered,
                    failed_count: failed,
                    sent_at: new Date().toISOString()
                })
                .eq('id', campaign.id);
            if (updateError) {
                console.error('[AdminBroadcast] Campaign summary could not be updated:', updateError);
                return NextResponse.json({
                    error: 'Notifications were created, but the campaign summary could not be saved.',
                    delivered,
                    campaignId: campaign.id
                }, { status: 502 });
            }
            if (failed || deliveryAuditError) {
                return NextResponse.json({
                    error: `Campaign only partially completed. Delivered ${delivered} of ${totalRecipients}; ${deliveryAuditError || 'some recipients failed'}.`,
                    delivered,
                    failed,
                    campaignId: campaign.id
                }, { status: 502 });
            }
            return NextResponse.json({ success: true, count: delivered, campaignId: campaign.id });
        }

        const adminDatabase = getAdminDatabase();
        if (!adminDatabase) return NextResponse.json({ error: 'Marketing database access is not configured.' }, { status: 503 });

        const subscribers: { email: string }[] = [];
        if (emailAudience === 'waitlist') {
            for (let offset = 0; ; offset += 500) {
                const { data, error } = await adminDatabase
                    .from('market_waitlist')
                    .select('email')
                    .eq('email_updates_consent', true)
                    .neq('status', 'UNSUBSCRIBED')
                    .is('unsubscribed_at', null)
                    .order('id')
                    .range(offset, offset + 499);
                if (error) throw error;
                subscribers.push(...(data || []));
                if (!data || data.length < 500) break;
            }
        } else {
            for (let offset = 0; ; offset += 500) {
                const { data, error } = await adminDatabase
                    .from('newsletter_subscribers')
                    .select('email')
                    .eq('is_active', true)
                    .order('id')
                    .range(offset, offset + 499);
                if (error) throw error;
                subscribers.push(...(data || []));
                if (!data || data.length < 500) break;
            }
        }

        if (!subscribers.length) {
            return NextResponse.json({
                error: emailAudience === 'waitlist'
                    ? 'No waitlist members with active email-marketing consent are available.'
                    : 'No opted-in newsletter subscribers are available for this email campaign.'
            }, { status: 409 });
        }

        if (channel === 'email') {
            const emailConfig = getTransactionalEmailConfig();
            if (!emailConfig.configured || !emailConfig.from) {
                return NextResponse.json({ error: "Email delivery requires JMSURF_MAIL_KEY and a verified JMSURF_FROM_EMAIL on the server." }, { status: 503 });
            }

            const { data: campaign, error: campaignError } = await adminDatabase
                .from('message_campaigns')
                .insert({
                    name: subject || 'Onbar email campaign',
                    status: 'Sending',
                    sent_count: 0,
                    open_count: 0,
                    attributed_revenue: 0,
                    channel: 'email',
                    message,
                    sent_by: session.email || 'owner'
                })
                .select('id')
                .single();
            if (campaignError) throw campaignError;

            const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character] || character);
            const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
            const origin = new URL(request.url).origin;
            let delivered = 0;
            let failed = 0;
            let deliveryAuditError: string | null = null;
            for (let offset = 0; offset < subscribers.length; offset += 50) {
                const batch = subscribers.slice(offset, offset + 50);
                const results = await Promise.all(batch.map(async (sub, index) => {
                    const unsubscribeUrl = `${origin}/newsletter/unsubscribe?token=${encodeURIComponent(createMarketingUnsubscribeToken(sub.email))}`;
                    try {
                        const result = await sendTransactionalEmail({
                            from: emailConfig.from,
                            to: sub.email,
                            subject: subject || (emailAudience === 'waitlist' ? 'Online Bar ticket update' : 'Update from Online Bar Nairobi'),
                            text: `${message}\n\nYou received this because you opted in to Online Bar ${emailAudience === 'waitlist' ? 'event email updates' : 'newsletter emails'}. Unsubscribe: ${unsubscribeUrl}`,
                            idempotencyKey: `campaign-${campaign.id}-${offset + index}`,
                            html: `
                            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                                <h2 style="color: #ff6b00;">${emailAudience === 'waitlist' ? 'Online Bar Ticket Update' : 'Online Bar Nairobi Premium Update'}</h2>
                                <p>${safeMessage}</p>
                                <hr style="border: 1px solid #eee; margin: 20px 0;" />
                                <p style="font-size: 12px; color: #999;">You received this because you opted in to Online Bar ${emailAudience === 'waitlist' ? 'event email updates' : 'newsletter emails'}.</p>
                                <p style="font-size: 12px;"><a href="${unsubscribeUrl}">Unsubscribe from marketing emails</a></p>
                            </div>
                            `
                        });
                        return { error: null, messageId: result.messageId };
                    } catch (error) {
                        return {
                            error: { message: error instanceof Error ? error.message : 'Email provider rejected the message.' },
                            messageId: null
                        };
                    }
                }));
                const batchDelivered = results.filter(result => !result.error).length;
                const batchFailed = results.filter(result => Boolean(result.error)).length;
                delivered += batchDelivered;
                failed += batchFailed;
                const deliveryRows = batch.map((subscriber, index) => ({
                    campaign_id: campaign.id,
                    recipient_email: subscriber.email,
                    status: results[index].error ? 'failed' : 'sent',
                    error_message: results[index].error?.message || null
                }));
                const { error: deliveryError } = await adminDatabase
                    .from('message_campaign_deliveries')
                    .insert(deliveryRows);
                if (deliveryError) {
                    deliveryAuditError = deliveryError.message;
                    console.error('[AdminBroadcast] Email delivery audit failed:', deliveryError);
                    break;
                }
                const providerMessageUpdates = deliveryRows.flatMap((row, index) =>
                    results[index].messageId
                        ? [adminDatabase.from('message_campaign_deliveries')
                            .update({ provider_message_id: results[index].messageId })
                            .eq('campaign_id', campaign.id)
                            .eq('recipient_email', row.recipient_email)
                            .then(({ error }) => {
                                if (error) console.error('[AdminBroadcast] Email sent but provider message ID could not be saved:', error);
                            })]
                        : []
                );
                await Promise.all(providerMessageUpdates);
            }
            if (deliveryAuditError && delivered + failed < subscribers.length) {
                failed += subscribers.length - delivered - failed;
            }
            const campaignStatus = failed === 0 && !deliveryAuditError
                ? 'Sent'
                : delivered > 0 ? 'Partial' : 'Failed';
            const { error: updateError } = await adminDatabase
                .from('message_campaigns')
                .update({
                    status: campaignStatus,
                    sent_count: delivered,
                    failed_count: failed,
                    sent_at: new Date().toISOString()
                })
                .eq('id', campaign.id);
            if (updateError) {
                console.error('[AdminBroadcast] Email campaign summary could not be updated:', updateError);
                return NextResponse.json({
                    error: 'Emails were attempted, but the campaign summary could not be saved.',
                    delivered,
                    campaignId: campaign.id
                }, { status: 502 });
            }
            if (failed > 0 || deliveryAuditError) {
                console.error(`[AdminBroadcast] Email campaign partially completed: ${delivered} delivered, ${failed} failed.`);
                return NextResponse.json({
                    error: `Email campaign partially completed: ${delivered} delivered, ${failed} failed${deliveryAuditError ? `; delivery audit failed: ${deliveryAuditError}` : ''}.`,
                    delivered,
                    failed,
                    campaignId: campaign.id
                }, { status: 502 });
            }
            return NextResponse.json({ success: true, count: delivered, campaignId: campaign.id });
        }

        return NextResponse.json({ error: 'Unsupported campaign channel.' }, { status: 400 });

    } catch (error: unknown) {
        console.error("Broadcast Error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
