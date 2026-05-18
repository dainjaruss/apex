import { createBrowserClient as createSupabaseBrowser, createServerClient as createSupabaseServer } from '@supabase/ssr'

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
