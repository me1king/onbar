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
    if (!supabase) throw new Error('Marketing campaign backend is unavailable.');

    // 1. Initialize Campaign Header (Schema-Safe)
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
        const retryRes = await supabase
            .from('marketing_campaigns_v2')
            .insert([payload])
            .select()
            .single();
        campaign = retryRes.data;
        initError = retryRes.error;
    }

    if (initError) throw initError;
    if (!campaign?.id) throw new Error('Campaign creation did not return a persisted campaign ID.');
    const campaignId = campaign.id;

    // 2. Create Channel Jobs
    const jobs = pkg.channels.map(channel => ({
        campaign_id: campaignId,
        channel,
        status: 'QUEUED'
    }));
    const { error: jobsError } = await supabase.from('campaign_jobs').insert(jobs);
    if (jobsError) throw jobsError;

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

        if (!platformPostId) throw new Error(`${channel} did not return a platform post ID.`);

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
 * Provider adapters reject until their real publishing integrations are configured.
 */

async function adapterWhatsApp(pkg: CampaignPackage): Promise<string> {
    void pkg;
    throw new Error('WhatsApp Business API integration is not configured.');
}

async function adapterMeta(pkg: CampaignPackage, platform: 'instagram' | 'facebook'): Promise<string> {
    void pkg;
    throw new Error(`${platform} publishing integration is not configured.`);
}

async function adapterTikTok(pkg: CampaignPackage): Promise<string> {
    void pkg;
    throw new Error('TikTok publishing integration is not configured.');
}

async function adapterGmail(pkg: CampaignPackage): Promise<string> {
    void pkg;
    throw new Error('Gmail campaign integration is not configured.');
}
