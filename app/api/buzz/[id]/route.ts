import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const revalidate = 30;

const publicStatuses = ['LIVE', 'TRENDING', 'STARTING_SOON'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: 'This event could not be found.' }, { status: 404 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'The event feed is not configured.' }, { status: 503 });
  }

  const { data, error } = await database
    .from('buzz_posts')
    .select('id,title,description,start_at,end_at,status,trend_score,latitude,longitude,venue:buzz_venues(id,name,address,category,hero_image_url),category:buzz_categories(label),media:buzz_media(media_type,url),updates:buzz_updates(id,message,media_url,created_at)')
    .eq('id', id)
    .in('status', publicStatuses)
    .abortSignal(AbortSignal.timeout(8_000))
    .maybeSingle();

  if (error) {
    console.error('[BuzzDetail] Could not load published event:', error);
    return NextResponse.json({ error: 'Event details could not be loaded. Please try again.' }, { status: 503 });
  }
  if (!data) {
    return NextResponse.json({ error: 'This event is no longer available.' }, { status: 404 });
  }

  return NextResponse.json({ buzz: data }, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60'
    }
  });
}
