import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next') ?? '/profile'
  let next = '/profile'
  try {
    const target = new URL(requestedNext, origin)
    if (target.origin === origin && target.pathname.startsWith('/') && !target.pathname.startsWith('//')) {
      next = `${target.pathname}${target.search}`
    }
  } catch (error) {
    console.error('[AuthCallback] Ignoring an invalid post-auth destination:', error)
  }

  if (code) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey =
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase URL and public key must be configured.')
        }

        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const referralCode = data.user?.user_metadata?.referred_by_code || searchParams.get('ref');
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
            if (typeof referralCode === 'string' && referralCode.trim() && !serviceKey) {
                console.error('[AuthCallback] Cannot register referral rewards without the server service key.');
            } else if (typeof referralCode === 'string' && referralCode.trim() && serviceKey && data.user) {
                const database = createClient(supabaseUrl, serviceKey, {
                    auth: { autoRefreshToken: false, persistSession: false }
                });
                const { error: referralError } = await database.rpc('record_loyalty_referral', {
                    referred_profile_id_input: data.user.id,
                    referral_code_input: referralCode.trim(),
                    qualifying_order_id_input: null
                });
                if (referralError) {
                    console.error('[AuthCallback] Could not register referral rewards:', referralError);
                }
            }
            return NextResponse.redirect(`${origin}${next}`)
        }
        console.error('Code exchange error:', error)
    } catch (err) {
        console.error('Auth callback crash:', err)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth?mode=signin&error=auth-failed`)
}
