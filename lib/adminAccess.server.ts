import 'server-only';

import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export type AdminPermission =
  | 'can_view_revenue'
  | 'can_manage_inventory'
  | 'can_manage_orders'
  | 'can_execute_payouts'
  | 'can_view_audit_logs'
  | 'can_manage_settings'
  | 'can_manage_staff'
  | 'can_view_sensitive_data'
  | 'can_manage_communications'
  | 'can_manage_marketing';

export async function getAdminSession() {
  const cookieStore = await cookies();
  return verifySessionCookie(cookieStore.get('admin_session')?.value);
}

export function hasAdminPermission(
  session: Awaited<ReturnType<typeof getAdminSession>>,
  permission: AdminPermission
): boolean {
  return Boolean(
    session &&
    (session.role.toLowerCase() === 'owner' || session.permissions[permission] === true)
  );
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isInternalRequest(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || value.length !== secret.length) return false;

  let difference = 0;
  for (let index = 0; index < secret.length; index++) {
    difference |= secret.charCodeAt(index) ^ value.charCodeAt(index);
  }
  return difference === 0;
}
