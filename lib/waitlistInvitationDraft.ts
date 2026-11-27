export const WAITLIST_INVITATION_DRAFT_STORAGE_KEY = 'waitlist-join-invitation-draft';

export const DEFAULT_WAITLIST_INVITATION_SUBJECT = 'Online Bar is open, {{name}} — your invite is here';

export const DEFAULT_WAITLIST_INVITATION_MESSAGE = [
  'Hi {{name}},',
  '',
  'You joined our waitlist, and Online Bar is now open. Create your account and start shopping today.',
  '',
  'Your first paid order also comes with a mystery gift, included at no extra charge.',
  '',
  'Create your account and start shopping: {{signup_link}}'
].join('\n');

const PREVIOUS_DEFAULT_WAITLIST_INVITATION_SUBJECT = 'You’re invited to join Online Bar';
const PREVIOUS_DEFAULT_WAITLIST_INVITATION_MESSAGE = [
  'Hi {{name}},',
  '',
  'You joined our waitlist, and the doors are open. Create your Online Bar account to explore the store and place your first order.',
  '',
  'There’s a mystery gift waiting for you on your first paid order.',
  '',
  'Join here: {{signup_link}}'
].join('\n');

export function upgradeWaitlistInvitationDraft(subject: string, message: string) {
  return {
    subject: subject === PREVIOUS_DEFAULT_WAITLIST_INVITATION_SUBJECT
      ? DEFAULT_WAITLIST_INVITATION_SUBJECT
      : subject,
    message: message === PREVIOUS_DEFAULT_WAITLIST_INVITATION_MESSAGE
      ? DEFAULT_WAITLIST_INVITATION_MESSAGE
      : message
  };
}
