import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseClient'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      return NextResponse.redirect(`${origin}/welcome`)
    }
  }

  // If there's an error or no code, redirect to login with an error message
  return NextResponse.redirect(`${origin}/login?error=Verification_Failed`)
}
