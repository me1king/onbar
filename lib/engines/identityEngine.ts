/**
 * ONLINE BAR: IDENTITY ENGINE (RBAC)
 * Centralizes permission checks and role-based access logic.
 */

export type Role =
    | 'OWNER'               // Full system access
    | 'SUPER_ADMIN'         // High level management
    | 'OPERATIONS_ADMIN'    // Orders, Riders, Dispatch
    | 'FINANCE_ADMIN'       // Ledger, Payouts, Reports
    | 'SUPPORT_ADMIN'       // Tickets, Messages, Reviews
    | 'SECURITY_ADMIN'      // Audit logs, Risk Engine, IP blocking
    | 'SUPPLIER_ADMIN'      // Limited to own inventory
    | 'RIDER_MANAGER'       // Limited to rider coordination
    | 'STAFF'               // Basic operational entry
    | 'VIEWER';             // Read-only access

export type Permission =
    | 'CAN_VIEW_REVENUE'
    | 'CAN_MANAGE_INVENTORY'
    | 'CAN_MANAGE_ORDERS'
    | 'CAN_EXECUTE_PAYOUTS'
    | 'CAN_VIEW_AUDIT_LOGS'
    | 'CAN_MANAGE_SETTINGS'
    | 'CAN_MANAGE_STAFF'
    | 'CAN_VIEW_SENSITIVE_DATA'
    | 'CAN_MANAGE_COMMUNICATIONS'
    | 'CAN_MANAGE_MARKETING';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    'OWNER': [
        'CAN_VIEW_REVENUE', 'CAN_MANAGE_INVENTORY', 'CAN_MANAGE_ORDERS',
        'CAN_EXECUTE_PAYOUTS', 'CAN_VIEW_AUDIT_LOGS', 'CAN_MANAGE_SETTINGS',
        'CAN_MANAGE_STAFF', 'CAN_VIEW_SENSITIVE_DATA', 'CAN_MANAGE_COMMUNICATIONS',
        'CAN_MANAGE_MARKETING'
    ],
    'SUPER_ADMIN': [
        'CAN_VIEW_REVENUE', 'CAN_MANAGE_INVENTORY', 'CAN_MANAGE_ORDERS',
        'CAN_VIEW_AUDIT_LOGS', 'CAN_MANAGE_SETTINGS', 'CAN_MANAGE_STAFF',
        'CAN_VIEW_SENSITIVE_DATA', 'CAN_MANAGE_COMMUNICATIONS', 'CAN_MANAGE_MARKETING'
    ],
    'OPERATIONS_ADMIN': [
        'CAN_MANAGE_INVENTORY', 'CAN_MANAGE_ORDERS', 'CAN_VIEW_SENSITIVE_DATA',
        'CAN_MANAGE_COMMUNICATIONS'
    ],
    'FINANCE_ADMIN': [
        'CAN_VIEW_REVENUE', 'CAN_EXECUTE_PAYOUTS', 'CAN_VIEW_AUDIT_LOGS'
    ],
    'SUPPORT_ADMIN': [
        'CAN_MANAGE_COMMUNICATIONS', 'CAN_MANAGE_ORDERS'
    ],
    'SECURITY_ADMIN': [
        'CAN_VIEW_AUDIT_LOGS', 'CAN_VIEW_SENSITIVE_DATA'
    ],
    'SUPPLIER_ADMIN': [
        'CAN_MANAGE_INVENTORY'
    ],
    'RIDER_MANAGER': [
        'CAN_MANAGE_ORDERS', 'CAN_VIEW_SENSITIVE_DATA'
    ],
    'STAFF': [
        'CAN_MANAGE_ORDERS'
    ],
    'VIEWER': [
        'CAN_VIEW_AUDIT_LOGS' // Limited read-only
    ]
};

/**
 * Checks if a user has a specific permission based on their role
 */
export function hasPermission(role: Role | string, permission: Permission): boolean {
    const normalizedRole = (role || 'STAFF').toUpperCase() as Role;
    const permissions = ROLE_PERMISSIONS[normalizedRole] || [];
    return permissions.includes(permission);
}

/**
 * Checks if a user can access a specific admin route
 */
export function canAccessRoute(
    role: Role | string,
    pathname: string,
    permissions: Record<string, boolean | string[]> = {}
): boolean {
    const r = (role || 'STAFF').toUpperCase() as Role;

    // Global Rules
    if (r === 'OWNER') return true;

    const permissionKeys: Record<Permission, string> = {
        CAN_VIEW_REVENUE: 'can_view_revenue',
        CAN_MANAGE_INVENTORY: 'can_manage_inventory',
        CAN_MANAGE_ORDERS: 'can_manage_orders',
        CAN_EXECUTE_PAYOUTS: 'can_execute_payouts',
        CAN_VIEW_AUDIT_LOGS: 'can_view_audit_logs',
        CAN_MANAGE_SETTINGS: 'can_manage_settings',
        CAN_MANAGE_STAFF: 'can_manage_staff',
        CAN_VIEW_SENSITIVE_DATA: 'can_view_sensitive_data',
        CAN_MANAGE_COMMUNICATIONS: 'can_manage_communications',
        CAN_MANAGE_MARKETING: 'can_manage_marketing'
    };
    const isAllowed = (permission: Permission) =>
        permissions[permissionKeys[permission]] === true || hasPermission(r, permission);

    if (pathname === '/admin') return isAllowed('CAN_VIEW_REVENUE');

    const routePermissions: [string[], Permission][] = [
        [['/admin/finance', '/admin/reports', '/admin/analytics', '/admin/behavior', '/admin/pulse'], 'CAN_VIEW_REVENUE'],
        [['/admin/payouts'], 'CAN_EXECUTE_PAYOUTS'],
        [['/admin/staff'], 'CAN_MANAGE_STAFF'],
        [['/admin/audit', '/admin/security'], 'CAN_VIEW_AUDIT_LOGS'],
        [['/admin/settings', '/admin/ticketing'], 'CAN_MANAGE_SETTINGS'],
        [['/admin/marketing', '/admin/growth', '/admin/broadcast', '/admin/blog', '/admin/content', '/admin/subscribers', '/admin/coupons', '/admin/media', '/admin/experience'], 'CAN_MANAGE_MARKETING'],
        [['/admin/communications', '/admin/messages', '/admin/abandoned', '/admin/support', '/admin/customers'], 'CAN_MANAGE_COMMUNICATIONS'],
        [['/admin/orders', '/admin/dispatch', '/admin/delivery', '/admin/riders', '/admin/operations', '/admin/merchants', '/admin/traceability'], 'CAN_MANAGE_ORDERS'],
        [['/admin/inventory', '/admin/forge', '/admin/souvenirs', '/admin/bites', '/admin/munchies', '/admin/kitchen', '/admin/warranty', '/admin/ratings', '/admin/reviews', '/admin/upload', '/admin/vault'], 'CAN_MANAGE_INVENTORY']
    ];

    const match = routePermissions.find(([prefixes]) =>
        prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    );
    return match ? isAllowed(match[1]) : false;
}
