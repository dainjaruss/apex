import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--subtle)" }}>
        404
      </p>
      <h1 className="text-xl font-bold apex-heading mb-2">Page not found</h1>
      <p className="text-sm max-w-md mb-6" style={{ color: "var(--muted-foreground)" }}>
        This route does not exist or you may not have access.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link href="/dashboard" className="apex-btn-primary">
          Dashboard
        </Link>
        <Link href="/login" className="apex-btn-secondary">
          Sign in
        </Link>
      </div>
    </div>
  );
}