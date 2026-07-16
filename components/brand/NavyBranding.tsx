import NavyEmblem from "@/components/brand/NavyEmblem";

type NavyBrandingProps = {
  /** Mockup 3 — bordered panel at bottom of sidebar */
  sidebar?: boolean;
  /** Use on landing/footer over light background (fixes contrast audits) */
  onLightSurface?: boolean;
  /** Small inline mark */
  compact?: boolean;
  className?: string;
};

function BupersCaption({ centered = true }: { centered?: boolean }) {
  return (
    <div className={`mt-3 space-y-1 ${centered ? "text-center" : "text-left"}`}>
      <p className="apex-sidebar-brand-title">Bureau of Naval Personnel</p>
      <p className="apex-sidebar-brand-tagline">People Are Our Mission</p>
    </div>
  );
}

export default function NavyBranding({
  sidebar = false,
  onLightSurface = false,
  compact = false,
  className = "",
}: NavyBrandingProps) {
  if (sidebar) {
    return (
      <div
        className={`apex-sidebar-brand ${onLightSurface ? "apex-sidebar-brand--on-light" : ""} ${className}`}
      >
        <NavyEmblem size={96} priority className="mx-auto" />
        <BupersCaption />
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <NavyEmblem size={44} />
        <BupersCaption centered={false} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <NavyEmblem size={80} priority />
      <BupersCaption />
      <p className="mt-2 text-[8px] font-medium apex-text-muted">
        NAVPERS · BUPERSINST 1610.10H
      </p>
    </div>
  );
}