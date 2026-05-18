import Link from 'next/link'

function LandingHeader() {
  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <span className="font-extrabold text-xl tracking-wider text-white">APEX</span>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1c2541] text-[#3e6e99] border border-blue-900/30">NAVAL EVAL v1.0</span>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/login" className="text-sm font-medium hover:text-white transition-colors duration-200">
          Sign In
        </Link>
        <Link href="/register" className="px-4 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-sm font-semibold transition-all duration-200 shadow-md shadow-blue-900/20">
          Get Started
        </Link>
      </div>
    </header>
  )
}

function LandingHero() {
  return (
    <div className="text-center space-y-6 max-w-3xl">
      <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
        <span className="block navy-gradient-text">Advanced Performance</span>
        <span className="block gold-gradient-text mt-2">Evaluation eXchange</span>
      </h1>
      <p className="text-base md:text-lg text-[#91aec9] font-light leading-relaxed">
        Eliminate administrative rejections for NAVPERS 1616/26 EVALs. Real-time validation engine, 10/12-pitch comment-box overflow checking, and BUPERSINST 1610.10H policy conformance.
      </p>
      <div className="flex flex-wrap justify-center gap-4 pt-6">
        <Link href="/register" className="px-8 py-3 rounded-lg bg-blue-700 hover:bg-blue-600 font-bold transition-all shadow-lg shadow-blue-900/30 hover:scale-[1.02]">
          Register Account
        </Link>
        <Link href="/login" className="px-8 py-3 rounded-lg bg-[#1c2541] hover:bg-slate-800 font-bold border border-slate-700 transition-all">
          Member Sign In
        </Link>
      </div>
    </div>
  )
}

function LandingFeatures() {
  return (
    <div className="grid md:grid-cols-3 gap-6 mt-20 w-full">
      <div className="p-6 rounded-xl glass-panel space-y-3">
        <div className="text-blue-400 text-2xl font-bold">01</div>
        <h3 className="text-lg font-bold text-white">Catch the rejection before the signature</h3>
        <p className="text-sm text-[#91aec9] leading-relaxed">
          APEX developer brings 20+ years of Navy experience working with EVALs. Every block strictly validated against Navy Business rules (EVALMAN), so errors die on screen, not at PERS-32.
        </p>
      </div>
      <div className="p-6 rounded-xl glass-panel space-y-3">
        <div className="text-blue-400 text-2xl font-bold">02</div>
        <h3 className="text-lg font-bold text-white">No more truncated comments</h3>
        <p className="text-sm text-[#91aec9] leading-relaxed">
          Real-time validation of your comments against the physical dimensions of the form's comment box—measured in characters and line breaks at 10- or 12-pitch. 
          Tired of the old Windows only NavFit98 App. APEX modern web interface is available on any device with a browser.
        </p>
      </div>
      <div className="p-6 rounded-xl glass-panel space-y-3">
        <div className="text-blue-400 text-2xl font-bold">03</div>
        <h3 className="text-lg font-bold text-white">The clean foundation for electronic submission</h3>
        <p className="text-sm text-[#91aec9] leading-relaxed">
           APEX deilvers a rejection-proofed product today, the groundwork for PERS-32 integration tomorrow. 
           Our goal is to provide a seamless transition from paper to electronic submission, 
           eliminating the administrative burden of manual data entry and ensuring accuracy in your 
           official military record.
        </p>
      </div>
    </div>
  )
}

function LandingFooter() {
  return (
    <footer className="border-t border-[#1c2541] py-6 text-center text-xs text-[#608bb3]">
      <p>© 2026 APEX Project. Developed for CIS5898 Capstone. Governing directive BUPERSINST 1610.10H.</p>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0b132b] text-[#f0f4f8]">
      <LandingHeader />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-6xl mx-auto w-full">
        <LandingHero />
        <LandingFeatures />
      </main>

      <LandingFooter />
    </div>
  )
}

