// components/brag/BragDisclaimerBanner.tsx
//
// Renders BRAG_AI_DISCLAIMER verbatim (spec §1.1 / §6). Placed at the top of
// the /brag-sheet page AND again at the top of AutofillReviewPanel. The
// disclaimer lives in the UI and the brag-sheet PDF only — never in any
// evaluations field.
//

"use client";

import { BRAG_AI_DISCLAIMER } from "@/lib/bragSheet/types";

export default function BragDisclaimerBanner() {
  return (
    <div
      role="note"
      aria-label="AI drafting disclaimer"
      className="apex-card p-4 border-l-4 text-xs leading-relaxed"
      style={{
        borderLeftColor: "var(--accent-gold)",
        color: "var(--muted-foreground)",
      }}
    >
      {BRAG_AI_DISCLAIMER}
    </div>
  );
}
