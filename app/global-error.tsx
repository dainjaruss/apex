"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-bold mb-2">APEX is unavailable</h1>
        <p className="text-sm text-slate-500 mb-6 max-w-md">
          A critical error prevented the app from loading.
          {error.digest ? ` Reference: ${error.digest}` : null}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg px-4 py-2 text-xs font-bold bg-blue-600 text-white"
        >
          Reload
        </button>
      </body>
    </html>
  );
}