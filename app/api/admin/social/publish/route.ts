import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createInstagramDatabase, getFreshInstagramToken, getInstagramConfig, readInstagramResponse } from '@/lib/instagram.server';
import { isIP } from 'node:net';

type InstagramConnection = {
    id: string;
    instagram_user_id: string;
    username: string;
    access_token_encrypted: string;
    token_expires_at: string;
};

function isPublicHttpsUrl(value: string) {
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        if (url.protocol !== 'https:' || url.username || url.password) return false;
        if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
        if (isIP(host)) {
            if (host.includes(':')) return false;
            const [first, second] = host.split('.').map(Number);
            if (first === 10 || first === 127 || first === 0
                || (first === 169 && second === 254)
                || (first === 172 && second >= 16 && second <= 31)
                || (first === 192 && second === 168)) return false;
        }
        return true;
    } catch {
        return false;
    }
}

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

        if (typeof caption !== 'string' || !caption.trim() || caption.length > 2200
            || typeof mediaUrl !== 'string' || mediaUrl.length > 2048
            || !Array.isArray(platforms) || platforms.length !== 1 || platforms[0] !== 'INSTAGRAM') {
            return NextResponse.json({ error: 'Choose Instagram only, with a caption up to 2,200 characters and one public image URL.' }, { status: 400 });
        }
        if (!isPublicHttpsUrl(mediaUrl)) {
            return NextResponse.json({ error: 'Instagram needs a public HTTPS image URL. Choose a product image hosted by Online Bar; local file previews cannot be published directly.' }, { status: 400 });
        }

        const database = createInstagramDatabase();
        const { data: connection, error: connectionError } = await database
            .from('instagram_connections')
            .select('id, instagram_user_id, username, access_token_encrypted, token_expires_at')
            .eq('status', 'CONNECTED')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (connectionError) throw connectionError;
        if (!connection) {
            return NextResponse.json({ error: 'Connect an Instagram professional account in Social Accounts before publishing.' }, { status: 409 });
        }

        const token = await getFreshInstagramToken(database, connection as InstagramConnection);
        const { graphVersion } = getInstagramConfig();
        const containerUrl = `https://graph.instagram.com/${graphVersion}/${
            encodeURIComponent((connection as InstagramConnection).instagram_user_id)
        }/media`;
        const container = await readInstagramResponse<{ id: string }>(await fetch(containerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                image_url: mediaUrl,
                caption: caption.trim(),
                access_token: token
            }),
            signal: AbortSignal.timeout(20000)
        }));
        if (!container.id) throw new Error('Instagram did not create a media container.');

        const published = await readInstagramResponse<{ id: string }>(await fetch(
            `https://graph.instagram.com/${graphVersion}/${encodeURIComponent((connection as InstagramConnection).instagram_user_id)}/media_publish`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    creation_id: container.id,
                    access_token: token
                }),
                signal: AbortSignal.timeout(20000)
            }
        ));
        if (!published.id) throw new Error('Instagram did not confirm the published post.');

        return NextResponse.json({ success: true, platformPostId: published.id, account: (connection as InstagramConnection).username });
    } catch (error) {
        console.error('[SocialPublish] Instagram publishing failed:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Instagram publishing failed.'
        }, { status: 503 });
    }
}
