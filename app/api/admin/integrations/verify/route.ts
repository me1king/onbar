import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";
import { verifySessionCookie } from "@/lib/adminAuth";
import { cookies } from "next/headers";

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);

        if (!session || !['owner', 'admin'].includes(session.role)) {
            return NextResponse.json({ error: "Unauthorized Command" }, { status: 401 });
        }

        const { nodeId, secretKey, apiKey } = (await request.json()) as { nodeId: string; secretKey?: string; apiKey?: string };

        if (typeof nodeId !== 'string' || !nodeId.trim()) {
            return NextResponse.json({ error: "Node ID is required" }, { status: 400 });
        }

        const normalizedNodeId = nodeId.trim().toUpperCase();
        if (['WHATSAPP', 'META', 'TIKTOK', 'GOOGLE'].includes(normalizedNodeId)) {
            return NextResponse.json({
                success: false,
                error: `${normalizedNodeId} OAuth and live connection checks are not implemented.`
            }, { status: 501 });
        }
        if (normalizedNodeId === 'MPESA') {
            return NextResponse.json({
                success: false,
                error: 'M-Pesa live credential verification is not implemented.'
            }, { status: 501 });
        }
        if (!['PAYSTACK', 'GOOGLE_MAPS', 'MAPS'].includes(normalizedNodeId)) {
            return NextResponse.json({ error: `Unsupported integration: ${nodeId}` }, { status: 400 });
        }

        let isHealthy = false;
        let message = `${nodeId} Gateway Handshake Active.`;

        // 1. Live Handshake Tests
        switch (normalizedNodeId) {
            case 'PAYSTACK': {
                const key = secretKey || process.env.PAYSTACK_SECRET_KEY;
                if (key) {
                    try {
                        const res = await fetch('https://api.paystack.co/bank', {
                            headers: { 'Authorization': `Bearer ${key}` }
                        });
                        isHealthy = res.ok;
                        message = isHealthy ? 'Paystack API key verified.' : 'Paystack Secret Key Invalid.';
                    } catch {
                        isHealthy = false;
                        message = 'Paystack Connection Timeout.';
                    }
                } else {
                    message = 'Paystack connection not verified. Enter a secret key to test the live gateway.';
                }
                break;
            }
            case 'GOOGLE_MAPS':
            case 'MAPS': {
                const key = apiKey || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
                if (key) {
                    try {
                        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Nairobi&key=${key}`);
                        const data = await res.json();
                        isHealthy = data.status === 'OK' || data.status === 'ZERO_RESULTS';
                        message = isHealthy ? 'Google Maps API key verified.' : `Google Maps API Error (${data.status}).`;
                    } catch {
                        isHealthy = false;
                        message = 'Google Maps Connection Error.';
                    }
                } else {
                    message = 'Google Maps connection not verified. Enter an API key to test the live service.';
                }
                break;
            }
        }

        // 2. Update Grid Status in Supabase
        if (supabase) {
            try {
                await supabase.from('integration_nodes').upsert({
                    id: nodeId,
                    status: isHealthy ? 'Connected' : 'Error',
                    last_tested_at: new Date().toISOString()
                });
            } catch (err) {
                console.warn("Integration Nodes Table Warning:", err);
            }
        }

        return NextResponse.json({ success: isHealthy, nodeId, message });

    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
