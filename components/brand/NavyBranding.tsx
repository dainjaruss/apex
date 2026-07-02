import NavyEmblem from '@/components/brand/NavyEmblem'

type NavyBrandingProps = {
  /** Mockup 3 — bordered panel at bottom of sidebar */
  sidebar?: boolean
  /** Small inline mark */
  compact?: boolean
  className?: string
}

function BupersCaption({ centered = true }: { centered?: boolean }) {
  return (
    <div className={`mt-3 space-y-1 ${centered ? 'text-center' : 'text-left'}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white leading-snug">
        Bureau of Naval Personnel
      </p>
      <p className="text-[10px] font-medium italic tracking-wide gold-accent">
        People Are Our Mission
      </p>
    </div>
  )
}

export default function NavyBranding({ sidebar = false, compact = false, className = '' }: NavyBrandingProps) {
  if (sidebar) {
    return (
      <div className={`apex-sidebar-brand ${className}`}>
        <NavyEmblem size={96} priority className="mx-auto" />
        <BupersCaption />
      </div>
    )
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <NavyEmblem size={44} />
        <BupersCaption centered={false} />
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <NavyEmblem size={80} priority />
      <BupersCaption />
      <p className="mt-2 text-[8px] font-medium" style={{ color: 'var(--muted-foreground)' }}>
        NAVPERS · BUPERSINST 1610.10H
      </p>
    </div>
  )
}
