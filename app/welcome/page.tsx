import Link from "next/link";
import ThemeToggle from "@/components/theme/ThemeToggle";

export default function WelcomePage() {
  return (
    <div className="apex-auth-shell relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <div className="apex-auth-card text-center">
        <h2 className="text-2xl font-bold apex-heading tracking-wide">
          Identity Confirmed
        </h2>
        <p className="text-muted-foreground text-sm">
          Your email has been successfully verified. Your APEX account is now
          active and ready to use.
        </p>
        <div className="pt-6">
          <Link href="/dashboard" className="apex-btn-primary w-full py-3 text-sm">
            Proceed to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}