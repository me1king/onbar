'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Image as ImageIcon, Mail, MapPin, MessageCircle, RefreshCw, Save, Search, Send, Store, Upload, Users } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import WaitlistFitStudioPanel from '@/components/admin/WaitlistFitStudioPanel';
import LocationLaunchSettings from '@/components/admin/LocationLaunchSettings';
import WaitlistLaunchCountdownPreview from '@/components/admin/WaitlistLaunchCountdownPreview';
import WaitlistContactInviteButton from '@/components/admin/WaitlistContactInviteButton';

type WaitlistStatus = 'WAITLIST' | 'INVITED' | 'NOTIFIED' | 'CONVERTED' | 'UNSUBSCRIBED';
type RewardPath = 'wine' | 'adventure' | 'music';
const experienceLabels: Record<RewardPath, string> = {
  wine: 'Wine tastings & curated gifts',
  adventure: 'Hosted adventures for two',
  music: 'Soul Fest ticket draw'
};
interface WaitlistContact {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  country: string;
  county: string;
  city: string;
  area: string;
  landmark: string | null;
  location_verified: boolean;
  location_accuracy_m: number | null;
  service_area_status: 'in_area' | 'outside_area' | 'unknown';
  email_updates_consent: boolean;
  sms_consent: boolean;
  whatsapp_consent: boolean;
  preferred_contact_method: string | null;
  product_interests: string[];
  reward_path: RewardPath | null;
  order_frequency: string | null;
  age_group: string | null;
  age_confirmed: boolean;
  age_confirmed_at: string | null;
  referral_code: string | null;
  referred_by_code: string | null;
  campaign: string | null;
  landing_page: string | null;
  source: string;
  status: WaitlistStatus;
  created_at: string;
  unsubscribed_at: string | null;
}
interface WaitlistStats {
  total: number;
  inArea: number;
  outsideArea: number;
  unknownArea: number;
  emailOptIns: number;
  smsOptIns: number;
  whatsappOptIns: number;
  areas: Array<{ country: string; county: string; city: string; area: string; total: number; inArea: number }>;
  interests: Array<{ name: string; count: number }>;
  ageGroups: Array<{ group: string; label: string; count: number }>;
  rewardPaths: Array<{ path: RewardPath; label: string; count: number }>;
}
interface WaitlistReferralLeaderboardEntry {
  referrerId: string;
  name: string;
  referralCode: string;
  directReferrals: number;
  networkReferrals: number;
  positiveTurnoverReferrals: number;
  turnover: number;
  pointsEarned: number;
}
interface WaitlistReferralCredit {
  id: string;
  referrerId: string;
  referrerName: string;
  inviteeId: string;
  inviteeName: string;
  inviteeEmail: string;
  depth: number;
  points: number;
  turnover: number;
  country: string;
  county: string;
  city: string;
  area: string;
  createdAt: string;
}
interface WaitlistResponse {
  contacts: WaitlistContact[];
  stats: WaitlistStats;
  invitationsSent?: number | null;
  invitationTrackingSetupRequired?: boolean;
  referralAnalytics: {
    referrers: WaitlistReferralLeaderboardEntry[];
    credits: WaitlistReferralCredit[];
    uncreditedDirectReferrals: number;
  };
  page: number;
  hasMore: boolean;
  error?: string;
}
type CampaignPhase = 'signal' | 'anticipation' | 'invitation' | 'final_call' | 'aftermath';
type CampaignExperience = { id: RewardPath; title: string; description: string; icon: string; active: boolean };
interface WaitlistCampaignSettings {
  brandName: string;
  brandDescriptor: string;
  palette: 'midnight' | 'yellow';
  tagline: string;
  subheadline: string;
  presentedBy: string;
  instagramHandle: string;
  ctaLabel: string;
  phase: CampaignPhase;
  announcement: string;
  eventTitle: string;
  eventDetails: string;
  venueNotice: string;
  registrationUrl: string;
  registrationLabel: string;
  experiences: CampaignExperience[];
}
interface WaitlistSiteContent {
  id: string;
  eyebrow: string;
  headline: string;
  intro: string;
  benefit_one: string;
  benefit_two: string;
  benefit_three: string;
  hero_image_url: string | null;
  hero_image_path: string | null;
  hero_image_alt: string;
  age_group_tracks: Record<string, { title: string; path: string; url: string }>;
  genre_tracks: Record<string, { title: string; path: string; url: string }>;
  campaign_settings: WaitlistCampaignSettings;
  launch_at: string | null;
  tokens_per_referral: number;
  updated_at: string;
}
interface WaitlistSiteReward {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  image_path: string | null;
  token_cost: number;
  is_active: boolean;
  sort_order: number;
}
interface WaitlistRewardClaim {
  id: string;
  referrer_id: string;
  reward_id: string;
  tokens_spent: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  member?: { full_name: string | null; email: string } | null;
}
interface WaitlistSiteAnalytics {
  page_opens: number;
  unique_visitors: number;
  age_groups: Array<{ group: string; label: string; visitors: number }>;
  genre_picks: Array<{ genre: string | null; label: string; visitors: number }>;
  music: Array<{ age_group: string; music_genre: string | null; track_title: string; starts: number; heard_80: number; listeners: number }>;
  locations: Array<{ country: string; county: string; city: string; area: string; signups: number }>;
}

const ageGroups = [
  { id: '18_20', label: '18–20' },
  { id: '21_24', label: '21–24' },
  { id: '25_34', label: '25–34' },
  { id: '35_44', label: '35–44' },
  { id: '45_plus', label: '45+' }
];

const musicGenres = [
  { id: 'reggae', label: 'Reggae' },
  { id: 'genge', label: 'Genge' },
  { id: 'gengetone', label: 'Gengetone' },
  { id: 'soul', label: 'Soul' },
  { id: 'rnb', label: 'R&B' },
  { id: 'classic', label: 'Classics' },
  { id: 'love_romance', label: 'Love & Romance' },
  { id: 'afrobeats', label: 'Afrobeats' },
  { id: 'hip_hop', label: 'Hip-hop' },
  { id: 'pop', label: 'Pop' },
  { id: 'other', label: 'Other' }
];

const statusLabels: Record<WaitlistStatus, string> = {
  WAITLIST: 'New',
  INVITED: 'Invited',
  NOTIFIED: 'Notified',
  CONVERTED: 'Converted',
  UNSUBSCRIBED: 'Unsubscribed'
};

function count(value: number | undefined) {
  return new Intl.NumberFormat('en-KE').format(value || 0);
}

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value || 0);
}

function date(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString('en-KE');
}

async function readAdminJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const isHtml = response.headers.get('content-type')?.includes('text/html') || /^\s*</.test(body);
    throw new Error(isHtml
      ? `The Admin API returned a web page instead of data (HTTP ${response.status}). Refresh the page and sign in again. If it continues, redeploy Online Bar so the waitlist Admin API is available.`
      : `${fallbackMessage} The Admin API returned an invalid response (HTTP ${response.status}).`);
  }
}

export default function WaitlistPage() {
  const { role, permissions } = useAdmin();
  const [data, setData] = useState<WaitlistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [rewardPath, setRewardPath] = useState<'all' | RewardPath>('all');
  const [page, setPage] = useState(0);
  const [referralCreditPage, setReferralCreditPage] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [invitationSubject, setInvitationSubject] = useState('You’re invited: Halloween Private House Party 🎃');
  const [invitationMessage, setInvitationMessage] = useState(
    'Hi {{name}},\n\nYou’re invited to the biggest Halloween private house party! 🎃\n\nGet your ticket here: {{tickets_link}}\n\nWe hope to see you there!'
  );
  const [sendingInvitations, setSendingInvitations] = useState(false);
  const [invitationNotice, setInvitationNotice] = useState('');
  const [siteContent, setSiteContent] = useState<WaitlistSiteContent | null>(null);
  const [loadingSiteContent, setLoadingSiteContent] = useState(false);
  const [publicSiteCheckAvailable, setPublicSiteCheckAvailable] = useState<boolean | null>(null);
  const [publicSiteConfirmed, setPublicSiteConfirmed] = useState<Record<string, boolean>>({});
  const [siteContentError, setSiteContentError] = useState('');
  const [siteContentNotice, setSiteContentNotice] = useState('');
  const [siteContentNoticeConfirmed, setSiteContentNoticeConfirmed] = useState(true);
  const [savingSiteContent, setSavingSiteContent] = useState(false);
  const [uploadingSiteImage, setUploadingSiteImage] = useState(false);
  const [uploadingTrack, setUploadingTrack] = useState<string | null>(null);
  const [trackUploadErrors, setTrackUploadErrors] = useState<Record<string, string>>({});
  const [trackTitles, setTrackTitles] = useState<Record<string, string>>({});
  const [siteAnalytics, setSiteAnalytics] = useState<WaitlistSiteAnalytics | null>(null);
  const [siteAnalyticsError, setSiteAnalyticsError] = useState('');
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [siteRewards, setSiteRewards] = useState<WaitlistSiteReward[]>([]);
  const [rewardClaims, setRewardClaims] = useState<WaitlistRewardClaim[]>([]);
  const [newReward, setNewReward] = useState({ name: '', description: '', token_cost: 10 });
  const [savingRewardId, setSavingRewardId] = useState<string | null>(null);
  const [reviewingClaimId, setReviewingClaimId] = useState<string | null>(null);

  const canView = role === 'owner' || role === 'admin'
    || permissions.can_manage_communications || permissions.can_manage_customer_care;
  const canManageMarket = role === 'owner' || role === 'admin' || permissions.can_manage_inventory;
  const canManageSite = role === 'owner' || role === 'admin' || permissions.can_manage_settings;
  const canExportFitStudio = role === 'owner' || role === 'admin' || permissions.can_view_sensitive_data;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), status, search, rewardPath });
      const response = await fetch(`/api/admin/waitlist?${params}`, { cache: 'no-store' });
      const result = await response.json() as WaitlistResponse;
      if (!response.ok) throw new Error(result.error || 'Waitlist data could not be loaded.');
      setData(result);
    } catch (cause) {
      console.error('[AdminWaitlist] Could not load early-access list:', cause);
      setError(cause instanceof Error ? cause.message : 'Waitlist data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [page, search, rewardPath, status]);

  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const loadSiteContent = useCallback(async () => {
    if (!canManageSite) return;
    setLoadingSiteContent(true);
    setSiteContentError('');
    setSiteAnalyticsError('');
    try {
      const response = await fetch(`/api/admin/waitlist-site?days=${analyticsDays}`, { cache: 'no-store' });
      const result = await readAdminJson<{
        content?: WaitlistSiteContent;
        rewards?: WaitlistSiteReward[];
        claims?: WaitlistRewardClaim[];
        analytics?: WaitlistSiteAnalytics | null;
        analyticsError?: string | null;
        analyticsDays?: number;
        publicSiteCheckAvailable?: boolean;
        publicSiteConfirmed?: Record<string, boolean>;
        error?: string;
      }>(response, 'Website content could not be loaded.');
      if (!response.ok || !result.content) throw new Error(result.error || 'Website content could not be loaded.');
      setSiteContent(result.content);
      setSiteRewards(result.rewards || []);
      setRewardClaims(result.claims || []);
      setSiteAnalytics(result.analytics || null);
      setSiteAnalyticsError(result.analyticsError || '');
      if (result.analyticsDays) setAnalyticsDays(result.analyticsDays);
      setPublicSiteCheckAvailable(result.publicSiteCheckAvailable ?? false);
      setPublicSiteConfirmed(result.publicSiteConfirmed || {});
    } catch (cause) {
      console.error('[AdminWaitlistSite] Could not load website settings:', cause);
      setSiteContentError(cause instanceof Error ? cause.message : 'Website content could not be loaded.');
    } finally {
      setLoadingSiteContent(false);
    }
  }, [analyticsDays, canManageSite]);

  useEffect(() => { void loadSiteContent(); }, [loadSiteContent]);

  useEffect(() => {
    if (loadingSiteContent || !window.location.hash.startsWith('#waitlist-')) return;
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    if (targetId !== 'waitlist-age-music' && targetId !== 'waitlist-genre-music') return;
    const timer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [loadingSiteContent, siteContent]);

  const topAreas = useMemo(() => (data?.stats.areas || []).slice(0, 5), [data]);
  const referralCredits = data?.referralAnalytics?.credits || [];
  const referralCreditPageSize = 20;
  const referralCreditPageCount = Math.ceil(referralCredits.length / referralCreditPageSize);
  const visibleReferralCredits = referralCredits.slice(
    referralCreditPage * referralCreditPageSize,
    (referralCreditPage + 1) * referralCreditPageSize
  );
  const locationHeatMaximum = Math.max(1, ...(siteAnalytics?.locations || []).map(location => location.signups));
  const genrePickMaximum = Math.max(1, ...(siteAnalytics?.genre_picks || []).map(genre => genre.visitors));
  const invitationReady = Boolean(invitationSubject.trim() && invitationMessage.trim());
  const topTrackByAge = useMemo(() => {
    const leaders = new Map<string, WaitlistSiteAnalytics['music'][number]>();
    for (const track of siteAnalytics?.music || []) {
      const current = leaders.get(track.age_group);
      if (track.starts >= 5 && (!current || track.heard_80 / track.starts > current.heard_80 / current.starts)) {
        leaders.set(track.age_group, track);
      }
    }
    return leaders;
  }, [siteAnalytics]);

  const saveSiteContent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!siteContent) return;
    setSavingSiteContent(true);
    setSiteContentError('');
    setSiteContentNotice('');
    setSiteContentNoticeConfirmed(true);
    try {
      const response = await fetch('/api/admin/waitlist-site', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(siteContent)
      });
      const result = await readAdminJson<{ content?: WaitlistSiteContent; error?: string }>(response, 'Website content could not be saved.');
      if (!response.ok || !result.content) throw new Error(result.error || 'Website content could not be saved.');
      setSiteContent(result.content);
      setSiteContentNotice('Published. The standalone site will use the selected palette and campaign settings on its next load or refresh.');
    } catch (cause) {
      console.error('[AdminWaitlistSite] Could not save website content:', cause);
      setSiteContentError(cause instanceof Error ? cause.message : 'Website content could not be saved.');
    } finally {
      setSavingSiteContent(false);
    }
  };

  const uploadSiteImage = async (file: File | undefined) => {
    if (!file) return;
    setUploadingSiteImage(true);
    setSiteContentError('');
    setSiteContentNotice('');
    setSiteContentNoticeConfirmed(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/waitlist-site', { method: 'POST', body: form });
      const result = await readAdminJson<{ content?: WaitlistSiteContent; error?: string }>(response, 'Website image could not be uploaded.');
      if (!response.ok || !result.content) throw new Error(result.error || 'Website image could not be uploaded.');
      setSiteContent(result.content);
      setSiteContentNotice('Hero image uploaded and published.');
    } catch (cause) {
      console.error('[AdminWaitlistSite] Could not upload website hero image:', cause);
      setSiteContentError(cause instanceof Error ? cause.message : 'Website image could not be uploaded.');
    } finally {
      setUploadingSiteImage(false);
    }
  };

  const uploadMusicTrack = async (type: 'age' | 'genre', key: string, file: File | undefined) => {
    if (!file) return;
    const trackId = `${type}:${key}`;
    const track = type === 'genre' ? siteContent?.genre_tracks?.[key] : siteContent?.age_group_tracks?.[key];
    const title = trackTitles[trackId]?.trim() || track?.title || '';
    if (!title) {
      const label = type === 'genre'
        ? musicGenres.find(genre => genre.id === key)?.label || key
        : ageGroups.find(group => group.id === key)?.label || key;
      const message = `Enter a track name for ${type === 'genre' ? label : `age ${label}`}.`;
      setTrackUploadErrors(current => ({ ...current, [trackId]: message }));
      setSiteContentError(message);
      return;
    }
    setTrackUploadErrors(current => ({ ...current, [trackId]: '' }));
    setUploadingTrack(trackId);
    setSiteContentError('');
    setSiteContentNotice('');
    setSiteContentNoticeConfirmed(true);
    try {
      const form = new FormData();
      form.append('kind', 'music');
      form.append('musicType', type);
      form.append(type === 'genre' ? 'genre' : 'ageGroup', key);
      form.append('title', title);
      form.append('file', file);
      const response = await fetch('/api/admin/waitlist-site', { method: 'POST', body: form });
      const result = await readAdminJson<{
        content?: WaitlistSiteContent;
        publicSiteCheckAvailable?: boolean;
        publicSiteConfirmed?: boolean;
        error?: string;
      }>(response, 'Music could not be uploaded.');
      if (!response.ok || !result.content) throw new Error(result.error || 'Music could not be uploaded.');
      const savedTrack = type === 'genre' ? result.content.genre_tracks?.[key] : result.content.age_group_tracks?.[key];
      if (!savedTrack || savedTrack.title !== title) throw new Error('The upload finished but its saved music assignment could not be confirmed. Refresh the page and check the track before retrying.');
      setSiteContent(result.content);
      setPublicSiteCheckAvailable(result.publicSiteCheckAvailable ?? false);
      setPublicSiteConfirmed(current => ({ ...current, [trackId]: result.publicSiteConfirmed === true }));
      const label = type === 'genre'
        ? musicGenres.find(genre => genre.id === key)?.label || key
        : ageGroups.find(group => group.id === key)?.label || key;
      setSiteContentNoticeConfirmed(result.publicSiteConfirmed === true);
      setSiteContentNotice(result.publicSiteConfirmed
        ? `UPLOAD COMPLETE — “${savedTrack.title}” is assigned to ${type === 'genre' ? label : `age ${label}`} and confirmed on the live waitlist site.`
        : result.publicSiteCheckAvailable
          ? `UPLOAD SAVED, BUT NOT LIVE — “${savedTrack.title}” is saved for ${type === 'genre' ? label : `age ${label}`}, but the live waitlist site does not have this assignment. Make sure both deployments use the same Supabase project. Do not upload it again.`
          : `UPLOAD SAVED — “${savedTrack.title}” is assigned to ${type === 'genre' ? label : `age ${label}`}, but the live waitlist site could not be checked. Check the public site connection before treating it as live.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Music could not be uploaded.';
      console.error('[AdminWaitlistSite] Could not upload waitlist music:', cause);
      setTrackUploadErrors(current => ({ ...current, [trackId]: message }));
      setSiteContentError(message);
    } finally {
      setUploadingTrack(null);
    }
  };

  const saveReward = async (reward: Partial<WaitlistSiteReward> & Pick<WaitlistSiteReward, 'name' | 'description' | 'token_cost' | 'is_active' | 'sort_order'>) => {
    setSavingRewardId(reward.id || 'new');
    setSiteContentError('');
    setSiteContentNotice('');
    try {
      const response = await fetch('/api/admin/waitlist-site', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_reward', reward })
      });
      const result = await response.json() as { reward?: WaitlistSiteReward; error?: string };
      if (!response.ok || !result.reward) throw new Error(result.error || 'Souvenir details could not be saved.');
      setSiteRewards(current => current.some(item => item.id === result.reward!.id)
        ? current.map(item => item.id === result.reward!.id ? result.reward! : item)
        : [...current, result.reward!].sort((a, b) => a.sort_order - b.sort_order));
      if (!reward.id) setNewReward({ name: '', description: '', token_cost: 10 });
      setSiteContentNotice('Souvenir saved. Upload an image to make the prize visible on the standalone site.');
      return result.reward;
    } catch (cause) {
      setSiteContentError(cause instanceof Error ? cause.message : 'Souvenir details could not be saved.');
      return null;
    } finally {
      setSavingRewardId(null);
    }
  };

  const uploadRewardImage = async (reward: WaitlistSiteReward, file: File | undefined) => {
    if (!file) return;
    setSavingRewardId(reward.id);
    setSiteContentError('');
    setSiteContentNotice('');
    try {
      const form = new FormData();
      form.append('kind', 'reward');
      form.append('rewardId', reward.id);
      form.append('file', file);
      const response = await fetch('/api/admin/waitlist-site', { method: 'POST', body: form });
      const result = await response.json() as { reward?: WaitlistSiteReward; error?: string };
      if (!response.ok || !result.reward) throw new Error(result.error || 'Souvenir image could not be uploaded.');
      setSiteRewards(current => current.map(item => item.id === reward.id ? result.reward! : item));
      setSiteContentNotice(`Image published for ${reward.name}.`);
    } catch (cause) {
      setSiteContentError(cause instanceof Error ? cause.message : 'Souvenir image could not be uploaded.');
    } finally {
      setSavingRewardId(null);
    }
  };

  const deleteReward = async (reward: WaitlistSiteReward) => {
    setSiteContentError('');
    setSiteContentNotice('');
    try {
      const response = await fetch('/api/admin/waitlist-site', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_reward', id: reward.id })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Souvenir could not be removed.');
      setSiteRewards(current => current.filter(item => item.id !== reward.id));
    } catch (cause) {
      setSiteContentError(cause instanceof Error ? cause.message : 'Souvenir could not be removed.');
    }
  };

  const decideRewardClaim = async (claim: WaitlistRewardClaim, decision: 'approved' | 'rejected') => {
    setReviewingClaimId(claim.id);
    setSiteContentError('');
    try {
      const response = await fetch('/api/admin/waitlist-site', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_status', id: claim.id, status: decision })
      });
      const result = await response.json() as { claim?: WaitlistRewardClaim; error?: string };
      if (!response.ok || !result.claim) throw new Error(result.error || 'Redemption could not be reviewed.');
      setRewardClaims(current => current.map(item => item.id === claim.id ? result.claim! : item));
    } catch (cause) {
      setSiteContentError(cause instanceof Error ? cause.message : 'Redemption could not be reviewed.');
    } finally {
      setReviewingClaimId(null);
    }
  };

  const updateStatus = async (contact: WaitlistContact, nextStatus: WaitlistStatus) => {
    if (contact.status === 'WAITLIST' && nextStatus === 'INVITED') {
      setError('To send the invitation, use Invite beside that person or open Halloween invitations for a bulk send.');
      return;
    }
    setSavingId(contact.id);
    setError('');
    setInvitationNotice('');
    try {
      const response = await fetch('/api/admin/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: contact.id,
          status: nextStatus,
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Signup status could not be updated.');
      if (contact.status === 'WAITLIST' && nextStatus === 'INVITED') {
        setInvitationNotice(`Halloween invitation sent to ${contact.email}.`);
      }
      await load();
    } catch (cause) {
      console.error('[AdminWaitlist] Could not update signup:', cause);
      setError(cause instanceof Error ? cause.message : 'Signup status could not be updated.');
    } finally {
      setSavingId(null);
    }
  };

  const sendHalloweenInvitations = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.confirm('Send this invitation to every New waitlist member with active email, SMS and/or WhatsApp consent? Each person will only be contacted through channels they opted into.')) return;
    setSendingInvitations(true);
    setError('');
    setInvitationNotice('');
    try {
      const response = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_halloween_invitations',
          subject: invitationSubject,
          message: invitationMessage
        })
      });
      const result = await response.json() as { invited?: number; sent?: number; failed?: number; trackingFailed?: number; eligible?: number; error?: string };
      if (!response.ok && response.status !== 207) throw new Error(result.error || 'Halloween invitations could not be sent.');
      setInvitationNotice(
        `Invited ${result.invited || 0} of ${result.eligible || 0} eligible people (${result.sent || 0} messages sent across their opted-in channels)${result.failed ? `; ${result.failed} channel deliveries failed` : ''}${result.trackingFailed ? `; ${result.trackingFailed} delivery results could not be counted` : ''}.`
      );
      await load();
    } catch (cause) {
      console.error('[AdminWaitlist] Could not send Halloween invitations:', cause);
      setError(cause instanceof Error ? cause.message : 'Halloween invitations could not be sent.');
    } finally {
      setSendingInvitations(false);
    }
  };

  if (!canView) return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-rose-500" />
      <h1 className="mt-4 text-2xl font-black text-slate-950">Waitlist access required</h1>
      <p className="mt-2 text-sm text-slate-600">Only administrators and authorized customer communications managers can view signup contact details.</p>
    </main>
  );

  const stats = data?.stats;
  return (
    <main className="min-h-screen space-y-6 bg-slate-50 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary"><MapPin size={14} /> Pre-launch · consent-respecting market demand</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-950">Early Access Waitlist</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Signups from the standalone early-access site and storefront waitlist. Area demand helps us prepare coverage for the planned same-day, late-night treats delivery system. Exact GPS coordinates are never stored.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <Link href="/lord/waitlist/invitations" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-800 px-4 text-sm font-bold text-white hover:bg-orange-900"><Mail size={15} /> Halloween invitations</Link>
          {canManageMarket && <Link href="/lord/market" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 text-sm font-bold text-violet-800 hover:bg-violet-50"><Store size={15} /> Manage Halloween shop</Link>}
          {canManageSite && <>
            <a href="#waitlist-fit-studio-items" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/30 bg-white px-4 text-sm font-bold text-primary hover:bg-primary/5"><ImageIcon size={15} /> Upload wig, belt or item photos</a>
            <a href="#waitlist-age-music" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:opacity-90"><Upload size={15} /> Upload age-group songs</a>
            <a href="#waitlist-genre-music" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"><Upload size={15} /> Upload genre songs</a>
          </>}
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
      </header>

      {error && <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle size={18} className="shrink-0" />{error}</div>}

      {canView && !canManageSite && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">You can view waitlist signups, but uploading songs and editing the standalone site requires an owner/admin account or the <code className="font-bold">can_manage_settings</code> permission.</div>}

      {canManageSite && <LocationLaunchSettings />}

      <WaitlistFitStudioPanel canView={canView} canManage={canManageSite} canExport={canExportFitStudio} />

      {canManageSite && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <ImageIcon size={19} className="mt-1 text-primary" />
            <div><h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Midnight Society campaign</h2><p className="mt-1 text-xs text-slate-500">Manage the live public identity, reveal phase, announcement, experience cards, event details and countdown for the separate waitlist site.</p></div>
          </div>
          {siteContentError && <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{siteContentError}</p>}
          {siteContentNotice && <p role="status" className={`mb-4 rounded-lg border p-3 text-sm font-bold ${siteContentNoticeConfirmed ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>{siteContentNoticeConfirmed && <Check size={15} className="mr-1 inline-block" />}{siteContentNotice}</p>}
          {publicSiteCheckAvailable === false && siteContent && <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">The live waitlist could not be checked right now. Song assignments below are not confirmed live.</p>}
          {!siteContent ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">{loadingSiteContent ? 'Loading website content…' : 'Website campaign settings are unavailable. The full campaign editor will return after its settings load.'}</p>
              <p className="mt-2 text-xs text-slate-500">You can still upload a named licensed song below. The assignment is confirmed only when the upload endpoint saves it to the shared waitlist database.</p>
              <div id="waitlist-age-music" className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Upload age-group songs</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ageGroups.map(group => {
                  const trackId = `age:${group.id}`;
                  return <div key={trackId} className="rounded-lg border border-slate-100 p-3">
                    <label className="block text-xs font-bold text-slate-600">{group.label} track name<input required maxLength={100} value={trackTitles[trackId] ?? ''} onChange={event => setTrackTitles(current => ({ ...current, [trackId]: event.target.value }))} className="mt-1 block min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-normal" /></label>
                    <label className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200"><Upload size={13} />{uploadingTrack === trackId ? 'Uploading…' : 'Choose audio file'}<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a" disabled={uploadingTrack !== null} className="sr-only" onChange={event => { void uploadMusicTrack('age', group.id, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
                    {trackUploadErrors[trackId] && <p role="alert" className="mt-2 text-xs text-rose-800">{trackUploadErrors[trackId]}</p>}
                  </div>;
                })}</div>
              </div>
              <div id="waitlist-genre-music" className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Upload genre songs</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{musicGenres.map(genre => {
                  const trackId = `genre:${genre.id}`;
                  return <div key={trackId} className="rounded-lg border border-slate-100 p-3">
                    <label className="block text-xs font-bold text-slate-600">{genre.label} track name<input required maxLength={100} value={trackTitles[trackId] ?? ''} onChange={event => setTrackTitles(current => ({ ...current, [trackId]: event.target.value }))} className="mt-1 block min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-normal" /></label>
                    <label className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200"><Upload size={13} />{uploadingTrack === trackId ? 'Uploading…' : 'Choose audio file'}<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a" disabled={uploadingTrack !== null} className="sr-only" onChange={event => { void uploadMusicTrack('genre', genre.id, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
                    {trackUploadErrors[trackId] && <p role="alert" className="mt-2 text-xs text-rose-800">{trackUploadErrors[trackId]}</p>}
                  </div>;
                })}</div>
              </div>
              {!loadingSiteContent && <button type="button" onClick={() => void loadSiteContent()} className="mt-3 min-h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white">Retry loading settings</button>}
            </div>
          ) : (
            <form className="grid gap-4 lg:grid-cols-2" onSubmit={saveSiteContent}>
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:col-span-2">
                <div className="sm:col-span-2"><h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Public identity</h3><p className="mt-1 text-xs text-slate-500">Midnight Society KE is the experience brand; ONLINE BAR remains the parent brand.</p></div>
                <div className="sm:col-span-2" role="group" aria-label="Waitlist website color palette">
                  <p className="text-xs font-bold text-slate-700">Website colors</p>
                  <p className="mt-1 text-xs text-slate-500">Choose the original cream, red and green look or switch back to the classic yellow palette. Publish the settings below to apply your choice.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" aria-pressed={(siteContent.campaign_settings.palette || 'midnight') === 'midnight'} onClick={() => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, palette: 'midnight' } })} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold ${(siteContent.campaign_settings.palette || 'midnight') === 'midnight' ? 'border-slate-900 bg-white ring-2 ring-slate-900/10' : 'border-slate-200 bg-white'}`}>
                      <span aria-hidden="true" className="flex h-5 w-5 overflow-hidden rounded-full border border-slate-200"><i className="w-1/3 bg-[#F9F4EC]" /><i className="w-1/3 bg-[#D91C1C]" /><i className="w-1/3 bg-[#10231f]" /></span>
                      Cream · red · green
                    </button>
                    <button type="button" aria-pressed={siteContent.campaign_settings.palette === 'yellow'} onClick={() => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, palette: 'yellow' } })} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold ${siteContent.campaign_settings.palette === 'yellow' ? 'border-slate-900 bg-white ring-2 ring-slate-900/10' : 'border-slate-200 bg-white'}`}>
                      <span aria-hidden="true" className="h-5 w-5 rounded-full border border-slate-200 bg-[#F5A000]" />
                      Classic yellow
                    </button>
                  </div>
                </div>
                <label className="text-xs font-bold text-slate-700">Experience brand<input required maxLength={80} value={siteContent.campaign_settings.brandName} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, brandName: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Brand descriptor<input required maxLength={120} value={siteContent.campaign_settings.brandDescriptor} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, brandDescriptor: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Tagline line one<input required maxLength={120} value={siteContent.campaign_settings.tagline} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, tagline: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Tagline line two<input required maxLength={120} value={siteContent.campaign_settings.subheadline} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, subheadline: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Instagram handle<input required maxLength={40} value={siteContent.campaign_settings.instagramHandle} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, instagramHandle: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Presented by<input required maxLength={120} value={siteContent.campaign_settings.presentedBy} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, presentedBy: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              </div>
              <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:grid-cols-2 lg:col-span-2">
                <div className="sm:col-span-2"><h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Reveal sequence &amp; live announcement</h3><p className="mt-1 text-xs text-slate-500">Changing a phase only updates the public site; it does not send messages to members. Only publish dates, venue details and availability that are confirmed.</p></div>
                <label className="text-xs font-bold text-slate-700">Current phase<select value={siteContent.campaign_settings.phase} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, phase: event.target.value as CampaignPhase } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal"><option value="signal">Phase 1 — The signal</option><option value="anticipation">Phase 2 — The anticipation</option><option value="invitation">Phase 3 — The invitation</option><option value="final_call">Phase 4 — The final call</option><option value="aftermath">Phase 5 — The aftermath</option></select></label>
                <label className="text-xs font-bold text-slate-700">Primary button label<input required maxLength={60} value={siteContent.campaign_settings.ctaLabel} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, ctaLabel: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">Public announcement<textarea required maxLength={700} rows={4} value={siteContent.campaign_settings.announcement} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, announcement: event.target.value } })} className="mt-1 block w-full rounded-lg border border-slate-200 p-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Invitation / event card title<input required maxLength={120} value={siteContent.campaign_settings.eventTitle} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, eventTitle: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Venue / reveal note<input required maxLength={180} value={siteContent.campaign_settings.venueNotice} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, venueNotice: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">Event details<textarea required maxLength={500} rows={3} value={siteContent.campaign_settings.eventDetails} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, eventDetails: event.target.value } })} className="mt-1 block w-full rounded-lg border border-slate-200 p-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Official registration URL (optional)<input type="url" maxLength={500} placeholder="https://..." value={siteContent.campaign_settings.registrationUrl} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, registrationUrl: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-700">Registration link label<input required maxLength={60} value={siteContent.campaign_settings.registrationLabel} onChange={event => setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, registrationLabel: event.target.value } })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                <p className="text-xs text-slate-500 sm:col-span-2">This link only sends visitors to the official destination. It does not report ticket purchases; ticket conversion reporting requires an integration with the ticketing provider.</p>
              </div>
              <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:col-span-2">
                <div className="sm:col-span-2"><h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Experience cards</h3><p className="mt-1 text-xs text-slate-500">These labels appear on the landing page and in the signup choice. At least one must remain visible.</p></div>
                {siteContent.campaign_settings.experiences.map((experience, index) => (
                  <fieldset key={experience.id} className="grid gap-2 rounded-lg border border-slate-200 p-3">
                    <legend className="px-1 text-xs font-black text-slate-700">{experience.id === 'wine' ? 'Wine experiences' : experience.id === 'adventure' ? 'Curated experiences' : 'Music & live events'}</legend>
                    <label className="text-xs font-bold text-slate-700">Title<input required maxLength={80} value={experience.title} onChange={event => { const experiences = [...siteContent.campaign_settings.experiences]; experiences[index] = { ...experience, title: event.target.value }; setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, experiences } }); }} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                    <label className="text-xs font-bold text-slate-700">Description<input required maxLength={240} value={experience.description} onChange={event => { const experiences = [...siteContent.campaign_settings.experiences]; experiences[index] = { ...experience, description: event.target.value }; setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, experiences } }); }} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                    <label className="text-xs font-bold text-slate-700">Icon<input required maxLength={8} value={experience.icon} onChange={event => { const experiences = [...siteContent.campaign_settings.experiences]; experiences[index] = { ...experience, icon: event.target.value }; setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, experiences } }); }} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={experience.active} onChange={event => { const experiences = [...siteContent.campaign_settings.experiences]; experiences[index] = { ...experience, active: event.target.checked }; setSiteContent({ ...siteContent, campaign_settings: { ...siteContent.campaign_settings, experiences } }); }} /> Show on public site and signup</label>
                  </fieldset>
                ))}
              </div>
              <label className="text-xs font-bold text-slate-700">Eyebrow<input required maxLength={80} value={siteContent.eyebrow} onChange={event => setSiteContent({ ...siteContent, eyebrow: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-700">Headline<input required maxLength={120} value={siteContent.headline} onChange={event => setSiteContent({ ...siteContent, headline: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-700 lg:col-span-2">Introduction<textarea required maxLength={500} rows={3} value={siteContent.intro} onChange={event => setSiteContent({ ...siteContent, intro: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-200 p-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-700">Benefit one<input required maxLength={60} value={siteContent.benefit_one} onChange={event => setSiteContent({ ...siteContent, benefit_one: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-700">Benefit two<input required maxLength={60} value={siteContent.benefit_two} onChange={event => setSiteContent({ ...siteContent, benefit_two: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-700">Benefit three<input required maxLength={60} value={siteContent.benefit_three} onChange={event => setSiteContent({ ...siteContent, benefit_three: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-700">Hero image description<input required maxLength={180} value={siteContent.hero_image_alt} onChange={event => setSiteContent({ ...siteContent, hero_image_alt: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
              <div className="grid gap-3 rounded-xl border border-rose-100 bg-rose-50/50 p-4 sm:grid-cols-2 lg:col-span-2">
                <div className="sm:col-span-2"><h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Waitlist countdown &amp; invite rewards</h3><p className="mt-1 text-xs text-slate-500">The saved launch time drives the standalone site and installable member-pass countdown. Once the target time passes, the member dashboard correctly switches to its live state. Each new signup awards exactly 3 points to every inviter in the chain.</p></div>
                <label className="text-xs font-bold text-slate-700">Launch date and time<input type="datetime-local" value={siteContent.launch_at ? new Date(new Date(siteContent.launch_at).getTime() - new Date(siteContent.launch_at).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''} onChange={event => setSiteContent({ ...siteContent, launch_at: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" /></label>
                <WaitlistLaunchCountdownPreview launchAt={siteContent.launch_at} />
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Fixed referral reward: 3 points for every member in the referral chain.</div>
              </div>
              <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  <Upload size={15} />{uploadingSiteImage ? 'Uploading…' : siteContent.hero_image_url ? 'Replace hero image' : 'Upload hero image'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingSiteImage} className="sr-only" onChange={event => { void uploadSiteImage(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                </label>
                <span className="text-xs text-slate-500">JPG, PNG, WebP or AVIF · maximum 6 MB</span>
                {siteContent.hero_image_url && <div role="img" aria-label={siteContent.hero_image_alt} className="h-16 w-24 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url("${siteContent.hero_image_url.replaceAll('"', '%22')}")` }} />}
                <button type="submit" disabled={savingSiteContent || uploadingSiteImage} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50"><Save size={15} />{savingSiteContent ? 'Publishing…' : 'Publish copy'}</button>
              </div>
              <div id="waitlist-age-music" className="scroll-mt-6 grid gap-3 border-t border-slate-100 pt-4 lg:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Upload songs by age group</h3><p className="mt-1 text-xs text-slate-500">Upload music you own or are licensed to use. Visitors choose an adult age range and explicitly enter before a track plays. MP3, WAV, OGG or M4A · maximum 10 MB.</p></div>
                  <button type="button" onClick={() => void loadSiteContent()} disabled={loadingSiteContent} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <RefreshCw size={13} className={loadingSiteContent ? 'animate-spin' : ''} /> {loadingSiteContent ? 'Checking…' : 'Verify live tracks'}
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {ageGroups.map(group => {
                    const track = siteContent.age_group_tracks?.[group.id];
                    const trackId = `age:${group.id}`;
                    const isLive = publicSiteConfirmed[trackId] === true;
                    return <div key={group.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-black text-slate-800">Age {group.label}</p>
                      {track && <div className={`mt-2 rounded-lg p-2.5 ${isLive ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                        <p className={`flex items-center gap-1.5 text-xs font-bold ${isLive ? 'text-emerald-800' : 'text-amber-900'}`}>
                          {isLive ? <Check size={13} /> : <AlertTriangle size={13} />}
                          {isLive ? 'UPLOAD COMPLETE · LIVE' : publicSiteCheckAvailable ? 'UPLOADED · NOT LIVE' : 'SAVED · LIVE STATUS UNKNOWN'}
                        </p>
                        <p className={`mt-1 truncate text-xs ${isLive ? 'text-emerald-900' : 'text-amber-950'}`}>{track.title}</p>
                        <audio className="mt-2 block h-9 w-full" controls preload="none" src={track.url} aria-label={`Preview published track for age ${group.label}`} />
                      </div>}
                      {!track && <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs font-semibold text-slate-500">NO SONG UPLOADED for this age group.</p>}
                      <label className="mt-2 block text-[10px] font-bold text-slate-600">Track name<input maxLength={100} value={trackTitles[trackId] ?? track?.title ?? ''} onChange={event => setTrackTitles(current => ({ ...current, [trackId]: event.target.value }))} className="mt-1 block min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-normal" /></label>
                      {!track && trackTitles[trackId]?.trim() && <p className="mt-1 text-[10px] font-semibold text-amber-800">Name entered only — select the audio file below to upload this song.</p>}
                      <label className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200">
                        <Upload size={13} />{uploadingTrack === trackId ? 'Uploading & publishing…' : track ? 'Choose replacement audio' : 'Choose audio file to upload'}
                        <input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a" disabled={uploadingTrack !== null} className="sr-only" onChange={event => { void uploadMusicTrack('age', group.id, event.target.files?.[0]); event.currentTarget.value = ''; }} />
                      </label>
                      {uploadingTrack === trackId && <p role="status" className="mt-2 text-xs text-slate-500">Uploading the file and publishing it to the waitlist site. Keep this page open.</p>}
                      {trackUploadErrors[trackId] && <p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-800">{trackUploadErrors[trackId]}</p>}
                    </div>;
                  })}
                </div>
              </div>
              <div id="waitlist-genre-music" className="scroll-mt-6 grid gap-3 border-t border-slate-100 pt-4 lg:col-span-2">
                <div><h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Upload songs by genre</h3><p className="mt-1 text-xs text-slate-500">Upload a licensed song for each style. Visitors can choose a genre at the age gate and hear that genre’s track. If no genre track is available, they can use the existing age-group mix.</p></div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {musicGenres.map(genre => {
                    const track = siteContent.genre_tracks?.[genre.id];
                    const trackId = `genre:${genre.id}`;
                    const isLive = publicSiteConfirmed[trackId] === true;
                    return <div key={genre.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-black text-slate-800">{genre.label}</p>
                      {track && <div className={`mt-2 rounded-lg p-2.5 ${isLive ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                        <p className={`flex items-center gap-1.5 text-xs font-bold ${isLive ? 'text-emerald-800' : 'text-amber-900'}`}>
                          {isLive ? <Check size={13} /> : <AlertTriangle size={13} />}
                          {isLive ? 'UPLOAD COMPLETE · LIVE' : publicSiteCheckAvailable ? 'UPLOADED · NOT LIVE' : 'SAVED · LIVE STATUS UNKNOWN'}
                        </p>
                        <p className={`mt-1 truncate text-xs ${isLive ? 'text-emerald-900' : 'text-amber-950'}`}>{track.title}</p>
                        <audio className="mt-2 block h-9 w-full" controls preload="none" src={track.url} aria-label={`Preview ${genre.label} track`} />
                      </div>}
                      {!track && <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs font-semibold text-slate-500">NO SONG UPLOADED for this genre.</p>}
                      <label className="mt-2 block text-[10px] font-bold text-slate-600">Track name<input maxLength={100} value={trackTitles[trackId] ?? track?.title ?? ''} onChange={event => setTrackTitles(current => ({ ...current, [trackId]: event.target.value }))} className="mt-1 block min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-normal" /></label>
                      <label className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200">
                        <Upload size={13} />{uploadingTrack === trackId ? 'Uploading & publishing…' : track ? 'Choose replacement audio' : 'Choose audio file to upload'}
                        <input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a" disabled={uploadingTrack !== null} className="sr-only" onChange={event => { void uploadMusicTrack('genre', genre.id, event.target.files?.[0]); event.currentTarget.value = ''; }} />
                      </label>
                      {uploadingTrack === trackId && <p role="status" className="mt-2 text-xs text-slate-500">Uploading the file and publishing it to the waitlist site. Keep this page open.</p>}
                      {trackUploadErrors[trackId] && <p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-800">{trackUploadErrors[trackId]}</p>}
                    </div>;
                  })}
                </div>
              </div>
            </form>
          )}
        </section>
      )}

      {canManageSite && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Waitlist visits &amp; music resonance</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">Anonymous page opens and listening engagement, alongside a heat map of the areas members chose to share at signup. We do not infer visitor location from IP addresses.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">Period
                <select value={analyticsDays} onChange={event => setAnalyticsDays(Number(event.target.value))} className="ml-2 min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs">
                  <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
                </select>
              </label>
              <button type="button" onClick={() => void loadSiteContent()} disabled={loadingSiteContent} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw size={13} className={loadingSiteContent ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>
          {siteAnalyticsError && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{siteAnalyticsError}</p>}
          {!siteAnalytics && !siteAnalyticsError && <p className="text-sm text-slate-500">{loadingSiteContent ? 'Loading anonymous site analytics…' : 'Analytics are not available yet.'}</p>}
          {siteAnalytics && <>
            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Website opens · {analyticsDays} days</p><p className="mt-2 text-3xl font-black text-slate-950">{count(siteAnalytics.page_opens)}</p></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Anonymous browser sessions</p><p className="mt-2 text-3xl font-black text-slate-950">{count(siteAnalytics.unique_visitors)}</p></article>
            </div>

            <div>
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Music styles people choose · {analyticsDays} days</h3>
              <p className="mt-1 text-xs text-slate-500">Counts are anonymous browser sessions that selected each style. A session can select more than one while exploring; counts are not linked to signup details.</p>
              {!siteAnalytics.genre_picks?.length
                ? <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Style-pick analytics will appear after the Waitlist site and database migration are updated.</p>
                : <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {siteAnalytics.genre_picks.map(genre => {
                    const percentage = Math.round((genre.visitors / genrePickMaximum) * 100);
                    return <article key={genre.genre || 'age-group-mix'} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="truncate text-xs font-black text-slate-800">{genre.label}</h4>
                        <span className="shrink-0 text-xs font-black text-primary">{count(genre.visitors)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">anonymous sessions</p>
                    </article>;
                  })}
                </div>}
            </div>

            <div>
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Age groups, genres &amp; the songs they listen through</h3>
              <p className="mt-1 text-xs text-slate-500">“Heard 80%” is a useful resonance signal, not a guarantee that listeners like a track. We need at least five starts before highlighting a leading song.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ageGroups.map(group => {
                  const leader = topTrackByAge.get(group.id);
                  const groupTracks = (siteAnalytics.music || []).filter(track => track.age_group === group.id);
                  const visitors = siteAnalytics.age_groups.find(item => item.group === group.id)?.visitors || 0;
                  return <article key={group.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-black text-slate-900">Age {group.label}</h4><span className="text-[10px] font-bold text-slate-500">{count(visitors)} selected</span></div>
                    {leader
                      ? <p className="mt-2 text-xs text-emerald-800">Leading so far: <b>{leader.track_title}</b> · {Math.round((leader.heard_80 / leader.starts) * 100)}% heard 80% ({count(leader.starts)} starts)</p>
                      : <p className="mt-2 text-xs text-slate-500">{groupTracks.length ? `Need at least 5 listens to call a leader · ${count(groupTracks.reduce((total, track) => total + track.starts, 0))} starts so far.` : 'No track listening data yet for this age group.'}</p>}
                    {groupTracks.map(track => {
                      const rate = track.starts ? Math.round((track.heard_80 / track.starts) * 100) : 0;
                      return <div key={`${track.age_group}-${track.music_genre || 'age'}-${track.track_title}`} className="mt-3">
                        <div className="flex justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-700">{track.track_title}{track.music_genre ? ` · ${musicGenres.find(genre => genre.id === track.music_genre)?.label || track.music_genre}` : ''}</span><span className="shrink-0 text-slate-500">{count(track.starts)} plays · {rate}% to 80%</span></div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} /></div>
                      </div>;
                    })}
                  </article>;
                })}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Delivery launch coverage · signup-area demand</h3>
              <p className="mt-1 text-xs text-slate-500">Use these neighborhood-level signup counts to prioritize coverage for the planned same-day, late-night treats delivery system before launch. Counts reflect areas members entered when joining, not confirmed service availability or delivery bookings.</p>
              {!siteAnalytics.locations.length
                ? <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No signups in this period yet.</p>
                : <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {siteAnalytics.locations.map(location => {
                    const intensity = location.signups / locationHeatMaximum;
                    return <article key={`${location.country}-${location.city}-${location.area}`} title={`${location.county}, ${location.country}`} className="rounded-xl border p-3" style={{ backgroundColor: `rgba(217, 28, 28, ${0.05 + intensity * 0.2})`, borderColor: `rgba(217, 28, 28, ${0.15 + intensity * 0.45})` }}>
                      <p className="truncate text-xs font-black text-slate-900">{location.area}</p>
                      <p className="mt-1 truncate text-[10px] text-slate-600">{location.city}, {location.county}</p>
                      <p className="mt-2 text-lg font-black text-primary">{count(location.signups)} <span className="text-[9px] uppercase tracking-wide">signups</span></p>
                    </article>;
                  })}
                </div>}
            </div>
          </>}
        </section>
      )}

      {canManageSite && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <ImageIcon size={19} className="mt-1 text-primary" />
            <div><h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Waitlist phone widget &amp; souvenirs</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">Choose the launch countdown above, upload the actual souvenirs/prizes people can earn, and set token prices. The standalone site includes an installable home-screen dashboard with a live countdown and referral/token totals.</p></div>
          </div>
          <form className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_1.5fr_150px_auto] sm:items-end" onSubmit={event => { event.preventDefault(); void saveReward({ ...newReward, is_active: true, sort_order: siteRewards.length }); }}>
            <label className="text-xs font-bold text-slate-700">Souvenir / prize name<input required maxLength={100} value={newReward.name} onChange={event => setNewReward({ ...newReward, name: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" /></label>
            <label className="text-xs font-bold text-slate-700">What they could win<input maxLength={300} value={newReward.description} onChange={event => setNewReward({ ...newReward, description: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" /></label>
            <label className="text-xs font-bold text-slate-700">Tokens to request<input type="number" min={1} max={1000000} required value={newReward.token_cost} onChange={event => setNewReward({ ...newReward, token_cost: Number(event.target.value) })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" /></label>
            <button type="submit" disabled={savingRewardId !== null} className="min-h-10 rounded-lg bg-slate-900 px-4 text-xs font-bold text-white disabled:opacity-50">{savingRewardId === 'new' ? 'Saving…' : 'Add souvenir'}</button>
          </form>
          {!siteRewards.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No souvenirs are published yet. Add the real prize details and an image above to show people what they can earn.</p> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {siteRewards.map(reward => <article key={reward.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
                {reward.image_url && <div role="img" aria-label={reward.name} className="h-36 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url("${reward.image_url.replaceAll('"', '%22')}")` }} />}
                <label className="block text-xs font-bold text-slate-700">Prize name<input maxLength={100} value={reward.name} onChange={event => setSiteRewards(current => current.map(item => item.id === reward.id ? { ...item, name: event.target.value } : item))} className="mt-1 block min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal" /></label>
                <label className="block text-xs font-bold text-slate-700">Prize details<input maxLength={300} value={reward.description} onChange={event => setSiteRewards(current => current.map(item => item.id === reward.id ? { ...item, description: event.target.value } : item))} className="mt-1 block min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal" /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-bold text-slate-700">Token cost<input type="number" min={1} max={1000000} value={reward.token_cost} onChange={event => setSiteRewards(current => current.map(item => item.id === reward.id ? { ...item, token_cost: Number(event.target.value) } : item))} className="mt-1 block min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal" /></label>
                  <label className="text-xs font-bold text-slate-700">Display order<input type="number" min={0} max={10000} value={reward.sort_order} onChange={event => setSiteRewards(current => current.map(item => item.id === reward.id ? { ...item, sort_order: Number(event.target.value) } : item))} className="mt-1 block min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal" /></label>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={reward.is_active} onChange={event => setSiteRewards(current => current.map(item => item.id === reward.id ? { ...item, is_active: event.target.checked } : item))} />Published on standalone site</label>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><Upload size={13} />{savingRewardId === reward.id ? 'Uploading…' : reward.image_url ? 'Replace image' : 'Upload prize image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={savingRewardId !== null} className="sr-only" onChange={event => { void uploadRewardImage(reward, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
                  <button type="button" onClick={() => void saveReward(reward)} disabled={savingRewardId !== null} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-50">{savingRewardId === reward.id ? 'Saving…' : 'Save prize'}</button>
                  <button type="button" onClick={() => void deleteReward(reward)} className="min-h-9 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700">Remove</button>
                </div>
              </article>)}
            </div>
          )}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Souvenir redemption requests</h3>
            <p className="mt-1 text-xs text-slate-500">Pending requests reserve the member’s tokens. Approving fulfils a request; rejecting releases the reserved tokens back to their balance.</p>
            {!rewardClaims.length ? <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No souvenir requests yet.</p> : (
              <ul className="mt-3 divide-y divide-slate-100">
                {rewardClaims.map(claim => <li key={claim.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                  <span><b className="text-slate-900">{siteRewards.find(reward => reward.id === claim.reward_id)?.name || 'Souvenir'}</b><span className="ml-2 text-slate-500">{claim.tokens_spent} tokens · {date(claim.created_at)} · {claim.status}</span><span className="mt-1 block text-slate-600">{claim.member?.full_name || 'Waitlist member'} · {claim.member?.email || 'Member contact unavailable'}</span></span>
                  {claim.status === 'pending' && <span className="flex gap-2"><button type="button" disabled={reviewingClaimId === claim.id} onClick={() => void decideRewardClaim(claim, 'approved')} className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-50">Approve</button><button type="button" disabled={reviewingClaimId === claim.id} onClick={() => void decideRewardClaim(claim, 'rejected')} className="rounded-lg border border-rose-200 px-3 py-2 font-bold text-rose-700 disabled:opacity-50">Reject</button></span>}
                </li>)}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Waitlist summary">
        {[
          { label: 'Total signups', value: stats?.total, icon: Users },
          { label: 'In configured area', value: stats?.inArea, icon: MapPin },
          { label: 'Outside area', value: stats?.outsideArea, icon: MapPin },
          { label: 'Email updates', value: stats?.emailOptIns, icon: Mail },
          { label: 'SMS updates', value: stats?.smsOptIns, icon: MessageCircle },
          { label: 'WhatsApp updates', value: stats?.whatsappOptIns, icon: MessageCircle }
        ].map(metric => (
          <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{metric.label}</p><metric.icon size={15} className="text-primary" /></div>
            <p className="mt-3 text-2xl font-black text-slate-950">{loading ? '—' : count(metric.value)}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4" aria-label="Waitlist referral rewards and turnover">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wide text-slate-900">Waitlist referral leaderboard</h2>
          <p className="mt-1 text-xs text-slate-500">Ranks people whose waitlist referrals converted into positive delivered sales. Each member in the referral chain receives 3 points/tokens for every new signup in their downline.</p>
        </div>
        {(data?.referralAnalytics?.uncreditedDirectReferrals || 0) > 0 && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {count(data?.referralAnalytics.uncreditedDirectReferrals)} referred signup(s) are in the waitlist, but have no referral credit records yet. Apply <code>supabase/WAITLIST_SITE_MIGRATION.sql</code> to the shared WAITLIST Supabase project to backfill credits and enable future referral rewards.
          </p>
        )}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead><tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Referrer</th>
              <th className="px-4 py-3">Direct invites</th>
              <th className="px-4 py-3">Full network</th>
              <th className="px-4 py-3">Positive-turnover members</th>
              <th className="px-4 py-3">Delivered turnover</th>
              <th className="px-4 py-3">Referral points</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!data?.referralAnalytics?.referrers?.length ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No waitlist referrals have been recorded yet.</td></tr>
              ) : data.referralAnalytics.referrers.map((referrer, index) => (
                <tr key={referrer.referrerId}>
                  <td className="px-4 py-3 font-black text-primary">#{index + 1}</td>
                  <td className="px-4 py-3"><b className="block text-slate-900">{referrer.name}</b><span className="font-mono text-[10px] text-slate-500">{referrer.referralCode || referrer.referrerId}</span></td>
                  <td className="px-4 py-3 font-bold text-slate-800">{count(referrer.directReferrals)}</td>
                  <td className="px-4 py-3 font-bold text-slate-800">{count(referrer.networkReferrals)}</td>
                  <td className="px-4 py-3 font-black text-emerald-700">{count(referrer.positiveTurnoverReferrals)}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">{money(referrer.turnover)}</td>
                  <td className="px-4 py-3 font-black text-primary">{count(referrer.pointsEarned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">Referral points distributed by person</h3>
            <p className="mt-1 text-xs text-slate-500">One row per reward recipient and invited member, including chain depth, converted-member sales and a map link for the area shared at signup. Waitlist signups store neighbourhoods, not exact coordinates.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="bg-slate-50 font-black uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Points recipient</th>
                <th className="px-4 py-3">Referred member</th>
                <th className="px-4 py-3">Generation</th>
                <th className="px-4 py-3">Points credited</th>
                <th className="px-4 py-3">Positive turnover</th>
                <th className="px-4 py-3">Member area</th>
                <th className="px-4 py-3">Map</th>
                <th className="px-4 py-3">Signup</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {!referralCredits.length ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Referral credit details will appear here as waitlist members join.</td></tr>
                ) : visibleReferralCredits.map(credit => (
                  <tr key={credit.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{credit.referrerName}</td>
                    <td className="px-4 py-3"><span className="block font-semibold text-slate-900">{credit.inviteeName}</span><span className="text-slate-500">{credit.inviteeEmail}</span></td>
                    <td className="px-4 py-3 text-slate-700">Level {credit.depth}</td>
                    <td className="px-4 py-3 font-black text-primary">{count(credit.points)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{money(credit.turnover)}</td>
                    <td className="px-4 py-3 text-slate-600">{[credit.city, credit.area].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-4 py-3">{credit.city || credit.area ? <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent([credit.area, credit.city, credit.county, credit.country].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 underline underline-offset-2">Approximate area map</a> : <span className="text-slate-400">No area</span>}</td>
                    <td className="px-4 py-3 text-slate-500">{date(credit.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {referralCreditPageCount > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs">
              <span className="text-slate-500">Showing {referralCreditPage * referralCreditPageSize + 1}–{Math.min((referralCreditPage + 1) * referralCreditPageSize, referralCredits.length)} of {count(referralCredits.length)} credits</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setReferralCreditPage(current => Math.max(0, current - 1))} disabled={referralCreditPage === 0} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous</button>
                <button type="button" onClick={() => setReferralCreditPage(current => Math.min(referralCreditPageCount - 1, current + 1))} disabled={referralCreditPage >= referralCreditPageCount - 1} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Adult age groups</h2>
        <p className="mt-1 text-xs text-slate-500">Age bands reported by waitlist members. No birth dates are collected; this page has no under-18 audience segment.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {ageGroups.map(group => {
            const total = data?.stats.ageGroups?.find(item => item.group === group.id)?.count || 0;
            return <li key={group.id} className="rounded-xl bg-slate-50 p-4"><span className="text-xs font-bold text-slate-500">Age {group.label}</span><b className="mt-2 block text-2xl text-slate-950">{loading ? '—' : count(total)}</b></li>;
          })}
        </ul>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Demand by area</h2>
          <p className="mt-1 text-xs text-slate-500">Coverage means the area matched configured launch zones at the time of signup; unknown means no coverage list was configured.</p>
          {!topAreas.length ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No area signups recorded.</p> : (
            <ul className="mt-4 space-y-2">{topAreas.map(item => (
              <li key={`${item.country}-${item.county}-${item.city}-${item.area}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <span className="min-w-0"><b className="block truncate text-sm text-slate-900">{item.city} · {item.area}</b><small className="text-slate-500">{item.county} County · {count(item.inArea)} in configured area</small></span>
                <strong className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-900">{count(item.total)}</strong>
              </li>
            ))}</ul>
          )}
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Member interests</h2>
          <p className="mt-1 text-xs text-slate-500">Product selections by waitlist members.</p>
          {!stats?.interests?.length ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No product preferences recorded yet.</p> : (
            <ul className="mt-4 space-y-3">{stats.interests.slice(0, 8).map(item => (
              <li key={item.name} className="flex items-center justify-between text-sm"><span className="font-semibold text-slate-700">{item.name}</span><b className="text-slate-950">{count(item.count)}</b></li>
            ))}</ul>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Experience interests</h2>
        <p className="mt-1 text-xs text-slate-500">See signup interest in the experience cards currently published on the Midnight Society site. Select a card to show those members below.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {(stats?.rewardPaths || []).map(path => (
            <li key={path.path}>
              <button
                type="button"
                aria-pressed={rewardPath === path.path}
                onClick={() => { setRewardPath(current => current === path.path ? 'all' : path.path); setPage(0); }}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${rewardPath === path.path ? 'border-primary bg-amber-50 ring-2 ring-primary/20' : 'border-transparent bg-slate-50 hover:border-slate-200'}`}
              >
                <span className="text-xs font-bold text-slate-600">{path.label || experienceLabels[path.path]}</span>
                <b className="mt-2 block text-2xl text-slate-950">{loading ? '—' : count(path.count)}</b>
                <span className="mt-1 block text-[10px] font-semibold text-slate-500">{rewardPath === path.path ? 'Showing these members · click to clear' : 'Click to view interested members'}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-orange-100 p-2 text-orange-800"><Mail size={18} /></span>
          <div>
            <h2 className="text-lg font-black text-slate-950">Halloween invitation studio 🎃</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">Edit the email here. Messages are sent only when you press the send button and confirm. The button emails every waitlist member with active email consent; unsubscribed and non-consenting addresses are excluded. Changing a status alone never sends an email.</p>
          </div>
        </div>
        <form onSubmit={sendHalloweenInvitations} className="mt-5 grid gap-3">
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Email subject
            <input
              required
              maxLength={200}
              value={invitationSubject}
              onChange={event => setInvitationSubject(event.target.value)}
              className="min-h-10 rounded-lg border border-orange-200 bg-white px-3 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Invitation message
            <textarea
              required
              maxLength={5000}
              rows={9}
              value={invitationMessage}
              onChange={event => setInvitationMessage(event.target.value)}
              className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm leading-6"
            />
          </label>
          <p className="text-[11px] leading-5 text-slate-600">Personalization tokens: <code>{'{{name}}'}</code> and <code>{'{{tickets_link}}'}</code>. If you omit the link token, the Online Bar ticket link is added automatically. Event date, time, and venue are optional.</p>
          {invitationNotice && <p role="status" className="text-xs font-bold text-emerald-800">{invitationNotice}</p>}
          {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
          <div>
            <button type="submit" disabled={sendingInvitations || !invitationReady} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-700 px-4 text-xs font-black text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50">
              {sendingInvitations ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {sendingInvitations ? 'Sending invitations…' : 'Send to all new members with channel consent'}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-slate-950">Waitlist signups</h2>
            <p className="mt-1 text-xs text-slate-500">Invites use each person’s opted-in email, SMS and/or WhatsApp channels only. Email opt-out never blocks a separately opted-in SMS or WhatsApp invite.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Total: {count(data?.stats.total ?? 0)}</span>
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-orange-900">Invites sent: {count(data?.invitationsSent ?? 0)}</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">Current page: {page + 1}</span>
            </div>
            <p className="mt-2 text-xs font-bold text-orange-900">
              {data?.invitationTrackingSetupRequired
                ? 'Invite tracking is not set up yet. Apply WAITLIST_INVITATION_DELIVERIES_MIGRATION.sql.'
                : `Tracked invitation messages sent: ${data?.invitationsSent ?? '—'}`}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_180px_210px]">
            <label className="relative"><span className="sr-only">Search waitlist</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search name, area, contact" className="min-h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" /></label>
            <select aria-label="Filter by signup status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="Filter by chosen experience" value={rewardPath} onChange={event => { setRewardPath(event.target.value as 'all' | RewardPath); setPage(0); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="all">All experience interests</option>
              {(stats?.rewardPaths || []).map(path => <option key={path.path} value={path.path}>{path.label || experienceLabels[path.path]}</option>)}
            </select>
          </div>
        </div>
        {loading && !data ? <p className="p-10 text-center text-sm text-slate-500">Loading signups…</p>
          : !data?.contacts.length ? <p className="p-10 text-center text-sm text-slate-500">No signups match these filters.</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500"><tr>{['Person & area','Consent','Interests & frequency','Experience interest','Age group & check','Attribution','Joined','Status','Invite'].map(label => <th key={label} className="px-3 py-3 font-black">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{data.contacts.map((contact, index) => {
                const globalIndex = page * 30 + index + 1;
                return (
                  <tr key={contact.id} className="align-top">
                    <td className="max-w-[220px] px-3 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">#{globalIndex}</span>
                        <b className="block text-slate-950">{contact.full_name || 'Name not provided'}</b>
                      </div>
                      <a href={`mailto:${encodeURIComponent(contact.email)}`} className="mt-1 block break-all text-primary hover:underline">{contact.email}</a>
                      {contact.phone && <a href={`tel:${encodeURIComponent(contact.phone)}`} className="mt-1 block text-slate-600 hover:underline">{contact.phone}</a>}
                      <span className="mt-2 block font-semibold text-slate-700">{contact.city} · {contact.area}</span>
                      <span className="text-slate-500">{contact.county}, {contact.country}{contact.landmark ? ` · ${contact.landmark}` : ''}</span>
                      <span className={`mt-2 inline-block rounded-full px-2 py-1 text-[9px] font-black uppercase ${contact.service_area_status === 'in_area' ? 'bg-emerald-100 text-emerald-800' : contact.service_area_status === 'outside_area' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{contact.service_area_status.replace('_', ' ')}{contact.location_verified ? ' · GPS matched' : ' · manual'}</span>
                    </td>
                    <td className="px-3 py-4"><div className="space-y-1.5">{[['Email', contact.email_updates_consent],['SMS', contact.sms_consent],['WhatsApp', contact.whatsapp_consent]].map(([label, allowed]) => <p key={String(label)} className={allowed ? 'font-bold text-emerald-700' : 'text-slate-400'}>{allowed ? '✓' : '—'} {String(label)}</p>)}</div><p className="mt-2 text-slate-500">Preferred: {contact.preferred_contact_method || 'No preference'}</p></td>
                    <td className="max-w-[190px] px-3 py-4"><p className="leading-relaxed text-slate-700">{contact.product_interests?.join(', ') || 'Not provided'}</p><p className="mt-2 text-slate-500">{contact.order_frequency?.replace('_', ' ') || 'Frequency not provided'}</p></td>
                    <td className="max-w-[190px] px-3 py-4 text-slate-700">{contact.reward_path ? stats?.rewardPaths.find(path => path.path === contact.reward_path)?.label || experienceLabels[contact.reward_path] : 'Not selected'}</td>
                    <td className="px-3 py-4"><b className="mb-1 block text-slate-800">{ageGroups.find(group => group.id === contact.age_group)?.label ? `Age ${ageGroups.find(group => group.id === contact.age_group)?.label}` : 'Age group not provided'}</b>{contact.age_confirmed ? <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><Check size={13} /> 18+ confirmed</span> : <span className="font-bold text-amber-700">Not recorded</span>}<p className="mt-1 text-slate-500">{date(contact.age_confirmed_at)}</p></td>
                    <td className="max-w-[160px] px-3 py-4 text-slate-600"><p>{contact.source || 'direct'}</p>{contact.campaign && <p className="mt-1">Campaign: {contact.campaign}</p>}{contact.referred_by_code && <p className="mt-1">Referred: {contact.referred_by_code}</p>}{contact.referral_code && <p className="mt-1">Invite: {contact.referral_code}</p>}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-slate-600">{date(contact.created_at)}</td>
                    <td className="px-3 py-4"><select aria-label={`Status for ${contact.email}`} disabled={savingId === contact.id} value={contact.status} onChange={event => void updateStatus(contact, event.target.value as WaitlistStatus)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-bold disabled:opacity-50">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value} disabled={value === 'INVITED' && contact.status === 'WAITLIST'}>{label}</option>)}</select></td>
                    <td className="px-3 py-4">{contact.status !== 'UNSUBSCRIBED' && (contact.email_updates_consent || contact.sms_consent || contact.whatsapp_consent)
                      ? <WaitlistContactInviteButton
                        contactId={contact.id}
                        contactName={contact.full_name}
                        contactEmail={contact.email}
                        hasEmailConsent={contact.email_updates_consent && !contact.unsubscribed_at}
                        hasSmsConsent={contact.sms_consent}
                        hasWhatsappConsent={contact.whatsapp_consent}
                        onSent={() => void load()}
                      />
                      : <span className="text-[10px] text-slate-400">No active channel opt-in</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0 || loading} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40">Previous</button>
          <span className="text-xs text-slate-500">Page {page + 1}</span>
          <button type="button" onClick={() => setPage(current => current + 1)} disabled={!data?.hasMore || loading} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40">Next</button>
        </div>
      </section>
    </main>
  );
}
