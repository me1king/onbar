import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const BUCKET = 'waitlist-site-images';
const AUDIO_BUCKET = 'waitlist-site-audio';
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
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a'
};
const contentFields = 'id,eyebrow,headline,intro,benefit_one,benefit_two,benefit_three,hero_image_url,hero_image_path,hero_image_alt,age_group_tracks,updated_at';

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
  return NextResponse.json({ content: data }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
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
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Waitlist site storage is not configured.' }, { status: 503 });
  const { data, error } = await database.from('waitlist_site_content')
    .update({ ...updates, updated_at: new Date().toISOString() })
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
    const audioExtension = audioExtensions[file.type];
    if (typeof ageGroup !== 'string' || !AGE_GROUPS.has(ageGroup)) {
      return NextResponse.json({ error: 'Choose a valid adult age group for this track.' }, { status: 400 });
    }
    if (!title) return NextResponse.json({ error: 'Enter a track name.' }, { status: 400 });
    if (!audioExtension) return NextResponse.json({ error: 'Only MP3, WAV, OGG, or M4A audio files are supported.' }, { status: 400 });
    if (file.size === 0 || file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio must be greater than 0 bytes and no larger than 10 MB.' }, { status: 400 });
    }
    const audioBytes = new Uint8Array(await file.arrayBuffer());
    if (!validAudioSignature(file.type, audioBytes)) {
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
      contentType: file.type,
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
    if (previousPath && previousPath !== path) {
      const { error: cleanupError } = await database.storage.from(AUDIO_BUCKET).remove([previousPath]);
      if (cleanupError) console.error('[AdminWaitlistSite] Could not remove replaced age-group track:', cleanupError);
    }
    return NextResponse.json({ content: data }, { headers: { 'Cache-Control': 'no-store' } });
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
