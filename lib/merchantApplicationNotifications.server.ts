import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { getPublicBaseUrl } from '@/lib/utils';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

async function getAdminRecipient(database: SupabaseClient) {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim();
  if (configuredEmail) return configuredEmail;

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'contact')
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw error;

  return typeof data?.value?.email === 'string' ? data.value.email.trim() : '';
}

export async function notifyAdminOfMerchantApplication(
  database: SupabaseClient,
  input: {
    applicationId: string;
    businessName: string;
    businessType: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    reviewPath: '/lord/merchants' | '/lord/market';
    idempotencyKey: string;
  }
): Promise<{ sent: boolean; warning?: string }> {
  const emailConfig = getTransactionalEmailConfig();
  if (!emailConfig.configured || !emailConfig.from) {
    return { sent: false, warning: 'Email alerts are not configured.' };
  }

  let recipient: string;
  try {
    recipient = await getAdminRecipient(database);
  } catch (error) {
    console.error('[MerchantApplicationAlert] Could not load the admin email recipient:', error);
    return { sent: false, warning: 'The admin notification recipient could not be loaded.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { sent: false, warning: 'The admin notification recipient is not configured.' };
  }

  const businessName = escapeHtml(input.businessName);
  const businessType = escapeHtml(input.businessType.replace(/_/g, ' '));
  const contactName = escapeHtml(input.contactName);
  const contactEmail = escapeHtml(input.contactEmail);
  const contactPhone = escapeHtml(input.contactPhone);
  const applicationId = escapeHtml(input.applicationId);
  const reviewUrl = `${getPublicBaseUrl()}${input.reviewPath}`;
  const text = [
    `A new ${input.businessType.replace(/_/g, ' ')} application was submitted.`,
    `Business: ${input.businessName}`,
    `Contact: ${input.contactName} (${input.contactEmail}, ${input.contactPhone})`,
    `Application reference: ${input.applicationId}`,
    `Review: ${reviewUrl}`
  ].join('\n');

  try {
    await sendTransactionalEmail({
      from: emailConfig.from,
      to: recipient,
      subject: `New merchant application: ${input.businessName.replace(/[\r\n]/g, ' ')}`,
      text,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#152238">
        <p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#e79a00;text-transform:uppercase">OnlineBar · Merchant submissions</p>
        <h1 style="font-size:24px;margin:12px 0">A new application is ready for review</h1>
        <p><b>Business:</b> ${businessName}</p>
        <p><b>Application type:</b> ${businessType}</p>
        <p><b>Contact:</b> ${contactName} · ${contactEmail} · ${contactPhone}</p>
        <p><b>Reference:</b> ${applicationId}</p>
        <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#e79a00;color:#152238;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Open application queue</a>
      </div>`,
      idempotencyKey: input.idempotencyKey
    });
    return { sent: true };
  } catch (error) {
    console.error('[MerchantApplicationAlert] Could not email the admin about a new application:', error);
    return { sent: false, warning: 'The application was saved, but its admin email alert could not be sent.' };
  }
}

export async function emailMarketSellerApproval(input: {
  applicationId: string;
  businessName: string;
  recipient: string;
  approvedAt: string;
}): Promise<{ sent: boolean; warning?: string }> {
  const emailConfig = getTransactionalEmailConfig();
  if (!emailConfig.configured || !emailConfig.from) {
    return { sent: false, warning: 'Approval was saved, but email is not configured to send the seller dashboard link.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient)) {
    return { sent: false, warning: 'Approval was saved, but the seller email address is invalid.' };
  }

  const businessName = escapeHtml(input.businessName);
  const dashboardUrl = `${getPublicBaseUrl()}/merchant/dashboard`;
  const applicationId = escapeHtml(input.applicationId);
  try {
    await sendTransactionalEmail({
      from: emailConfig.from,
      to: input.recipient,
      subject: `${input.businessName.replace(/[\r\n]/g, ' ')} is approved for the OnlineBar Market`,
      text: `Your seller application for ${input.businessName} has been approved. Sign in with the verified account used to apply, then open your seller dashboard: ${dashboardUrl}. Application reference: ${input.applicationId}.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#152238">
        <p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#e79a00;text-transform:uppercase">OnlineBar · Midnight Market</p>
        <h1 style="font-size:24px;margin:12px 0">Your seller application is approved</h1>
        <p>Your application for <b>${businessName}</b> has been approved and your seller account is ready.</p>
        <p>Sign in with the verified account used to apply, then open your seller dashboard.</p>
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#e79a00;color:#152238;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Open seller dashboard</a>
        <p style="margin-top:20px;font-size:12px;color:#64748b">Application reference: ${applicationId}</p>
      </div>`,
      idempotencyKey: `market-seller-approval:${input.applicationId}:${input.approvedAt}`
    });
    return { sent: true };
  } catch (error) {
    console.error('[MarketAdmin] Seller approved, but the dashboard email failed:', error);
    return { sent: false, warning: 'Approval was saved, but the seller dashboard email could not be sent. Resend the link after checking Email Command Center.' };
  }
}
