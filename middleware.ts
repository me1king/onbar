import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionCookie } from '@/lib/adminAuth';
import { canAccessRoute } from '@/lib/engines/identityEngine';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const destination = request.nextUrl.clone();
    destination.pathname = `/lord${pathname.slice('/admin'.length)}`;
    return NextResponse.redirect(destination, 308);
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/lord', '/lord/:path*', '/supplier/:path*'],
};
