import 'server-only';

import { createClient, type User } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { WAITLIST_LAUNCH_GIFT_MESSAGE } from '@/lib/lifecycleEmailPreviews';

function getServiceDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error('Waitlist lifecycle database access is not configured.');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

export async function recordWaitlistAccountConversion(user: User, origin: string) {
  const email = user.email?.trim().toLowerCase();
  if (!email) return { converted: false as const };

  const database = getServiceDatabase();
  const { data: members, error: memberError } = await database
    .from('market_waitlist')
    .select('id,full_name,email,status,email_updates_consent,unsubscribed_at,created_at')
    .eq('email', email)
    .order('created_at', { ascending: true })
    .limit(20);
  if (memberError) throw memberError;

  const createdAt = new Date(user.created_at);
  const member = (members || []).find(candidate => {
    const waitlistAt = new Date(candidate.created_at);
    return Number.isFinite(createdAt.getTime())
      && Number.isFinite(waitlistAt.getTime())
      && createdAt.getTime() >= waitlistAt.getTime();
  });
  if (!member) return { converted: false as const };

  const accountCreatedAt = createdAt.toISOString();
  const { error: linkError } = await database.from('market_waitlist')
    .update({
      user_id: user.id,
      converted_to_user: user.id,
      account_created_at: accountCreatedAt,
      status: member.status === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'CONVERTED',
      updated_at: new Date().toISOString()
    })
    .eq('id', member.id);
  if (linkError) throw linkError;

  const emailAllowed = member.email_updates_consent === true
    && member.status !== 'UNSUBSCRIBED'
    && !member.unsubscribed_at;
  const { error: createEventError } = await database.from('waitlist_lifecycle_events')
    .upsert({
      waitlist_id: member.id,
      user_id: user.id,
      event_type: 'account_created',
      welcome_email_status: emailAllowed ? 'pending' : 'skipped',
      metadata: { accountCreatedAt }
    }, {
      onConflict: 'user_id,event_type',
      ignoreDuplicates: true
    });
  if (createEventError) throw createEventError;

  const { data: event, error: eventError } = await database.from('waitlist_lifecycle_events')
    .select('id,welcome_email_status')
    .eq('user_id', user.id)
    .eq('event_type', 'account_created')
    .single();
  if (eventError) throw eventError;

  if (!emailAllowed && event.welcome_email_status === 'pending') {
    const { error } = await database.from('waitlist_lifecycle_events')
      .update({ welcome_email_status: 'skipped', welcome_email_error: null })
      .eq('id', event.id);
    if (error) throw error;
    return { converted: true as const, emailStatus: 'skipped' as const };
  }

  if (emailAllowed && ['pending', 'failed'].includes(event.welcome_email_status)) {
    const { data: suppression, error: suppressionError } = await database.from('email_suppressions')
      .select('email')
      .eq('email', email)
      .maybeSingle();
    if (suppressionError) {
      console.error('[WaitlistLifecycle] Could not verify email suppression status:', suppressionError);
      const { error } = await database.from('waitlist_lifecycle_events')
        .update({
          welcome_email_status: 'failed',
          welcome_email_error: 'Email suppression status could not be verified.'
        })
        .eq('id', event.id);
      if (error) console.error('[WaitlistLifecycle] Could not record the suppression check failure:', error);
      return { converted: true as const, emailStatus: 'failed' as const };
    }
    if (suppression) {
      const { error } = await database.from('waitlist_lifecycle_events')
        .update({
          welcome_email_status: 'skipped',
          welcome_email_error: 'Recipient address is suppressed.'
        })
        .eq('id', event.id);
      if (error) throw error;
      return { converted: true as const, emailStatus: 'skipped' as const };
    }

    const firstName = (member.full_name || user.user_metadata?.full_name || 'there')
      .toString()
      .trim()
      .split(/\s+/)[0] || 'there';
    const shopUrl = new URL('/market', origin).toString();
    try {
      await sendTransactionalEmail({
        to: email,
        subject: 'Your Online Bar account is ready—and a mystery gift awaits 🎁',
        text: `Hi ${firstName},\n\nWelcome to Online Bar. Your waitlist membership is linked to your account, and a mystery gift will be included with your first paid order.\n\n${WAITLIST_LAUNCH_GIFT_MESSAGE}\n\nStart shopping: ${shopUrl}\n\nOnline Bar · Nairobi, Kenya`,
        html: `<!doctype html><html lang="en"><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#14213a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#0b1020;padding:20px 28px;color:#fff;font:bold 16px Arial,sans-serif;letter-spacing:2px">ONLINE <span style="color:#f59e0b">BAR</span></td></tr><tr><td style="padding:30px 28px"><p style="margin:0;color:#d97706;font:bold 12px Arial,sans-serif;letter-spacing:2px">WELCOME TO ONLINE BAR</p><h1 style="margin:12px 0;color:#14213a;font:bold 30px/1.2 Arial,sans-serif">You’re in, ${escapeHtml(firstName)}.</h1><p style="color:#475467;font:16px/1.65 Arial,sans-serif">Your waitlist membership is linked to your account. Your first paid order comes with a mystery gift, included at no extra charge.</p><div style="margin:22px 0;padding:18px;border:1px solid #ffc943;border-radius:14px;background:#fff7e6;color:#713d12;font:15px/1.6 Arial,sans-serif">${escapeHtml(WAITLIST_LAUNCH_GIFT_MESSAGE)}</div><p style="text-align:center;margin:26px 0"><a href="${escapeHtml(shopUrl)}" style="display:inline-block;background:#f59e0b;color:#111827;font:bold 15px Arial,sans-serif;text-decoration:none;padding:15px 28px;border-radius:12px">Start shopping</a></p><p style="color:#667085;font:12px/1.6 Arial,sans-serif">Online Bar · Nairobi, Kenya · 18+ for alcohol products. Please drink responsibly.</p></td></tr></table></td></tr></table></body></html>`,
        idempotencyKey: `waitlist-welcome-${event.id}`
      });
      const { error: sentError } = await database.from('waitlist_lifecycle_events')
        .update({
          welcome_email_status: 'sent',
          welcome_email_sent_at: new Date().toISOString(),
          welcome_email_error: null
        })
        .eq('id', event.id);
      if (sentError) throw sentError;
      return { converted: true as const, emailStatus: 'sent' as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Welcome email delivery failed.';
      console.error('[WaitlistLifecycle] Account was linked, but the welcome email could not be sent:', error);
      const { error: saveError } = await database.from('waitlist_lifecycle_events')
        .update({
          welcome_email_status: 'failed',
          welcome_email_error: message.slice(0, 500)
        })
        .eq('id', event.id);
      if (saveError) {
        console.error('[WaitlistLifecycle] Could not record the welcome email failure:', saveError);
      }
      return { converted: true as const, emailStatus: 'failed' as const };
    }
  }

  return { converted: true as const, emailStatus: event.welcome_email_status };
}
