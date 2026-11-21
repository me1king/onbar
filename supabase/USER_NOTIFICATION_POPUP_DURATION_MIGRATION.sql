-- Persist each popup's configured lifetime in the user's notification inbox.

BEGIN;

ALTER TABLE public.user_notifications
    ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 7;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_notifications_duration_check'
          AND conrelid = 'public.user_notifications'::regclass
    ) THEN
        ALTER TABLE public.user_notifications
            ADD CONSTRAINT user_notifications_duration_check CHECK (duration BETWEEN 1 AND 60);
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
