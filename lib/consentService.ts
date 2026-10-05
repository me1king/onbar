import { supabase } from './supabaseClient';

/**
 * ONLINE BAR: CONSENT ENGINE
 * Manages user privacy choices and enforces data collection gates.
 */

export interface ConsentPreferences {
    necessary: boolean;
    analytics: boolean;
    personalization: boolean;
    marketing: boolean;
}

const STORAGE_KEY = 'ob_user_consent';

export const getLocalConsent = (): ConsentPreferences => {
    if (typeof window === 'undefined') return { necessary: true, analytics: false, personalization: false, marketing: false };
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return { necessary: true, analytics: false, personalization: false, marketing: false };
        const parsed: unknown = JSON.parse(saved);
        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('Saved consent preferences are not an object.');
        }
        const value = parsed as Partial<ConsentPreferences>;
        return {
            necessary: value.necessary === true,
            analytics: value.analytics === true,
            personalization: value.personalization === true,
            marketing: value.marketing === true
        };
    } catch (error) {
        console.warn('[Consent] Could not read saved preferences; analytics remains disabled:', error);
        return { necessary: true, analytics: false, personalization: false, marketing: false };
    }
};

export const updateConsent = async (prefs: Partial<ConsentPreferences>, userId?: string, anonymousId?: string) => {
    const current = getLocalConsent();
    const updated = { ...current, ...prefs };

    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }

    if (!supabase) return;

    // Persist to Master OS Datastore
    await supabase.from('user_consent').upsert({
        user_id: userId,
        anonymous_id: anonymousId,
        ...updated,
        updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
};

/**
 * Gatekeeper: Returns true if the system is allowed to perform the action.
 */
export const isAllowed = (category: keyof ConsentPreferences): boolean => {
    const prefs = getLocalConsent();
    return prefs[category] || category === 'necessary';
};
