type UserAvatarProps = {
  firstName?: string | null
  lastName?: string | null
  /** Override computed initials (e.g. from member_name "DOE, JOHN A"). */
  initials?: string
  size?: 'sm' | 'md' | 'lg'
  tone?: 'blue' | 'amber' | 'cyan' | 'slate'
  /** No fill — ring + initials only (profile avatars). */
  plain?: boolean
  className?: string
}

const SIZE_CLASS = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
} as const

const TONE_CLASS = {
  blue: 'apex-user-avatar',
  amber: 'apex-user-avatar apex-user-avatar-amber',
  cyan: 'apex-user-avatar apex-user-avatar-cyan',
  slate: 'apex-user-avatar apex-user-avatar-slate',
} as const

export function getInitials(firstName?: string | null, lastName?: string | null) {
  const first = (firstName?.trim()?.[0] || '').toUpperCase()
  const last = (lastName?.trim()?.[0] || '').toUpperCase()
  const computed = `${first}${last}`
  return computed || '?'
}

/** Parse NAVPERS-style "LAST, FIRST M" into two-letter initials. */
export function getMemberInitials(memberName?: string | null) {
  if (!memberName?.trim()) return '?'
  const parts = memberName.split(',').map((s) => s.trim())
  if (parts.length >= 2) {
    const last = parts[0]?.[0] || ''
    const first = parts[1]?.split(/\s+/)[0]?.[0] || ''
    const initials = `${first}${last}`.toUpperCase()
    if (initials) return initials
  }
  return memberName.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?'
}

export default function UserAvatar({
  firstName,
  lastName,
  initials,
  size = 'md',
  tone = 'blue',
  plain = false,
  className = '',
}: UserAvatarProps) {
  const label = initials || getInitials(firstName, lastName)
  const styleClass = plain ? 'apex-user-avatar-plain' : TONE_CLASS[tone]
  return (
    <div
      className={`shrink-0 ${SIZE_CLASS[size]} ${styleClass} ${className}`}
      aria-hidden
    >
      {label}
    </div>
  )
}
