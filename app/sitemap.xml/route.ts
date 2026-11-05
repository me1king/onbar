import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { supabase } from '@/lib/supabaseClient';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { getPublicBaseUrl } from '@/lib/utils';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const staticRoutes = [
  '',
  '/shop',
  '/delivery',
  '/build-my-night',
  '/concierge',
  '/about',
  '/contact',
  '/shipping',
  '/returns',
  '/privacy',
  '/terms',
  '/blog',
];

function escapeXml(value: string) {
  const replacements: Record<string, string> = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  };
  return value.replace(/[<>&'"]/g, character => replacements[character]);
}

export async function GET() {
  const baseUrl = getPublicBaseUrl();
  const database = createServerSupabaseClient() || supabase;
  let products: { id: string | number; updated_at: string | null; status?: string; hide_product?: boolean; is_available_now?: boolean; category?: string | null }[] = [];
  let posts: { slug: string }[] = [];

  if (database) {
    const [productsResult, postsResult] = await Promise.all([
      database.from('products')
        .select('id, updated_at, status, hide_product, is_available_now, category')
        .abortSignal(AbortSignal.timeout(8_000)),
      database.from('blog_posts')
        .select('slug')
        .eq('is_published', true)
        .abortSignal(AbortSignal.timeout(8_000)),
    ]);

    if (productsResult.error) {
      console.error('[Sitemap] Could not load products:', productsResult.error.message);
    } else {
      products = (productsResult.data || []).filter(isStorefrontProductVisible);
    }

    if (postsResult.error) {
      console.error('[Sitemap] Could not load published posts:', postsResult.error.message);
    } else {
      posts = postsResult.data || [];
    }
  } else {
    console.error('[Sitemap] Server-side catalog is not configured; returning static public routes only.');
  }

  const lastmod = new Date().toISOString();
  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    ...staticRoutes.map(route => ({ loc: `${baseUrl}${route}`, lastmod, priority: route === '' ? '1.0' : '0.8' })),
    ...products.map(product => ({
      loc: `${baseUrl}/shop/${encodeURIComponent(String(product.id))}`,
      lastmod: product.updated_at ? new Date(product.updated_at).toISOString() : lastmod,
      priority: '0.9',
    })),
    ...posts.map(post => ({
      loc: `${baseUrl}/blog/${encodeURIComponent(post.slug)}`,
      priority: '0.7',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    ${'lastmod' in url && url.lastmod ? `<lastmod>${escapeXml(url.lastmod)}</lastmod>` : ''}
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
  });
}
