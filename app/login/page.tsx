"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signInWithPassword, resendVerificationEmail } from '@/lib/auth'
import { loginSchema, type LoginFormData, type LoginFieldErrors } from '@/lib/schemas'
import ApexLogo from '@/components/brand/ApexLogo'
import NavyBranding from '@/components/brand/NavyBranding'

type FieldErrors = LoginFieldErrors

const getLoginFieldErrors = (result: any) => {
  if (result.success) return {}
  const flat = result.error.flatten().fieldErrors
  return {
    email: flat.email?.[0],
    password: flat.password?.[0],
  }
}

const getAuthErrorMessage = (error: any) => error?.message || 'Authentication failed.'

interface AuthNotificationsProps {
  serverError: string | null
  resendSuccess: boolean
  needsVerification: boolean
  loading: boolean
  onResend: () => void
}

function AuthNotifications({
  serverError,
  resendSuccess,
  needsVerification,
  loading,
  onResend,
}: AuthNotificationsProps) {
  if (serverError) {
    return (
      <div className="p-3.5 rounded bg-red-950/40 border border-red-800/40 text-xs text-red-300">
        {serverError}
      </div>
    )
  }
  if (resendSuccess) {
    return (
      <div className="p-3.5 rounded bg-green-900/40 border border-green-800/40 text-xs text-green-300">
        A new verification link has been sent to your email. Please check your inbox.
      </div>
    )
  }
  if (needsVerification) {
    return (
      <button
        onClick={onResend}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-[#1c2541] hover:bg-[#2c4f70] text-[#91aec9] hover:text-white font-semibold transition-all border border-[#3e6e99] disabled:opacity-50 text-xs tracking-wide"
      >
        {loading ? 'Sending...' : 'Verification link expired? Click here to resend.'}
      </button>
    )
  }
  return null
}

interface LoginFormProps {
  credentials: LoginFormData
  fieldErrors: FieldErrors
  loading: boolean
  onChange: (field: 'email' | 'password', value: string) => void
  onSubmit: (e: React.FormEvent) => void
  fieldClass: (field: keyof LoginFormData) => string
}

function LoginForm({
  credentials,
  fieldErrors,
  loading,
  onChange,
  onSubmit,
  fieldClass,
}: LoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label className="apex-label">
          Email Address
        </label>
        <input
          id="login-email"
          type="email"
          value={credentials.email}
          onChange={(e) => onChange('email', e.target.value)}
          className={fieldClass('email')}
          placeholder="sailor@navy.mil"
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-xs text-red-400 mt-1">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="apex-label">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          value={credentials.password}
          onChange={(e) => onChange('password', e.target.value)}
          className={fieldClass('password')}
          placeholder="••••••••"
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
        />
        {fieldErrors.password && (
          <p id="password-error" className="text-xs text-red-400 mt-1">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="apex-btn-primary w-full py-3 text-sm tracking-wide"
      >
        {loading ? 'Authenticating...' : 'Sign In'}
      </button>
    </form>
  )
}

function useLoginForm() {
  const router = useRouter()
  const [credentials, setCredentials] = useState({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  const handleChange = (field: 'email' | 'password', value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) setFieldErrors(prev => ({ ...prev, [field]: undefined }))
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = loginSchema.safeParse(credentials)
    if (!res.success) return setFieldErrors(getLoginFieldErrors(res))

    setFieldErrors({})
    setServerError(null)
    setNeedsVerification(false)
    setResendSuccess(false)
    setLoading(true)
    try {
      await signInWithPassword(res.data.email, res.data.password)
      router.push('/dashboard')
      router.refresh()
    } catch (error: any) {
      const msg = error?.message || 'Authentication failed.'
      setServerError(msg)
      if (msg.toLowerCase().includes('email not confirmed')) setNeedsVerification(true)
    }
    setLoading(false)
  }

  const handleResend = async () => {
    setServerError(null)
    setLoading(true)
    try {
      await resendVerificationEmail(credentials.email)
      setResendSuccess(true)
      setNeedsVerification(false)
    } catch (error: any) {
      setServerError(error?.message || 'Authentication failed.')
    }
    setLoading(false)
  }

  const fieldClass = (field: keyof LoginFormData) =>
    `apex-input ${fieldErrors[field] ? '!border-red-500/70 focus:!border-red-400' : ''}`

  return { credentials, fieldErrors, serverError, loading, needsVerification, resendSuccess, handleChange, handleLogin, fieldClass, handleResend }
}

export default function LoginPage() {
  const {
    credentials,
    fieldErrors,
    serverError,
    loading,
    needsVerification,
    resendSuccess,
    handleChange,
    handleLogin,
    fieldClass,
    handleResend,
  } = useLoginForm()

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-md p-8 rounded-2xl apex-card space-y-6">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <ApexLogo size="xl" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-white tracking-wide">APEX Portal</h2>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Enter credentials to access evaluation portal</p>
          </div>
          <NavyBranding sidebar className="mt-2" />
        </div>

        <AuthNotifications
          serverError={serverError}
          resendSuccess={resendSuccess}
          needsVerification={needsVerification}
          loading={loading}
          onResend={handleResend}
        />

        <LoginForm
          credentials={credentials}
          fieldErrors={fieldErrors}
          loading={loading}
          onChange={handleChange}
          onSubmit={handleLogin}
          fieldClass={fieldClass}
        />

        <div className="text-center text-xs pt-2" style={{ color: 'var(--subtle)' }}>
          New to APEX?{' '}
          <Link href="/register" className="text-blue-400 hover:underline font-medium">
            Register for a profile
          </Link>
        </div>
      </div>
    </div>
  )
}
