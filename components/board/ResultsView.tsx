// components/board/ResultsView.tsx
//
// Results tab of the Record Readiness Review. v2: COVERAGE FIRST, THEN A PLAN.
// The 0–100 dial and the six factor bars are gone.
//
// WHY. The old screen showed a score and a band that measured data-entry volume
// rather than readiness: six straight Early Promote reports with empty tabs
// scored 45.0 "Not competitive this cycle", five straight Promotable fully typed
// in scored 57.2 "Crunch", and an empty record scored 1.0 "Drop-from-
// consideration risk" — the first thing the product ever said about a Sailor's
// career. `readiness.ts` suppresses the verdict (score: null) whenever the
// arithmetic cannot support one, which after the blind-spot gate is the COMMON
// path, not an edge case. This screen is built for that path.
//
// RENDERING RULES, each from a measured failure:
//  1. `areas[].detail` never reaches this file. One reduce over
//     detail.contribution reconstructs the suppressed score AND its band exactly
//     (measured: 43.2 on a score: null report), so the server strips it —
//     ClientReadinessReport, types.ts. Nothing here recomputes a score either.
//  2. score === null ⇒ no number and no band anywhere on the screen.
//  3. "Not entered" is a DATA STATE, not a deficiency: not_enough_entered is a
//     dashed, muted, unranked card; needs_attention is a solid amber one. Never
//     the same bar at different lengths, never the same colour at different
//     saturations. That conflation is the whole defect this epic exists to fix.
//  4. evidenceNote renders inline on the surface, never in a tooltip.
//  5. ONE disclaimer. The old journey rendered the unofficial-tool warning five
//     times before the first actionable sentence (consent modal, page banner,
//     this view, the dial's <title>, the dial's caveat line) plus a sixth in the
//     page footer. §1.1 requires it on the page AND on every results view; the
//     page now hides its banner on this tab so exactly one is ever on screen.
//  6. Actions group on horizonBasis, NOT on horizon. No seeded milestone carries
//     typical_months, so today every meet-action lands in next_cycle with basis
//     "unknown_duration" — a "Next cycle" header would tell a Sailor five months
//     out that everything is next cycle. Buckets render only when non-empty.
//
// The narrative is deliberately NOT rendered here. Its deterministic per-factor
// commentary prints "Contributed 33.5 of 40.0 possible points" for all six
// factors (narrative.ts:174-186), which sums straight back to the suppressed
// score. It stays persisted on the row as a historical record.

"use client";

import { useState } from "react";
import BoardDisclaimer from "@/components/board/BoardDisclaimer";
import {
  type BoardAnalysisRow,
  type ClientReadinessReport,
} from "@/lib/boardConfidence/types";
import { runBoardAnalysis } from "@/lib/boardConfidenceService";

type Report = ClientReadinessReport;
type Area = Report["areas"][number];
type Action = Report["actions"][number];

interface ResultsViewProps {
  runs: BoardAnalysisRow[];
  selected: BoardAnalysisRow | null;
  onSelect: (row: BoardAnalysisRow) => void;
  onRunComplete: (row: BoardAnalysisRow) => void;
  /** Server-enforced first-use consent; Run is blocked until granted. */
  consentGranted: boolean;
  onRequestConsent: () => void;
  /**
   * Persists pending Record Entry / LaDR edits and reports whether they landed.
   * Run Analysis scores the SAVED record, so a Sailor who types data and clicks
   * Run would otherwise get a score computed without it. false ⇒ do not run.
   */
  onSaveBeforeRun: () => Promise<boolean>;
  /** member_board_records.rating_abbrev — null until they pick one. */
  rating: string | null;
  /** A LaDR document is stored for that rating. False for 80 of 82 ratings. */
  ladrLoaded: boolean;
  ladrFetching: boolean;
  ladrFetchMsg: string | null;
  onFetchLadr: () => void;
}

/**
 * Status treatment. `not_enough_entered` is deliberately NOT on the same visual
 * axis as the graded statuses: dashed border, no accent, and a neutral word. It
 * is a statement about APEX's data, not about the Sailor.
 */
const STATUS_STYLE = {
  strong: {
    label: "Looking strong",
    badge: "apex-badge-emerald",
    accent: "var(--success-solid)",
    dashed: false,
  },
  on_track: {
    label: "On track",
    badge: "apex-badge-routing",
    accent: "var(--badge-routing-border)",
    dashed: false,
  },
  needs_attention: {
    label: "Needs attention",
    badge: "apex-badge-amber",
    accent: "var(--badge-amber-border)",
    dashed: false,
  },
  not_enough_entered: {
    label: "Not entered",
    badge: "apex-badge-draft",
    accent: "var(--border)",
    dashed: true,
  },
} as const;

/**
 * The narrative's citation gate STRIPS only the trailing bracket group (it
 * checks them all), so that legitimate prose brackets survive: `Complete
 * "Advanced Network Analyst [NEC 742A]"` keeps its NEC code, which matters
 * because the transcribed roadmaps are full of bracketed NEC and CIN codes. The
 * cost is that a citation token in NON-final position reaches the Sailor —
 * `"Solid [areas.performance]. [areas.continuity]"` arrives as `"Solid
 * [areas.performance]."`. It cannot launder a claim (every group is validated
 * and must agree with what it points at) but it is ugly, so it is stripped at
 * display time instead.
 *
 * ANCHORED TO THE LEGAL PREFIXES, not to a generic `word.word` shape. A
 * shape-only match degraded by MANGLING rather than removing:
 * `"…per [1610.10H]. [actions.a1]"` became `"…per."`, which reads as broken
 * software.
 *
 * MUST STAY IN SYNC WITH `PATH_SHAPED` (narrative.ts). It was out of sync in two
 * ways that both rendered raw tokens to a Sailor:
 *   - `monthsToBoard` was omitted, on the reasoning that it "carries no dot" —
 *     true of a shape-only matcher, irrelevant to an enumerated one.
 *   - the character class lacked `:`, but real action ids are
 *     `ladr:${milestone_id}:${meet|answer}`, so every non-trailing
 *     `[actions.ladr:m-cert:meet]` survived intact.
 * Out-of-family tokens (`[awards.fabricated]`) are deliberately NOT stripped
 * here: the gate deletes the whole item instead, so they cannot arrive.
 */
const PATH_TOKEN = /\s*\[(?:(?:coverage|areas|actions|unmet)\.[\w.:-]+|monthsToBoard)\]/g;

const stripPathTokens = (text: string): string =>
  text.replace(PATH_TOKEN, "").replace(/\s+([.,;:])/g, "$1").trim();

/**
 * BUPERSINST 1610.10H para 17-6 says the OPPOSITE of what APEX used to claim:
 * "Missing FITREPs, CHIEFEVALs, or EVALs do not disqualify a member before a
 * selection board, but missing reports can make the work of the board more
 * difficult." (Verified against the LIVE CH-2, whose transmittal revises Encl (2)
 * chapter 3 only, so chapter 17 is unrevised and current. The timestamped fetch
 * record is in lib/boardConfidence/rubric.ts — MyNavyHR re-posts the file, so its
 * page count and hash are a log entry, not a check.)
 *
 * Runs stored before that correction persisted the inverted claim into BOTH
 * `input.meta.continuity_advisory` AND `input.warnings` (rubric.ts pushes the
 * advisory into warnings too), and this view renders both verbatim from the
 * immutable snapshot. Correcting the engine does not correct those rows, so the
 * retracted claim is filtered HERE too — the last place it can reach a Sailor.
 */
const RETRACTED_CONTINUITY_CLAIM = /even a single day/i;

/**
 * Used only when the run's own advisory is absent or predates the correction. A
 * current run's advisory is preferred, so live text has one source and cannot
 * drift; this copy tracks `continuityAdvisory` in `lib/boardConfidence/rubric.ts`
 * minus the gap count and day threshold, which this component does not hold.
 */
const CONTINUITY_ADVISORY =
  "Missing FITREPs, CHIEFEVALs, or EVALs do NOT disqualify you before a " +
  "selection board (BUPERSINST 1610.10H para 17-6) — but a gap is a period of " +
  "undocumented performance, and the board evaluates the record with what is " +
  "available. At a minimum, try to recover any missing report covering " +
  "significant duty in the grades of E-5 or above within the past 5 years: " +
  "send PERS-32 a copy of the original that displays all required signatures, " +
  "initials and dates, together with a signed cover letter asking that the " +
  "duplicate report be filed in your official record (para 17-6a); or, if the " +
  "report cannot be obtained, send PERS-32 a one-page letter in lieu of the " +
  "report explaining why it could not be obtained and supplying what would have " +
  "appeared in blocks 1-19 and 22-26 (para 17-6b, Exhibit 17-4 — accepted only " +
  "to fill a gap in Regular report continuity, and it may not evaluate your own " +
  "performance or recommend you for promotion). Verify your reporting " +
  "continuity on BOL and NSIPS.";

/** Ordered plan buckets. Keyed on horizonBasis first — see rule 6 in the header. */
const BUCKET_ORDER = [
  "unlock",
  "before_board",
  "unknown",
  "next_cycle",
  "blocked",
] as const;
type BucketKey = (typeof BUCKET_ORDER)[number];

const bucketOf = (a: Action): BucketKey =>
  a.horizonBasis === "blocked_unless"
    ? "blocked"
    : a.horizonBasis === "unknown_duration"
      ? "unknown"
      : a.horizon === "before_board"
        ? "before_board"
        : "next_cycle";

const bucketTitle = (key: BucketKey, boardDate: string): string => {
  switch (key) {
    case "unlock":
      return "Let APEX see the rest of your record";
    case "before_board":
      return `Achievable before the ${boardDate} board`;
    case "unknown":
      // NOT "next cycle". APEX has no typical_months for these, so the only
      // advice that cannot be wrong is "start now" — and it says why.
      return "APEX does not know how long these take — start now";
    case "next_cycle":
      return "Longer than the time left before this board";
    case "blocked":
      return "Waiting on something else first";
  }
};

/** One numbered step. `note` is the how/where line; `blockedBy` names the gate. */
function PlanStep({
  n,
  text,
  note,
}: {
  n: number;
  text: string;
  note?: string | null;
}) {
  return (
    <li className="flex gap-3 p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <span
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold apex-heading"
        style={{ background: "var(--muted)" }}
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="space-y-1">
        <span className="block text-sm apex-heading">{text}</span>
        {note && (
          <span className="block text-xs" style={{ color: "var(--muted-foreground)" }}>
            {note}
          </span>
        )}
      </span>
    </li>
  );
}

function CoverageCard({ report }: { report: Report }) {
  const { coverage, scoreNote } = report;
  const pct = Math.round(coverage.measured * 100);
  return (
    <section className="apex-card p-6 space-y-4" aria-labelledby="readiness-coverage">
      <h2 id="readiness-coverage" className="text-xl font-bold apex-heading">
        APEX can see {coverage.areasKnown} of {coverage.areasTotal}{" "}
        {coverage.areasTotal === 1 ? "area" : "areas"} of your record
      </h2>

      <div className="space-y-1.5">
        <div
          className="h-3 w-full rounded-full overflow-hidden"
          style={{ background: "var(--muted)" }}
          role="img"
          aria-label={`${pct} percent of the areas APEX scores is entered`}
        >
          <div
            className="h-3 rounded-full"
            style={{ width: `${pct}%`, background: "var(--accent-gold)" }}
          />
        </div>
        {/* NAMES ITS POPULATION, which the heading above does not share. The
            heading counts every area shown; this bar is coverage.measured, which
            is Σ(weight·confidence) over the SCORED areas only. Three areas carry
            weight 0, so they are in the heading's denominator and not in the
            bar's. Rendered together as "3 of 5 areas" over "89% of your record",
            the two contradicted each other — three of five is 60%, and the bar
            read 89% because the two missing areas carry no weight and therefore
            no denominator. Same numbers, honest labels. */}
        <p className="text-sm apex-heading">
          {pct}% of the areas APEX scores is entered
        </p>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          The bar covers only the areas that feed the assessment; the count above
          it covers every area on this page. Both measure how much of your record
          APEX can see — not how strong it is. Nothing below is a grade on what
          you have not entered.
        </p>
      </div>

      {coverage.missing.length > 0 && (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          <span className="apex-heading font-semibold">Missing: </span>
          {coverage.missing.map((m) => m.label).join(", ")}
        </p>
      )}

      {/* Rule 2: when the engine suppresses the verdict, NO number and NO band
          appear — only its plain-language reason, rendered verbatim so a new
          gate branch (e.g. "your rating's roadmap grew") reaches the Sailor
          without this file guessing at its wording. */}
      {scoreNote && (
        <p
          className="text-sm leading-relaxed p-3 rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          data-testid="score-note"
        >
          {scoreNote}
        </p>
      )}

      {/* THE 0-100 COMPOSITE DOES NOT RENDER. Founder ruling, and `report.score`
          is destructured above only so this file states that on purpose rather
          than by omission.

          The gates suppress the number when the record is thin, which is the
          case the epic set out to fix. What survives the gates is the case where
          the number is confidently WRONG: a record with four straight Must
          Promote, trait averages above the summary group in every period, PSR
          entered and the LaDR fully answered cleared every gate at coverage
          6 of 6, 1.000, and read "44.5 / 100 — vote 25, Not competitive this
          cycle" directly above two cards saying On track. Suppression cannot
          catch that, because nothing is missing.

          The composite is still computed, and persisted only when the readiness
          layer emitted one — `board_analyses.overall_score` and `.band` are
          NULLABLE as of migration 013, and NULL on a suppressed run. Nothing
          here reads either column; this stays a render decision.

          GATE: the band renders nowhere today, which is the only reason the
          BANDS cut points can be left mis-calibrated (docs/specs §7.2). Anything
          that renders `band` again must land BANDS recalibration in the same PR.
          `app/api/board-confidence/runs/route.ts` already returns both columns
          to the client, currently unconsumed — that is what makes this safe, and
          it stops being safe the moment something consumes them. */}
    </section>
  );
}

function LadrFetchCard({
  rating,
  fetching,
  message,
  onFetch,
}: {
  rating: string | null;
  fetching: boolean;
  message: string | null;
  onFetch: () => void;
}) {
  return (
    <section className="apex-card p-6 space-y-3" aria-labelledby="readiness-ladr-fetch">
      <h3 id="readiness-ladr-fetch" className="text-sm font-bold gold-accent uppercase tracking-wider">
        Start here — get your rating&apos;s roadmap
      </h3>
      {rating ? (
        <>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            APEX has no development roadmap (LaDR) stored for{" "}
            <strong className="apex-heading">{rating}</strong> yet, so it cannot
            assess your professional development. It can pull the official
            document from Navy COOL — this takes one click and is normal: only a
            couple of ratings ship with a roadmap already loaded.
          </p>
          <button
            type="button"
            className="apex-btn-primary text-sm disabled:opacity-50"
            onClick={onFetch}
            disabled={fetching}
          >
            {fetching ? "Fetching from Navy COOL…" : "Fetch official LaDR from Navy COOL"}
          </button>
          {message && (
            <p role="status" className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {message}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Pick your rating on the Record Entry tab first. APEX then fetches that
          rating&apos;s development roadmap (LaDR) from Navy COOL in one click.
        </p>
      )}
    </section>
  );
}

function PlanSection({
  report,
  showLadrFetchHint,
}: {
  report: Report;
  showLadrFetchHint: boolean;
}) {
  const grouped: Record<BucketKey, Array<{ text: string; note?: string | null }>> = {
    unlock: report.coverage.missing.map((m) => ({
      text: `Add ${m.label} — unlocks ${m.unlocks}`,
      note: m.howTo,
    })),
    before_board: [],
    unknown: [],
    next_cycle: [],
    blocked: [],
  };
  for (const a of report.actions) {
    // Worth is never printed: it is composite points on a scale nothing else on
    // this screen uses, and the ranking already carries the signal.
    grouped[bucketOf(a)].push({ text: a.action, note: a.blockedBy });
  }

  const buckets = BUCKET_ORDER.filter((k) => grouped[k].length > 0);
  const total = buckets.reduce((n, k) => n + grouped[k].length, 0);
  let n = 0;

  return (
    <section className="space-y-3" aria-labelledby="readiness-plan">
      <h3 id="readiness-plan" className="text-sm font-bold gold-accent uppercase tracking-wider">
        Do this next
      </h3>
      {total === 0 ? (
        <div className="apex-card p-6">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {showLadrFetchHint
              ? "APEX has no development roadmap for your rating yet, so it has no steps to rank. Fetch it above and run the review again."
              : "APEX has no open steps to rank from what you have entered. Keep your evaluations and record entries current, and re-run this before the board."}
          </p>
        </div>
      ) : (
        buckets.map((key) => {
          const start = n + 1;
          n += grouped[key].length;
          return (
            <div key={key} className="apex-card p-4 space-y-2">
              <h4
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                {bucketTitle(key, report.boardDate)}
              </h4>
              <ol className="space-y-2" start={start}>
                {grouped[key].map((step, i) => (
                  <PlanStep key={step.text} n={start + i} text={step.text} note={step.note} />
                ))}
              </ol>
            </div>
          );
        })
      )}
    </section>
  );
}

function AreaCard({ area }: { area: Area }) {
  const s = STATUS_STYLE[area.status];
  return (
    <div
      className="apex-card p-4 space-y-2"
      data-testid={`area-${area.key}`}
      data-status={area.status}
      style={{
        // Border STYLE and WIDTH carry the distinction, not a colour ramp and
        // not opacity: dimming the card pushed the evidence note to 4.38:1
        // against WCAG AA's 4.5:1 in light theme.
        borderStyle: s.dashed ? "dashed" : "solid",
        borderLeftWidth: s.dashed ? "1px" : "4px",
        borderLeftColor: s.accent,
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold apex-heading">{area.label}</h4>
        <span className={`${s.badge} px-2 py-0.5`}>{s.label}</span>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {area.summary}
      </p>
      {/* Rule 4: provenance on the surface, not in a tooltip. Every area says
          where its data came from, and "From your entries" is the common case. */}
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        <span className="font-semibold">{area.evidenceLabel}.</span>{" "}
        {area.evidenceNote}
      </p>
    </div>
  );
}

/**
 * The AI narrative, and ONLY the AI narrative.
 *
 * PR #24 rebuilt narrative.ts from the ReadinessReport, so the reason this
 * screen originally dropped it — the fallback printed "Contributed 33.5 of 40.0
 * possible points" for all six factors, which sums back to the suppressed
 * composite — is gone. What replaced it is a different problem: the
 * DETERMINISTIC fallback is now assembled from the very strings this screen
 * already renders. `factor_commentary[key] = area.summary` is the area cards
 * verbatim; `recommendations` is roundRobin(actions.action, missing.howTo,
 * confirmInOmpf.note) — the plan and the OMPF list, reordered. Rendering it
 * would show a Sailor the same sentences twice in two different orders.
 *
 * That reasoning is right about the fallback and does NOT reach the path this
 * component actually renders, which is model-only — where `recommendations` is
 * model-written, citation-gated prose, not those strings. Re-decided on the
 * correct grounds, and still excluded:
 *
 *   The payload hands the model `actions` — the same rows the ranked plan is
 *   built from — so model `recommendations` are prose OVER the plan's contents.
 *   At best they restate it in different words; at worst they imply a different
 *   order. The plan is ranked by measured marginal composite value and is the
 *   product's core promise; a second, unranked to-do list beside it leaves a
 *   Sailor asking which to do first. That is the "two numbers for one item"
 *   failure in list form, and it is a real cost against a speculative gain.
 *
 * `factor_commentary` stays out for a firmer reason than "it duplicates the
 * cards": `applyCitationGate` substitutes `deterministic.factor_commentary[key]`
 * for any entry it cannot cite (narrative.ts:216), so model output really can
 * arrive carrying the area summaries verbatim.
 */
function ModelNarrative({ narrative }: { narrative: BoardAnalysisRow["narrative"] }) {
  const strengths = (narrative?.strengths ?? []).map(stripPathTokens).filter(Boolean);
  const gaps = (narrative?.gaps ?? []).map(stripPathTokens).filter(Boolean);
  // A dropped item must not read as a clean bill of health. The gate deletes a
  // claim that contradicts the area it cites, and an absent "What is working"
  // says "nothing good was found" when it means "we could not verify these
  // claims" — opposite messages. So the card renders whenever anything was
  // withheld, even with both lists empty, and names the removal. Counting only
  // the two lists rendered here keeps the number reconcilable with the screen.
  const withheld = narrative?.withheld ?? 0;
  if (strengths.length === 0 && gaps.length === 0 && withheld === 0) return null;
  return (
    <section className="apex-card p-4 space-y-3" aria-labelledby="readiness-narrative">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3
          id="readiness-narrative"
          className="text-sm font-bold gold-accent uppercase tracking-wider"
        >
          In plain terms
        </h3>
        <span className="apex-badge-draft px-2 py-0.5">Written by AI</span>
      </div>
      {([
        ["What is working", strengths],
        ["What a board would notice", gaps],
      ] as const).map(([title, items]) =>
        items.length === 0 ? null : (
          <div key={title} className="space-y-1">
            <h4
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              {title}
            </h4>
            <ul className="text-sm list-disc pl-5 space-y-1" style={{ color: "var(--foreground)" }}>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ),
      )}
      {withheld > 0 && (
        <p
          className="text-xs"
          style={{ color: "var(--muted-foreground)" }}
          data-testid="narrative-withheld"
        >
          {/* `withheld` counts BOTH kinds of drop — a citation that resolves to
              nothing, and one that disagrees with what it points at — so the
              wording has to cover both. Naming only the second was wrong for
              items that cited no area at all. */}
          APEX removed {withheld} written {withheld === 1 ? "statement" : "statements"}{" "}
          it could not verify against your record: the source{" "}
          {withheld === 1 ? "it cited" : "they cited"} is either not in your
          record, or does not say what the sentence claimed. That is a check on
          the writing, not a finding about your record — the area cards above are
          what APEX actually measured.
        </p>
      )}
    </section>
  );
}

function LegacyRunPanel() {
  return (
    <div className="apex-card p-6 space-y-2">
      <p className="text-sm apex-heading">This run predates the readiness review.</p>
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        It was scored by a rubric that could not tell &ldquo;APEX has no
        data&rdquo; apart from &ldquo;the record is weak&rdquo;, so its number is
        not shown. Run the review again to see your coverage and your plan.
      </p>
    </div>
  );
}

export default function ResultsView({
  runs,
  selected,
  onSelect,
  onRunComplete,
  consentGranted,
  onRequestConsent,
  onSaveBeforeRun,
  rating,
  ladrLoaded,
  ladrFetching,
  ladrFetchMsg,
  onFetchLadr,
}: ResultsViewProps) {
  const [boardDate, setBoardDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setRunError(null);
    try {
      // The route scores the SAVED record. Save first, and abort if the save was
      // refused (bad dates, network) rather than silently scoring stale data.
      if (!(await onSaveBeforeRun())) {
        setRunError(
          "Unsaved changes could not be saved, so the review was not run. Fix the problem shown above, then run again.",
        );
        return;
      }
      const row = await runBoardAnalysis({
        boardDate,
        // The engine reads no clock — the browser's today is handed in and
        // validated at the route boundary.
        asOf: new Date().toISOString().slice(0, 10),
      });
      onRunComplete(row);
    } catch (err: any) {
      setRunError(err?.message || "Record readiness review failed.");
    } finally {
      setRunning(false);
    }
  };

  const report = selected?.input?.readiness ?? null;
  const adverse = selected ? Number(selected.adverse_adjustment ?? 0) : 0;
  const meta = (selected?.input?.meta ?? {}) as Record<string, unknown>;
  const continuityGap = meta.continuity_gap === true;
  const stored = meta.continuity_advisory;
  const continuityAdvisory =
    typeof stored === "string" && !RETRACTED_CONTINUITY_CLAIM.test(stored)
      ? stored
      : CONTINUITY_ADVISORY;
  // rubric.ts pushes the advisory into warnings as well, so a pre-correction row
  // carries the retracted claim twice. The advisory block above says it right.
  const warnings: string[] = (selected?.input?.warnings ?? []).filter(
    (w) => !RETRACTED_CONTINUITY_CLAIM.test(w),
  );
  const showLadrFetch = !ladrLoaded;
  // Empty preceptFlags ⇒ the rubric excluded the factor (weight 0, ×100/90
  // redistribution) and coverage counts 5 areas. Read from the run's own
  // snapshot so a prior run renders the state it was scored under.
  //
  // TWO states land here, and the copy below must be true of BOTH: no precept
  // row at all, and a precept row an admin filled in that cites no convening
  // order (assembleRubricInputs drops those flags). "Not set up for your cycle"
  // was written for the first and is false for the second — somebody DID set
  // them up; APEX declined to trust them.
  const preceptConfigured = (selected?.input?.preceptFlags?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* §1.1: the disclaimer on the results view. The page banner is hidden on
          this tab so this is the only copy on screen. */}
      <BoardDisclaimer />

      <div className="apex-card p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="apex-filter-label">Board date</span>
          <input
            type="date"
            className="apex-input"
            value={boardDate}
            onChange={(e) => setBoardDate(e.target.value)}
            aria-label="Board convening date"
          />
        </label>
        <button
          type="button"
          className="apex-btn-primary disabled:opacity-50"
          onClick={run}
          disabled={running || !consentGranted}
          title={consentGranted ? undefined : "Consent required before running a review."}
        >
          {running ? "Reviewing…" : "Run Review"}
        </button>
        {!consentGranted && (
          <button
            type="button"
            className="apex-btn-secondary text-xs"
            onClick={onRequestConsent}
          >
            Review consent terms
          </button>
        )}
        <p className="text-xs basis-full" style={{ color: "var(--subtle)" }}>
          Running saves any unsaved Record Entry and LaDR changes first, so the
          review always reflects what you just typed.
        </p>
      </div>

      {runError && (
        <div
          role="alert"
          className="p-3 rounded-lg text-xs border border-amber-900/40 bg-amber-950/30 text-amber-200 flex items-center justify-between gap-3"
        >
          <span>{runError}</span>
          <button
            type="button"
            className="apex-btn-secondary py-1 px-3 text-xs"
            onClick={run}
            disabled={running}
          >
            Retry
          </button>
        </div>
      )}

      {showLadrFetch && (
        <LadrFetchCard
          rating={rating}
          fetching={ladrFetching}
          message={ladrFetchMsg}
          onFetch={onFetchLadr}
        />
      )}

      {!selected ? (
        <div className="apex-card p-10 text-center space-y-2">
          <p className="text-sm apex-heading">No review yet.</p>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Run one now — you do not need a complete record first. APEX will show
            you what it can already see and what to enter next.
          </p>
        </div>
      ) : !report ? (
        <LegacyRunPanel />
      ) : (
        <>
          <CoverageCard report={report} />

          <PlanSection report={report} showLadrFetchHint={showLadrFetch} />

          {report.confirmInOmpf && (
            <section className="apex-card p-4 space-y-2" aria-labelledby="readiness-ompf">
              <h3
                id="readiness-ompf"
                className="text-sm font-bold gold-accent uppercase tracking-wider"
              >
                Confirm in your OMPF
              </h3>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {report.confirmInOmpf.note}
              </p>
              <ul className="text-sm list-disc pl-5 space-y-1" style={{ color: "var(--foreground)" }}>
                {report.confirmInOmpf.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {selected.narrative_source === "model" && (
            <ModelNarrative narrative={selected.narrative} />
          )}

          {continuityGap && (
            <div
              role="alert"
              className="p-4 rounded-lg border border-red-900/50 bg-red-950/30 text-red-200 text-sm space-y-1"
            >
              <p className="font-bold uppercase tracking-wider text-red-300">
                Reporting continuity gap detected
              </p>
              <p className="text-xs" data-testid="continuity-advisory">
                {continuityAdvisory}
              </p>
            </div>
          )}

          {adverse > 0 && (
            <div
              role="note"
              className="p-3 rounded-lg text-xs border border-red-900/40 bg-red-950/25 text-red-200"
            >
              Your record contains adverse entries and/or a PFA failure within 36
              months of the board date. A board sees these — be ready to address
              them.
            </div>
          )}

          {warnings.length > 0 && (
            <section className="space-y-2" aria-labelledby="readiness-warnings">
              <h3
                id="readiness-warnings"
                className="text-xs font-bold uppercase tracking-wider text-amber-400"
              >
                Data notices
              </h3>
              <ul className="space-y-1.5">
                {warnings.map((w, i) => (
                  <li
                    key={i}
                    className="p-2.5 rounded-lg border border-amber-900/30 bg-amber-950/15 text-xs text-amber-200"
                  >
                    {w}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Per-area detail is available but does NOT lead. */}
          <section className="space-y-2" aria-labelledby="readiness-areas">
            <h3
              id="readiness-areas"
              className="text-sm font-bold gold-accent uppercase tracking-wider"
            >
              What APEX looked at
            </h3>
            {report.areas
              .filter((a) => a.key !== "precept" || preceptConfigured)
              .map((area) => (
                <AreaCard key={area.key} area={area} />
              ))}
            {/* With no precept loaded the rubric drops the factor to weight 0
                and coverage counts 5 areas, not 6 — so showing a sixth card
                labelled "Not entered" would both contradict the headline and
                blame the Sailor for a setting only an Admin can make. */}
            {!preceptConfigured && (
              <p className="text-xs px-1" style={{ color: "var(--muted-foreground)" }}>
                APEX has no board emphasis areas it can trace to a convening
                order, so it left them out of this review entirely — they are not
                counted against you.
              </p>
            )}
          </section>
        </>
      )}

      <section className="space-y-2" aria-labelledby="readiness-prior">
        <h3
          id="readiness-prior"
          className="text-sm font-bold gold-accent uppercase tracking-wider"
        >
          Prior reviews
        </h3>
        {runs.length === 0 ? (
          <div className="apex-card p-6 text-center">
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              No prior reviews.
            </p>
          </div>
        ) : (
          <div className="apex-card overflow-x-auto">
            {/* No score or band column: those are exactly the numbers the
                readiness gate suppresses, and a history table is no place to
                reintroduce them. */}
            <table className="apex-data-table min-w-[520px]">
              <thead>
                <tr>
                  <th>Run date</th>
                  <th>Board date</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const isSelected = r.id != null && r.id === selected?.id;
                  const cov = r.input?.readiness?.coverage;
                  return (
                    <tr
                      key={r.id ?? r.created_at}
                      tabIndex={0}
                      onClick={() => onSelect(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(r);
                        }
                      }}
                      // toLocaleString, matching the cell below: two runs on the
                      // same day are the normal case while iterating, and a
                      // date-only label makes them indistinguishable to a screen
                      // reader while sighted users can tell them apart.
                      aria-label={`Load review from ${
                        r.created_at
                          ? new Date(r.created_at).toLocaleString()
                          : r.board_date
                      }`}
                      className="cursor-pointer"
                      style={isSelected ? { background: "var(--muted)" } : undefined}
                    >
                      <td className="text-xs">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="text-xs font-mono">{r.board_date}</td>
                      <td className="text-xs">
                        {cov
                          ? `${cov.areasKnown} of ${cov.areasTotal} areas`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
