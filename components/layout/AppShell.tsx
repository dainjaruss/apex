"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconDashboard,
  IconFilePlus,
  IconFolder,
  IconShield,
  IconUser,
  IconLogOut,
  NavIconComponent,
} from "@/components/layout/NavIcons";
import ApexLogo from "@/components/brand/ApexLogo";
import NavyBranding from "@/components/brand/NavyBranding";
import UserAvatar from "@/components/brand/UserAvatar";
import { signOut } from "@/lib/auth";
import { hasPermission, canManageSummaryGroups } from "@/lib/permissions";
import ThemeToggle from "@/components/theme/ThemeToggle";
import MobileTabBar, {
  defaultMobileTabs,
} from "@/components/layout/MobileTabBar";

export type ShellProfile = {
  id?: string;
  navy_rank?: string;
  last_name?: string;
  first_name?: string;
  preferred_role?: string;
};

export type BreadcrumbItem = { label: string; href?: string };

export type TopbarSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

interface AppShellProps {
  children: React.ReactNode;
  profile?: ShellProfile | null;
  title?: string;
  subtitle?: string;
  badge?: string;
  headerActions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  topbarSearch?: TopbarSearchProps;
  maxWidth?: "5xl" | "6xl" | "7xl" | "full";
  /** When true, page title renders inside main content band (enterprise default) */
  contentHeader?: boolean;
}

const WIDTH: Record<NonNullable<AppShellProps["maxWidth"]>, string> = {
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  full: "max-w-none",
};

export default function AppShell({
  children,
  profile,
  title,
  subtitle,
  badge,
  headerActions,
  breadcrumbs,
  topbarSearch,
  maxWidth = "7xl",
  contentHeader = true,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin =
    profile && hasPermission(profile.preferred_role as any, "manage_users");
  const canGroups = profile && canManageSummaryGroups(profile as any);

  const nav: {
    href: string;
    label: string;
    icon: NavIconComponent;
    match: (p: string) => boolean;
    group: "ops" | "account";
  }[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: IconDashboard,
      match: (p) => p === "/dashboard",
      group: "ops",
    },
    {
      href: "/evaluations/new",
      label: "New evaluation",
      icon: IconFilePlus,
      match: (p) => p === "/evaluations/new",
      group: "ops",
    },
  ];
  if (canGroups) {
    nav.push({
      href: "/summary-groups",
      label: "Summary groups",
      icon: IconFolder,
      match: (p) => p.startsWith("/summary-groups"),
      group: "ops",
    });
  }
  if (isAdmin) {
    nav.push({
      href: "/admin",
      label: "Admin",
      icon: IconShield,
      match: (p) => p.startsWith("/admin"),
      group: "ops",
    });
  }

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const opsNav = nav.filter((n) => n.group === "ops");

  return (
    <div
      className="flex min-h-screen pb-16 lg:pb-0"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <aside
        className="apex-sidebar hidden lg:flex w-60 shrink-0 flex-col border-r"
        style={{
          background: "var(--sidebar)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div
          className="px-5 py-5 border-b"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <div className="flex items-center gap-3">
            <ApexLogo size="md" className="shrink-0" />
            <div className="min-w-0">
              <div className="font-extrabold text-base tracking-[0.12em] text-white">
                APEX
              </div>
              <div className="text-[10px] uppercase tracking-[0.22em] gold-accent font-semibold">
                Eval workflow
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 p-3 space-y-4">
          <div>
            <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Operations
            </div>
            <nav className="space-y-0.5">
              {opsNav.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`apex-nav-item ${active ? "apex-nav-item-active" : ""}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="px-3 pb-2">
          <NavyBranding sidebar />
        </div>

        <div
          className="p-3 border-t space-y-1"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          {profile && (
            <div className="px-2 py-2 mb-1 text-[11px] text-white/50 truncate">
              {profile.navy_rank} {profile.last_name}
              {profile.preferred_role && (
                <span className="block capitalize text-white/35">
                  {profile.preferred_role.replace(/_/g, " ")}
                </span>
              )}
            </div>
          )}
          <Link
            href="/profile"
            className={`apex-nav-item ${pathname === "/profile" ? "apex-nav-item-active" : ""}`}
          >
            <IconUser className="h-4 w-4" />
            Profile
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="apex-nav-item w-full text-left"
          >
            <IconLogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header
          className="sticky top-0 z-30 flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 border-b"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <div className="flex items-center gap-2 lg:hidden">
            <ApexLogo size="sm" />
            <span className="font-extrabold apex-heading text-sm">APEX</span>
          </div>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              className="hidden sm:flex flex-1 min-w-0 text-sm gap-1 items-center"
              aria-label="Breadcrumb"
              style={{ color: "var(--muted-foreground)" }}
            >
              {breadcrumbs.map((crumb, i) => (
                <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <span className="opacity-50">/</span>}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="hover:underline"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <strong style={{ color: "var(--heading)" }}>{crumb.label}</strong>
                  )}
                </span>
              ))}
            </nav>
          )}

          {topbarSearch && (
            <input
              type="search"
              className="apex-topbar-search flex-1 sm:flex-none sm:min-w-[220px]"
              placeholder={topbarSearch.placeholder ?? "Search…"}
              value={topbarSearch.value}
              onChange={(e) => topbarSearch.onChange(e.target.value)}
              aria-label="Search"
            />
          )}

          <div className="flex items-center gap-2 ml-auto">
            <ThemeToggle compact />
            {headerActions}
          </div>
        </header>

        <main
          className={`flex-1 w-full mx-auto px-4 sm:px-6 py-6 ${WIDTH[maxWidth]}`}
        >
          {contentHeader && (title || subtitle || badge) && (
            <div className="mb-6">
              {badge && <span className="apex-badge mb-2">{badge}</span>}
              {title && <h1 className="apex-page-title">{title}</h1>}
              {subtitle && <p className="apex-page-subtitle">{subtitle}</p>}
            </div>
          )}
          {children}
        </main>
      </div>

      <MobileTabBar
        tabs={defaultMobileTabs({
          canGroups: !!canGroups,
          canAdmin: !!isAdmin,
        })}
      />
    </div>
  );
}