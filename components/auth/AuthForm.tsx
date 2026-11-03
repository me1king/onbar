'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { OB_OS } from '@/lib/onlineBarOS';
import {
    Mail,
    Lock,
    Loader2,
    Key,
    Smartphone,
    Globe,
    ShieldCheck,
    MapPin,
    AlertCircle,
    ArrowRight,
    WifiOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AuthMethod = 'email' | 'phone';

interface AuthFormProps {
    initialMode?: 'signin' | 'signup';
    onSuccess?: (userId: string) => void;
}

interface AuthError {
  message: string;
  details?: string;
  code?: string;
  hint?: string;
  name?: string;
}

export default function AuthForm({ initialMode = 'signin', onSuccess }: AuthFormProps) {
  const [method, setAuthMethod] = useState<AuthMethod>('email');
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpField, setShowOtpField] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'idle', text: string }>({ type: 'idle', text: '' });
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState(false);

  const checkNetworkNode = async () => {
    setIsDiagnosticRunning(true);
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!url) throw new Error("Supabase URL undefined.");
        const start = Date.now();
        await fetch(url, { mode: 'no-cors' }); // Simple ping
        const latency = Date.now() - start;
        alert(`Network Uplink: Healthy (${latency}ms)`);
    } catch {
        alert(`Network Error: Connection to Supabase failed. Check your internet or ad-blocker.`);
    } finally {
        setIsDiagnosticRunning(false);
    }
  };

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  useEffect(() => {
    setIsSignUp(initialMode === 'signup');
  }, [initialMode]);

  useEffect(() => {
    if (!isSignUp) return;
    try {
      const saved = sessionStorage.getItem('ob_checkout_profile_draft')
        || localStorage.getItem('ob_checkout_profile_draft');
      if (!saved) return;
      sessionStorage.setItem('ob_checkout_profile_draft', saved);
      localStorage.removeItem('ob_checkout_profile_draft');
      const parsed: unknown = JSON.parse(saved);
      if (typeof parsed !== 'object' || parsed === null) return;
      const draft = parsed as Record<string, unknown>;
      if (draft.userId !== null && draft.userId !== undefined) return;
      if (typeof draft.customerName === 'string') setFullName(current => current || (draft.customerName as string));
      if (typeof draft.customerPhone === 'string') setPhoneNumber(current => current || (draft.customerPhone as string));
      if (typeof draft.customerEmail === 'string') setEmail(current => current || (draft.customerEmail as string));
      const savedAddress = [
        draft.deliveryBuilding,
        draft.deliveryLandmark
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(', ');
      if (savedAddress) setAddress(current => current || savedAddress);
    } catch (error) {
      console.warn('[AuthForm] Could not restore checkout details for account creation:', error);
    }
  }, [isSignUp]);

  const handleIdentityStitching = async (userId: string) => {
      try {
          const anonId = localStorage.getItem('ob_anonymous_id');
          if (anonId) {
              await OB_OS.stitchIdentity(anonId, userId);
          }
          await OB_OS.refreshSession(userId);
      } catch (_err) {
          console.warn("[OB_OS] Identity Stitching Failure (Non-critical):", _err);
      }
  };

  const registerReferral = async (accessToken: string | undefined, referralCode: unknown) => {
    if (!accessToken || typeof referralCode !== 'string' || !referralCode.trim()) return true;
    try {
      const response = await fetch('/api/member/referrals', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Referral rewards could not be synchronized.');
      return true;
    } catch (error) {
      console.error('[AuthForm] Referral rewards could not be synchronized:', error);
      setMessage({
        type: 'error',
        text: 'Your account is ready, but referral points are still syncing. Please sign in again or contact support if they do not appear.'
      });
      return false;
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage({ type: 'idle', text: '' });
    setDebugInfo(null);

    try {
      if (!supabase) throw new Error('Supabase not configured. Check your environment variables.');

      if (isSignUp) {
        const referralCode = typeof window !== 'undefined'
          ? sessionStorage.getItem('ob_referral_code')
          : null;
        let nextPath = '/profile';
        if (typeof window !== 'undefined') {
          try {
            const savedRedirect = sessionStorage.getItem('ob_auth_redirect') || '';
            const target = new URL(savedRedirect, window.location.origin);
            const inviteToken = target.searchParams.get('invite') || '';
            if (target.origin === window.location.origin && target.pathname === '/affiliate/register'
              && /^[A-Za-z0-9_-]{40,60}$/.test(inviteToken)) {
              nextPath = `${target.pathname}${target.search}`;
            }
          } catch (redirectError) {
            console.error('[AuthForm] Could not validate the saved sign-up destination:', redirectError);
          }
        }
        const emailRedirectTo = typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
          : undefined;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
              emailRedirectTo,
              data: {
                  full_name: fullName.trim() || null,
                  phone_number: phoneNumber.trim() || null,
                  address: address.trim() || null,
                  ...(referralCode ? { referred_by_code: referralCode } : {})
              }
          }
        });

        if (error) {
            let errorText = error.message || "Uplink Failure";
            const userExists = error.message?.includes("already registered") || error.code === '23505' || error.message?.includes("user_already_exists");
            if (userExists) errorText = "Identity already exists on the grid. Switch to Login mode below.";
            setMessage({ type: 'error', text: errorText });
            setDebugInfo(JSON.stringify({ code: error.code || 'UNKNOWN', message: error.message, name: error.name }));
            setLoading(false);
            return;
        }

        if (data.user) {
            await handleIdentityStitching(data.user.id);
            await OB_OS.track('USER_REGISTERED', { userId: data.user.id, anonymousId: localStorage.getItem('ob_anonymous_id') || undefined });

            if (data.session) {
                setMessage({ type: 'success', text: 'Registration Successful! Establishing profile...' });
                await registerReferral(data.session.access_token, data.user.user_metadata?.referred_by_code);
                if (onSuccess) setTimeout(() => onSuccess(data.user!.id), 2000);
            } else {
                setMessage({ type: 'success', text: 'Identity Reserved! Please check your email inbox to confirm your account.' });
            }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });

        if (error) {
            let errorText = error.message || "Uplink Failure";
            if (error.message?.includes("Invalid login credentials")) errorText = "Credential Mismatch. Incorrect key or identity not found.";
            setMessage({ type: 'error', text: errorText });
            setDebugInfo(JSON.stringify({ code: error.code || 'UNKNOWN', message: error.message, name: error.name }));
            setLoading(false);
            return;
        }

        if (data.user) {
            await handleIdentityStitching(data.user.id);
            await OB_OS.track('USER_LOGIN', { userId: data.user.id });
            const referralSynced = await registerReferral(data.session?.access_token, data.user.user_metadata?.referred_by_code);
            if (referralSynced) setMessage({ type: 'success', text: 'Access Granted. Entering Vault...' });
            if (onSuccess) {
                setTimeout(() => onSuccess(data.user!.id), 1500);
            }
        }
      }
    } catch (error: unknown) {
      const err = error as AuthError;
      console.error("[OB_OS] Auth Node Failure:", err);

      let errorText = err.message || "Uplink Failure";
      const isFetchError = errorText.toLowerCase().includes('failed to fetch') || err.name === 'AuthRetryableFetchError';

      if (isFetchError) {
          errorText = "Network error: Could not reach Supabase. Check your connection and Supabase project URL/key configuration, then try again.";
      }

      if (err.code === 'over_email_send_rate_limit' || err.code === 'over_sms_send_rate_limit') {
          errorText = "Rate Limit Node Active. Please wait or try Google Social Login below.";
          setCooldown(60);
      }

      const userExists = err.message?.includes("already registered") || err.code === '23505' || err.message?.includes("user_already_exists");
      if (userExists) {
          errorText = "Identity already exists on the grid. Switch to Login mode below.";
      }

      if (err.message?.includes("Invalid login credentials")) {
          errorText = "Credential Mismatch. Incorrect key or identity not found.";
      }

      setMessage({ type: 'error', text: errorText });
      setDebugInfo(JSON.stringify({
          code: err.code || 'UNKNOWN',
          message: err.message,
          name: err.name
      }));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage({ type: 'idle', text: '' });

    try {
        if (!supabase) throw new Error('Supabase not configured.');

        const cleanPhone = phoneNumber.startsWith('+') ? phoneNumber : `+254${phoneNumber.replace(/^0/, '')}`;

        if (!showOtpField) {
            const referralCode = isSignUp ? sessionStorage.getItem('ob_referral_code') : null;
            const { error } = await supabase.auth.signInWithOtp({
                phone: cleanPhone,
                options: {
                    data: {
                        phone_number: cleanPhone,
                        ...(isSignUp ? {
                            full_name: fullName.trim() || null,
                            address: address.trim() || null
                        } : {}),
                        ...(referralCode ? { referred_by_code: referralCode } : {})
                    }
                }
            });
            if (error) throw error;

            setShowOtpField(true);
            setMessage({ type: 'success', text: 'Verification code sent via SMS.' });
        } else {
            const { data, error } = await supabase.auth.verifyOtp({
                phone: cleanPhone,
                token: otp.trim(),
                type: 'sms'
            });
            if (error) throw error;

            if (data.user) {
                const profileUpdates = {
                    phone_number: cleanPhone,
                    ...(isSignUp && fullName.trim() ? { full_name: fullName.trim() } : {}),
                    ...(isSignUp && address.trim() ? { address: address.trim() } : {})
                };
                let profileSaved = true;
                const { data: existingProfile, error: profileError } = await supabase.from('profiles')
                    .update(profileUpdates)
                    .eq('id', data.user.id)
                    .select('id')
                    .maybeSingle();
                if (profileError) {
                    console.error('[AuthForm] Could not save verified phone account details:', profileError);
                    profileSaved = false;
                } else if (!existingProfile) {
                    const { error: insertError } = await supabase.from('profiles').insert({
                        id: data.user.id,
                        email: data.user.email || null,
                        ...profileUpdates
                    });
                    if (insertError) {
                        console.error('[AuthForm] Could not create profile for verified phone account:', insertError);
                        profileSaved = false;
                    }
                }
                await handleIdentityStitching(data.user.id);
                await OB_OS.track('USER_LOGIN', { userId: data.user.id });
                const referralSynced = await registerReferral(data.session?.access_token, data.user.user_metadata?.referred_by_code);
                if (!profileSaved) {
                    setMessage({
                        type: 'error',
                        text: 'Your account is ready, but your contact details could not be saved to the profile. You can continue and update them in Profile.'
                    });
                } else if (referralSynced) {
                    setMessage({ type: 'success', text: isSignUp ? 'Identity Established! Synchronizing...' : 'Access Granted. Entering Vault...' });
                }
                if (onSuccess) {
                    setTimeout(() => onSuccess(data.user!.id), 1500);
                }
            }
        }
    } catch (error: unknown) {
        const err = error as AuthError;
        let errorText = err.message || "Uplink Failure";

        if (errorText.toLowerCase().includes('failed to fetch')) {
            errorText = "Network Error: Cannot reach Supabase. Check your connection.";
        }

        if (err.code === 'over_sms_send_rate_limit') {
            errorText = "SMS Rate Limit Hit. Try again in 60 seconds.";
            setCooldown(60);
        }

        setMessage({ type: 'error', text: errorText });
    } finally {
        setLoading(false);
    }
  };

  const [isRecovering, setIsRecovering] = useState(false);

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
        setMessage({ type: 'error', text: 'Enter your registered protocol email address.' });
        return;
    }
    setLoading(true);
    setMessage({ type: 'idle', text: '' });
    try {
        if (!supabase) throw new Error('Supabase not configured.');
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
            redirectTo: `${window.location.origin}/auth/callback?type=recovery`
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Account Recovery Key transmitted! Check your email inbox.' });
    } catch (err: unknown) {
        setMessage({ type: 'error', text: (err as Error).message || 'Recovery transmission failed.' });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-10 bg-white rounded-[2rem] sm:rounded-[3.5rem] border border-slate-100 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] space-y-8 sm:y-12 animate-in zoom-in-95 duration-700">

      {/* HEADER NODE */}
      <div className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/10 animate-in fade-in slide-in-from-top-4 duration-1000">
              <ShieldCheck size={36} strokeWidth={2.5} />
          </div>
          <div className="space-y-1">
              <h2 className="text-4xl font-black text-[#1A202C] uppercase tracking-tighter leading-none italic">
                {isSignUp ? 'Join Grid' : 'Enter Vault'}
              </h2>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em]">Establish Protocol Connection</p>
          </div>
      </div>

      {/* METHOD SELECTOR */}
      <div className="flex p-1.5 bg-slate-50 rounded-[1.5rem] border border-slate-100 shadow-inner">
          <button
            onClick={() => { setAuthMethod('email'); setShowOtpField(false); }}
            className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                method === 'email' ? "bg-white text-[#1A202C] shadow-md scale-[1.02]" : "text-slate-400 hover:text-slate-600"
            )}
          >
              Secure Email
          </button>
          <button
            onClick={() => { setAuthMethod('phone'); setShowOtpField(false); }}
            className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                method === 'phone' ? "bg-white text-[#1A202C] shadow-md scale-[1.02]" : "text-slate-400 hover:text-slate-600"
            )}
          >
              Mobile OTP
          </button>
      </div>

      {/* FORM INTERFACE */}
      <div className="min-h-[300px]">
          {isRecovering ? (
              <form onSubmit={handleRecovery} className="space-y-6 sm:space-y-8 animate-in zoom-in-95 duration-500 text-left">
                  <div className="space-y-2 text-center">
                      <h3 className="text-2xl font-black text-[#1A202C] uppercase tracking-tighter">Retrieve Account</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enter your registered email to receive a secure recovery key</p>
                  </div>

                  <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Protocol Email</label>
                      <div className="relative">
                          <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="PATRON@ONLINEBAR.CO.KE" className="h-16 rounded-2xl bg-slate-50 border-slate-100 pl-14 font-black uppercase text-sm focus:bg-white transition-all shadow-inner" />
                          <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                      </div>
                  </div>

                  <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-20 rounded-[1.8rem] bg-slate-900 text-white font-black uppercase text-xs tracking-[0.3em] shadow-2xl hover:bg-primary transition-all active:scale-95 flex items-center justify-center gap-3 border-none"
                  >
                      {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Transmit Recovery Key'}
                  </Button>

                  <button
                      type="button"
                      onClick={() => { setIsRecovering(false); setMessage({ type: 'idle', text: '' }); }}
                      className="w-full text-center text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors tracking-widest"
                  >
                      &larr; Return to Vault Login
                  </button>
              </form>
          ) : method === 'email' ? (
              <form onSubmit={handleEmailAuth} className="space-y-6 sm:space-y-8">
                {isSignUp && (
                  <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Patron Name</label>
                        <div className="relative">
                            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="FULL NAME" required className="h-16 rounded-2xl bg-slate-50 border-slate-100 pl-14 font-black uppercase text-sm focus:bg-white transition-all shadow-inner" />
                            <Globe className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Phone Number</label>
                        <div className="relative">
                            <Input type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="07XXXXXXXX" required maxLength={40} className="h-16 rounded-2xl bg-slate-50 border-slate-100 pl-14 font-bold text-sm focus:bg-white transition-all shadow-inner" />
                            <Smartphone className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Delivery Node</label>
                        <div className="relative">
                            <Input required value={address} onChange={e => setAddress(e.target.value)} placeholder="E.G. KILIMANI, NAIROBI" className="h-16 rounded-2xl bg-slate-50 border-slate-100 pl-14 font-black uppercase text-sm focus:bg-white transition-all shadow-inner" />
                            <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                        </div>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Protocol Email</label>
                  <div className="relative">
                      <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="PATRON@ONLINEBAR.CO.KE" className="h-16 rounded-2xl bg-slate-50 border-slate-100 pl-14 font-black uppercase text-sm focus:bg-white transition-all shadow-inner" />
                      <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Secret Key</label>
                  <div className="relative">
                      <Input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="h-16 rounded-2xl bg-slate-50 border-slate-100 pl-14 font-black text-sm focus:bg-white transition-all shadow-inner" />
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                  </div>
                </div>

                {!isSignUp && (
                    <div className="flex justify-between items-center px-1">
                        <button
                            type="button"
                            onClick={() => { setIsRecovering(true); setMessage({ type: 'idle', text: '' }); }}
                            className="text-[9px] font-black uppercase text-primary hover:underline tracking-widest"
                        >
                            Retrieve Account?
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsRecovering(true); setMessage({ type: 'idle', text: '' }); }}
                            className="text-[9px] font-black uppercase text-slate-300 hover:text-primary transition-colors tracking-widest"
                        >
                            Lost your key?
                        </button>
                    </div>
                )}

                <Button
                    type="submit"
                    disabled={loading || cooldown > 0}
                    className="w-full h-20 rounded-[1.8rem] bg-slate-900 text-white font-black uppercase text-xs tracking-[0.3em] shadow-2xl hover:bg-primary transition-all active:scale-95 flex items-center justify-center gap-3 mt-6 border-none"
                >
                    {loading ? <Loader2 className="animate-spin h-5 w-5" /> : cooldown > 0 ? `LOCKED (${cooldown}s)` : (isSignUp ? 'Initialize Profile' : 'Authorize Entrance')}
                </Button>
              </form>
          ) : (
              <form onSubmit={handlePhoneOTP} className="space-y-8">
                  {isSignUp && (
                    <>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Full Name</label>
                        <Input required maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} placeholder="FULL NAME" className="h-14 rounded-2xl bg-slate-50 border-slate-100 px-5 font-bold focus:bg-white transition-all shadow-inner" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Delivery Address</label>
                        <Input required maxLength={300} value={address} onChange={event => setAddress(event.target.value)} placeholder="BUILDING OR ESTATE, NAIROBI" className="h-14 rounded-2xl bg-slate-50 border-slate-100 px-5 font-bold focus:bg-white transition-all shadow-inner" />
                      </div>
                    </>
                  )}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Mobile Uplink</label>
                    <div className="relative">
                        <Input required value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="07XXXXXXXX" className="h-16 rounded-2xl bg-slate-50 border-slate-100 pl-14 font-black text-xl tracking-widest focus:bg-white transition-all shadow-inner" disabled={showOtpField} />
                        <Smartphone className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                    </div>
                  </div>
                  {showOtpField && (
                    <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
                        <label className="text-[10px] font-black uppercase text-primary ml-1 animate-pulse tracking-[0.2em]">Synchronizing: Enter Code</label>
                        <div className="relative">
                            <Input required value={otp} onChange={e => setOtp(e.target.value)} placeholder="XXXXXX" maxLength={6} className="h-20 rounded-3xl bg-primary/5 border-primary/20 text-center font-black text-3xl tracking-[0.6em] text-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-inner" />
                            <Key className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/30" />
                        </div>
                    </div>
                  )}
                  <Button
                    type="submit"
                    disabled={loading || cooldown > 0}
                    className="w-full h-20 rounded-[1.8rem] bg-slate-900 text-white font-black uppercase text-xs tracking-[0.3em] shadow-2xl hover:bg-primary transition-all active:scale-95 border-none"
                >
                      {loading ? <Loader2 className="animate-spin h-5 w-5" /> : (showOtpField ? 'Verify Identity' : 'Transmit Access Code')}
                  </Button>
                  {showOtpField && <button type="button" onClick={() => setShowOtpField(false)} className="w-full text-[9px] font-black uppercase text-slate-300 hover:text-primary transition-colors tracking-widest">Change Phone Node</button>}
              </form>
          )}
      </div>

      {/* FEEDBACK NODE */}
      {message.text && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <div className={cn(
                  "p-8 rounded-[2rem] border-2 text-center relative overflow-hidden",
                  message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
              )}>
                  <div className="relative z-10 space-y-4">
                      <div className="flex justify-center">
                          {message.type === 'error' ? <AlertCircle size={32} /> : <ShieldCheck size={32} />}
                      </div>
                      <p className="text-[11px] font-black uppercase tracking-widest leading-relaxed italic">{message.text}</p>

                      {message.text.includes("already exists") && (
                          <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-700">
                              <div className="h-px bg-rose-200/50 w-full" />
                              <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">Protocol Signal: Identity detected in vault.</p>
                              <Button
                                onClick={() => { setIsSignUp(false); setMessage({ type: 'idle', text: '' }); }}
                                className="w-full h-14 rounded-xl bg-rose-600 text-white font-black uppercase text-[10px] shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95 border-none flex items-center justify-center gap-2"
                              >
                                Switch to Vault Login <ArrowRight size={14} className="ml-2" />
                              </Button>
                          </div>
                      )}

                      {(message.text.toLowerCase().includes("network error") || message.text.toLowerCase().includes("critical error")) && (
                          <Button
                            variant="outline"
                            onClick={checkNetworkNode}
                            disabled={isDiagnosticRunning}
                            className="h-12 rounded-xl border-rose-200 text-rose-600 font-black uppercase text-[10px] px-6 hover:bg-rose-100 transition-all flex items-center gap-2 mx-auto mt-4"
                          >
                            {isDiagnosticRunning ? <Loader2 className="animate-spin h-3 w-3" /> : <WifiOff size={14} />}
                            {isDiagnosticRunning ? 'Pinging Node...' : 'Run Network Diagnostic'}
                          </Button>
                      )}
                  </div>
              </div>

              {debugInfo && (
                  <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl text-left overflow-hidden shadow-inner group">
                      <p className="text-[9px] font-black uppercase text-slate-300 mb-2 tracking-[0.3em]">Telemetry Debug Data</p>
                      <code className="text-[10px] text-slate-400 font-mono break-all opacity-60 group-hover:opacity-100 transition-opacity">{debugInfo}</code>
                  </div>
              )}
          </div>
      )}

      {/* FOOTER ACTIONS */}
      <div className="pt-8 border-t border-slate-100 space-y-6">
          <div className="relative flex justify-center text-[9px] uppercase font-black tracking-[0.5em] text-slate-300">
              <span className="bg-white px-6">Social Uplink</span>
          </div>

          <button
            type="button"
            onClick={async () => {
                if (!supabase) return;
                setLoading(true);
                try {
                    const redirectUrl = new URL('/auth/callback', window.location.origin);
                    redirectUrl.searchParams.set('next', '/profile');
                    const referralCode = sessionStorage.getItem('ob_referral_code');
                    if (isSignUp && referralCode) redirectUrl.searchParams.set('ref', referralCode);
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: { redirectTo: redirectUrl.toString() }
                    });
                    if (error) throw error;
                } catch (err: unknown) {
                    setMessage({ type: 'error', text: (err as Error).message });
                } finally {
                    setLoading(false);
                }
            }}
            className="w-full h-18 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-center gap-4 hover:bg-slate-50 hover:border-slate-200 transition-all group active:scale-[0.98] shadow-sm"
          >
            <svg className="h-5 w-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="text-[11px] font-black uppercase tracking-widest text-[#1A202C]">Authenticate with Google</span>
          </button>

          <button
            onClick={() => { setIsSignUp(!isSignUp); setMessage({ type: 'idle', text: '' }); }}
            className="w-full text-center text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors tracking-[0.2em] italic"
          >
            {isSignUp ? 'Member already? Enter Vault' : 'New Patron? Initialize Identity'}
          </button>
      </div>

      {/* Decorative Accents */}
      <div className="absolute -top-10 -right-10 h-40 w-40 bg-primary/5 rounded-full blur-3xl -z-10 animate-pulse" />
      <div className="absolute -bottom-10 -left-10 h-40 w-40 bg-indigo-50/20 rounded-full blur-3xl -z-10" />
    </div>
  );
}
