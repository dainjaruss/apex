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

// Exactly what public.profiles_directory exposes (migration 009).
type DirectoryUser = Pick<
  Profile,
  "id" | "first_name" | "last_name" | "preferred_role"
>;

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
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
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

      // profiles_directory, not profiles: migration 009 narrows base-table reads
      // to the caller's own row. Rank, email, UIC and command are no longer
      // readable across users — see the notice rendered below the roster.
      const { data: allUsers } = await supabase
        .from("profiles_directory")
        .select("id, first_name, last_name, preferred_role")
        .order("last_name", { ascending: true });

      if (allUsers) setUsers(allUsers as DirectoryUser[]);
      setLoading(false);
    };
    load();
  }, [router]);

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
      u.preferred_role.toLowerCase().includes(q)
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
        placeholder: "Search users by name or role…",
      }}
    >
      <AnalyticsDashboard />

      <div className="admin-divider my-8" />

      <div className="mb-6">
        <h1 className="apex-page-title">User roster</h1>
        <p className="apex-page-subtitle">
          Who holds which evaluation role across the chain of command.
        </p>
      </div>

      {/* Honest degradation. This page used to read every column of every
          profile and offer a role <select>, both behind a client-side-only role
          check on a self-asserted role. Migration 009 removes both capabilities
          at the database. Restoring them needs a real admin trust model (a
          server-side authority check on a role the user cannot grant
          themselves), which is deliberately out of scope here. */}
      <div
        className="apex-card p-4 mb-6 border"
        style={{
          borderColor: "var(--border)",
          background: "var(--muted)",
        }}
        role="note"
      >
        <h2 className="apex-section-title">Reduced capability</h2>
        <ul
          className="text-xs mt-1 space-y-1 list-disc pl-4"
          style={{ color: "var(--muted-foreground)" }}
        >
          <li>
            <strong>Rank, email, UIC and command are not shown.</strong> They
            are protected profile fields and are no longer readable across users
            from the browser.
          </li>
          <li>
            <strong>Role assignment is disabled here.</strong> Roles are changed
            server-side only. The previous in-page control depended on a role
            the holder could grant themselves, so it was not an authority check.
          </li>
        </ul>
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
        <table className="apex-data-table min-w-[360px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Current role</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td className="font-semibold">
                  {user.last_name}, {user.first_name}
                </td>
                <td>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${roleBadgeClass(user.preferred_role)}`}
                  >
                    {user.preferred_role}
                  </span>
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
