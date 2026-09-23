import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { orchestrateCampaign } from '@/lib/engines/marketingOrchestrator';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { mediaUrl, caption, productId, platforms, timing, scheduleTime } = body;

        if (!caption || !platforms || !Array.isArray(platforms)) {
            return NextResponse.json({ error: 'Missing required parameters (caption, platforms)' }, { status: 400 });
        }

        // 1. Parallelized Fast Database Persistence (Lightning Fast)
        if (supabase) {
            const mediaTask = supabase
                .from('media_files')
                .insert([{
                    url: mediaUrl || 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&q=80',
                    public_id: `cloudinary-ob-${Date.now()}`,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            const postPayload = platforms.map((platform: string) => ({
                platform: platform.toUpperCase(),
                caption,
                image_url: mediaUrl,
                status: timing === 'SCHEDULED' ? 'SCHEDULED' : 'PUBLISHED',
                scheduled_for: timing === 'SCHEDULED' ? new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() : new Date().toISOString()
            }));

            const postTask = supabase.from('social_posts').insert(postPayload);

            // Execute DB writes in parallel
            await Promise.allSettled([mediaTask, postTask]);
        }

        // 2. Background Non-Blocking Multi-Channel Dispatch (Sub-100ms API Response)
        setTimeout(() => {
            orchestrateCampaign({
                title: caption.substring(0, 40) || 'Tactical Drop',
                productId: productId ? Number(productId) : undefined,
                message: caption,
                mediaUrl,
                channels: platforms as ('WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'GMAIL')[],
                audienceSegment: 'ALL_CUSTOMERS'
            }).catch(err => console.error("⚠️ [PUBLISH_API] Background Orchestrator Error:", err));
        }, 0);

        return NextResponse.json({
            success: true,
            message: 'Publish Protocol executed successfully (Lightning Speed)',
            timing,
            scheduleTime,
            deployedPlatforms: platforms
        });

    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
