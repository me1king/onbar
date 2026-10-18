import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export async function POST(request: Request) {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    if (!hasAdminPermission(session, 'can_manage_marketing')) {
        return NextResponse.json({ error: 'Marketing permission required.' }, { status: 403 });
    }
    if (!isSameOriginRequest(request)) {
        return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
    }
    try {
        const body = await request.json();
        const { mediaUrl, caption, platforms } = body;

        if (typeof caption !== 'string' || !caption.trim() || typeof mediaUrl !== 'string' || !mediaUrl.trim() || !Array.isArray(platforms) || platforms.length === 0) {
            return NextResponse.json({ error: 'A caption, media URL, and at least one platform are required.' }, { status: 400 });
        }

        return NextResponse.json({
            error: 'Social publishing is unavailable because no platform publishing integrations are configured.'
        }, { status: 503 });
    } catch {
        return NextResponse.json({ error: 'Invalid publishing request.' }, { status: 400 });
    }
}
