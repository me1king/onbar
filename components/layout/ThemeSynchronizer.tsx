'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function ThemeSynchronizer() {
    React.useEffect(() => {
        async function syncTheme() {
            if (!supabase) return;
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('loyalty_points')
                    .eq('id', session.user.id)
                    .maybeSingle();

                if (profile) {
                    const html = document.documentElement;
                    html.removeAttribute('data-theme');
                }
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        }

        syncTheme();
        // Listen for auth changes to re-sync
        if (supabase) {
            const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
                syncTheme();
            });

            return () => subscription.unsubscribe();
        }
    }, []);

    return null; // Side-effect only component
}
