"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDashboard,
  IconFilePlus,
  IconFolder,
  IconShield,
  IconUser,
  IconGauge,
  IconClipboardList,
  NavIconComponent,
} from "@/components/layout/NavIcons";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  icon: NavIconComponent;
  match: (p: string) => boolean;
};

export default function MobileTabBar({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-around gap-1">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1 min-w-0">
              <Link
                href={tab.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-colors",
                  active
                    ? "text-primary bg-[var(--nav-active-glow)]"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="truncate w-full text-center">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function defaultMobileTabs(options: {
  canGroups?: boolean;
  canAdmin?: boolean;
}): Tab[] {
  const tabs: Tab[] = [
    {
      href: "/dashboard",
      label: "Home",
      icon: IconDashboard,
      match: (p) => p === "/dashboard",
    },
    {
      href: "/evaluations/new",
      label: "New",
      icon: IconFilePlus,
      match: (p) => p === "/evaluations/new",
    },
    {
      href: "/brag-sheet",
      label: "Brag",
      icon: IconClipboardList,
      match: (p) => p.startsWith("/brag-sheet"),
    },
    {
      href: "/board-confidence",
      label: "Board",
      icon: IconGauge,
      match: (p) => p.startsWith("/board-confidence"),
    },
  ];
  if (options.canGroups) {
    tabs.push({
      href: "/summary-groups",
      label: "Groups",
      icon: IconFolder,
      match: (p) => p.startsWith("/summary-groups"),
    });
  }
  if (options.canAdmin) {
    tabs.push({
      href: "/admin",
      label: "Admin",
      icon: IconShield,
      match: (p) => p.startsWith("/admin"),
    });
  }
  tabs.push({
    href: "/profile",
    label: "Profile",
    icon: IconUser,
    match: (p) => p === "/profile",
  });
  return tabs;
}