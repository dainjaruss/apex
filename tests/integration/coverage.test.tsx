import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react'

// Set mock environment variables for Supabase
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-supabase.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-supabase-anon-key'

// Mocks for Next.js navigation and headers
const mockPush = vi.fn()
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => ({ value: 'test-token' }),
    set: vi.fn(),
  }),
}))

vi.mock('next/server', () => {
  class MockNextRequest {
    url: string
    nextUrl: any
    headers: any
    cookies: any

    constructor(url: string, init?: any) {
      this.url = url
      const u = new URL(url) as any
      u.clone = () => new URL(url)
      this.nextUrl = u
      this.headers = init?.headers || {}
      this.cookies = {
        get: () => ({ value: 'mock-cookie' }),
        set: vi.fn(),
      }
    }
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      next: vi.fn().mockReturnValue({ cookies: { set: vi.fn() } }),
      redirect: vi.fn().mockReturnValue({ status: 307 }),
    },
  }
})

import { NextRequest } from 'next/server'

// Use vi.hoisted to declare mock functions and state before any imports
const { mockQueryStore, MockSupabaseQuery, mockExchangeCode, mockGetUser } = vi.hoisted(() => {
  const mockQueryStore = {
    data: null as any,
    error: null as any,
  }

  class MockSupabaseQuery {
    from() { return this }
    select() { return this }
    insert() { return this }
    update() { return this }
    eq() { return this }
    or() { return this }
    order() { return this }
    single() { return this }

    then(resolve: any) {
      resolve({ data: mockQueryStore.data, error: mockQueryStore.error })
      return Promise.resolve({ data: mockQueryStore.data, error: mockQueryStore.error })
    }
  }

  return {
    mockQueryStore,
    MockSupabaseQuery,
    mockExchangeCode: vi.fn(),
    mockGetUser: vi.fn(),
  }
})

vi.mock('@/lib/supabaseClient', () => {
  const queryInstance = new MockSupabaseQuery()
  return {
    createBrowserClient: () => ({
      auth: {
        getUser: mockGetUser,
        exchangeCodeForSession: mockExchangeCode,
      },
      from: () => queryInstance,
    }),
    createServerClient: () => ({
      auth: {
        getUser: mockGetUser,
        exchangeCodeForSession: mockExchangeCode,
      },
      from: () => queryInstance,
    }),
  }
})

// Mock auth module
vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
  getSessionUserId: vi.fn().mockResolvedValue('test-user-id'),
  signOut: vi.fn().mockResolvedValue({ error: null }),
  resendVerificationEmail: vi.fn().mockResolvedValue({ error: null }),
  signInWithPassword: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
  signUpWithEmail: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}))

// Imports to test
import WelcomePage from '@/app/welcome/page'
import RootLayout, { metadata } from '@/app/layout'
import LandingPage from '@/app/page'
import ProfilePage from '@/app/profile/page'
import RegisterPage from '@/app/register/page'
import DashboardPage from '@/app/dashboard/page'
import ConsentModal from '@/components/ConsentModal'
import { useEvaluations } from '@/hooks/useEvaluations'
import { getFormDefinition, listActiveForms, getEvalSeed } from '@/lib/formDefinitions'
import { getProfile, updateProfile } from '@/lib/profileService'
import { createServerClient } from '@/lib/supabaseClient'
import { middleware, config as middlewareConfig } from '@/middleware'
import { GET as authCallbackGet } from '@/app/auth/callback/route'

describe('APEX Comprehensive Test Coverage Suite', () => {
  beforeEach(() => {
    mockQueryStore.data = {}
    mockQueryStore.error = null
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null })
  })

  it('should render WelcomePage correctly', () => {
    render(<WelcomePage />)
    expect(screen.getByText(/Identity Confirmed/i)).toBeDefined()
  })

  it('should render RootLayout correctly with children', () => {
    expect(metadata).toBeDefined()
    expect(metadata.title).toBeDefined()
    render(
      <RootLayout>
        <div>Test Child Content</div>
      </RootLayout>
    )
    expect(screen.getByText('Test Child Content')).toBeDefined()
  })

  it('should render LandingPage correctly', () => {
    render(<LandingPage />)
    expect(screen.getByText(/Advanced Performance/i)).toBeDefined()
  })

  it('should render and accept terms in ConsentModal', () => {
    render(<ConsentModal />)
    const acceptButton = screen.getByRole('button', { name: /Accept and Enter/i })
    fireEvent.click(acceptButton)
    expect(localStorage.getItem('apex_consent_accepted')).toBe('true')
  })

  it('should test formDefinitions offline fallback and return values', async () => {
    // Set to error to test offline cache fallback code path
    mockQueryStore.data = null
    mockQueryStore.error = new Error('DB offline')

    const def = await getFormDefinition('EVAL')
    expect(def).not.toBeNull()
    expect(def.navpers_number).toBe('1616/26')

    const list = await listActiveForms()
    expect(list.length).toBeGreaterThan(0)

    const seed = getEvalSeed()
    expect(seed.status).toBe('draft')
  })

  it('should test profileService functions', async () => {
    mockQueryStore.data = { first_name: 'Frank' }
    mockQueryStore.error = null

    const profile = await getProfile('test-user-id')
    expect(profile?.first_name).toBe('Frank')

    mockQueryStore.data = { first_name: 'Frank' }
    await updateProfile('test-user-id', { firstName: 'Frank' })
  })

  it('should initialize useEvaluations hook successfully', async () => {
    mockQueryStore.data = []
    mockQueryStore.error = null

    const { result } = renderHook(() => useEvaluations())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('should render RegisterPage correctly', () => {
    render(<RegisterPage />)
    expect(screen.getByText(/APEX Registry/i)).toBeDefined()
  })

  it('should render ProfilePage correctly', () => {
    render(<ProfilePage />)
    expect(screen.getByText(/Military Identity/i)).toBeDefined()
  })

  it('should render DashboardPage correctly', () => {
    render(<DashboardPage />)
    expect(screen.getByText(/My Drafts/i)).toBeDefined()
  })

  it('should execute middleware successfully', async () => {
    const req = new NextRequest('https://apex.mil/dashboard', {
      headers: {
        host: 'apex.mil',
      },
    })
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'test-user' } }, error: null })
    const res = await middleware(req)
    expect(res).toBeDefined()
    expect(middlewareConfig).toBeDefined()
  })

  it('should call auth callback route GET and handle redirect', async () => {
    const request = new Request('https://apex.mil/auth/callback?code=mock-code')
    mockExchangeCode.mockResolvedValueOnce({ error: null })
    const response = await authCallbackGet(request)
    expect(response).toBeDefined()
  })

  it('should successfully createServerClient', () => {
    const client = createServerClient()
    expect(client).toBeDefined()
  })
})
