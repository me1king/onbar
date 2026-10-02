import { supabase } from '@/lib/supabaseClient';

/**
 * ONLINE BAR OS: OMNI-CHANNEL PUBLISHING ENGINE
 * Standardized router for social media content deployment and compliance.
 */

export type SocialPlatform = 'META' | 'TIKTOK' | 'GOOGLE' | 'X' | 'LINKEDIN' | 'WHATSAPP';

class SocialPublisherEngine {
    private static instance: SocialPublisherEngine;

    private constructor() {}

    public static getInstance(): SocialPublisherEngine {
        if (!SocialPublisherEngine.instance) {
            SocialPublisherEngine.instance = new SocialPublisherEngine();
        }
        return SocialPublisherEngine.instance;
    }

    /**
     * Entry point for the queue worker.
     */
    public async processQueue() {
        if (!supabase) {
            throw new Error('Supabase is not configured. The publishing queue cannot be processed.');
        }

        // 1. Fetch next eligible job
        const { data: jobs, error } = await supabase
            .from('publishing_queue')
            .select(`
                *,
                content_master!inner(*),
                social_accounts!inner(*)
            `)
            .eq('status', 'SCHEDULED')
            .lte('scheduled_at', new Date().toISOString())
            .limit(5);

        if (error) throw new Error(`Unable to load scheduled publishing jobs: ${error.message}`);

        for (const job of jobs) {
            await this.executeJob(job);
        }
    }

    private async executeJob(job: {
        id: string,
        attempt_count: number,
        master_id: string,
        content_master: { title: string, media_urls: string[] },
        social_accounts: { platform: string, account_name: string, id: string },
        attribution_id: string
    }) {
        if (!supabase) {
            throw new Error('Supabase is not configured. The publishing job cannot be updated.');
        }

        // 2. Mark as Publishing
        const { error: updateError } = await supabase
            .from('publishing_queue')
            .update({ status: 'PUBLISHING', attempt_count: job.attempt_count + 1 })
            .eq('id', job.id);
        if (updateError) throw new Error(`Unable to mark publishing job as in progress: ${updateError.message}`);

        try {
            // 3. Extract Platform Variant
            const { data: variant } = await supabase
                .from('content_variants')
                .select('*')
                .eq('master_id', job.master_id)
                .eq('platform', job.social_accounts.platform)
                .single();

            if (!variant) throw new Error(`No adaptation found for platform ${job.social_accounts.platform}`);

            // 3.5 Compliance Check
            await this.performComplianceCheck(variant);

            // 4. Route to Adapter
            let externalId: string;
            switch (job.social_accounts.platform as SocialPlatform) {
                case 'META':
                    externalId = await this.publishToMeta();
                    break;
                case 'WHATSAPP':
                    externalId = await this.publishToWhatsApp();
                    break;
                default:
                    throw new Error(`Platform ${job.social_accounts.platform} adapter not yet active.`);
            }

            // 5. Success Node
            const { error: successError } = await supabase.from('publishing_queue').update({
                status: 'SUCCESS',
                external_post_id: externalId,
                published_at: new Date().toISOString()
            }).eq('id', job.id);
            if (successError) throw new Error(`Published content but could not record publishing status: ${successError.message}`);

        } catch (err: unknown) {
            // 6. Failure & Retry Node
            const errMsg = err instanceof Error ? err.message : 'Unknown publishing failure.';
            const isTransient = !errMsg.includes('PERMISSIONS') && !errMsg.includes('COMPLIANCE');
            const { error: failureError } = await supabase.from('publishing_queue').update({
                status: isTransient && job.attempt_count < 3 ? 'RETRYING' : 'FAILED',
                last_error: errMsg
            }).eq('id', job.id);
            if (failureError) {
                throw new Error(`Publishing failed (${errMsg}) and its queue status could not be recorded: ${failureError.message}`);
            }
        }
    }

    /**
     * META ADAPTER: Facebook & Instagram
     */
    private async publishToMeta(): Promise<string> {
        throw new Error('Meta publishing is unavailable: the Meta Graph API adapter is not configured.');
    }

    /**
     * WHATSAPP ADAPTER: Business API
     */
    private async publishToWhatsApp(): Promise<string> {
        throw new Error('WhatsApp publishing is unavailable: the WhatsApp Cloud API adapter is not configured.');
    }

    private async performComplianceCheck(variant: { caption: string }) {
        if (!supabase) return;

        const { data: rules, error } = await supabase.from('compliance_rules').select('*');
        if (error) throw new Error(`Unable to load compliance rules: ${error.message}`);

        const lowerCaption = variant.caption.toLowerCase();

        for (const rule of rules) {
            if (rule.rule_type === 'BLACKLIST_WORD' && lowerCaption.includes(rule.pattern.toLowerCase())) {
                throw new Error(`COMPLIANCE_BLOCK: Prohibited term "${rule.pattern}" detected.`);
            }
        }
    }
}

export const SocialRouter = SocialPublisherEngine.getInstance();
