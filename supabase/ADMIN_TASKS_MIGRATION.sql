-- Protected operations board with starter tasks that link to their working admin tools.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_key TEXT,
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
    status TEXT NOT NULL DEFAULT 'Todo'
        CHECK (status IN ('Todo', 'InProgress', 'Review', 'Done')),
    priority TEXT NOT NULL DEFAULT 'Medium'
        CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    assigned_to TEXT NOT NULL DEFAULT 'Staff' CHECK (length(assigned_to) <= 160),
    due_date DATE,
    created_by TEXT NOT NULL DEFAULT '',
    action_label TEXT,
    action_href TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (action_href IS NULL OR action_href LIKE '/lord/%')
);

ALTER TABLE public.admin_tasks
    ADD COLUMN IF NOT EXISTS task_key TEXT,
    ADD COLUMN IF NOT EXISTS action_label TEXT,
    ADD COLUMN IF NOT EXISTS action_href TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS admin_tasks_task_key_idx
    ON public.admin_tasks (task_key)
    WHERE task_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_tasks_board_idx
    ON public.admin_tasks (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_tasks_assignee_idx
    ON public.admin_tasks (assigned_to, status, due_date);

ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_tasks FROM anon, authenticated;
GRANT ALL ON public.admin_tasks TO service_role;

INSERT INTO public.admin_tasks (
    task_key, title, description, status, priority, assigned_to, action_label, action_href
) VALUES
(
    'starter-message-channel-check',
    'Configure and test customer message channels',
    'Open the automation workspace. Choose which email, WhatsApp, and SMS channels to enable, set valid provider credentials in the server environment, review the templates, and run a test before using live customer orders.',
    'Todo', 'High', 'Owner',
    'Open messaging automation', '/lord/communications/automation'
),
(
    'starter-affiliate-pilot',
    'Invite and onboard the first affiliate',
    'Open affiliate management, invite a real pilot partner, then verify the invitation is accepted by the matching verified email and that the partner sees the affiliate workspace only after activation.',
    'Todo', 'Medium', 'Owner',
    'Manage affiliate invitations', '/lord/affiliates'
),
(
    'starter-gate-staff-pilot',
    'Assign verified gate staff for a ticketing rehearsal',
    'Create or select a staging event, assign a verified staff account to its gate, and confirm that the scanner only lists that assigned event. Revoke the assignment afterwards if the pilot is not going live.',
    'Todo', 'High', 'Owner',
    'Manage gate staff', '/lord/ticketing/staff'
),
(
    'starter-ticket-admission-test',
    'Run a sandbox ticket purchase-to-scan rehearsal',
    'Using payment-provider sandbox credentials, buy a test ticket and scan it online. Confirm the first scan is accepted, a second device gets USED, and refunded, unpaid, wrong-event, and revoked tickets are denied before announcing ticket sales.',
    'Todo', 'Critical', 'Owner',
    'Open ticketing operations', '/lord/ticketing'
)
ON CONFLICT (task_key) WHERE task_key IS NOT NULL DO NOTHING;

COMMIT;
