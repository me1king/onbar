import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { verifySessionCookie } from "@/lib/adminAuth";
import { cookies } from "next/headers";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: Request) {
    try {
        // SECURITY: Verify authorized admin session
        const cookieStore = await cookies();
        const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);

        if (!session || session.role !== 'owner') {
            return NextResponse.json({ error: "Unauthorized Access Detected 🛡️" }, { status: 401 });
        }

        const body = await request.json() as {
            channel?: unknown;
            subject?: unknown;
            message?: unknown;
            audience?: unknown;
            schedule?: unknown;
        };
        const channel = body.channel;
        const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
        const message = typeof body.message === 'string' ? body.message.trim() : '';

        if (
            typeof channel !== 'string'
            || !['email', 'whatsapp', 'in_app'].includes(channel)
            || !message
            || message.length > 5000
            || subject.length > 200
        ) {
            return NextResponse.json({ error: "Choose a delivery channel and enter a message under 5,000 characters." }, { status: 400 });
        }
        if (body.audience !== undefined && body.audience !== 'all') {
            return NextResponse.json({ error: "Only the Everyone audience is currently supported." }, { status: 400 });
        }

        if (body.schedule === 'later') {
            return NextResponse.json({ error: "Scheduled campaigns are not available yet. Select Instant to send now." }, { status: 400 });
        }

        if (channel === 'whatsapp') {
            return NextResponse.json({ error: "WhatsApp delivery is not configured. Choose In-App or Email instead." }, { status: 501 });
        }

        if (channel === 'in_app') {
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
            if (!url || !serviceKey) {
                return NextResponse.json({ error: "Store announcements are not configured on the server." }, { status: 503 });
            }
            const adminDatabase = createClient(url, serviceKey, {
                auth: { autoRefreshToken: false, persistSession: false }
            });
            const { data, error } = await adminDatabase
                .from('customer_announcements')
                .insert({
                    title: subject || 'Online Bar announcement',
                    message,
                    is_active: true,
                    starts_at: new Date().toISOString(),
                    created_by: session.email || 'owner'
                })
                .select('id')
                .single();
            if (error) throw error;
            return NextResponse.json({ success: true, count: 0, announcementId: data.id });
        }

        if (!supabase) {
            return NextResponse.json({ error: "Database not connected" }, { status: 503 });
        }

        const { data: subscribers, error: dbError } = await supabase
            .from('newsletter_subscribers')
            .select('email');

        if (dbError) throw dbError;
        if (!subscribers || subscribers.length === 0) {
            return NextResponse.json({ error: "No newsletter subscribers are available for this email campaign." }, { status: 409 });
        }

        if (channel === 'email') {
            if (!resend) {
                return NextResponse.json({ error: "Email delivery is not configured on the server." }, { status: 503 });
            }

            const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character] || character);
            const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
            const emailResults = await Promise.all(subscribers.map(sub =>
                resend.emails.send({
                    from: 'Online Bar Nairobi <onboarding@resend.dev>', // Using verified domain or onboarding default
                    to: sub.email,
                    subject: subject || "Update from Online Bar Nairobi",
                    html: `
                        <div style="font-family: sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #ff6b00;">Online Bar Nairobi Premium Update</h2>
                            <p>${safeMessage}</p>
                            <hr style="border: 1px solid #eee; margin: 20px 0;" />
                            <p style="font-size: 12px; color: #999;">You received this because you subscribed to Online Bar Nairobi.</p>
                        </div>
                    `
                })
            ));
            const failures = emailResults.filter(result => result.error);
            if (failures.length > 0) {
                console.error('[AdminBroadcast] Email delivery failed for some recipients:', failures);
                return NextResponse.json({
                    error: `Email delivery failed for ${failures.length} of ${subscribers.length} subscribers.`,
                    delivered: subscribers.length - failures.length,
                    failed: failures.length
                }, { status: 502 });
            }
        }

        return NextResponse.json({ success: true, count: subscribers.length });

    } catch (error: unknown) {
        console.error("Broadcast Error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
