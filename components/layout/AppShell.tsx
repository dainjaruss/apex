'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  IconDashboard,
  IconFilePlus,
  IconFolder,
  IconShield,
  IconUser,
  IconLogOut,
  IconChevronRight,
  NavIconComponent,
} from '@/components/layout/NavIcons'
import ApexLogo from '@/components/brand/ApexLogo'
import NavyBranding from '@/components/brand/NavyBranding'
import UserAvatar from '@/components/brand/UserAvatar'
import { signOut } from '@/lib/auth'
import { hasPermission, canManageSummaryGroups } from '@/lib/permissions'

export type ShellProfile = {
  id?: string
  navy_rank?: string
  last_name?: string
  first_name?: string
  preferred_role?: string
}

interface AppShellProps {
  children: React.ReactNode
  profile?: ShellProfile | null
  title?: string
  subtitle?: string
  badge?: string
  headerActions?: React.ReactNode
  maxWidth?: '5xl' | '6xl' | '7xl'
}

const WIDTH: Record<NonNullable<AppShellProps['maxWidth']>, string> = {
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
}

export default function AppShell({
  children,
  profile,
  title,
  subtitle,
  badge,
  headerActions,
  maxWidth = '6xl',
}: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = profile && hasPermission(profile.preferred_role as any, 'manage_users')
  const canGroups = profile && canManageSummaryGroups(profile as any)

  const nav: { href: string; label: string; icon: NavIconComponent; match: (p: string) => boolean }[] = [
    { href: '/dashboard', label: 'Dashboard', icon: IconDashboard, match: (p) => p === '/dashboard' },
    { href: '/evaluations/new', label: 'New Evaluation', icon: IconFilePlus, match: (p) => p === '/evaluations/new' },
  ]
  if (canGroups) {
    nav.push({ href: '/summary-groups', label: 'Summary Groups', icon: IconFolder, match: (p) => p.startsWith('/summary-groups') })
  }
  if (isAdmin) {
    nav.push({ href: '/admin', label: 'Admin', icon: IconShield, match: (p) => p.startsWith('/admin') })
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <aside
        className="hidden lg:flex w-60 shrink-0 flex-col border-r"
        style={{ background: 'var(--sidebar)', borderColor: 'var(--sidebar-border)' }}
      >
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
          <div className="flex items-center gap-3">
            <ApexLogo size="md" className="shrink-0" />
            <div className="min-w-0">
              <div className="font-extrabold text-base tracking-[0.12em] text-white">APEX</div>
              <div className="text-[10px] uppercase tracking-[0.22em] gold-accent font-semibold">Naval EVAL</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {nav.map((item) => {
            const active = item.match(pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`apex-nav-item ${active ? 'apex-nav-item-active' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
                {active && <IconChevronRight className="ml-auto opacity-60" />}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 pb-2">
          <NavyBranding sidebar />
        </div>

        <div className="p-3 border-t space-y-1" style={{ borderColor: 'var(--sidebar-border)' }}>
          {profile && (
            <Link
              href="/profile"
              className={`flex items-center gap-3 px-2 py-2 mb-1 rounded-lg transition-colors hover:bg-white/[0.04] ${pathname === '/profile' ? 'ring-1 ring-cyan-500/30' : ''}`}
            >
              <UserAvatar
                firstName={profile.first_name}
                lastName={profile.last_name}
                size="md"
                plain
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">
                  {profile.navy_rank} {profile.last_name}
                </div>
                <div className="text-[11px] truncate capitalize" style={{ color: 'var(--subtle)' }}>
                  {profile.preferred_role?.replace(/_/g, ' ')}
                </div>
              </div>
            </Link>
          )}
          <Link href="/profile" className={`apex-nav-item ${pathname === '/profile' ? 'apex-nav-item-active' : ''}`}>
            <IconUser className="h-4 w-4" />
            Profile
          </Link>
          <button type="button" onClick={handleSignOut} className="apex-nav-item w-full text-left">
            <IconLogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header
          className="lg:hidden flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <div className="flex items-center gap-2">
            <ApexLogo size="sm" />
            <span className="font-extrabold text-white">APEX</span>
          </div>
          <div className="flex items-center gap-2">
            {profile && (
              <UserAvatar firstName={profile.first_name} lastName={profile.last_name} size="sm" plain />
            )}
            <Link href="/dashboard" className="apex-btn-ghost px-2 py-1.5">Home</Link>
            <button type="button" onClick={handleSignOut} className="apex-btn-ghost px-2 py-1.5">Out</button>
          </div>
        </header>

        {(title || headerActions) && (
          <div
            className="px-6 py-5 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            <div>
              {badge && <span className="apex-badge mb-2">{badge}</span>}
              {title && <h1 className="apex-page-title">{title}</h1>}
              {subtitle && <p className="apex-page-subtitle">{subtitle}</p>}
            </div>
            {headerActions && <div className="flex flex-wrap items-center gap-2">{headerActions}</div>}
          </div>
        )}

        <main className={`flex-1 w-full mx-auto px-4 sm:px-6 py-6 ${WIDTH[maxWidth]}`}>
          {children}
        </main>
      </div>
    </div>
  )
}
