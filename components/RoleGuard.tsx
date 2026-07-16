// components/RoleGuard.tsx
//
// Declarative wrapper component that conditionally renders children
// based on the current user's role permissions.
//

"use client";

import React from "react";
import { Profile } from "@/types";
import { Evaluation } from "@/types";
import {
  hasPermission,
  canPerformAction,
  Action,
  Role,
} from "@/lib/permissions";

interface RoleGuardProps {
  user: Profile;
  /** Static role-level permission check */
  requiredPermission?: Action;
  /** Contextual evaluation-level permission check (requires evaluation prop) */
  requiredAction?: Action;
  evaluation?: Evaluation;
  /** Alternative: allow specific roles directly */
  allowedRoles?: Role[];
  /** What to render when access is denied */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export default function RoleGuard({
  user,
  requiredPermission,
  requiredAction,
  evaluation,
  allowedRoles,
  fallback = null,
  children,
}: RoleGuardProps) {
  // Check by explicit role list
  if (allowedRoles) {
    const userRole = user.preferred_role as Role;
    if (!allowedRoles.includes(userRole) && userRole !== "Admin") {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // Check by static permission
  if (requiredPermission) {
    if (!hasPermission(user.preferred_role, requiredPermission)) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // Check by contextual action on evaluation
  if (requiredAction && evaluation) {
    if (!canPerformAction(user, requiredAction, evaluation)) {
      return <>{fallback}</>;
    }
    return <>{children}</>;
  }

  // No checks specified — render children
  return <>{children}</>;
}

/**
 * Access denied fallback panel for use in page-level guards.
 */
export function AccessDeniedPanel({ message }: { message?: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="bg-red-950/35 border border-red-900/40 rounded-xl p-8 max-w-md space-y-4">
        <div className="text-3xl">🔒</div>
        <h3 className="text-lg font-bold text-red-400">Access Restricted</h3>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {message ||
            "You do not have the required permissions to access this page."}
        </p>
        <a href="/dashboard" className="apex-btn-secondary inline-block">
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}
