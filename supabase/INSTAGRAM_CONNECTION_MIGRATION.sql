-- Private server-managed Instagram Business Login credentials.
-- Access tokens are encrypted by the app before being stored here.

CREATE TABLE IF NOT EXISTS public.instagram_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instagram_user_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    granted_scopes TEXT[] NOT NULL DEFAULT '{}',
    connected_by TEXT,
    status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'DISCONNECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instagram_connections_status_created_idx
    ON public.instagram_connections (status, created_at DESC);

ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.instagram_connections TO service_role;
