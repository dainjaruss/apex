// app/admin/page.tsx
//
// Admin dashboard for managing users and roles.
// Restricted to Admin role via RoleGuard.
//

"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createBrowserClient } from '@/lib/supabaseClient'
import { Profile } from '@/types'
import { hasPermission, getRoleDescription, Role } from '@/lib/permissions'
import { AccessDeniedPanel } from '@/components/RoleGuard'

const supabase = createBrowserClient()

const ALL_ROLES: Role[] = ['Sailor', 'Rater', 'Senior Rater', 'Reporting Senior', 'Admin']

export default function AdminPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const load = async () => {
      const session = await getSession()
      if (!session?.user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profile) setCurrentUser(profile as Profile)

      const { data: allUsers } = await supabase
        .from('profiles')
        .select('*')
        .order('last_name', { ascending: true })

      if (allUsers) setUsers(allUsers as Profile[])
      setLoading(false)
    }
    load()
  }, [router])

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setSaving(userId)
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_role: newRole, assigned_roles: [newRole] })
      .eq('id', userId)

    if (!error) {
      setUsers(prev =>
        prev.map(u =>
          u.id === userId ? { ...u, preferred_role: newRole, assigned_roles: [newRole] } : u
        )
      )
    }
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b132b] flex items-center justify-center">
        <p className="text-sm text-slate-500 animate-pulse">Loading admin panel...</p>
      </div>
    )
  }

  if (!currentUser || !hasPermission(currentUser.preferred_role, 'manage_users')) {
    return <AccessDeniedPanel message="Admin privileges are required to access the User Management panel." />
  }

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase()
    return (
      u.last_name.toLowerCase().includes(q) ||
      u.first_name.toLowerCase().includes(q) ||
      u.preferred_role.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="min-h-screen bg-[#0b132b] text-[#f0f4f8]">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-xl tracking-wider text-white">APEX</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-950/40 text-red-300 border border-red-900/30">
            ADMIN
          </span>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
        >
          ← Back to Dashboard
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">User & Role Management</h2>
          <p className="text-sm text-slate-400 mt-1">
            Assign roles to control evaluation workflow permissions across the chain of command.
          </p>
        </div>

        {/* Role Legend */}
        <div className="glass-panel border border-slate-800 rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Role Permissions Reference</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ALL_ROLES.map(role => (
              <div key={role} className="bg-[#0d1b2a]/60 rounded-lg p-3 border border-slate-800/60">
                <div className="text-xs font-bold text-blue-300">{role}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{getRoleDescription(role)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search users by name, email, or role..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-[#1c2541]/40 border border-slate-700/60 rounded-lg px-4 py-2.5
                     text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
        />

        {/* Users Table */}
        <div className="glass-panel border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d1b2a]/80 text-slate-400 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">Rank</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Current Role</th>
                <th className="text-left px-4 py-3 font-semibold">Assign Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-900/30 transition">
                  <td className="px-4 py-3 font-semibold text-white">
                    {user.last_name}, {user.first_name} {user.middle_initial || ''}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{user.navy_rank || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{user.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                      user.preferred_role === 'Admin'
                        ? 'bg-red-950/40 text-red-300 border-red-900/50'
                        : user.preferred_role === 'Reporting Senior'
                        ? 'bg-emerald-950/40 text-emerald-300 border-emerald-900/50'
                        : 'bg-blue-950/40 text-blue-300 border-blue-900/50'
                    }`}>
                      {user.preferred_role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.preferred_role}
                      onChange={e => handleRoleChange(user.id, e.target.value as Role)}
                      disabled={saving === user.id || user.id === currentUser?.id}
                      className="bg-[#1c2541] border border-slate-700 rounded px-2 py-1 text-xs text-white
                                 focus:outline-none focus:border-blue-500 disabled:opacity-40"
                    >
                      {ALL_ROLES.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    {saving === user.id && (
                      <span className="ml-2 text-[10px] text-blue-400 animate-pulse">Saving...</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No users match your search criteria.
            </div>
          )}
        </div>

        <div className="text-[10px] text-slate-600 text-center">
          Total registered users: {users.length}
        </div>
      </main>
    </div>
  )
}
