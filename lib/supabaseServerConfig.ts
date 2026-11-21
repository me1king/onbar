export function getSupabaseServerKey(env: NodeJS.ProcessEnv = process.env): string {
  return env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || env.SUPABASE_SECRET_KEY?.trim()
    || '';
}
