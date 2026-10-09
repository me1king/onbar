import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const BUCKET = 'waitlist-site-images';
const AUDIO_BUCKET = 'waitlist-site-audio';
const REWARD_BUCKET = 'waitlist-site-rewards';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const AGE_GROUPS = new Set(['18_20', '21_24', '25_34', '35_44', '45_plus']);
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif'
};
const audioExtensions: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/x-mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a'
};
const contentFields = 'id,eyebrow,headline,intro,benefit_one,benefit_two,benefit_three,hero_image_url,hero_image_path,hero_image_alt,age_group_tracks,launch_at,tokens_per_referral,updated_at';
const rewardFields = 'id,name,description,image_url,image_path,token_cost,is_active,sort_order,created_at,updated_at';
const claimFields = 'id,referrer_id,reward_id,tokens_spent,status,created_at,updated_at';

async function checkTracksOnPublicSite(tracks: Record<string, { title: string; url: string }>) {
  const baseUrl = (process.env.WAITLIST_PUBLIC_URL?.trim() || 'https://theewaitlist.vercel.app').replace(/\/+$/, '');
  try {
    const response = await fetch(`${baseUrl}/api/content?track_check=${crypto.randomUUID()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { available: false, confirmed: {} as Record<string, boolean> };
    const result = await response.json() as {
      content?: { age_group_tracks?: Record<string, { title?: string; url?: string }> };
    };
    const publishedTracks = result.content?.age_group_tracks || {};
    return {
      available: true,
      confirmed: Object.fromEntries(
        Object.entries(tracks).map(([ageGroup, track]) => {
          const publishedTrack = publishedTracks[ageGroup];
          return [ageGroup, publishedTrack?.title === track.title && publishedTrack.url === track.url];
        })
      )
    };
  } catch (error) {
    console.error('[AdminWaitlistSite] Could not verify the uploaded track on the public waitlist site:', error);
    return { available: false, confirmed: {} as Record<string, boolean> };
  }
}

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

async function authorize() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  if (!['owner', 'admin'].includes(session.role.toLowerCase()) && session.permissions.can_manage_settings !== true) {
    return { response: NextResponse.json({ error: 'Website content management access is required.' }, { status: 403 }) };
  }
  return { response: null };
}

function validImageSignature(type: string, bytes: Uint8Array) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && String.fromCharCode(...bytes.slice(1, 4)) === 'PNG'
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
  }
  if (type === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (type === 'image/avif') return String.fromCharCode(...bytes.slice(4, 12)).includes('ftypavi');
  return false;
}

function validAudioSignature(type: string, bytes: Uint8Array) {
  if (type === 'audio/mpeg') return bytes.length >= 3
    && (String.fromCharCode(...bytes.slice(0, 3)) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  if (type === 'audio/wav') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE';
  if (type === 'audio/ogg') return String.fromCharCode(...bytes.slice(0, 4)) === 'OggS';
  if (type === 'audio/mp4') return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  return false;
}

export async function GET() {
  const { response } = await authorize();
  if (response) return response;
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Waitlist site storage is not configured.' }, { status: 503 });
  const { data, error } = await database.from('waitlist_site_content').select(contentFields).eq('id', 'default').maybeSingle();
  if (error || !data) {
    console.error('[AdminWaitlistSite] Could not load published website content:', error);
    return NextResponse.json({ error: 'Apply waitlist-site/supabase/WAITLIST_SITE_MIGRATION.sql to enable website content management.' }, { status: 503 });
  }
  const [rewards, claims] = await Promise.all([
    database.from('waitlist_site_rewards').select(rewardFields).order('sort_order').order('created_at'),
    database.from('waitlist_reward_claims').select(claimFields).order('created_at', { ascending: false }).limit(100)
  ]);
  if (rewards.error || claims.error) {
    console.error('[AdminWaitlistSite] Could not load reward/widget settings:', rewards.error || claims.error);
    return NextResponse.json({ error: 'Souvenir and widget controls could not be loaded. Apply the waitlist site migration.' }, { status: 503 });
  }
  const memberIds = [...new Set((claims.data || []).map(claim => claim.referrer_id))];
  const members = memberIds.length
    ? await database.from('market_waitlist').select('id,full_name,email').in('id', memberIds)
    : { data: [], error: null };
  if (members.error) {
    console.error('[AdminWaitlistSite] Could not load redemption member details:', members.error);
    return NextResponse.json({ error: 'Souvenir request member details could not be loaded.' }, { status: 503 });
  }
  const tracks = data.age_group_tracks && typeof data.age_group_tracks === 'object'
    ? data.age_group_tracks as Record<string, { title?: unknown; url?: unknown }>
    : {};
  const tracksToCheck = Object.fromEntries(
    Object.entries(tracks).filter((entry): entry is [string, { title: string; url: string }] =>
      typeof entry[1]?.title === 'string' && typeof entry[1]?.url === 'string'
    )
  );
  const publicSiteCheck = await checkTracksOnPublicSite(tracksToCheck);
  const memberById = new Map((members.data || []).map(member => [member.id, member]));
  const claimsWithMember = (claims.data || []).map(claim => ({
    ...claim,
    member: memberById.get(claim.referrer_id) || null
  }));
  return NextResponse.json({
    content: data,
    rewards: rewards.data || [],
    claims: claimsWithMember,
    publicSiteCheckAvailable: publicSiteCheck.available,
    publicSiteConfirmed: publicSiteCheck.confirmed
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const { response } = await authorize();
  if (response) return response;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid website content update is required.' }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Waitlist site storage is not configured.' }, { status: 503 });
  if (body.action === 'save_reward') {
    const reward = body.reward && typeof body.reward === 'object' ? body.reward as Record<string, unknown> : {};
    const name = typeof reward.name === 'string' ? reward.name.trim() : '';
    const description = typeof reward.description === 'string' ? reward.description.trim() : '';
    const tokenCost = reward.token_cost;
    const sortOrder = reward.sort_order;
    if (!name || name.length > 100 || description.length > 300
      || !Number.isSafeInteger(tokenCost) || Number(tokenCost) < 1 || Number(tokenCost) > 1_000_000
      || !Number.isSafeInteger(sortOrder) || Number(sortOrder) < 0 || Number(sortOrder) > 10_000
      || typeof reward.is_active !== 'boolean') {
      return NextResponse.json({ error: 'Enter a souvenir name, description, valid token cost and display order.' }, { status: 400 });
    }
    const values = {
      name, description, token_cost: Number(tokenCost), sort_order: Number(sortOrder),
      is_active: reward.is_active, updated_at: new Date().toISOString()
    };
    const id = typeof reward.id === 'string' && /^[0-9a-f-]{36}$/i.test(reward.id) ? reward.id : null;
    const result = id
      ? await database.from('waitlist_site_rewards').update(values).eq('id', id).select(rewardFields).maybeSingle()
      : await database.from('waitlist_site_rewards').insert(values).select(rewardFields).single();
    if (result.error || !result.data) {
      console.error('[AdminWaitlistSite] Could not save souvenir:', result.error);
      return NextResponse.json({ error: 'The souvenir could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ reward: result.data }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (body.action === 'delete_reward') {
    const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : '';
    if (!id) return NextResponse.json({ error: 'Choose a valid souvenir.' }, { status: 400 });
    const { data: reward, error: readError } = await database.from('waitlist_site_rewards')
      .select('image_path').eq('id', id).maybeSingle();
    if (readError) {
      console.error('[AdminWaitlistSite] Could not load souvenir before removal:', readError);
      return NextResponse.json({ error: 'The souvenir could not be loaded for removal.' }, { status: 503 });
    }
    const { error } = await database.from('waitlist_site_rewards').delete().eq('id', id);
    if (error) {
      console.error('[AdminWaitlistSite] Could not remove souvenir:', error);
      return NextResponse.json({ error: 'This souvenir cannot be removed; it may already have a redemption request. Deactivate it instead.' }, { status: 409 });
    }
    if (reward?.image_path) {
      const { error: cleanupError } = await database.storage.from(REWARD_BUCKET).remove([reward.image_path]);
      if (cleanupError) console.error('[AdminWaitlistSite] Could not remove deleted souvenir image:', cleanupError);
    }
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (body.action === 'claim_status') {
    const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : '';
    if (!id || !['approved', 'rejected'].includes(String(body.status))) {
      return NextResponse.json({ error: 'Choose a valid redemption and decision.' }, { status: 400 });
    }
    const { data, error } = await database.from('waitlist_reward_claims')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select(claimFields)
      .maybeSingle();
    if (error || !data) {
      console.error('[AdminWaitlistSite] Could not review souvenir redemption:', error);
      return NextResponse.json({ error: 'This pending redemption could not be updated; refresh and check its status.' }, { status: error ? 503 : 409 });
    }
    return NextResponse.json({ claim: data }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const limits: Record<string, number> = {
    eyebrow: 80, headline: 120, intro: 500, benefit_one: 60, benefit_two: 60, benefit_three: 60, hero_image_alt: 180
  };
  const updates: Record<string, string | null> = {};
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof body[field] !== 'string' || !(body[field] as string).trim() || (body[field] as string).trim().length > limit) {
      return NextResponse.json({ error: `Enter ${field.replaceAll('_', ' ')} in 1–${limit} characters.` }, { status: 400 });
    }
    updates[field] = (body[field] as string).trim();
  }
  if (!Number.isSafeInteger(body.tokens_per_referral)
    || Number(body.tokens_per_referral) < 1 || Number(body.tokens_per_referral) > 1000) {
    return NextResponse.json({ error: 'Tokens per successful referral must be between 1 and 1,000.' }, { status: 400 });
  }
  let launchAt: string | null = null;
  if (body.launch_at !== null && body.launch_at !== '') {
    if (typeof body.launch_at !== 'string' || !Number.isFinite(Date.parse(body.launch_at))) {
      return NextResponse.json({ error: 'Enter a valid launch date and time.' }, { status: 400 });
    }
    launchAt = new Date(body.launch_at).toISOString();
  }
  const { data, error } = await database.from('waitlist_site_content')
    .update({ ...updates, launch_at: launchAt, tokens_per_referral: Number(body.tokens_per_referral), updated_at: new Date().toISOString() })
    .eq('id', 'default')
    .select(contentFields)
    .single();
  if (error) {
    console.error('[AdminWaitlistSite] Could not save website content:', error);
    return NextResponse.json({ error: 'Website content could not be saved. Confirm the waitlist site migration is applied.' }, { status: 503 });
  }
  return NextResponse.json({ content: data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const { response } = await authorize();
  if (response) return response;
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Waitlist site storage is not configured.' }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 });
  if (form.get('kind') === 'music') {
    const ageGroup = form.get('ageGroup');
    const title = typeof form.get('title') === 'string' ? String(form.get('title')).trim().slice(0, 100) : '';
    const audioType = file.type.toLowerCase();
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const audioExtension = audioExtensions[audioType]
      || (fileExtension && ['mp3', 'wav', 'ogg', 'm4a'].includes(fileExtension) ? fileExtension : undefined);
    const canonicalAudioType = audioExtension === 'mp3' ? 'audio/mpeg'
      : audioExtension === 'wav' ? 'audio/wav'
        : audioExtension === 'ogg' ? 'audio/ogg'
          : audioExtension === 'm4a' ? 'audio/mp4'
            : '';
    if (typeof ageGroup !== 'string' || !AGE_GROUPS.has(ageGroup)) {
      return NextResponse.json({ error: 'Choose a valid adult age group for this track.' }, { status: 400 });
    }
    if (!title) return NextResponse.json({ error: 'Enter a track name.' }, { status: 400 });
    if (!audioExtension || !canonicalAudioType) return NextResponse.json({ error: 'Only MP3, WAV, OGG, or M4A audio files are supported.' }, { status: 400 });
    if (file.size === 0 || file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio must be greater than 0 bytes and no larger than 10 MB.' }, { status: 400 });
    }
    const audioBytes = new Uint8Array(await file.arrayBuffer());
    if (!validAudioSignature(canonicalAudioType, audioBytes)) {
      return NextResponse.json({ error: 'The audio contents do not match the selected file type.' }, { status: 400 });
    }

    const { data: current, error: readError } = await database.from('waitlist_site_content')
      .select('age_group_tracks')
      .eq('id', 'default')
      .single();
    if (readError) {
      console.error('[AdminWaitlistSite] Could not load current age-group music:', readError);
      return NextResponse.json({ error: 'Music settings could not be loaded. Apply the waitlist site migration.' }, { status: 503 });
    }
    const path = `music/${ageGroup}/${crypto.randomUUID()}.${audioExtension}`;
    const { error: uploadError } = await database.storage.from(AUDIO_BUCKET).upload(path, audioBytes, {
      contentType: canonicalAudioType,
      upsert: false
    });
    if (uploadError) {
      console.error('[AdminWaitlistSite] Could not upload age-group track:', uploadError);
      const missingBucket = uploadError.message.toLowerCase().includes('bucket not found');
      return NextResponse.json({
        error: missingBucket
          ? `The ${AUDIO_BUCKET} storage bucket is missing. Apply the waitlist site migration.`
          : 'The age-group track could not be uploaded.'
      }, { status: 503 });
    }
    const tracks = current.age_group_tracks && typeof current.age_group_tracks === 'object'
      ? { ...current.age_group_tracks as Record<string, { path?: string }> }
      : {};
    const previousPath = tracks[ageGroup]?.path;
    const track = {
      title,
      path,
      url: database.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl
    };
    tracks[ageGroup] = track;
    const { data, error: saveError } = await database.from('waitlist_site_content')
      .update({ age_group_tracks: tracks, updated_at: new Date().toISOString() })
      .eq('id', 'default')
      .select(contentFields)
      .single();
    if (saveError) {
      const { error: cleanupError } = await database.storage.from(AUDIO_BUCKET).remove([path]);
      if (cleanupError) console.error('[AdminWaitlistSite] Could not clean up unlinked music:', cleanupError);
      console.error('[AdminWaitlistSite] Could not save age-group track:', saveError);
      return NextResponse.json({ error: 'The track uploaded but could not be published. Confirm the waitlist site migration.' }, { status: 503 });
    }
    const savedTracks = data.age_group_tracks && typeof data.age_group_tracks === 'object'
      ? data.age_group_tracks as Record<string, { title?: string; path?: string; url?: string }>
      : {};
    const savedTrack = savedTracks[ageGroup];
    if (savedTrack?.title !== title || savedTrack.path !== path || savedTrack.url !== track.url) {
      console.error('[AdminWaitlistSite] Track upload returned without the expected age-group assignment.');
      return NextResponse.json({ error: 'The audio file uploaded, but the age-group assignment could not be confirmed. Refresh the waitlist settings and try again.' }, { status: 503 });
    }
    if (previousPath && previousPath !== path) {
      const { error: cleanupError } = await database.storage.from(AUDIO_BUCKET).remove([previousPath]);
      if (cleanupError) console.error('[AdminWaitlistSite] Could not remove replaced age-group track:', cleanupError);
    }
    const publicSiteCheck = await checkTracksOnPublicSite({ [ageGroup]: track });
    return NextResponse.json({
      content: data,
      publicSiteCheckAvailable: publicSiteCheck.available,
      publicSiteConfirmed: publicSiteCheck.confirmed[ageGroup] === true
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (form.get('kind') === 'reward') {
    const rewardId = form.get('rewardId');
    if (typeof rewardId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rewardId)) {
      return NextResponse.json({ error: 'Save the souvenir before uploading its image.' }, { status: 400 });
    }
    const extension = extensions[file.type];
    if (!extension) return NextResponse.json({ error: 'Only JPG, PNG, WebP, or AVIF souvenir images are supported.' }, { status: 400 });
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'The souvenir image must be greater than 0 bytes and no larger than 6 MB.' }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validImageSignature(file.type, bytes)) return NextResponse.json({ error: 'The image contents do not match the selected file type.' }, { status: 400 });

    const { data: current, error: readError } = await database.from('waitlist_site_rewards')
      .select('image_path').eq('id', rewardId).maybeSingle();
    if (readError || !current) {
      console.error('[AdminWaitlistSite] Could not load souvenir before image upload:', readError);
      return NextResponse.json({ error: 'The saved souvenir could not be found.' }, { status: 404 });
    }
    const path = `souvenirs/${rewardId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await database.storage.from(REWARD_BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false
    });
    if (uploadError) {
      console.error('[AdminWaitlistSite] Could not upload souvenir image:', uploadError);
      return NextResponse.json({
        error: uploadError.message.toLowerCase().includes('bucket not found')
          ? `The ${REWARD_BUCKET} storage bucket is missing. Apply the waitlist site migration.`
          : 'The souvenir image could not be uploaded.'
      }, { status: 503 });
    }
    const imageUrl = database.storage.from(REWARD_BUCKET).getPublicUrl(path).data.publicUrl;
    const { data, error: saveError } = await database.from('waitlist_site_rewards')
      .update({ image_url: imageUrl, image_path: path, updated_at: new Date().toISOString() })
      .eq('id', rewardId)
      .select(rewardFields)
      .single();
    if (saveError) {
      const { error: cleanupError } = await database.storage.from(REWARD_BUCKET).remove([path]);
      if (cleanupError) console.error('[AdminWaitlistSite] Could not clean up unlinked souvenir image:', cleanupError);
      console.error('[AdminWaitlistSite] Could not publish souvenir image:', saveError);
      return NextResponse.json({ error: 'The image uploaded but could not be linked to the souvenir.' }, { status: 503 });
    }
    if (current.image_path && current.image_path !== path) {
      const { error: cleanupError } = await database.storage.from(REWARD_BUCKET).remove([current.image_path]);
      if (cleanupError) console.error('[AdminWaitlistSite] Could not remove replaced souvenir image:', cleanupError);
    }
    return NextResponse.json({ reward: data }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (form.get('kind') && form.get('kind') !== 'hero') {
    return NextResponse.json({ error: 'Choose a valid waitlist image type.' }, { status: 400 });
  }

  const extension = extensions[file.type];
  if (!extension) return NextResponse.json({ error: 'Only JPG, PNG, WebP, or AVIF images are supported.' }, { status: 400 });
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'The image must be greater than 0 bytes and no larger than 6 MB.' }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validImageSignature(file.type, bytes)) return NextResponse.json({ error: 'The image contents do not match the selected file type.' }, { status: 400 });

  const path = `hero/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await database.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false
  });
  if (uploadError) {
    console.error('[AdminWaitlistSite] Could not upload website hero image:', uploadError);
    const missingBucket = uploadError.message.toLowerCase().includes('bucket not found');
    return NextResponse.json({
      error: missingBucket
        ? `The ${BUCKET} storage bucket is missing. Apply the waitlist site migration.`
        : 'The website image could not be uploaded.'
    }, { status: 503 });
  }

  const { data: current, error: readError } = await database.from('waitlist_site_content')
    .select('hero_image_path')
    .eq('id', 'default')
    .single();
  if (readError) {
    await database.storage.from(BUCKET).remove([path]);
    console.error('[AdminWaitlistSite] Could not load current website image:', readError);
    return NextResponse.json({ error: 'The uploaded image could not be linked to the website. Apply the waitlist site migration.' }, { status: 503 });
  }
  const imageUrl = database.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error: saveError } = await database.from('waitlist_site_content')
    .update({ hero_image_url: imageUrl, hero_image_path: path, updated_at: new Date().toISOString() })
    .eq('id', 'default')
    .select(contentFields)
    .single();
  if (saveError) {
    const { error: cleanupError } = await database.storage.from(BUCKET).remove([path]);
    if (cleanupError) console.error('[AdminWaitlistSite] Could not clean up unlinked website image:', cleanupError);
    console.error('[AdminWaitlistSite] Could not publish website hero image:', saveError);
    return NextResponse.json({ error: 'The image uploaded but could not be published. Confirm the waitlist site migration and retry.' }, { status: 503 });
  }
  if (current.hero_image_path && current.hero_image_path !== path) {
    const { error: cleanupError } = await database.storage.from(BUCKET).remove([current.hero_image_path]);
    if (cleanupError) console.error('[AdminWaitlistSite] Could not remove replaced website image:', cleanupError);
  }
  return NextResponse.json({ content: data }, { headers: { 'Cache-Control': 'no-store' } });
}
