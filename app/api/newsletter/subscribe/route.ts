import { NextResponse } from "next/server";
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID || '';

export async function POST(request: Request) {
    try {
        let body: { email?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
        }
        const email = body.email;

        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 320) {
            return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
        }

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!url || !serviceKey) {
            return NextResponse.json({ error: "Newsletter database access is not configured on the server." }, { status: 503 });
        }
        const database = createClient(url, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
        const normalizedEmail = email.trim().toLowerCase();

        const { error: dbError } = await database
            .from('newsletter_subscribers')
            .upsert({
                email: normalizedEmail,
                is_active: true,
                consented_at: new Date().toISOString(),
                unsubscribed_at: null
            }, { onConflict: 'email' });

        if (dbError) throw dbError;

        // 2. Add to Resend Contacts
        if (resend) {
            try {
                await resend.contacts.create({
                    email: normalizedEmail,
                    audienceId: AUDIENCE_ID,
                });
            } catch (resendError) {
                console.error("Resend Sync Error:", resendError);
                // We don't fail the whole request if Resend fails but DB succeeded
            }
        }

        return NextResponse.json({ message: "Subscribed successfully!" }, { status: 200 });

    } catch (error: unknown) {
        console.error("Newsletter API Error:", (error as Error).message || error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
