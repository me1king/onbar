import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const fontFamilies = {
  classic: 'Georgia, serif',
  modern: 'Arial, sans-serif',
  signature: 'cursive'
} as const;

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  })[character] || character);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Order management access is required.' }, { status: 403 });
  }
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 });

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Choose a valid production job.' }, { status: 400 });
  }
  const { data, error } = await database.from('engraving_jobs')
    .select('approved_snapshot')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    console.error('[EngravingProduction] Could not load SVG source:', error?.message);
    return NextResponse.json({ error: error ? 'The design could not be loaded.' : 'Production job not found.' }, { status: error ? 503 : 404 });
  }

  const snapshot = data.approved_snapshot as Record<string, unknown>;
  const text = typeof snapshot.engravingText === 'string' ? snapshot.engravingText : '';
  const font = typeof snapshot.font === 'string' && snapshot.font in fontFamilies
    ? fontFamilies[snapshot.font as keyof typeof fontFamilies]
    : fontFamilies.modern;
  if (!text || text.length > 20 || !/^[A-Za-z0-9 .,'&-]+$/.test(text)) {
    return NextResponse.json({ error: 'The approved design is invalid and cannot be exported.' }, { status: 422 });
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="30mm" viewBox="0 0 1000 300">
  <text x="500" y="150" text-anchor="middle" dominant-baseline="middle" font-family="${font}" font-size="96">${escapeXml(text)}</text>
</svg>`;
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="engraving-job-${id}.svg"`,
      'Cache-Control': 'private, no-store, max-age=0'
    }
  });
}
