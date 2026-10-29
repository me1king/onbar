import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const revalidate = 30;

const publicStatuses = ['LIVE', 'TRENDING', 'STARTING_SOON'];

export async function GET() {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'The event feed is not configured.' }, { status: 503 });
  }

  const [hotspotsResult, storiesResult] = await Promise.all([
    database
      .from('buzz_metrics')
      .select('zone_name,buzz_score,buzz_status,active_visitors,active_orders')
      .order('buzz_score', { ascending: false })
      .limit(100)
      .abortSignal(AbortSignal.timeout(8_000)),
    database
      .from('buzz_posts')
      .select('id,title,description,area_zone,status,trend_score,latitude,longitude,start_at,category:buzz_categories(label),media:buzz_media(media_type,url)')
      .in('status', publicStatuses)
      .order('trend_score', { ascending: false })
      .limit(24)
      .abortSignal(AbortSignal.timeout(8_000))
  ]);

  if (storiesResult.error) {
    console.error('[BuzzDiscovery] Could not load published events:', storiesResult.error);
    return NextResponse.json({ error: 'Published events could not be loaded. Please try again.' }, { status: 503 });
  }

  if (hotspotsResult.error) {
    console.error('[BuzzDiscovery] Live hotspot metrics are unavailable:', hotspotsResult.error);
  }

  return NextResponse.json({
    hotspots: hotspotsResult.error ? [] : hotspotsResult.data || [],
    metricsAvailable: !hotspotsResult.error,
    stories: storiesResult.data || []
  }, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60'
    }
  });
}
