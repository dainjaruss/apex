import Link from "next/link";
import ThemeToggle from "@/components/theme/ThemeToggle";

export default function WelcomePage() {
  return (
    <div className="apex-auth-shell relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <main
        id="main-content"
        className="w-full max-w-lg p-8 rounded-2xl apex-card space-y-6 text-center"
      >
        <h2 className="text-2xl font-bold apex-heading tracking-wide">
          Identity Confirmed
        </h2>
        <p className="text-sm apex-text-muted">
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
      </main>
    </div>
  );
}
