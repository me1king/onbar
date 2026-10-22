import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const PROVIDER_CONFIG = {
    GEMINI: {
        env: 'GOOGLE_GEMINI_API_KEY',
        url: 'https://generativelanguage.googleapis.com/v1beta/models',
        headers: (key: string) => ({ 'x-goog-api-key': key }),
        successMessage: 'Google Gemini provider is reachable.'
    },
    OPENAI: {
        env: 'OPENAI_API_KEY',
        url: 'https://api.openai.com/v1/models',
        headers: (key: string) => ({ Authorization: `Bearer ${key}` }),
        successMessage: 'OpenAI provider is reachable.'
    },
    CLAUDE: {
        env: 'ANTHROPIC_API_KEY',
        url: 'https://api.anthropic.com/v1/models',
        headers: (key: string) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
        successMessage: 'Anthropic provider is reachable.'
    }
} as const;

type Provider = keyof typeof PROVIDER_CONFIG;

export async function POST(request: Request) {
    if (!isSameOriginRequest(request)) {
        return NextResponse.json({ success: false, error: 'Same-origin request required.' }, { status: 403 });
    }

    const session = await getAdminSession();
    if (!session || !hasAdminPermission(session, 'can_manage_settings')) {
        return NextResponse.json({ success: false, error: 'Settings management access is required.' }, { status: 403 });
    }

    let body: { provider?: unknown };
    try {
        body = await request.json() as { provider?: unknown };
    } catch {
        return NextResponse.json({ success: false, error: 'Choose a supported AI provider.' }, { status: 400 });
    }

    if (typeof body.provider !== 'string' || !(body.provider in PROVIDER_CONFIG)) {
        return NextResponse.json({ success: false, error: 'Choose a supported AI provider.' }, { status: 400 });
    }

    const provider = body.provider as Provider;
    const config = PROVIDER_CONFIG[provider];
    const apiKey = process.env[config.env]?.trim();
    if (!apiKey) {
        return NextResponse.json({
            success: false,
            provider,
            status: 'KEY_MISSING',
            message: `Add ${config.env} in your hosting provider's private environment settings, then redeploy.`
        }, { status: 503 });
    }

    try {
        const response = await fetch(config.url, {
            headers: config.headers(apiKey),
            cache: 'no-store',
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) {
            console.error(`[AdminAI] ${provider} connectivity check failed with HTTP ${response.status}.`);
            return NextResponse.json({
                success: false,
                provider,
                status: 'UNAVAILABLE',
                message: `${provider} provider verification failed (HTTP ${response.status}).`
            }, { status: 502 });
        }
        return NextResponse.json({ success: true, provider, status: 'ONLINE', message: config.successMessage });
    } catch (error) {
        console.error(`[AdminAI] ${provider} connectivity check failed:`, error);
        return NextResponse.json({
            success: false,
            provider,
            status: 'UNAVAILABLE',
            message: `${provider} provider could not be reached. Check server connectivity and try again.`
        }, { status: 502 });
    }
}
