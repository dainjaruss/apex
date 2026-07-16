// components/report/DetailsTab.tsx
//
// Read-only "Form Details" tab for the report screen, decomposed into small sections.

import React from "react";
import { Evaluation } from "@/types";
import { checkCommentFit } from "@/lib/commentFit";
import { SIGNATURE_BLOCKS, SignatureBlockMeta } from "@/lib/signatures";

export type OnSign = (block: number, label: string, signer: string) => void;

const PANEL = "apex-report-panel";
const H3 = "apex-report-section-title";
const LBL = "apex-report-field-label";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className={LBL}>{label}</div>
      <div className="font-semibold apex-heading mt-0.5">{value}</div>
    </div>
  );
}

function joinFlags(...flags: (string | false | undefined)[]): string {
  return flags.filter(Boolean).join(" ") || "—";
}

function IdentitySection({ e }: { e: Evaluation }) {
  const bv = e.block_values || {};
  return (
    <div className={PANEL}>
      <h3 className={H3}>Blocks 1 - 19: Identity & Report Occasion</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 text-sm">
        <Field label="1: Name" value={e.member_name} />
        <Field label="2: Grade/Rate" value={e.grade_rate} />
        <Field label="3: Designator" value={e.designator || "N/A"} />
        <Field label="4: DoD ID" value={e.dod_id} />
        <Field label="5: Duty Status" value={e.duty_status} />
        <Field label="6: UIC" value={e.uic} />
        <Field label="7: Ship/Station" value={e.ship_station} />
        <Field label="8: Promotion Status" value={e.promotion_status} />
        <Field label="9: Date Reported" value={bv.date_reported || "N/A"} />
        <Field
          label="Period of Report"
          value={`${e.period_from} to ${e.period_to}`}
        />
        <Field
          label="Occasion"
          value={joinFlags(
            bv.periodic && "Periodic (10)",
            bv.detachment_individual && "Detachment of Individual (11)",
            bv.promotion_frocking && "Promotion/Frocking (12)",
            bv.special && "Special (13)",
          )}
        />
        <Field
          label="Report Type"
          value={joinFlags(
            bv.regular_report && "Regular (17)",
            bv.concurrent_report && "Concurrent (18)",
            bv.not_observed && "Not Observed (16)",
          )}
        />
      </div>
    </div>
  );
}

function SignField({
  e,
  block,
  keyName,
  label,
  signer,
  onSign,
}: {
  e: Evaluation;
  block: number;
  keyName: string;
  label: string;
  signer: string;
  onSign: OnSign;
}) {
  const bv = e.block_values || {};
  const signed = bv[keyName];
  const date = bv[`${keyName}_date`];
  if (signed)
    return (
      <div className="apex-report-signed mt-0.5">
        ✓ {signed}
        {date ? ` · ${date}` : ""}
      </div>
    );
  if (e.status === "archived" || e.signature_locked)
    return <div className="font-semibold apex-heading mt-0.5">— (blank)</div>;
  return (
    <button
      type="button"
      onClick={() => onSign(block, label, signer)}
      className="apex-btn-primary mt-1 text-[11px]"
    >
      ✍ Sign
    </button>
  );
}

function CommandContextSection({
  e,
  onSign,
}: {
  e: Evaluation;
  onSign: OnSign;
}) {
  const bv = e.block_values || {};
  return (
    <div className={PANEL}>
      <h3 className={H3}>Blocks 20 - 32: Command Context & Counseling</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 text-sm mb-6">
        <Field
          label="20: Physical Readiness"
          value={bv.physical_readiness || "N/A"}
        />
        <Field
          label="21: Billet Subcategory"
          value={bv.billet_subcategory || "NA"}
        />
        <Field
          label="22: Reporting Senior"
          value={bv.reporting_senior_name || "N/A"}
        />
        <Field
          label="23: RS Grade"
          value={bv.reporting_senior_grade || "N/A"}
        />
        <Field
          label="24: RS Designator"
          value={bv.reporting_senior_designator || "N/A"}
        />
        <Field
          label="25: RS Title"
          value={bv.reporting_senior_title || "N/A"}
        />
        <Field label="26: RS UIC" value={bv.reporting_senior_uic || "N/A"} />
        <Field label="30: Date Counseled" value={bv.date_counseled || "N/A"} />
        <Field label="31: Counselor" value={bv.counselor || "N/A"} />
        <div>
          <div className={LBL}>32: Sig of Individual Counseled</div>
          <SignField
            e={e}
            block={32}
            keyName="individual_counseled_signature"
            label="Signature of Individual Counseled"
            signer="evaluated member"
            onSign={onSign}
          />
        </div>
      </div>
      <div className="space-y-4 text-sm border-t apex-report-divider pt-4">
        <div>
          <div className={LBL}>28: Command Employment and Achievements</div>
          <p className="mt-1 apex-report-body whitespace-pre-wrap">
            {bv.command_achievements || "None listed."}
          </p>
        </div>
        <div>
          <div className={LBL}>29: Primary/Collateral/Watchstanding Duties</div>
          <p className="mt-1 apex-report-body whitespace-pre-wrap">
            {bv.primary_duties || "None listed."}
          </p>
        </div>
      </div>
    </div>
  );
}

function TraitRatingsSection({ e }: { e: Evaluation }) {
  return (
    <div className={PANEL}>
      <h3 className={H3}>Blocks 33 - 40: Trait Ratings Breakdown</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4 text-center">
        {Object.entries(e.trait_grades || {}).map(([key, val]) => (
          <div key={key} className="apex-report-trait-cell">
            <div className="apex-report-trait-label">
              {key === "eo" ? "Climate/EO" : key}
            </div>
            <div className="text-base font-bold apex-heading mt-1">
              {val as string}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NarrativeSection({ e }: { e: Evaluation }) {
  const pitch = e.block_values?.comment_pitch || "10";
  const fit = checkCommentFit(e.comments || "", pitch);
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between mb-4 border-b apex-report-divider pb-2">
        <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
          Block 43: Narrative Comments
        </h3>
        <span className="text-[10px] apex-report-faint font-mono">
          Pitch Selected: {pitch}-Pitch | Lines: {fit.linesUsed} / 18
        </span>
      </div>
      <div className="apex-narrative-viewer">
        {fit.wrappedLines.length === 0 ? (
          <p className="italic apex-report-faint">No narrative entered.</p>
        ) : (
          <div className="space-y-0.5">
            {fit.wrappedLines.map((line, idx) => (
              <div key={idx} className="flex">
                <span className="apex-narrative-gutter">{idx + 1}</span>
                <span className="whitespace-pre">{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SignatureRow({
  e,
  s,
  onSign,
}: {
  e: Evaluation;
  s: SignatureBlockMeta;
  onSign: OnSign;
}) {
  const bv = e.block_values || {};
  const signedName = bv[s.key];
  const signedDate = bv[`${s.key}_date`];
  return (
    <div className="flex items-center justify-between gap-3 apex-form-panel border rounded-lg px-3 py-2">
      <div className="min-w-0">
        <div className="apex-report-faint">
          {s.block}: {s.label}
        </div>
        {signedName ? (
          <div className="apex-report-signed mt-0.5">
            ✓ {signedName}
            {signedDate ? ` · ${signedDate}` : ""}
          </div>
        ) : (
          <div className="apex-report-faint mt-0.5 italic">Unsigned</div>
        )}
      </div>
      {!signedName && e.status !== "archived" && !e.signature_locked && (
        <button
          type="button"
          onClick={() => onSign(s.block, s.label, s.signer)}
          className="apex-btn-primary shrink-0"
        >
          ✍ Sign
        </button>
      )}
    </div>
  );
}

function RecommendationsSection({
  e,
  onSign,
}: {
  e: Evaluation;
  onSign: OnSign;
}) {
  const bv = e.block_values || {};
  const recs = (e.career_recommendations || []).filter(Boolean).slice(0, 2);
  return (
    <div className={PANEL}>
      <h3 className={H3}>Blocks 41, 44 - 52: Recommendations & Signatures</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm mb-6">
        <div>
          <div className={LBL}>Block 41: Career Recommendations</div>
          <ul className="list-disc pl-5 mt-1 font-semibold apex-heading">
            {recs.length ? (
              recs.map((r, i) => <li key={i}>{r}</li>)
            ) : (
              <li className="italic apex-report-faint">None</li>
            )}
          </ul>
        </div>
        <Field
          label="45: Promotion Recommendation"
          value={e.promotion_recommendation || "NOB"}
        />
        <Field
          label="47: Retention Recommendation"
          value={e.retention || "N/A"}
        />
      </div>
      <div className="mb-6">
        <div className={`${LBL} mb-1`}>
          46: Promotion Recommendation Summary (Summary Group)
        </div>
        {e.promotion_recommendation === "NOB" ? (
          <p className="apex-report-faint text-sm italic">
            Left blank — Not Observed report.
          </p>
        ) : e.summary_group_distribution ? (
          <div className="flex flex-wrap gap-2 mt-1 text-xs">
            {[
              "Significant Problems",
              "Progressing",
              "Promotable",
              "Must Promote",
              "Early Promote",
            ].map((c) => (
              <span key={c} className="apex-report-chip">
                {c}:{" "}
                <span className="font-bold apex-heading">
                  {e.summary_group_distribution?.[c] ?? 0}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="apex-report-faint text-sm italic">Not available.</p>
        )}
      </div>
      <div className="mb-6">
        <div className={`${LBL} mb-1`}>44: Qualifications/Achievements</div>
        <p className="apex-report-body text-sm whitespace-pre-wrap">
          {bv.qualifications || "None listed."}
        </p>
      </div>
      <div className="mb-4">
        <div className={`${LBL} mb-1`}>48: Reporting Senior Address</div>
        <p className="apex-report-body text-sm whitespace-pre-wrap">
          {bv.reporting_senior_address || "None listed."}
        </p>
      </div>
      <p className="text-[11px] apex-report-faint mb-3">
        Each block is signed here on the report. Signing requires the authorized
        signer to enter their own credentials.
      </p>
      <div className="border-t apex-report-divider pt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {SIGNATURE_BLOCKS.filter((s) => s.block !== 32).map((s) => (
          <SignatureRow key={s.key} e={e} s={s} onSign={onSign} />
        ))}
      </div>
    </div>
  );
}

export default function DetailsTab({
  evaluation,
  onSign,
}: {
  evaluation: Evaluation;
  onSign: OnSign;
}) {
  return (
    <div className="space-y-6">
      <IdentitySection e={evaluation} />
      <CommandContextSection e={evaluation} onSign={onSign} />
      <TraitRatingsSection e={evaluation} />
      <NarrativeSection e={evaluation} />
      <RecommendationsSection e={evaluation} onSign={onSign} />
    </div>
  );
}