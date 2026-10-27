'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import {
  DEFAULT_WAITLIST_INVITATION_MESSAGE,
  DEFAULT_WAITLIST_INVITATION_SUBJECT,
  WAITLIST_INVITATION_DRAFT_STORAGE_KEY
} from '@/lib/waitlistInvitationDraft';

interface WaitlistContactInviteButtonProps {
  contactId: string;
  contactName: string | null;
  contactEmail: string;
  onSent: () => void;
}

function readInvitationDraft() {
  const saved = window.localStorage.getItem(WAITLIST_INVITATION_DRAFT_STORAGE_KEY);
  if (!saved) {
    return {
      subject: DEFAULT_WAITLIST_INVITATION_SUBJECT,
      message: DEFAULT_WAITLIST_INVITATION_MESSAGE
    };
  }

  const draft: unknown = JSON.parse(saved);
  if (typeof draft !== 'object' || draft === null
    || !('subject' in draft) || typeof draft.subject !== 'string'
    || !('message' in draft) || typeof draft.message !== 'string') {
    throw new Error('The saved invitation draft is invalid. Open the invitation studio and save it again.');
  }
  if (!draft.subject.trim() || !draft.message.trim()) {
    throw new Error('Add an email subject and message in the invitation studio before inviting this person.');
  }

  return {
    subject: draft.subject.slice(0, 200),
    message: draft.message.slice(0, 5000)
      .replace(/\bADD DATE\b|\bADD TIME\b|ADD PRIVATE VENUE DETAILS/gi, '')
      .replace(/\n{3,}/g, '\n\n')
  };
}

export default function WaitlistContactInviteButton({
  contactId,
  contactName,
  contactEmail,
  onSent
}: WaitlistContactInviteButtonProps) {
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function sendInvitation() {
    if (sending) return;
    setNotice(null);

    let draft: ReturnType<typeof readInvitationDraft>;
    try {
      draft = readInvitationDraft();
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'The saved invitation could not be loaded.'
      });
      return;
    }

    const recipient = contactName?.trim() || contactEmail;
    if (!window.confirm(`Send this invitation only to ${recipient} (${contactEmail})?`)) return;

    setSending(true);
    try {
      const response = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_halloween_invitation',
          id: contactId,
          ...draft
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The invitation could not be sent.');
      setNotice({ type: 'success', message: 'Invitation sent.' });
      onSent();
    } catch (error) {
      console.error(`[WaitlistInvitation] Could not invite signup ${contactId}:`, error);
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'The invitation could not be sent.'
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void sendInvitation()}
        disabled={sending}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-orange-800 px-3 text-[10px] font-black text-white hover:bg-orange-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send size={12} /> {sending ? 'Sending…' : 'Invite'}
      </button>
      {notice && (
        <p role={notice.type === 'error' ? 'alert' : 'status'} className={`max-w-40 text-[10px] ${notice.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
          {notice.message}
        </p>
      )}
    </div>
  );
}
