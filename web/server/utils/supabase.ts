import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function adminClient(): SupabaseClient {
  if (cached) return cached
  const config = useRuntimeConfig()
  const key = config.supabaseServiceKey as string
  if (!key) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase service key is not configured',
    })
  }
  cached = createClient(config.supabaseUrl as string, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

export function siteUrl(): string {
  return (useRuntimeConfig().public.siteUrl as string).replace(/\/$/, '')
}