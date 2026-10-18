'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, LockKeyhole, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { AFFILIATE_AGREEMENT_VERSION } from '@/lib/affiliateAgreement';

type InviteState = 'checking' | 'missing' | 'sign_in' | 'ready' | 'error' | 'accepted';
type PromotionChannel = 'Instagram' | 'TikTok' | 'WhatsApp' | 'Website';

export default function AffiliateRegistration() {
  const router = useRouter();
  const [inviteState, setInviteState] = React.useState<InviteState>('checking');
  const [token, setToken] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [businessName, setBusinessName] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [audienceSize, setAudienceSize] = React.useState('0');
  const [channels, setChannels] = React.useState<PromotionChannel[]>([]);
  const [payoutMethod, setPayoutMethod] = React.useState<'M-Pesa' | 'Bank'>('M-Pesa');
  const [payoutDetails, setPayoutDetails] = React.useState('');
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [acknowledgedAgreement, setAcknowledgedAgreement] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  const checkInvitation = React.useCallback(async (inviteToken: string) => {
    if (!supabase) throw new Error('Account service is unavailable. Please try again later.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setInviteState('sign_in');
      return;
    }
    const response = await fetch(`/api/affiliate/invitations?token=${encodeURIComponent(inviteToken)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store'
    });
    const result = await response.json() as {
      error?: string;
      valid?: boolean;
      alreadyAccepted?: boolean;
      email?: string;
      businessName?: string;
    };
    if (response.status === 401) {
      setInviteState('sign_in');
      return;
    }
    if (response.status === 403) {
      setErrorMessage(result.error || 'Sign in using the email address that received this invitation.');
      setInviteState('sign_in');
      return;
    }
    if (!response.ok) throw new Error(result.error || 'This invitation could not be verified.');
    if (result.alreadyAccepted) {
      setInviteState('accepted');
      return;
    }
    setInviteEmail(result.email || '');
    setBusinessName(result.businessName || '');
    setInviteState('ready');
  }, []);

  React.useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get('invite') || '';
    setToken(inviteToken);
    if (!inviteToken) {
      setInviteState('missing');
      return;
    }
    checkInvitation(inviteToken).catch(err => {
      console.error('[AffiliateInvitation] Could not validate invitation:', err);
      setErrorMessage(err instanceof Error ? err.message : 'This invitation could not be verified.');
      setInviteState('error');
    });
  }, [checkInvitation]);

  const goToSignIn = async () => {
    if (!token) return;
    try {
      sessionStorage.setItem('ob_auth_redirect', `/affiliate/register?invite=${encodeURIComponent(token)}`);
    } catch (error) {
      console.error('[AffiliateInvitation] Could not save sign-in continuation:', error);
      setErrorMessage('Could not save the invitation continuation in this browser. Please enable session storage and try again.');
      return;
    }
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[AffiliateInvitation] Could not switch accounts:', error);
        setErrorMessage('Could not switch accounts. Sign out, then reopen your invitation link.');
        return;
      }
    }
    router.push('/auth');
  };

  const toggleChannel = (channel: PromotionChannel) => {
    setChannels(current => current.includes(channel)
      ? current.filter(item => item !== channel)
      : [...current, channel]);
  };

  const acceptInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setInviteState('sign_in');
        return;
      }
      const response = await fetch('/api/affiliate/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          token,
          businessName,
          bio,
          audienceSize: Number(audienceSize),
          channels,
          payoutMethod,
          payoutDetails,
          acceptedTerms,
          acknowledgedAgreement,
          agreementVersion: AFFILIATE_AGREEMENT_VERSION
        })
      });
      const result = await response.json() as { error?: string; accepted?: boolean };
      if (!response.ok) throw new Error(result.error || 'Could not accept this invitation.');
      setInviteState('accepted');
      window.setTimeout(() => router.replace('/affiliate/dashboard'), 1200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not accept this invitation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to profile
        </Link>

        <header className="rounded-3xl bg-slate-950 p-7 text-white sm:p-10">
          <div className="flex items-center gap-3 text-amber-300">
            <LockKeyhole className="h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-[0.24em]">Private partner program</span>
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Affiliate invitation</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Online Bar affiliates join by invitation only. The catalog and partner tools unlock after you accept an invitation sent to your account email.
          </p>
        </header>

        {errorMessage && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMessage}
          </div>
        )}

        {inviteState === 'checking' && (
          <Card className="flex items-center justify-center gap-3 rounded-2xl bg-white p-12 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Checking invitation...
          </Card>
        )}

        {inviteState === 'missing' && (
          <Card className="space-y-4 rounded-2xl border-slate-200 bg-white p-7">
            <h2 className="text-xl font-black">Invitation required</h2>
            <p className="text-sm leading-6 text-slate-600">
              The affiliate program is not open for public applications. Contact Online Bar if you believe you should have received an invitation.
            </p>
            <Link href="/contact"><Button>Contact Online Bar</Button></Link>
          </Card>
        )}

        {inviteState === 'sign_in' && (
          <Card className="space-y-5 rounded-2xl border-slate-200 bg-white p-7">
            <div className="flex items-center gap-3">
              <UserPlus className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-black">Sign in with your invited email</h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Accept this invitation by signing in or creating an account using the same email address that received the invite. Your email must be verified.
            </p>
            <Button onClick={goToSignIn} className="w-full sm:w-auto">Continue to sign in or create account</Button>
          </Card>
        )}

        {inviteState === 'error' && (
          <Card className="space-y-4 rounded-2xl border-slate-200 bg-white p-7">
            <h2 className="text-xl font-black">Invitation unavailable</h2>
            <p className="text-sm text-slate-600">{errorMessage || 'This invitation is expired, cancelled, or invalid.'}</p>
            <Link href="/contact"><Button variant="outline">Contact Online Bar</Button></Link>
          </Card>
        )}

        {inviteState === 'accepted' && (
          <Card className="flex flex-col items-center gap-4 rounded-2xl border-emerald-200 bg-emerald-50 p-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <h2 className="text-2xl font-black text-emerald-900">Invitation accepted</h2>
            <p className="text-sm text-emerald-800">Your affiliate access is active. Opening your private studio...</p>
            <Button onClick={() => router.replace('/affiliate/dashboard')}>Open Affiliate Studio</Button>
          </Card>
        )}

        {inviteState === 'ready' && (
          <Card className="rounded-2xl border-slate-200 bg-white p-6 sm:p-8">
            <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
              Invitation verified for <strong>{inviteEmail}</strong>. Complete your partner details to unlock the product catalog.
            </div>
            <form onSubmit={acceptInvitation} className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold">
                  Business / display name
                  <Input required minLength={2} maxLength={120} value={businessName} onChange={event => setBusinessName(event.target.value)} />
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  Audience size
                  <Input required type="number" min={0} max={100000000} value={audienceSize} onChange={event => setAudienceSize(event.target.value)} />
                </label>
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                How will you promote Online Bar?
                <Textarea required minLength={10} maxLength={2000} rows={4} value={bio} onChange={event => setBio(event.target.value)} placeholder="Describe your audience and promotion approach." />
              </label>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Promotion channels (select at least one)</legend>
                <div className="flex flex-wrap gap-2">
                  {(['Instagram', 'TikTok', 'WhatsApp', 'Website'] as PromotionChannel[]).map(channel => (
                    <button
                      key={channel}
                      type="button"
                      aria-pressed={channels.includes(channel)}
                      onClick={() => toggleChannel(channel)}
                      className={cn(
                        'rounded-xl border px-4 py-2 text-sm font-semibold',
                        channels.includes(channel) ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-600'
                      )}
                    >{channel}</button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold">
                  Payout method
                  <select value={payoutMethod} onChange={event => setPayoutMethod(event.target.value as 'M-Pesa' | 'Bank')} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="M-Pesa">M-Pesa</option>
                    <option value="Bank">Bank transfer</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  {payoutMethod === 'M-Pesa' ? 'M-Pesa phone number' : 'Bank account details'}
                  <Input required minLength={3} maxLength={200} value={payoutDetails} onChange={event => setPayoutDetails(event.target.value)} />
                </label>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-primary" /> Partner terms</div>
                <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                  <input type="checkbox" required checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} className="mt-1" />
                  <span>I agree to promote Online Bar responsibly and understand payout requests are reviewed manually.</span>
                </label>
                <label className="flex items-start gap-3 text-sm leading-5 text-slate-600">
                  <input type="checkbox" required checked={acknowledgedAgreement} onChange={event => setAcknowledgedAgreement(event.target.checked)} className="mt-1" />
                  <span>I have read and accept the <Link href="/affiliate/agreement" target="_blank" rel="noreferrer" className="font-bold text-primary underline">Affiliate &amp; Partner Agreement</Link>.</span>
                </label>
              </div>

              <Button type="submit" disabled={loading || channels.length === 0} className="h-12 w-full rounded-xl font-black uppercase tracking-widest">
                {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                Accept invitation and unlock Affiliate Studio
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
