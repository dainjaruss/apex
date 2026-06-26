import { createBrowserClient as createSupabaseBrowser, createServerClient as createSupabaseServer } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Trusted server-ONLY client using the service-role key. Bypasses RLS, so it must
// only ever be used inside an API route AFTER an application-level permission check
// (see app/api/sign/route.ts). NEVER import this from a client component.
export const createAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured — required for server-side signature enforcement. ' +
      'Add it to .env.local (Supabase dashboard → Settings → API → service_role).'
    )
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Returns the authenticated caller's user id inside a route handler (cookie session),
// or null. Used by the routing/correction endpoints to identify who is acting.
export const getRouteUserId = async (): Promise<string | null> => {
  const supabase = createServerClient()
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

// Ephemeral anon client used to VERIFY submitted credentials in a route without
// touching the caller's browser session cookies (no persistence / refresh).
export const createCredentialVerifierClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// Custom browser client for APEX dashboard and profile pages
export const createBrowserClient = () => {
  // Guard checking just in case environment variables are missing on client build
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('Supabase credentials missing in browser client init')
  }
     
  return createSupabaseBrowser(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Server-side client helper for next.js server actions and API route validation.
// cookies() is imported inside the function body so it is only evaluated in
// server context -- importing this file from a client component won't break the build.
export const createServerClient = () => {
  // Dynamic import keeps next/headers out of the client bundle entirely
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { cookies } = require('next/headers')
  const jar = cookies()
     
  return createSupabaseServer(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        get(key: string) {
          return jar.get(key)?.value
        },
        set(key: string, val: string, opts: Record<string, unknown>) {
          try {
            jar.set({ name: key, value: val, ...opts })
          } catch {
            // Safe to ignore in Server Components - handled by middleware.ts session refresh
          }
        },
        remove(key: string, opts: Record<string, unknown>) {
          try {
            jar.set({ name: key, value: '', ...opts })
          } catch {
             // Safe to ignore
          }
        }
      }
    }
  )
}
