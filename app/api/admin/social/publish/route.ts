import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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
