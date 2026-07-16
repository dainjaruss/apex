"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("APEX route error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold apex-heading mb-2">Something went wrong</h1>
      <p className="text-sm max-w-md mb-6" style={{ color: "var(--muted-foreground)" }}>
        An unexpected error occurred. You can try again or return to the dashboard.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button type="button" onClick={() => reset()} className="apex-btn-primary">
          Try again
        </button>
        <a href="/dashboard" className="apex-btn-secondary">
          Dashboard
        </a>
      </div>
    </div>
  );
}