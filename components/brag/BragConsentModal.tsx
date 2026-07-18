// components/brag/BragConsentModal.tsx
//
// First-use AI-drafting consent modal for the Brag Sheet (spec §6, copy
// verbatim). Patterned on components/board/BoardConsentModal.tsx: consent is
// persisted to brag_sheets.consented_at and enforced SERVER-SIDE by the
// autofill route (403 while null). Declining keeps the brag sheet fully
// usable — only AI drafting is disabled.
//

"use client";

export default function BragConsentModal({
  onAccept,
  onDecline,
  saving,
}: {
  onAccept: () => void;
  onDecline: () => void;
  saving: boolean;
}) {
  return (
    <div
      className="apex-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="AI drafting consent"
    >
      <div className="w-full max-w-2xl p-8 rounded-2xl apex-card space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div
          className="space-y-2 border-b pb-4"
          style={{ borderColor: "var(--border)" }}
        >
          <h2 className="text-xl font-bold apex-heading tracking-wide">
            AI Drafting Consent
          </h2>
        </div>

        {/* Spec §6 copy — verbatim. */}
        <div
          className="space-y-4 text-sm leading-relaxed"
          style={{ color: "var(--foreground)" }}
        >
          <p>
            <strong className="apex-heading">AI Drafting Consent.</strong>{" "}
            Before APEX can generate evaluation draft text for you: (1) Your
            brag sheet content, summaries of your prior APEX evaluations, and
            your LaDR checklist status will be sent to the AI model configured
            by this server. (2) Your DoD ID number is removed from the payload
            before it is sent. Never enter classified information anywhere in a
            brag sheet. (3) Generated text is a proposal — every block requires
            your explicit review before it touches an evaluation, and trait
            grades and the Block 45 promotion recommendation are never
            generated. (4) Each generation run is recorded in the APEX audit
            log.
          </p>
          <p>
            Declining keeps the brag sheet fully usable — only AI drafting is
            disabled.
          </p>
        </div>

        <div
          className="pt-6 flex flex-col-reverse sm:flex-row justify-end gap-3 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={onDecline}
            className="apex-btn-secondary text-sm"
            disabled={saving}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="apex-btn-primary text-sm disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "Saving…" : "I consent — enable AI drafting"}
          </button>
        </div>
      </div>
    </div>
  );
}
