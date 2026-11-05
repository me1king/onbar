import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionCookie } from '@/lib/adminAuth';
import { canAccessRoute } from '@/lib/engines/identityEngine';
import { isPublicSiteLocked, parsePublicLaunchGate } from '@/lib/publicLaunchGate';

const ticketingPublicPaths = [
  '/tickets',
  '/merchant/onboarding',
  '/merchant/documents',
  '/api/merchant-applications',
  '/api/merchant-onboarding-invite',
  '/rider',
  '/api/rider',
  '/api/mpesa/rider-delivery-callback',
  '/scanner',
  '/launch-countdown',
  '/api/settings',
  '/api/ticketing',
  '/api/payhero/ticketing',
  '/api/paystack/webhook',
  '/api/webhooks',
  '/api/health',
  '/api/ready',
  '/api/public-launch-gate',
  '/api/admin'
];

function isTicketingOrAdminPath(pathname: string) {
  return ticketingPublicPaths.some(path => pathname === path || pathname.startsWith(`${path}/`))
    || pathname === '/lord'
    || pathname.startsWith('/lord/')
    || pathname === '/admin'
    || pathname.startsWith('/admin/')
    || pathname === '/supplier'
    || pathname.startsWith('/supplier/');
}

function isPublicAssetPath(pathname: string) {
  return pathname === '/robots.txt'
    || pathname === '/llms.txt'
    || pathname === '/sitemap.xml'
    || /\.(?:avif|gif|jpe?g|png|svg|webp|ico|woff2?|ttf|otf|eot)$/i.test(pathname);
}

async function readPublicLaunchGate() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    return { active: process.env.PUBLIC_TICKETING_ONLY?.trim().toLowerCase() === 'true', releaseAt: null };
  }

  const endpoint = new URL('/rest/v1/settings', url);
  endpoint.searchParams.set('key', 'eq.public_launch_gate');
  endpoint.searchParams.set('select', 'value');
  endpoint.searchParams.set('is_published', 'eq.true');
  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(2500)
  });
  if (!response.ok) throw new Error(`Launch gate lookup failed (${response.status}).`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { active: process.env.PUBLIC_TICKETING_ONLY?.trim().toLowerCase() === 'true', releaseAt: null };
  }
  const value = typeof rows[0] === 'object' && rows[0] !== null
    ? (rows[0] as { value?: unknown }).value
    : null;
  const gate = parsePublicLaunchGate(value);
  if (!gate) throw new Error('The stored public-site launch setting is invalid.');
  return gate;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.nextUrl.hostname === 'onlinebar.co.ke') {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = 'www.onlinebar.co.ke';
    canonicalUrl.protocol = 'https:';
    canonicalUrl.port = '';
    return NextResponse.redirect(canonicalUrl, 308);
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const destination = request.nextUrl.clone();
    destination.pathname = `/lord${pathname.slice('/admin'.length)}`;
    return NextResponse.redirect(destination, 308);
  }

  if (!isTicketingOrAdminPath(pathname) && !isPublicAssetPath(pathname)) {
    let locked = false;
    try {
      locked = isPublicSiteLocked(await readPublicLaunchGate());
    } catch (error) {
      console.error('[PublicLaunchGate] Could not verify public-site availability:', error);
      locked = true;
    }
    if (locked) {
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'The public site is temporarily unavailable while ticketing remains open.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const countdownPage = request.nextUrl.clone();
      countdownPage.pathname = '/launch-countdown';
      countdownPage.search = '';
      return NextResponse.redirect(countdownPage, 307);
    }
  }

  // 1. Protected Paths
  const isAdminPath = pathname.startsWith('/lord') && pathname !== '/lord/login';
  const isSupplierPath = pathname.startsWith('/supplier');

  if ((isAdminPath || isSupplierPath) && !pathname.includes('.')) {
    try {
      const sessionCookie = request.cookies.get('admin_session')?.value;
      const sessionData = await verifySessionCookie(sessionCookie);

      if (!sessionData) {
        return NextResponse.redirect(new URL('/lord/login', request.url));
      }

      // 2. Role-Based Routing & Route Access Logic
      if (isAdminPath) {
          if (sessionData.role === 'supplier') {
            return NextResponse.redirect(new URL('/supplier', request.url));
          }

          // Enhanced RBAC Check
          if (!canAccessRoute(sessionData.role, pathname, sessionData.permissions)) {
              console.warn(`🛑 RBAC REJECTION: Role ${sessionData.role} attempted to access ${pathname}`);
              return NextResponse.redirect(new URL('/lord', request.url));
          }
      }

      // Prevent Staff from entering Supplier (unless Owner/Admin)
      if (isSupplierPath && sessionData.role === 'staff') {
        return NextResponse.redirect(new URL('/lord', request.url));
      }

    } catch (err) {
      console.error("Middleware Auth Error:", err);
      return NextResponse.redirect(new URL('/lord/login', request.url));
    }
  }

  const response = NextResponse.next();
  if ((pathname === '/merchant/onboarding' && request.nextUrl.searchParams.has('invite'))
    || pathname === '/merchant/documents') {
    response.headers.set('Referrer-Policy', 'no-referrer');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
