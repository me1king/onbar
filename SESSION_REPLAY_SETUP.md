# Shared session replay setup

Online Bar, Midnight Market, and the Waitlist use one PostHog project so recordings are available from **Online Bar Admin → Behavioral OS → Session Forensics → Visual replays**. Each event includes an `app_name` property to distinguish the three sites.

1. Create or select one PostHog Cloud project. Copy its project API key and numeric project ID.
2. In the production environment for all three deployments, set the same `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_POSTHOG_UI_HOST`, and `NEXT_PUBLIC_POSTHOG_PROJECT_ID` values. For a US project use `https://us.i.posthog.com` for ingest and `https://us.posthog.com` for the dashboard. Use the matching EU hosts for an EU project.
3. Redeploy all three apps. In each app, opt into Analytics in Privacy settings and then verify a recording appears in the shared PostHog project. In Online Bar Admin, open the session-forensics page and choose **Visual replays**.

Recordings are disabled until the visitor explicitly opts into session replay in Privacy settings. Form inputs are masked, automatic interaction capture is disabled, and admin, merchant, checkout, payment, profile, member, invite, widget, and Fit Studio areas are excluded from recording. Personal waitlist confirmation details are text-masked. Pages with sensitive query parameters are excluded too. The Online Bar admin action opens the authenticated PostHog replay workspace in a new tab; PostHog access still follows the user's PostHog account permissions.

Do not put a PostHog personal API key in any frontend environment variable. The public project API key is intended for browser ingestion; the project ID and dashboard host are used only to construct the admin link.
