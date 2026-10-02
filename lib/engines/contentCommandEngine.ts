import { supabase } from '../supabaseClient';

/**
 * Local content-draft persistence. No external publishing provider is connected.
 */

export interface MasterContentPayload {
    title: string;
    description: string;
    mediaUrls: string[];
    platforms: string[];
}

class ContentCommandEngine {
    private static instance: ContentCommandEngine;

    private constructor() {}

    public static getInstance(): ContentCommandEngine {
        if (!ContentCommandEngine.instance) {
            ContentCommandEngine.instance = new ContentCommandEngine();
        }
        return ContentCommandEngine.instance;
    }

    /** Saves the supplied copy and platform-labeled variants as drafts only. */
    public async establishMasterContent(payload: MasterContentPayload, actorEmail: string) {
        if (!supabase) throw new Error('Cannot save content because the database is not connected.');

        const { data: master, error: masterErr } = await supabase
            .from('content_master')
            .insert([{
                title: payload.title,
                base_description: payload.description,
                media_urls: payload.mediaUrls,
                status: 'DRAFT'
            }])
            .select()
            .single();

        if (masterErr || !master) throw masterErr || new Error('Failed to save the content draft.');

        const variants = payload.platforms.map(platform => ({
            master_id: master.id,
            platform,
            caption: payload.description,
            status: 'DRAFT'
        }));

        if (variants.length > 0) {
            const { error: variantsErr } = await supabase.from('content_variants').insert(variants);
            if (variantsErr) throw variantsErr;
        }

        const { error: auditErr } = await supabase.from('content_audit_log').insert([{
            content_id: master.id,
            actor_email: actorEmail,
            action: 'CREATE',
            metadata: { platforms: payload.platforms }
        }]);
        if (auditErr) throw auditErr;

        return master.id;
    }

    /** Archives a saved content record locally; this does not affect external platforms. */
    public async expelContentNode(id: string, actorEmail: string) {
        if (!supabase) throw new Error('Cannot archive content because the database is not connected.');

        const { error: archiveErr } = await supabase
            .from('content_master')
            .update({ status: 'ARCHIVED' })
            .eq('id', id);
        if (archiveErr) throw archiveErr;

        const { error: auditErr } = await supabase.from('content_audit_log').insert([{
            content_id: id,
            actor_email: actorEmail,
            action: 'DELETE',
            metadata: { local_only: true }
        }]);
        if (auditErr) throw auditErr;
    }
}

export const ContentCommand = ContentCommandEngine.getInstance();
