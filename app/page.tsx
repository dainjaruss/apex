import Link from "next/link";
import ApexLogo from "@/components/brand/ApexLogo";
import NavyBranding from "@/components/brand/NavyBranding";
import ThemeToggle from "@/components/theme/ThemeToggle";

function LandingHeader() {
  return (
    <header className="px-6 py-4 flex items-center justify-between border-b sticky top-0 z-50 apex-card rounded-none border-x-0 border-t-0">
      <div className="flex items-center gap-3">
        <ApexLogo size="md" className="shrink-0" />
        <div>
          <span className="font-extrabold text-xl tracking-[0.1em] apex-heading">
            APEX
          </span>
          <span className="apex-badge hidden sm:inline ml-2">
            Naval EVAL v1.0
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <ThemeToggle compact />
        <Link
          href="/login"
          className="text-sm font-medium transition-colors hover:opacity-90"
          style={{ color: "var(--muted-foreground)" }}
        >
          Sign In
        </Link>
        <Link href="/register" className="apex-btn-primary px-4 py-1.5">
          Get Started
        </Link>
      </div>
    </header>
  );
}

function LandingHero() {
  return (
    <div className="text-center space-y-6 max-w-3xl">
      <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
        <span className="block navy-gradient-text">Advanced Performance</span>
        <span className="block gold-gradient-text mt-2">
          Evaluation eXchange
        </span>
      </h1>
      <p
        className="text-base md:text-lg font-normal leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        Eliminate administrative rejections for NAVPERS 1616/26 EVALs. Real-time
        validation engine, 10/12-pitch comment-box overflow checking, and
        BUPERSINST 1610.10H policy conformance.
      </p>
      <div className="flex flex-wrap justify-center gap-4 pt-6">
        <Link
          href="/register"
          className="apex-btn-primary px-8 py-3 text-sm hover:scale-[1.02]"
        >
          Register Account
        </Link>
        <Link href="/login" className="apex-btn-secondary px-8 py-3 text-sm">
          Member Sign In
        </Link>
      </div>
    </div>
  );
}

function LandingFeatures() {
  const features = [
    {
      n: "01",
      title: "Catch the rejection before the signature",
      body: "Every block strictly validated against Navy Business rules (EVALMAN), so errors die on screen, not at PERS-32.",
    },
    {
      n: "02",
      title: "No more truncated comments",
      body: "Real-time validation of comments against the physical dimensions of the form's comment box at 10- or 12-pitch. Available on any device with a browser.",
    },
    {
      n: "03",
      title: "The clean foundation for electronic submission",
      body: "Rejection-proofed today, groundwork for PERS-32 integration tomorrow — eliminating manual data entry burden.",
    },
  ];
  return (
    <div className="grid md:grid-cols-3 gap-6 mt-20 w-full">
      {features.map((f) => (
        <div
          key={f.n}
          className="p-6 apex-card space-y-3 hover:border-blue-500/25 transition-colors"
        >
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--accent-cyan)" }}
          >
            {f.n}
          </div>
          <h3 className="text-lg font-bold apex-heading">{f.title}</h3>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {f.body}
          </p>
        </div>
      ))}
    </div>
  );
}

function LandingFooter() {
  return (
    <footer
      className="border-t py-8 px-4"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <NavyBranding sidebar onLightSurface className="max-w-xs" />
        <p
          className="text-center md:text-right text-xs max-w-md"
          style={{ color: "var(--text-secondary)" }}
        >
          © 2026 APEX Project · CIS5898 Capstone
          <br />
          Governing directive BUPERSINST 1610.10H · NAVPERS 1616/26
        </p>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-6xl mx-auto w-full">
        <LandingHero />
        <LandingFeatures />
      </main>
      <LandingFooter />
    </div>
  );
}
