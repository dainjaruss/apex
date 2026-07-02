import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '@/app/login/page'
import React from 'react'

// Mock next/navigation router
const mockPush = vi.fn()
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh
  }),
  usePathname: () => '/login',
}))

// Mock auth module
const mockSignIn = vi.fn()
vi.mock('@/lib/auth', () => ({
  signInWithPassword: (...args: any[]) => mockSignIn(...args)
}))

describe('LoginPage Integration Tests', () => {
  it('should render the login form inputs and submit button', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText('sailor@navy.mil')).toBeDefined()
    expect(screen.getByPlaceholderText('••••••••')).toBeDefined()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined()
  })

  it('should call signInWithPassword and redirect to dashboard on successful login', async () => {
    mockSignIn.mockResolvedValueOnce({ user: { id: 'test-user-id' } })
    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText('sailor@navy.mil')
    const passInput = screen.getByPlaceholderText('••••••••')
    const submitBtn = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'sailor@navy.mil' } })
    fireEvent.change(passInput, { target: { value: 'password123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('sailor@navy.mil', 'password123')
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('should display error message on authentication failure', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Invalid password'))
    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText('sailor@navy.mil')
    const passInput = screen.getByPlaceholderText('••••••••')
    const submitBtn = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'sailor@navy.mil' } })
    fireEvent.change(passInput, { target: { value: 'wrongpass' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Invalid password')).toBeDefined()
    })
  })
})
