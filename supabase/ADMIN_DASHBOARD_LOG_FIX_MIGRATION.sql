-- Restore the campaign name column expected by the admin marketing screens.
ALTER TABLE public.marketing_campaigns
    ADD COLUMN IF NOT EXISTS name TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'marketing_campaigns'
          AND column_name = 'title'
    ) THEN
        EXECUTE $update$
            UPDATE public.marketing_campaigns
            SET name = COALESCE(NULLIF(btrim(name), ''), NULLIF(btrim(title::TEXT), ''), 'Untitled campaign')
            WHERE name IS NULL OR btrim(name) = ''
        $update$;
    ELSE
        UPDATE public.marketing_campaigns
        SET name = 'Untitled campaign'
        WHERE name IS NULL OR btrim(name) = '';
    END IF;
END;
$$;

ALTER TABLE public.marketing_campaigns
    ALTER COLUMN name SET NOT NULL;
