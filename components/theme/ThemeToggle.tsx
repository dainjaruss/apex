"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

export default function ThemeToggle({
  className,
  compact = false,
}: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-muted/50",
          compact ? "h-9 w-9" : "h-9 w-[7.5rem]",
          className,
        )}
        aria-hidden
      />
    );
  }

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const Icon =
    theme === "system"
      ? Monitor
      : resolvedTheme === "dark"
        ? Moon
        : Sun;

  const label =
    theme === "system"
      ? "System theme"
      : resolvedTheme === "dark"
        ? "Dark mode"
        : "Light mode";

  if (compact) {
    return (
      <button
        type="button"
        onClick={cycle}
        className={cn("apex-btn-ghost h-9 w-9 p-0 shrink-0", className)}
        aria-label={`Appearance: ${label}. Click to change.`}
        title={label}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
        "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/80",
        className,
      )}
      aria-label={`Appearance: ${label}. Click to change.`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="capitalize">{theme === "system" ? "Auto" : theme}</span>
    </button>
  );
}