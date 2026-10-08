export function phoneCallHref(value: string | null | undefined) {
  const rawPhone = value?.trim() || '';
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;
  return `tel:${rawPhone.startsWith('+') ? '+' : ''}${digits}`;
}

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'x' | 'youtube' | 'snapchat';

const socialHosts: Record<SocialPlatform, string> = {
  instagram: 'instagram.com',
  tiktok: 'tiktok.com',
  facebook: 'facebook.com',
  x: 'x.com',
  youtube: 'youtube.com',
  snapchat: 'snapchat.com'
};

export function socialProfileHref(platform: SocialPlatform, value: string | null | undefined) {
  const profile = value?.trim();
  if (!profile) return null;

  const candidate = /^https?:\/\//i.test(profile) ? profile : `https://${profile}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== socialHosts[platform] && !host.endsWith(`.${socialHosts[platform]}`)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
