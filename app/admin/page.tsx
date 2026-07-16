// app/admin/page.tsx
//
// Admin dashboard for managing users and roles.
// Restricted to Admin role via RoleGuard.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabaseClient";
import { Profile } from "@/types";
import { hasPermission, getRoleDescription, Role } from "@/lib/permissions";
import { AccessDeniedPanel } from "@/components/RoleGuard";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import AppShell from "@/components/layout/AppShell";

const supabase = createBrowserClient();

const ALL_ROLES: Role[] = [
  "Sailor",
  "Rater",
  "Senior Rater",
  "Reporting Senior",
  "Admin",
];

function roleBadgeClass(role: string) {
  if (role === "Admin")
    return "bg-red-950/40 text-red-300 border-red-900/50";
  if (role === "Reporting Senior")
    return "bg-emerald-950/40 text-emerald-300 border-emerald-900/50";
  return "bg-blue-950/40 text-blue-300 border-blue-900/50";
}

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      const session = await getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profile) setCurrentUser(profile as Profile);

      const { data: allUsers } = await supabase
        .from("profiles")
        .select("*")
        .order("last_name", { ascending: true });

      if (allUsers) setUsers(allUsers as Profile[]);
      setLoading(false);
    };
    load();
  }, [router]);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setSaving(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_role: newRole, assigned_roles: [newRole] })
      .eq("id", userId);

    if (!error) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, preferred_role: newRole, assigned_roles: [newRole] }
            : u,
        ),
      );
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <p
          className="text-sm animate-pulse"
          style={{ color: "var(--muted-foreground)" }}
        >
          Loading admin panel…
        </p>
      </div>
    );
  }

  if (
    !currentUser ||
    !hasPermission(currentUser.preferred_role, "manage_users")
  ) {
    return (
      <AccessDeniedPanel message="Admin privileges are required to access the User Management panel." />
    );
  }

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.last_name.toLowerCase().includes(q) ||
      u.first_name.toLowerCase().includes(q) ||
      u.preferred_role.toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <AppShell
      profile={currentUser}
      maxWidth="6xl"
      badge="ADMIN"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Administration" },
      ]}
      topbarSearch={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search users by name, email, or role…",
      }}
    >
      <AnalyticsDashboard />

      <div className="admin-divider my-8" />

      <div className="mb-6">
        <h1 className="apex-page-title">User & role management</h1>
        <p className="apex-page-subtitle">
          Assign roles to control evaluation workflow permissions across the
          chain of command.
        </p>
      </div>

      <div className="apex-card p-4 mb-6 space-y-2">
        <h2 className="apex-section-title">Role permissions reference</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ALL_ROLES.map((role) => (
            <div
              key={role}
              className="rounded-lg p-3 border"
              style={{
                background: "var(--muted)",
                borderColor: "var(--border)",
              }}
            >
              <div
                className="text-xs font-bold"
                style={{ color: "var(--accent-cyan)" }}
              >
                {role}
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: "var(--subtle)" }}
              >
                {getRoleDescription(role)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="apex-card overflow-x-auto">
        <table className="apex-data-table min-w-[720px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rank</th>
              <th>Email</th>
              <th>Current role</th>
              <th>Assign role</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td className="font-semibold">
                  {user.last_name}, {user.first_name}{" "}
                  {user.middle_initial || ""}
                </td>
                <td style={{ color: "var(--muted-foreground)" }}>
                  {user.navy_rank || "—"}
                </td>
                <td style={{ color: "var(--muted-foreground)" }}>
                  {user.email || "—"}
                </td>
                <td>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${roleBadgeClass(user.preferred_role)}`}
                  >
                    {user.preferred_role}
                  </span>
                </td>
                <td>
                  <select
                    value={user.preferred_role}
                    onChange={(e) =>
                      handleRoleChange(user.id, e.target.value as Role)
                    }
                    disabled={
                      saving === user.id || user.id === currentUser?.id
                    }
                    className="apex-select max-w-[200px] py-1.5 text-xs"
                    aria-label={`Preferred role for ${user.email || `${user.first_name} ${user.last_name}`.trim() || "user"}`}
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {saving === user.id && (
                    <span
                      className="ml-2 text-[10px] animate-pulse"
                      style={{ color: "var(--accent-cyan)" }}
                    >
                      Saving…
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div
            className="p-8 text-center text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            No users match your search criteria.
          </div>
        )}
      </div>

      <p
        className="text-[10px] text-center mt-4"
        style={{ color: "var(--subtle)" }}
      >
        Total registered users: {users.length}
      </p>
    </AppShell>
  );
}