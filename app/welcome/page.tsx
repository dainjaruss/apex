import Link from "next/link";

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen bg-[#0b132b] items-center justify-center p-4">
      <div className="w-full max-w-lg p-8 rounded-2xl glass-panel space-y-6 text-center">
        <h2 className="text-2xl font-bold text-white tracking-wide">
          Identity Confirmed
        </h2>
        <p className="text-[#91aec9] text-sm">
          Your email has been successfully verified. Your APEX account is now
          active and ready to use.
        </p>
        <div className="pt-6">
          <Link
            href="/dashboard"
            className="inline-block w-full py-3 rounded bg-[#3e6e99] hover:bg-[#2c4f70] text-white font-bold tracking-wider transition-colors shadow-lg"
          >
            Proceed to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
