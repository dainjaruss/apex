import { createBrowserClient } from './supabaseClient'

const supabase = createBrowserClient()

// user authentication with password
export const signInWithPassword = async (email: string, pass: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: pass
  })
  if (error) {
    console.error('Login failed for email:', email, error.message)
    throw error
  }
  return data
}

// register new user
export const signUpWithEmail = async (
  email: string,
  pass: string,
  profileMeta: {
    firstName: string
    lastName: string
    middleInitial?: string
    dodId?: string
    uic?: string         
    navyRank: string
    command: string
    preferredRole: 'Sailor' | 'Rater' | 'Senior Rater' | 'Reporting Senior' | 'Admin'
  }
) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: {
      data: {
        first_name: profileMeta.firstName,
        last_name: profileMeta.lastName,
        middle_initial: profileMeta.middleInitial || '',
        dod_id: profileMeta.dodId || '',
        uic: profileMeta.uic || '',
        navy_rank: profileMeta.navyRank,
        command: profileMeta.command,
        preferred_role: profileMeta.preferredRole
      }
    }
  })
  if (error) {
    console.error('Registration failed:', error.message)
    throw error
  }
  return data
}

// end user session
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Logout error:', error.message)
    throw error
  }
}

// resend verification email
export const resendVerificationEmail = async (email: string) => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  })
  if (error) {
    console.error('Failed to resend verification:', error.message)
    throw error
  }
}

// get active user session
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('Session retrieval error:', error.message)
    return null
  }
  return data.session
}

// get active user ID helper
export const getSessionUserId = async () => {
  const session = await getSession()
  return session?.user?.id || null
}

// gets users roles to restrict dashboard view access

export const getCurrentUserRoles = async () => {
  const userId = await getSessionUserId()
  if (!userId) return { preferred: null, assigned: [] }

  // Fetch the role from the public profiles table we created
  const { data, error } = await supabase
    .from('profiles')
    .select('preferred_role, assigned_roles')
    .eq('id', userId)
    .single()

  if (error) {
    console.warn('Profile read failed, using fallback or default. Error:', error.message)
    return { preferred: null, assigned: [] }
  }

  return {
    preferred: data?.preferred_role || null,
    assigned: data?.assigned_roles || (data?.preferred_role ? [data.preferred_role] : ['Sailor'])
  }
}
