'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const areasByCity: Record<string, { county: string; areas: string[] }> = {
  Nairobi: {
    county: 'Nairobi',
    areas: ['CBD', 'Westlands', 'Kilimani', 'Lavington', 'Kileleshwa', 'Karen', 'Langata', 'South C', 'South B', 'Embakasi', 'Roysambu', 'Kasarani']
  },
  Mombasa: { county: 'Mombasa', areas: ['Nyali', 'Mombasa Island'] },
  Kisumu: { county: 'Kisumu', areas: ['Kisumu CBD', 'Milimani'] },
  Eldoret: { county: 'Uasin Gishu', areas: ['Eldoret CBD'] },
  Nakuru: { county: 'Nakuru', areas: ['Nakuru CBD'] },
  Other: { county: '', areas: [] }
};

const interests = ['Spirits', 'Wine', 'Beer', 'Champagne', 'Cocktails', 'Mixers', 'Gift boxes', 'Snacks', 'Something else'];
const frequencies = [
  ['weekly', 'Once a week'],
  ['few_monthly', 'A few times a month'],
  ['monthly', 'Once a month'],
  ['occasions', 'For special occasions'],
  ['depends', 'It depends']
];

type SignupResult = { success?: boolean; serviceAreaStatus?: 'in_area' | 'outside_area' | 'unknown'; referralCode?: string; trackingAvailable?: boolean; demoMode?: boolean; error?: string };
type Location = { country: string; county: string; city: string; area: string; verified: boolean; accuracy: number | null };
type Reward = { id: string; name: string; description: string; image_url: string | null; token_cost: number; is_active: boolean; sort_order: number };
type RewardPath = 'wine' | 'adventure' | 'music';
type ReferralStats = { referrals: number; tokensEarned: number; tokensAvailable: number };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
declare global {
  interface Window {
    OnlineBarNative?: {
      saveMemberProgress: (referralCode: string, rewardPath: RewardPath) => void;
    };
  }
}
const rewardPaths: { id: RewardPath; title: string; subtitle: string; description: string; icon: string }[] = [
  { id: 'wine', title: 'Wine & good living', subtitle: 'AN INVITATION WORTH KEEPING', description: 'A chance to enjoy wine-tasting experiences, special invitations and curated gifts.', icon: '🍷' },
  { id: 'adventure', title: 'Adventure & experiences', subtitle: 'YOUR ADVENTURE. OUR TREAT.', description: 'Bring a friend, choose an experience and we may cover the adventure and create a complimentary gift around it.', icon: '🌍' },
  { id: 'music', title: 'Music & madness', subtitle: 'SOUL FEST, ON US', description: 'A chance to win Soul Fest tickets and special access.', icon: '🎟️' }
];
type SiteContent = {
  eyebrow: string;
  headline: string;
  intro: string;
  benefit_one: string;
  benefit_two: string;
  benefit_three: string;
  hero_image_url: string | null;
  hero_image_alt: string;
  launch_at: string | null;
  tokens_per_referral: number;
  rewards: Reward[];
  age_group_tracks: Record<string, { title: string; url: string }>;
};
const ageGroups = [
  { id: '18_20', label: '18–20' },
  { id: '21_24', label: '21–24' },
  { id: '25_34', label: '25–34' },
  { id: '35_44', label: '35–44' },
  { id: '45_plus', label: '45+' }
];
const defaultSiteContent: SiteContent = {
  eyebrow: 'A BETTER NIGHT STARTS HERE',
  headline: 'Something good is coming.',
  intro: 'Your next drink night is about to get a lot easier. Online Bar is bringing your favorites to your door, starting in selected areas.',
  benefit_one: 'Priority access',
  benefit_two: 'Launch surprises',
  benefit_three: 'Area-first delivery',
  hero_image_url: null,
  hero_image_alt: 'Online Bar early access',
  launch_at: null,
  tokens_per_referral: 25,
  rewards: [
    { id: 'launch-bundle', name: 'Launch bundle', description: 'Priority access to the first delivery window and a surprise freebie when we launch.', image_url: null, token_cost: 25, is_active: true, sort_order: 1 },
    { id: 'vip-night', name: 'VIP night', description: 'Reserve a limited release tasting pack and be first in line for bar-night drops.', image_url: null, token_cost: 60, is_active: true, sort_order: 2 },
    { id: 'goodies-drop', name: 'Goodies drop', description: 'A curated mix of premium cocktail add-ons and delivery extras.', image_url: null, token_cost: 90, is_active: true, sort_order: 3 }
  ],
  age_group_tracks: {}
};

export default function Home() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [siteContent, setSiteContent] = useState<SiteContent>(defaultSiteContent);
  const [siteContentLoaded, setSiteContentLoaded] = useState(false);
  const [ageGateComplete, setAgeGateComplete] = useState(false);
  const [adultConfirmedAtEntry, setAdultConfirmedAtEntry] = useState(false);
  const [ageGroup, setAgeGroup] = useState('');
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicNotice, setMusicNotice] = useState('');
  const [step, setStep] = useState(0);
  const [location, setLocation] = useState<Location>({
    country: 'Kenya', county: 'Nairobi', city: 'Nairobi', area: '', verified: false, accuracy: null
  });
  const [customCity, setCustomCity] = useState('');
  const [customArea, setCustomArea] = useState('');
  const [landmark, setLandmark] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consents, setConsents] = useState({ email: false, sms: false, whatsapp: false });
  const [preferredContactMethod, setPreferredContactMethod] = useState<'email' | 'sms' | 'whatsapp' | ''>('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [rewardPath, setRewardPath] = useState<RewardPath | ''>('');
  const [frequency, setFrequency] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [serviceAreaStatus, setServiceAreaStatus] = useState<SignupResult['serviceAreaStatus']>('unknown');
  const [referralCode, setReferralCode] = useState('');
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [trackingAvailable, setTrackingAvailable] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const shareDialogCloseRef = useRef<HTMLButtonElement>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installNotice, setInstallNotice] = useState('');
  const [isInstalled, setIsInstalled] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('');
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, live: false });
  const [launchMessage, setLaunchMessage] = useState('LAUNCH DATE TO BE ANNOUNCED');

  useEffect(() => {
    void fetch('/api/content', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json() as { content?: SiteContent; error?: string };
        if (!response.ok || !result.content) throw new Error(result.error || 'Published content could not be loaded.');
        setSiteContent({ ...defaultSiteContent, ...result.content });
      })
      .catch(cause => {
        console.error('[WaitlistSite] Using default landing page content:', cause);
      })
      .finally(() => {
        setSiteContentLoaded(true);
      });
  }, []);

  const areas = useMemo(() => areasByCity[location.city]?.areas || [], [location.city]);
  const hasPhoneConsent = consents.sms || consents.whatsapp;
  const resolvedArea = customArea.trim() || location.area;
  const resolvedCity = location.city === 'Other' ? customCity.trim() : location.city;
  const updatesAllowed = consents.email || consents.sms || consents.whatsapp;
  const selectedAgeGroup = ageGroups.find(group => group.id === ageGroup);
  const shareVariant = ageGroup === '45_plus'
    ? 'whisper'
    : ageGroup === '18_20' || ageGroup === '21_24'
      ? 'buzz'
      : 'friend';
  const shareLabel = shareVariant === 'whisper'
    ? 'Whisper to a friend'
    : shareVariant === 'buzz'
      ? 'Share the buzz'
      : 'Tell a friend';
  const currentAgeTrack = ageGroup ? siteContent.age_group_tracks[ageGroup] : undefined;
  const selectedRewardPath = rewardPaths.find(path => path.id === rewardPath);
  const activeRewards = (siteContent.rewards || defaultSiteContent.rewards)
    .filter(reward => reward.is_active)
    .sort((a, b) => a.token_cost - b.token_cost);
  const tokensAvailable = referralStats?.tokensAvailable ?? 0;
  const nextReward = activeRewards.find(reward => tokensAvailable < reward.token_cost);
  const friendsToNextReward = nextReward && siteContent.tokens_per_referral > 0
    ? Math.ceil((nextReward.token_cost - tokensAvailable) / siteContent.tokens_per_referral)
    : 0;

  useEffect(() => {
    const installed = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setIsInstalled(installed);
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallNotice('Online Bar is on your home screen. Tap it anytime to check your launch progress.');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!shareDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShareDialogOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    shareDialogCloseRef.current?.focus();
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [shareDialogOpen]);

  useEffect(() => {
    if (!referralCode || !trackingAvailable) return;
    const loadReferralStats = async () => {
      try {
        const response = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'referral_stats', referralCode })
        });
        const result = await response.json() as { stats?: ReferralStats; error?: string };
        if (!response.ok || !result.stats) throw new Error(result.error || 'Referral progress could not be loaded.');
        setReferralStats(result.stats);
      } catch (cause) {
        console.error('[WaitlistSite] Could not load referral progress:', cause);
        setTrackingAvailable(false);
      }
    };
    void loadReferralStats();
  }, [referralCode, trackingAvailable]);

  useEffect(() => {
    if (!siteContent.launch_at) {
      setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, live: false });
      return;
    }
    const target = new Date(siteContent.launch_at).getTime();
    if (Number.isNaN(target)) {
      setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, live: false });
      return;
    }
    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setCountdown({ days, hours, minutes, seconds, live: diff > 0 });
      if (diff <= 0) setLaunchMessage('YOU MADE IT. WE’RE LIVE.');
      else if (days === 0) {
        const isTomorrow = new Date(target).toDateString() !== new Date().toDateString();
        setLaunchMessage(isTomorrow ? 'TOMORROW. 🔥' : 'LAUNCH DAY. YOU MADE IT. 🔥');
      }
      else if (days <= 3) setLaunchMessage(`${days} DAYS. YOUR FRIENDS ARE JOINING.`);
      else if (days <= 7) setLaunchMessage(`${days} DAYS. DON’T MISS THIS.`);
      else if (days <= 14) setLaunchMessage('YOU’RE GETTING CLOSE…');
      else if (days >= 30) setLaunchMessage('THE WAIT BEGINS 👀');
      else setLaunchMessage('THE COUNTDOWN IS ON 👀');
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [siteContent.launch_at]);

  const enterSite = () => {
    if (!selectedAgeGroup || !adultConfirmedAtEntry) return;
    setAgeGateComplete(true);
    setMusicNotice('');
    if (currentAgeTrack && audioRef.current) {
      audioRef.current.src = currentAgeTrack.url;
      void audioRef.current.play()
        .then(() => setMusicPlaying(true))
        .catch(() => setMusicNotice('Tap “Play music” to start your age-group track.'));
    }
  };

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (musicPlaying) {
      audio.pause();
      setMusicPlaying(false);
      return;
    }
    setMusicNotice('');
    void audio.play()
      .then(() => setMusicPlaying(true))
      .catch(() => setMusicNotice('This track could not be played in your browser.'));
  };

  const requestLocation = () => {
    setError('');
    setGpsStatus('');
    if (!navigator.geolocation) {
      setGpsStatus('Location is unavailable in this browser. Enter your area instead.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'resolve',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          })
        });
        const result = await response.json() as { location?: Location; error?: string };
        if (!response.ok || !result.location) throw new Error(result.error || 'We could not identify your approximate area.');
        setLocation(result.location);
        setCustomArea('');
        setGpsStatus(`Approximate area found: ${result.location.area}, ${result.location.city}. You can change it below.`);
      } catch (cause) {
        setGpsStatus(cause instanceof Error ? cause.message : 'We could not identify your approximate area. Enter it manually.');
      } finally {
        setBusy(false);
      }
    }, () => {
      setBusy(false);
      setGpsStatus('Location permission was not available. You can still enter your area manually.');
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!resolvedArea || !resolvedCity || !location.county.trim()) {
      setError('Enter your county, town and area so we can plan local availability.');
      setStep(1);
      return;
    }
    if (!updatesAllowed) {
      setError('Select at least one update channel so we know where to send your early-access invitation.');
      return;
    }
    if (!rewardPath) {
      setError('Choose the experience you’re most excited about.');
      return;
    }
    if (hasPhoneConsent && !phone.trim()) {
      setError('Add a phone number for SMS or WhatsApp updates, or deselect those channels.');
      return;
    }
    if (!ageConfirmed) {
      setError('Confirm that you are of legal drinking age to join the list.');
      return;
    }
    if (!ageGroup || !selectedAgeGroup) {
      setError('Choose your adult age range to join the list.');
      return;
    }
    setBusy(true);
    try {
      const query = new URLSearchParams(window.location.search);
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'signup',
          fullName,
          email,
          phone,
          country: location.country,
          county: location.county || areasByCity[location.city]?.county || 'Unspecified',
          city: resolvedCity,
          area: resolvedArea,
          landmark,
          locationVerified: location.verified,
          locationAccuracy: location.accuracy,
          emailConsent: consents.email,
          smsConsent: consents.sms,
          whatsappConsent: consents.whatsapp,
          preferredContactMethod,
          productInterests: selectedInterests,
          rewardPath,
          orderFrequency: frequency,
          ageGroup,
          ageConfirmed,
          referralCode: query.get('ref') || '',
          campaign: query.get('utm_campaign') || '',
          source: query.get('utm_source') || query.get('ref') ? 'campaign' : 'waitlist-website',
          landingPage: window.location.pathname,
          website
        })
      });
      const result = await response.json() as SignupResult;
      if (!response.ok) throw new Error(result.error || 'Your signup could not be saved.');
      setServiceAreaStatus(result.serviceAreaStatus || 'unknown');
      setReferralCode(result.referralCode || '');
      setTrackingAvailable(result.trackingAvailable !== false);
      setDemoMode(result.demoMode === true);
      if (result.trackingAvailable && !result.demoMode && result.referralCode) {
        window.OnlineBarNative?.saveMemberProgress(result.referralCode, rewardPath);
      }
      setStep(3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your signup could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const changeCity = (city: string) => {
    setLocation(current => ({
      ...current,
      city,
      county: areasByCity[city]?.county || '',
      area: '',
      verified: false,
      accuracy: null
    }));
    setCustomCity('');
    setCustomArea('');
  };

  const setManualArea = (area: string) => {
    setLocation(current => ({ ...current, area, verified: false, accuracy: null }));
    setCustomArea('');
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(current => current.includes(interest)
      ? current.filter(value => value !== interest)
      : [...current, interest]);
  };

  const addToHomeScreen = async () => {
    try {
      if (installPrompt) {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        setInstallPrompt(null);
        setInstallNotice(choice.outcome === 'accepted'
          ? 'Added to your home screen. Open Online Bar anytime to check your live countdown and progress.'
          : 'No worries. You can add Online Bar to your home screen later from your browser menu.');
        return;
      }
      setInstallNotice(/iphone|ipad|ipod/i.test(navigator.userAgent)
        ? 'In Safari, tap Share, then “Add to Home Screen” to keep a shortcut to your live launch tracker.'
        : 'Open your browser menu and choose “Install app” or “Add to Home screen” for a shortcut to your live launch tracker.');
    } catch (cause) {
      console.error('[WaitlistSite] Could not install the launch tracker:', cause);
      setInstallNotice('The install prompt could not be opened. Use your browser menu to add this page to your home screen.');
    }
  };

  const openShareChooser = () => {
    const variant = shareVariant;
    setShareNotice('');
    const url = new URL(window.location.href);
    if (referralCode) url.searchParams.set('ref', referralCode);
    const text = variant === 'buzz'
      ? `Share the buzz: join me on the Online Bar early-access list and help us launch. My invite: ${url.toString()}`
      : variant === 'whisper'
        ? `A little whisper for you: join me on the Online Bar early-access list. My invite: ${url.toString()}`
        : `Tell a friend to join the Online Bar early-access waitlist. My invite: ${url.toString()}`;
    setShareLink(url.toString());
    setShareMessage(text);
    setShareDialogOpen(true);
  };

  const copyShareMessage = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setShareNotice('Your invite message and personal link are copied and ready to share.');
    } catch (cause) {
      console.error('[WaitlistSite] Could not copy the invite message:', cause);
      setShareNotice('We could not copy the invite. Allow clipboard access or copy your invite link manually.');
    }
  };

  const shareToApp = async (app: 'instagram' | 'snapchat') => {
    const appUrl = app === 'instagram' ? 'https://www.instagram.com/' : 'https://www.snapchat.com/';
    window.open(appUrl, '_blank', 'noopener,noreferrer');
    try {
      await navigator.clipboard.writeText(shareMessage);
      setShareNotice(`Your invite is copied. Paste it into your ${app === 'instagram' ? 'Instagram message or story' : 'Snapchat chat'} to share.`);
    } catch (cause) {
      console.error(`[WaitlistSite] Could not copy the invite for ${app}:`, cause);
      setShareNotice(`Copy your invite link here, then paste it into ${app === 'instagram' ? 'Instagram' : 'Snapchat'}.`);
    }
  };

  return (
    <main className="site-shell">
      <nav className="topbar"><Link className="brand" href="/" aria-label="Online Bar home"><span className="brand-mark">OB</span><span>ONLINE BAR<span className="brand-sub">GOOD TIMES, DELIVERED</span></span></Link><span className="top-status"><i /> EARLY ACCESS</span></nav>
      <audio ref={audioRef} loop preload="none" onEnded={() => setMusicPlaying(false)} />
      {!ageGateComplete && (
        <section className="age-gate">
          <p className="eyebrow"><span /> ONLINE BAR EARLY ACCESS</p>
          <h1>First, are you <em>18+?</em></h1>
          <p>This experience is for adults of legal drinking age. Choose an age range; we do not ask for your date of birth. Your range is only saved if you join the waitlist.</p>
          <label className="age-gate-select">Your age range<select value={ageGroup} onChange={event => setAgeGroup(event.target.value)}><option value="">Choose an adult age range</option>{ageGroups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
          <label className="check-row age-row"><input type="checkbox" checked={adultConfirmedAtEntry} onChange={event => setAdultConfirmedAtEntry(event.target.checked)} /><span>I confirm I am 18 or older.</span></label>
          <p className="privacy-note">Music starts only after you choose your age range and continue. You can pause it anytime.</p>
          <button className="button button-primary" disabled={!siteContentLoaded || !ageGroup || !adultConfirmedAtEntry} onClick={enterSite}>{siteContentLoaded ? 'Enter & play' : 'Loading…'} <span>↗</span></button>
          {!currentAgeTrack && siteContentLoaded && <p className="inline-note">No track is assigned to this age range yet. You can still continue.</p>}
        </section>
      )}
      {ageGateComplete && (
        <div className="music-control">
          <span>{currentAgeTrack ? currentAgeTrack.title : 'Music not set for this range'}</span>
          {currentAgeTrack && <button type="button" onClick={toggleMusic}>{musicPlaying ? 'Pause music' : 'Play music'}</button>}
          {musicNotice && <span role="status">{musicNotice}</span>}
        </div>
      )}
      {ageGateComplete && <>
      {step === 0 && (
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span /> {siteContent.eyebrow}</p>
            <h1>{siteContent.headline}</h1>
            <p className="hero-intro">{siteContent.intro}</p>
            <button className="button button-primary" onClick={() => setStep(1)}>Get early access <span>↗</span></button>
            <div className="benefits">{[siteContent.benefit_one, siteContent.benefit_two, siteContent.benefit_three].map(benefit => <span key={benefit}>✦ {benefit}</span>)}</div>
          </div>
          <div className={`hero-art${siteContent.hero_image_url ? ' has-photo' : ''}`} role="img" aria-label={siteContent.hero_image_url ? siteContent.hero_image_alt : 'Online Bar early access'} style={siteContent.hero_image_url ? { backgroundImage: `url("${siteContent.hero_image_url.replaceAll('"', '%22')}")` } : undefined}><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="glass">✦</div><div className="art-label"><b>01</b><span>THE GOOD<br />STUFF IS NEAR</span></div><div className="art-note">FIRST IN.<br />FIRST POUR.</div></div>
          <footer className="hero-footer"><span>NAIROBI · KENYA</span><span>18+ · RESPONSIBLE ENJOYMENT</span><span>YOUR NEIGHBOURHOOD, NEXT</span></footer>
        </section>
      )}

      {(step === 1 || step === 2) && (
        <section className="form-layout">
          <div className="form-aside"><p className="eyebrow"><span /> YOUR EARLY ACCESS</p><h1>{step === 1 ? 'First, your neighbourhood.' : 'Make it yours.'}</h1><p>We’re opening in selected areas first. Your area helps us plan where to go next.</p><div className="steps"><span className={step === 1 ? 'current' : 'complete'}>01</span><i /><span className={step === 2 ? 'current' : ''}>02</span><i /><span>03</span></div><small>LOCATION <b>·</b> YOUR DETAILS <b>·</b> YOU’RE IN</small></div>
          {step === 1 ? (
            <div className="form-card">
              <p className="eyebrow">STEP 01 — DELIVERY AREA</p><h2>Where should we deliver?</h2>              <p className="muted">Tell us your neighbourhood and a nearby landmark so we can plan where to launch next. GPS is optional.</p>
              <button type="button" className="button button-outline" onClick={requestLocation} disabled={busy}>⌖ {busy ? 'Finding your area…' : 'Use my current location'}</button>
              {gpsStatus && <p className="inline-note" role="status">{gpsStatus}</p>}
              <div className="divider"><span>OR ENTER IT YOURSELF</span></div>
              <label>Town / city<select value={location.city} onChange={event => changeCity(event.target.value)}>{[...Object.keys(areasByCity), 'Other'].filter((city, index, all) => all.indexOf(city) === index).map(city => <option key={city}>{city}</option>)}</select></label>
              {location.city === 'Other' && <>
                <label>Town / city<input value={customCity} onChange={event => setCustomCity(event.target.value)} placeholder="Your town or city" maxLength={100} /></label>
                <label>County<input value={location.county} onChange={event => setLocation(current => ({ ...current, county: event.target.value }))} placeholder="Your county" maxLength={80} /></label>
              </>}
              {areas.length > 0 && <label>Estate / neighbourhood<select value={location.area} onChange={event => setManualArea(event.target.value)}><option value="">Choose an area</option>{areas.map(area => <option key={area}>{area}</option>)}</select></label>}
              <label>Enter an area {areas.length ? <span className="optional">(or add a more specific estate)</span> : null}<input value={customArea} onChange={event => { setCustomArea(event.target.value); if (event.target.value) setLocation(current => ({ ...current, verified: false, accuracy: null })); }} placeholder="e.g. Westlands, Kilimani, Nyali" maxLength={100} /></label>
              <label>Nearby landmark <span className="optional">OPTIONAL</span><input value={landmark} onChange={event => setLandmark(event.target.value)} placeholder="e.g. Sarit Centre, Westlands" maxLength={120} /></label>
              <p className="privacy-note">We use your area to plan launch availability. Exact GPS coordinates are used only to find an approximate area and are not saved.</p>
              <button className="button button-primary full" disabled={busy || !resolvedArea || !resolvedCity || !location.county.trim()} onClick={() => setStep(2)}>Continue <span>→</span></button>
              {error && <p className="error" role="alert">{error}</p>}
            </div>
          ) : (
            <form className="form-card" onSubmit={submit}>
              <p className="eyebrow">STEP 02 — YOUR INVITATION</p><h2>Where should we reach you?</h2>              <p className="muted">For {resolvedArea}, {location.city}. Already in our launch coverage? Join and wait for your launch update. Not there yet? Join anyway — we’re coming soon and your area helps us plan.</p>
              <label>Your name<input autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Name" maxLength={120} /></label>
              <label>Email address<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" maxLength={254} /></label>
              <label>Phone number <span className="optional">OPTIONAL UNLESS YOU CHOOSE SMS / WHATSAPP</span><input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+254 7XX XXX XXX" maxLength={32} /></label>
              <p className="inline-note">Age range selected: {selectedAgeGroup?.label}. Your age range is used for launch planning and personalized music.</p>
              <fieldset className="reward-path-fieldset">
                <legend>What are you here for? <span className="optional">CHOOSE YOUR EXPERIENCE</span></legend>
                <div className="reward-path-grid">
                  {rewardPaths.map(path => (
                    <button
                      type="button"
                      key={path.id}
                      className={`reward-path-option${rewardPath === path.id ? ' selected' : ''}`}
                      aria-pressed={rewardPath === path.id}
                      onClick={() => setRewardPath(path.id)}
                    >
                      <span className="reward-path-icon" aria-hidden="true">{path.icon}</span>
                      <strong>{path.title}</strong>
                      <small>{path.description}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset><legend>How may we send your early-access update?</legend>
                {(['email', 'sms', 'whatsapp'] as const).map(channel => <label className="check-row" key={channel}><input type="checkbox" checked={consents[channel]} onChange={event => setConsents(current => ({ ...current, [channel]: event.target.checked }))} /><span>{channel === 'email' ? 'Email' : channel === 'sms' ? 'SMS' : 'WhatsApp'} updates</span></label>)}
              </fieldset>
              {updatesAllowed && <label>Preferred contact method<select value={preferredContactMethod} onChange={event => setPreferredContactMethod(event.target.value as typeof preferredContactMethod)}><option value="">No preference</option>{consents.email && <option value="email">Email</option>}{consents.sms && <option value="sms">SMS</option>}{consents.whatsapp && <option value="whatsapp">WhatsApp</option>}</select></label>}
              <fieldset><legend>What would you love to see? <span className="optional">OPTIONAL · SELECT ANY</span></legend><div className="interest-grid">{interests.map(item => <button type="button" key={item} className={`interest ${selectedInterests.includes(item) ? 'selected' : ''}`} aria-pressed={selectedInterests.includes(item)} onClick={() => toggleInterest(item)}>{item}</button>)}</div></fieldset>
              <label>How often do you usually order? <span className="optional">OPTIONAL</span><select value={frequency} onChange={event => setFrequency(event.target.value)}><option value="">Choose one</option>{frequencies.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="check-row age-row"><input type="checkbox" required checked={ageConfirmed} onChange={event => setAgeConfirmed(event.target.checked)} /><span>I confirm that I am of legal drinking age. This is not a substitute for age checks when purchasing or receiving alcohol.</span></label>
              <label className="trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
              <p className="privacy-note">We’ll only use the contact channels you selected for early-access updates. You can opt out later.</p>
              <div className="button-row"><button type="button" className="button button-ghost" onClick={() => { setError(''); setStep(1); }}>← Back</button><button className="button button-primary" disabled={busy}>{busy ? 'Joining…' : 'Join early access'} <span>↗</span></button></div>
              {error && <p className="error" role="alert">{error}</p>}
            </form>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="success-card">
            <div className="success-icon">✦</div><p className="eyebrow">{demoMode ? 'PREVIEW MODE' : 'YOU’RE ON THE LIST'}</p><h1>{demoMode ? <>Preview<br /><em>ready.</em></> : <>You’re in.<br /><em>Cheers.</em></>}</h1>
            {demoMode && <p className="demo-notice" role="status">This is a preview: your details and invite code were not saved. Connect the waitlist database to accept signups and track real referrals.</p>}
            {!demoMode && <p className="success-copy">{serviceAreaStatus === 'in_area'
              ? `Good news — ${resolvedArea}, ${resolvedCity} is in our current launch coverage. We’re getting ready to serve your area, so stay on the list and watch for your launch and early-access update.`
              : serviceAreaStatus === 'outside_area'
                ? `We’re not serving ${resolvedArea}, ${resolvedCity} just yet, but we’re coming soon. We’ve recorded your area${landmark.trim() ? ` near ${landmark.trim()}` : ''} to help us plan where to expand next, and we’ll keep you posted.`
                : `We’ve recorded demand for ${resolvedArea}, ${resolvedCity}${landmark.trim() ? ` near ${landmark.trim()}` : ''}. We’re still confirming launch coverage, and we’ll share an update as soon as we know more.`}</p>}
            {!demoMode && <p className="success-copy">You’re now on the Online Bar early-access list. You’ll get first dibs on launch-day surprises, priority delivery access, and early-access perks as soon as we open nearby.</p>}
          <div className="success-grid">
            <div className="perk-card">
              <p className="mini-label">WHAT EARLY ACCESS GETS YOU</p>
              {selectedRewardPath && <div className="chosen-path"><span>{selectedRewardPath.icon}</span><div><strong>{selectedRewardPath.subtitle}</strong><small>{selectedRewardPath.description}</small></div></div>}
              <ul>
                <li>Priority launch access in your area.</li>
                <li>Curated experiences and launch surprises aligned with your interests.</li>
                <li>Earn {siteContent.tokens_per_referral} tokens for each friend who joins through your link.</li>
              </ul>
            </div>
            <div className="widget-card">
              <p className="mini-label">YOUR LAUNCH TRACKER</p>
              <strong className="launch-message">{launchMessage}</strong>
              <div className="countdown-row">
                <span>{siteContent.launch_at ? countdown.days : '—'}</span><small>days</small>
                <span>{siteContent.launch_at ? countdown.hours : '—'}</span><small>hrs</small>
                <span>{siteContent.launch_at ? countdown.minutes : '—'}</span><small>min</small>
                <span>{siteContent.launch_at ? countdown.seconds : '—'}</span><small>sec</small>
              </div>
              <div className="widget-metrics">
                <div><strong>{trackingAvailable ? referralStats?.referrals ?? '…' : '—'}</strong><small>friends joined</small></div>
                <div><strong>{trackingAvailable ? referralStats?.tokensEarned ?? '…' : '—'}</strong><small>tokens earned</small></div>
              </div>
              {nextReward && <p className="next-unlock"><span>NEXT UNLOCK</span><strong>{nextReward.name}</strong><small>{trackingAvailable && referralStats ? `${friendsToNextReward} successful ${friendsToNextReward === 1 ? 'referral' : 'referrals'} to go` : `${nextReward.token_cost} tokens`}</small></p>}
              <p className="widget-note">{trackingAvailable
                ? `Each successful referral earns ${siteContent.tokens_per_referral} tokens. Your balance updates as friends join.`
                : 'Live referral tracking will appear when this waitlist is connected to its member database.'}</p>
              <button type="button" className="button button-outline install-button" onClick={() => void addToHomeScreen()}>
                {isInstalled ? 'Open from your home screen' : 'Add launch tracker to home screen'} <span>↗</span>
              </button>
              <p className="install-disclaimer">Adds a shortcut to your live tracker. Countdown and progress refresh when you open it; the web app cannot show a live counter inside your phone’s native widget area.</p>
              {installNotice && <p className="inline-note" role="status">{installNotice}</p>}
            </div>
          </div>
          {referralCode && !demoMode && <p className="referral">YOUR INVITE CODE <b>{referralCode}</b></p>}
          <div className="share-actions">
            <button type="button" className="button button-primary" disabled={demoMode} onClick={openShareChooser}>{shareLabel} <span>↗</span></button>
          </div>
          {shareNotice && <p className="inline-note" role="status">{shareNotice}</p>}
          <div className="rewards-panel">
            <p className="mini-label">SOUVENIRS TO EARN</p>
            <div className="reward-list">
              {(siteContent.rewards || defaultSiteContent.rewards).slice(0, 3).map(reward => (
                <div key={reward.id} className="reward-item">
                  <div className="reward-image" style={reward.image_url ? { backgroundImage: `url("${reward.image_url.replaceAll('"', '%22')}")` } : undefined}>{!reward.image_url && reward.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong>{reward.name}</strong>
                    <small>{reward.description}</small>
                    <span>{reward.token_cost} tokens</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      </>}
      {shareDialogOpen && (
        <div className="share-dialog-backdrop" onClick={() => setShareDialogOpen(false)}>
          <section
            aria-labelledby="share-dialog-title"
            aria-modal="true"
            className="share-dialog"
            onClick={event => event.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label="Close sharing options"
              className="share-dialog-close"
              onClick={() => setShareDialogOpen(false)}
              ref={shareDialogCloseRef}
              type="button"
            >×</button>
            <p className="mini-label">PASS THE GOOD TIMES ON</p>
            <h2 id="share-dialog-title">{shareLabel}</h2>
            <p className="share-dialog-copy">Choose where to send your personal invite. Your referral link stays attached.</p>
            <div className="share-platform-grid">
              <a href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`} rel="noreferrer" target="_blank">WhatsApp</a>
              <button onClick={() => void shareToApp('instagram')} type="button">Instagram</button>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}`} rel="noreferrer" target="_blank">X</a>
              <button onClick={() => void shareToApp('snapchat')} type="button">Snapchat</button>
              <a href={`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(shareLabel)}`} rel="noreferrer" target="_blank">Telegram</a>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`} rel="noreferrer" target="_blank">Facebook</a>
              <a href={`mailto:?subject=${encodeURIComponent('Join me on Online Bar early access')}&body=${encodeURIComponent(shareMessage)}`}>Email</a>
              <a href={`sms:?body=${encodeURIComponent(shareMessage)}`}>Text message</a>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button
                  className="share-platform-more"
                  onClick={async () => {
                    try {
                      await navigator.share({ title: 'Online Bar early access', text: shareMessage, url: shareLink });
                    } catch (cause) {
                      if (cause instanceof Error && cause.name !== 'AbortError') {
                        console.error('[WaitlistSite] Could not open the device share sheet:', cause);
                        setShareNotice('Your device sharing menu could not be opened. Choose an app above or copy your invite.');
                      }
                    }
                  }}
                  type="button"
                >More apps…</button>
              )}
              <button className="share-platform-copy" onClick={() => void copyShareMessage()} type="button">Copy invite</button>
            </div>
            <p className="share-dialog-footnote">Instagram and Snapchat need you to paste the copied invite into your message or story. “More apps” opens the sharing options supported by your phone.</p>
            {shareNotice && <p className="inline-note" role="status">{shareNotice}</p>}
          </section>
        </div>
      )}
      <footer className="site-footer"><span>ONLINE BAR</span><span>GOOD TIMES, DELIVERED.</span><a href="https://onlinebar.co.ke/privacy">PRIVACY</a></footer>
    </main>
  );
}
