import { supabase } from '../supabaseClient';

/**
 * ONLINE BAR: MARKETING ORCHESTRATOR v2
 * Orchestrates multi-channel campaign publishing with platform-specific adapters.
 */

export interface CampaignPackage {
    title: string;
    productId?: number;
    message: string;
    mediaUrl?: string;
    landingUrl?: string;
    channels: ('WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'GMAIL')[];
    audienceSegment: string;
}

export async function orchestrateCampaign(pkg: CampaignPackage) {
    if (!supabase) return `camp-${Date.now()}`;

    // 1. Initialize Campaign Header (Schema-Safe)
    let campaignId = `camp-${Date.now()}`;

    try {
        const payload: Record<string, unknown> = {
            title: pkg.title,
            product_id: pkg.productId,
            base_message: pkg.message,
            media_url: pkg.mediaUrl,
            landing_url: pkg.landingUrl,
            status: 'QUEUED'
        };

        let { data: campaign, error: initError } = await supabase
            .from('marketing_campaigns_v2')
            .insert([{ ...payload, audience_segment: pkg.audienceSegment }])
            .select()
            .single();

        if (initError && initError.message?.includes('audience_segment')) {
            // Retry without optional audience_segment column
            const retryRes = await supabase
                .from('marketing_campaigns_v2')
                .insert([payload])
                .select()
                .single();
            campaign = retryRes.data;
            initError = retryRes.error;
        }

        if (campaign) campaignId = campaign.id;
    } catch (err) {
        console.warn("⚠️ [MARKETING_ORCHESTRATOR] Schema Fallback Active:", err);
    }

    // 2. Create Channel Jobs
    try {
        const jobs = pkg.channels.map(channel => ({
            campaign_id: campaignId,
            channel,
            status: 'QUEUED'
        }));
        await supabase.from('campaign_jobs').insert(jobs);
    } catch (err) {
        console.warn("⚠️ [MARKETING_ORCHESTRATOR] Campaign Jobs Table Fallback:", err);
    }

    // 3. Execute Async Publishing (Fire and forget for the UI)
    pkg.channels.forEach((channel) => {
        setTimeout(async () => {
            try {
                await publishToChannel(campaignId, channel, pkg);
            } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`❌ [MARKETING_ORCHESTRATOR] ${errorMsg} Publishing Failed:`, err);
            }
        }, 0);
    });

    return campaignId;
}

async function publishToChannel(campaignId: string, channel: string, pkg: CampaignPackage) {
    if (!supabase) return;

    // Update Job Status
    try {
        await supabase.from('campaign_jobs').update({ status: 'PUBLISHING' }).eq('campaign_id', campaignId).eq('channel', channel);
    } catch {
        // Fallback for missing campaign_jobs table
    }

    try {
        let platformPostId = null;

        // Channel Specific Adapters
        switch (channel) {
            case 'WHATSAPP':
                platformPostId = await adapterWhatsApp(pkg);
                break;
            case 'INSTAGRAM':
                platformPostId = await adapterMeta(pkg, 'instagram');
                break;
            case 'FACEBOOK':
                platformPostId = await adapterMeta(pkg, 'facebook');
                break;
            case 'TIKTOK':
                platformPostId = await adapterTikTok(pkg);
                break;
            case 'GMAIL':
                platformPostId = await adapterGmail(pkg);
                break;
        }

        // Mark Job as Completed
        try {
            await supabase.from('campaign_jobs').update({
                status: 'COMPLETED',
                platform_post_id: platformPostId
            }).eq('campaign_id', campaignId).eq('channel', channel);
        } catch {
            // Fallback
        }

    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        try {
            await supabase.from('campaign_jobs').update({
                status: 'FAILED',
                errors: errorMsg
            }).eq('campaign_id', campaignId).eq('channel', channel);
        } catch {
            // Fallback
        }
    }
}

/**
 * ADAPTERS (Stubs for the hardening phase - link to real provider APIs in production)
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function adapterWhatsApp(_: CampaignPackage) {
    return `WA-${Math.random().toString(36).substring(7)}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function adapterMeta(_: CampaignPackage, __: 'instagram' | 'facebook') {
    return `META-${Math.random().toString(36).substring(7)}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function adapterTikTok(_: CampaignPackage) {
    return `TT-${Math.random().toString(36).substring(7)}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function adapterGmail(_: CampaignPackage) {
    return `GM-${Math.random().toString(36).substring(7)}`;
}
