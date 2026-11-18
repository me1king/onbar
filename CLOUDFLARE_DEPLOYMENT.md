# Cloudflare Workers deployment

This Next.js app is packaged for Cloudflare Workers with OpenNext. In the
Cloudflare Workers Builds settings, use:

- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Node.js: `24` (also declared by `.node-version` and `package.json`)

The build command raises Node's heap to 3 GB, limits Next.js build workers, and
enables Webpack's memory optimizations. It then generates `.open-next/worker.js`
and its static assets for the existing Wrangler deploy command. Do not disable
Next.js type checking to work around memory limits.

Next.js embeds `NEXT_PUBLIC_*` values during the build. Add the public values
used by the app from `.env.example` under **Workers Builds → Build variables and
secrets**, especially the Supabase URL and publishable/anon key, and the public
site URL. Keep service-role keys, payment secrets, session secrets, and other
private values under the deployed Worker’s **Settings → Variables & Secrets**;
never use a `NEXT_PUBLIC_` prefix for secrets.

The app's Cloudflare image output uses original image URLs and does not require
a paid Cloudflare Images binding.
