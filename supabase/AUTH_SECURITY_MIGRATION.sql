-- Authentication audit records and server-only access controls.

CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'STAFF',
    pin TEXT,
    status TEXT DEFAULT 'Offline',
    can_view_revenue BOOLEAN DEFAULT false,
    can_manage_inventory BOOLEAN DEFAULT true,
    can_manage_orders BOOLEAN DEFAULT true,
    can_execute_payouts BOOLEAN DEFAULT false,
    can_view_audit_logs BOOLEAN DEFAULT false,
    can_manage_settings BOOLEAN DEFAULT false,
    can_manage_staff BOOLEAN DEFAULT false,
    can_view_sensitive_data BOOLEAN DEFAULT false,
    can_manage_communications BOOLEAN DEFAULT false,
    can_manage_marketing BOOLEAN DEFAULT false,
    can_manage_kitchen BOOLEAN DEFAULT false,
    completed_tasks INTEGER DEFAULT 0,
    sla_rating NUMERIC DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS supplier_id UUID,
    ADD COLUMN IF NOT EXISTS can_execute_payouts BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_view_audit_logs BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_staff BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_view_sensitive_data BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_communications BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_marketing BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_kitchen BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_email TEXT,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    resource_type TEXT,
    resource_id TEXT,
    old_value JSONB,
    new_value JSONB,
    correlation_id TEXT,
    request_id TEXT,
    ip_address TEXT,
    device_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    success BOOLEAN NOT NULL DEFAULT false,
    mode TEXT NOT NULL,
    identity_hint TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    user_agent TEXT,
    attempt_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.login_attempts
    ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS identity_hint TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS login_attempts_ip_time_idx
    ON public.login_attempts (ip_address, attempt_time DESC);
CREATE INDEX IF NOT EXISTS login_attempts_failed_ip_time_idx
    ON public.login_attempts (ip_address, attempt_time DESC)
    WHERE success = false;

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;
GRANT ALL ON public.login_attempts TO service_role;

CREATE TABLE IF NOT EXISTS public.security_threats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    ip_address TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    fingerprint TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

ALTER TABLE public.security_threats
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'SECURITY_EVENT',
    ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'INFO',
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS ip_address TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolved_by TEXT;

CREATE INDEX IF NOT EXISTS security_threats_status_created_at_idx
    ON public.security_threats (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS security_threats_fingerprint_uidx
    ON public.security_threats (fingerprint);

ALTER TABLE public.security_threats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_threats FROM anon, authenticated;
GRANT ALL ON public.security_threats TO service_role;

CREATE TABLE IF NOT EXISTS public.ip_blacklist (
    ip_address TEXT PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_blacklist
    ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_by TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.ip_blacklist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ip_blacklist FROM anon, authenticated;
GRANT ALL ON public.ip_blacklist TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM anon, authenticated;
GRANT ALL ON public.audit_logs TO service_role;

NOTIFY pgrst, 'reload schema';
