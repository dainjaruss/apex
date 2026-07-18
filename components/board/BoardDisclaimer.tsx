// components/board/BoardDisclaimer.tsx
//
// Renders the normative BOARD_DISCLAIMER (spec §1.1) verbatim. Required at the
// top of the /board-confidence page AND at the top of every results view.
//

"use client";

import { BOARD_DISCLAIMER } from "@/lib/boardConfidence/types";

const LEAD = "UNOFFICIAL TOOL — NOT A SELECTION BOARD.";

export default function BoardDisclaimer() {
  const hasLead = BOARD_DISCLAIMER.startsWith(LEAD);
  const rest = hasLead ? BOARD_DISCLAIMER.slice(LEAD.length) : BOARD_DISCLAIMER;
  return (
    <div
      className="apex-card p-4 border-l-4"
      style={{ borderLeftColor: "var(--accent-gold)" }}
      role="note"
      aria-label="Unofficial tool disclaimer"
    >
      <p
        className="text-xs leading-relaxed"
        style={{ color: "var(--muted-foreground)" }}
      >
        {hasLead && <strong className="apex-heading">{LEAD}</strong>}
        {rest}
      </p>
    </div>
  );
}
