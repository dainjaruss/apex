import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function createMiddlewareClient(req: NextRequest, responseRef: { value: NextResponse }) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        get(key: string) {
          return req.cookies.get(key)?.value
        },
        set(key: string, val: string, opts: CookieOptions) {
          req.cookies.set({
            name: key,
            value: val,
            ...opts
          })
          responseRef.value = NextResponse.next({
            request: {
              headers: req.headers
            }
          })
          responseRef.value.cookies.set({
            name: key,
            value: val,
            ...opts
          })
        },
        remove(key: string, opts: CookieOptions) {
          req.cookies.set({
            name: key,
            value: '',
            ...opts
          })
          responseRef.value = NextResponse.next({
            request: {
              headers: req.headers
            }
          })
          responseRef.value.cookies.set({
            name: key,
            value: '',
            ...opts
          })
        }
      }
    }
  )
}

function getRedirectTarget(user: any, path: string): string | null {
  const protectedPrefixes = ['/dashboard', '/profile', '/evaluations']
  const authRoutes = ['/login', '/register', '/']

  const isProtected = protectedPrefixes.some(prefix => path.startsWith(prefix))
  if (!user && isProtected) {
    return '/login'
  }

  const isAuthRoute = authRoutes.includes(path)
  if (user && isAuthRoute) {
    return '/dashboard'
  }

  return null
}

export async function middleware(req: NextRequest) {
  const responseRef = {
    value: NextResponse.next({
      request: {
        headers: req.headers
      }
    })
  }

  const supabase = createMiddlewareClient(req, responseRef)
  const { data: { user } } = await supabase.auth.getUser()
  const path = req.nextUrl.pathname

  const redirectPath = getRedirectTarget(user, path)
  if (redirectPath) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = redirectPath
    return NextResponse.redirect(redirectUrl)
  }

  return responseRef.value
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
}

