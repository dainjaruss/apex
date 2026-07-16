import Link from "next/link";
import ThemeToggle from "@/components/theme/ThemeToggle";

export default function WelcomePage() {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--background)" }}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-lg p-8 rounded-2xl apex-card space-y-6 text-center">
        <h2 className="text-2xl font-bold apex-heading tracking-wide">
          Identity Confirmed
        </h2>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Your email has been successfully verified. Your APEX account is now
          active and ready to use.
        </p>
        <div className="pt-6">
          <Link
            href="/dashboard"
            className="inline-block w-full py-3 apex-btn-primary font-bold tracking-wider"
          >
            Proceed to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
