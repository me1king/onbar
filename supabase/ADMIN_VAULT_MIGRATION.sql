-- Private admin document vault. All table access is routed through authorized
-- server endpoints; browser uploads and downloads use short-lived signed URLs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'Contract',
  size TEXT NOT NULL DEFAULT '0 MB',
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  content_type TEXT,
  authorized_by TEXT NOT NULL DEFAULT 'Admin',
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_vault
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Contract',
  ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT '0 MB',
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS authorized_by TEXT NOT NULL DEFAULT 'Admin',
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.admin_vault
SET size_bytes = CASE
  WHEN trim(size::TEXT) ~* '^[0-9]+(\.[0-9]+)?[[:space:]]*GB$'
    THEN round(regexp_replace(size::TEXT, '[^0-9.]', '', 'g')::NUMERIC * 1024 * 1024 * 1024)::BIGINT
  WHEN trim(size::TEXT) ~* '^[0-9]+(\.[0-9]+)?[[:space:]]*MB$'
    THEN round(regexp_replace(size::TEXT, '[^0-9.]', '', 'g')::NUMERIC * 1024 * 1024)::BIGINT
  WHEN trim(size::TEXT) ~* '^[0-9]+(\.[0-9]+)?[[:space:]]*KB$'
    THEN round(regexp_replace(size::TEXT, '[^0-9.]', '', 'g')::NUMERIC * 1024)::BIGINT
  WHEN trim(size::TEXT) ~ '^[0-9]+$'
    THEN trim(size::TEXT)::BIGINT
  ELSE 0
END
WHERE size_bytes = 0 AND size IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_vault_storage_path_uidx
  ON public.admin_vault (storage_path)
  WHERE storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_vault_created_at_idx
  ON public.admin_vault (created_at DESC);

ALTER TABLE public.admin_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_vault FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_vault FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_vault TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-vault',
  'admin-vault',
  FALSE,
  26214400,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS admin_vault_are_private ON storage.objects;
CREATE POLICY admin_vault_are_private
  ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'admin-vault')
  WITH CHECK (bucket_id <> 'admin-vault');

COMMIT;
