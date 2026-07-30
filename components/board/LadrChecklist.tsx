// components/board/LadrChecklist.tsx
//
// LaDR milestone checklist for the Board Confidence Analyzer (spec §6, tab 2).
// Auto-loaded for the selected rating + target paygrade. Applicability rule
// (spec §3): min(applies_to_paygrades) <= target paygrade.
//
// v1.6 — grouping and substance. This file used to render `item` and
// `item_code` and nothing else, so an IT1 targeting E-7 met 26 milestones as
// one flat list with an E-3 certification and an E-7 board item styled
// identically, and everything the v1.6 transcription captured in `detail` (the
// verbatim criterion, its parenthetical examples, the Fully/Best Qualified
// tier the board actually sorts on, the step's sea/shore guidance) was stored
// and invisible. Now: paygrade block first — the LaDR's own organisation,
// which separates what is behind a candidate from the block that is the gate
// for the target — then category by LADR_CATEGORY_WEIGHTS descending with the
// zero-weight (informational) categories last, then the source's tier.
//
// Presentation only: no scoring input changes, and nothing is synthesised.
// Every string below comes off the row; an absent field renders nothing rather
// than a placeholder sentence.
//
// EDITORIAL CLAIMS ADDED BY v1.6 — the complete list of the three sentences
// this change puts on screen that make an assertion rather than label a control
// or quote the source. All three are claims about this page's layout, not about
// Navy doctrine, and none is derived from a field the row does not carry.
//
// Not listed, because they are UI chrome rather than claims: the disclosure
// triggers ("What the LaDR says", "Named in the LaDR:", "Sea/shore — …") and
// the "Board emphasis" badge. Not listed, because they predate this change: the
// TAR/SELRES caveat in renderCategory and the "Unanswered items lower scoring
// confidence" line in the subtitle — both true, neither the LaDR's words.
//   1. renderCategory — the Best Qualified heading's "in addition to the Fully
//      qualified list above — not instead of it". Shown only when an FQ group
//      is actually rendered above it.
//   2. renderBlock — the block glosses "the gate for E-N", "first listed at
//      E-N" and "first listed at E-N — behind you at E-N". The last is printed
//      only when every row in the block stops short of the target; the block
//      key is min(applies_to_paygrades), so a block can otherwise hold rows the
//      LaDR still lists AT the target.
//   3. The subtitle's "grouped by the paygrade block the LaDR first lists them
//      at" — a description of the grouping this file performs.
//

"use client";

import React from "react";
import {
  LADR_CATEGORY_WEIGHTS,
  isBoardEmphasis,
} from "@/lib/boardConfidence/rubric";
import type {
  LadrCategory,
  LadrDocument,
  LadrMilestone,
  LadrStatus,
  MemberBoardRecord,
} from "@/lib/boardConfidence/types";

type Checklist = MemberBoardRecord["ladr_checklist"];

interface LadrChecklistProps {
  document: LadrDocument | null;
  milestones: LadrMilestone[];
  targetPaygrade: number | null;
  checklist: Checklist;
  onChange: (next: Checklist) => void;
  onSave: () => void;
  saving: boolean;
}

const CATEGORY_LABELS: Record<LadrCategory, string> = {
  qual_warfare: "Warfare qualifications",
  pme_required: "PME — required",
  qual_rate_specific: "Rate-specific qualifications",
  qual_watchstanding: "Watchstanding qualifications",
  skill_training_required: "Skill training — required",
  credential: "Credentials",
  education_degree: "Education — degree",
  nec_opportunity: "NEC opportunities",
  pme_recommended: "PME — recommended",
  skill_training_recommended: "Skill training — recommended",
  advancement_consideration: "E7+ advancement considerations (board emphasis)",
  career_milestone: "Career milestones",
  billet_recommended: "Recommended billets",
};

const STATUS_OPTIONS: Array<[LadrStatus, string]> = [
  ["met", "Met"],
  ["not_met", "Not met"],
  ["na", "N/A"],
];

/** The source's own sorting of candidates (scripts/ladr-data/advancement.ts). */
type Tier = "fully_qualified" | "best_qualified";

const TIER_LABELS: Record<Tier, string> = {
  fully_qualified: "Fully qualified",
  best_qualified: "Best qualified",
};

/** Tier groups in source order; `null` holds rows the LaDR prints no tier for. */
const TIER_ORDER: Array<Tier | null> = [
  null,
  "fully_qualified",
  "best_qualified",
];

/** A `detail` string, or null when absent/blank — never a placeholder. */
function detailText(m: LadrMilestone, key: string): string | null {
  const v = m.detail?.[key];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * `detail.examples` — the whole parenthetical lists, verbatim. They are NOT
 * split into per-code chips: the transcription keeps each parenthetical intact
 * (tests/unit/ladrAdvancementData.test.ts asserts every example is a literal
 * substring of `notes`) and a comma split would mangle "Combat System Watch
 * Officer (CSWO)" into fragments the LaDR never printed.
 */
function detailExamples(m: LadrMilestone): string[] {
  const v = m.detail?.examples;
  return Array.isArray(v)
    ? v.filter((e): e is string => typeof e === "string" && e.trim() !== "")
    : [];
}

/** The tier the source prints, or null — BM's `unspecified` invents no badge. */
function tierOf(m: LadrMilestone): Tier | null {
  const t = detailText(m, "tier");
  return t === "fully_qualified" || t === "best_qualified" ? t : null;
}

/** "E-3" · "E-4–E-6" (contiguous run) · "E-3, E-5" (gapped). */
function paygradeLabel(paygrades: number[]): string {
  const pg = Array.from(new Set(paygrades)).sort((a, b) => a - b);
  if (pg.length === 0) return "";
  if (pg.length === 1) return `E-${pg[0]}`;
  const last = pg[pg.length - 1];
  return last - pg[0] === pg.length - 1
    ? `E-${pg[0]}–E-${last}`
    : pg.map((n) => `E-${n}`).join(", ");
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="apex-card p-8 text-center">
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        {message}
      </p>
    </div>
  );
}

export default function LadrChecklist({
  document,
  milestones,
  targetPaygrade,
  checklist,
  onChange,
  onSave,
  saving,
}: LadrChecklistProps) {
  if (!document) {
    return (
      <EmptyCard message="Select your rating on the Record Entry tab to load the LaDR checklist." />
    );
  }
  if (targetPaygrade == null) {
    return (
      <EmptyCard message="Select a target paygrade on the Record Entry tab to filter the LaDR checklist." />
    );
  }
  const target = targetPaygrade;

  const applicable = milestones.filter(
    (m) =>
      m.applies_to_paygrades.length > 0 &&
      Math.min(...m.applies_to_paygrades) <= target,
  );

  // Paygrade block = the first paygrade the LaDR lists the item at, which is
  // also the applicability key. Highest first, so the block that is the gate
  // for the target leads and the earlier blocks read as history.
  const byBlock = new Map<number, LadrMilestone[]>();
  for (const m of applicable) {
    const block = Math.min(...m.applies_to_paygrades);
    byBlock.set(block, [...(byBlock.get(block) ?? []), m]);
  }
  const blocks = Array.from(byBlock.keys()).sort((a, b) => b - a);

  // v1.4: milestones ingested by the on-demand Navy COOL fetch are flagged
  // auto_extracted — surface that they should be verified against the PDF.
  const hasAutoExtracted = applicable.some(
    (m) => m.detail?.source === "auto_extracted",
  );

  // sea_shore_scope "rating" is a rating-wide note by definition — the LaDR
  // prints it once and the transcription copies it onto every step's rows. HM's
  // is 2,715 characters, so scoping it to a card would print it three times to
  // an E-9 candidate. Once, above the blocks.
  const ratingSeaShore = Array.from(
    new Set(
      applicable
        .filter((m) => detailText(m, "sea_shore_scope") === "rating")
        .map((m) => detailText(m, "sea_shore"))
        .filter((s): s is string => s !== null),
    ),
  );

  const setStatus = (id: string, status: LadrStatus) => {
    const next = { ...checklist };
    if (status === "unanswered") delete next[id];
    else
      next[id] = {
        status,
        verified_in_ompf:
          status === "met" ? (next[id]?.verified_in_ompf ?? false) : false,
      };
    onChange(next);
  };

  const setVerified = (id: string, verified: boolean) => {
    const entry = checklist[id];
    if (!entry || entry.status !== "met") return;
    onChange({ ...checklist, [id]: { ...entry, verified_in_ompf: verified } });
  };

  const renderRow = (m: LadrMilestone) => {
    const id = m.id as string;
    const entry = checklist[id];
    const status: LadrStatus = entry?.status ?? "unanswered";
    const notes = detailText(m, "notes");
    const examples = detailExamples(m);
    // BM's section IS its sea/shore guidance, so the assignment heading the
    // bullet is printed under lives per row (detail.sea_shore_scope === "row").
    const group = detailText(m, "group");
    const course = detailText(m, "course");
    return (
      <li
        key={id}
        className="space-y-2 border-b pb-3 last:border-b-0 last:pb-0"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-[14rem] flex-1 space-y-1">
            <div>
              <span className="text-sm apex-heading">{m.item}</span>
              {m.item_code && (
                <span
                  className="ml-2 text-xs font-mono"
                  style={{ color: "var(--subtle)" }}
                >
                  {m.item_code}
                </span>
              )}
              {course && (
                <span
                  className="ml-2 text-xs font-mono"
                  style={{ color: "var(--subtle)" }}
                >
                  course {course}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="apex-badge">
                {paygradeLabel(m.applies_to_paygrades)}
              </span>
              {/* The weight gate is not a divergence from the shared
                  predicate — it mirrors service.ts's UNSCORED_CATEGORIES
                  filter, which drops zero-weight rows before emphasis is ever
                  computed. Without it the badge would claim emphasis on a row
                  the engine never scores. No dataset has such a row today. */}
              {LADR_CATEGORY_WEIGHTS[m.category] > 0 &&
                isBoardEmphasis(m, target) && (
                  <span className="apex-badge-amber">Board emphasis</span>
                )}
            </div>
          </div>
          <div
            role="radiogroup"
            aria-label={`Status for ${m.item}`}
            className="flex items-center gap-3"
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                <input
                  type="radio"
                  name={`ladr-${id}`}
                  checked={status === value}
                  onChange={() => setStatus(id, value)}
                />
                {label}
              </label>
            ))}
            {status !== "unanswered" && (
              <button
                type="button"
                className="text-xs underline"
                style={{ color: "var(--subtle)" }}
                onClick={() => setStatus(id, "unanswered")}
                aria-label={`Clear status for ${m.item}`}
              >
                Clear
              </button>
            )}
          </div>
          <label
            className="flex items-center gap-2 text-xs"
            style={{
              color: "var(--muted-foreground)",
              opacity: status === "met" ? 1 : 0.5,
            }}
          >
            <input
              type="checkbox"
              disabled={status !== "met"}
              checked={entry?.verified_in_ompf ?? false}
              onChange={(e) => setVerified(id, e.target.checked)}
              aria-label={`${m.item} verified in OMPF`}
            />
            Verified in OMPF
          </label>
        </div>
        {/* Native <details>: focusable trigger, expanded state announced, and
            it matches ResultsView.tsx. A row whose detail carries none of these
            gets no trigger at all rather than an empty panel. */}
        {(notes || examples.length > 0 || group) && (
          <details className="text-xs">
            <summary
              className="cursor-pointer"
              style={{ color: "var(--muted-foreground)" }}
              aria-label={`What the LaDR says about ${m.item}`}
            >
              What the LaDR says
            </summary>
            <div
              className="mt-2 space-y-2 break-words"
              style={{ color: "var(--muted-foreground)" }}
            >
              {group && <p className="font-semibold">{group}</p>}
              {/* Untruncated and pre-line: BM's bullets and HM's sub-bullet are
                  newline-separated inside one verbatim string. */}
              {notes && <p className="whitespace-pre-line">{notes}</p>}
              {examples.length > 0 && (
                <div>
                  <p className="font-semibold">Named in the LaDR:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {examples.map((ex) => (
                      <li key={ex} className="font-mono">
                        {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}
      </li>
    );
  };

  const renderCategory = (cat: LadrCategory, rows: LadrMilestone[]) => {
    const weight = LADR_CATEGORY_WEIGHTS[cat];
    // The LaDR prints its "Considerations for advancement" section once per
    // service component (Active / TAR / SELRES) with materially different
    // criteria, and only one is seeded. Name the transcribed component here:
    // these rows carry the heaviest weight in the table, so a Reserve Sailor
    // must not be scored against Active criteria without knowing it.
    const sourceComponents = Array.from(
      new Set(
        rows
          .map((m) => detailText(m, "component"))
          .filter((c): c is string => c !== null),
      ),
    );
    // sea_shore is a property of the advancement step, not of the row — every
    // row in this card carries the same string, so it renders once per card
    // rather than in each row's disclosure. Rating-scoped notes are excluded:
    // they are not step-specific and are hoisted to the top of the checklist.
    const seaShore = Array.from(
      new Set(
        rows
          .filter((m) => detailText(m, "sea_shore_scope") !== "rating")
          .map((m) => detailText(m, "sea_shore"))
          .filter((s): s is string => s !== null),
      ),
    );
    const tierGroups = TIER_ORDER.map(
      (t) => [t, rows.filter((m) => tierOf(m) === t)] as const,
    ).filter(([, rs]) => rs.length > 0);
    const hasFullyQualified = tierGroups.some(
      ([t]) => t === "fully_qualified",
    );
    // A step-level preamble (HM) resolves onto every row of both tiers; a
    // tier-level one (IT's Best Qualified lead-in) onto one tier's rows. Print
    // each distinct string once, under the first tier that carries it.
    const printed = new Set<string>();
    return (
      <section key={cat} className="apex-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
            {CATEGORY_LABELS[cat]}
          </h3>
          {weight > 0 ? (
            <span className="apex-badge-amber">weight {weight}</span>
          ) : (
            <span className="apex-badge-draft">not scored</span>
          )}
        </div>
        {sourceComponents.length > 0 && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Transcribed from <strong>{sourceComponents.join("; ")}</strong>. The
            LaDR prints different criteria for other service components — if you
            are TAR or SELRES, verify these against your own career path in the
            source LaDR before answering.
          </p>
        )}
        {seaShore.map((text) => (
          <details key={text} className="text-xs">
            <summary
              className="cursor-pointer"
              style={{ color: "var(--muted-foreground)" }}
            >
              Sea/shore assignment considerations
            </summary>
            <p
              className="mt-2 whitespace-pre-line break-words"
              style={{ color: "var(--muted-foreground)" }}
            >
              {text}
            </p>
          </details>
        ))}
        {tierGroups.map(([tier, rs]) => {
          const preamble =
            rs.map((m) => detailText(m, "preamble")).find(Boolean) ?? null;
          const showPreamble = preamble !== null && !printed.has(preamble);
          if (preamble !== null) printed.add(preamble);
          return (
            <div key={tier ?? "untiered"} className="space-y-2">
              {tier && (
                <h4 className="flex items-baseline gap-2 flex-wrap">
                  <span
                    className={
                      tier === "best_qualified"
                        ? "apex-badge-emerald"
                        : "apex-badge"
                    }
                  >
                    {TIER_LABELS[tier]}
                  </span>
                  {/* Editorial claim 1 of 3 (see the file header). Best
                      Qualified is a superset of Fully Qualified, not an
                      alternative to it — the sources say so themselves (IT
                      prints it as the Best Qualified preamble below; HM prints
                      "Must meet preceding E7 FULLY QUALIFIED criteria" as an
                      E8 row) — but a Sailor who reads two headings and picks
                      one chases the wrong things, so the relationship is
                      stated on the heading too. */}
                  {tier === "best_qualified" && hasFullyQualified && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      in addition to the Fully qualified list above — not
                      instead of it
                    </span>
                  )}
                </h4>
              )}
              {showPreamble && (
                <p
                  className="text-xs whitespace-pre-line break-words"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {preamble}
                </p>
              )}
              <ul className="space-y-3">{rs.map(renderRow)}</ul>
            </div>
          );
        })}
      </section>
    );
  };

  const renderBlock = (block: number) => {
    const rows = byBlock.get(block) ?? [];
    const byCategory = new Map<LadrCategory, LadrMilestone[]>();
    for (const m of rows)
      byCategory.set(m.category, [...(byCategory.get(m.category) ?? []), m]);
    const categories = Array.from(byCategory.keys()).sort(
      (a, b) =>
        LADR_CATEGORY_WEIGHTS[b] - LADR_CATEGORY_WEIGHTS[a] ||
        a.localeCompare(b),
    );
    return (
      <section key={block} className="space-y-3">
        <h2 className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider gold-accent">
            E-{block}
          </span>
          <span
            className="text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            {/* The block key is min(applies_to_paygrades), so an earlier block
                can still hold rows the LaDR lists AT the target — IT's CANES
                PQS is [4,5,6], block E-4, live at E-5. "Behind you" is only
                true when every row in the block stops short of the target;
                otherwise the header states the block and claims nothing. */}
            {block === target
              ? `the gate for E-${target}`
              : rows.every((m) => Math.max(...m.applies_to_paygrades) < target)
                ? `first listed at E-${block} — behind you at E-${target}`
                : `first listed at E-${block}`}
          </span>
        </h2>
        {categories.map((cat) =>
          renderCategory(cat, byCategory.get(cat) ?? []),
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <p className="apex-page-subtitle">
        {document.rating_name} ({document.rating_abbrev}) LaDR ·{" "}
        {document.version} ·{" "}
        <a
          href={document.source_url}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          source
        </a>{" "}
        · showing items applicable up to E-{target}, grouped by the paygrade
        block the LaDR first lists them at. Unanswered items lower scoring
        confidence; they never count as not-met.
      </p>

      {hasAutoExtracted && (
        <p
          role="note"
          className="text-xs border-l-2 pl-3"
          style={{
            color: "var(--muted-foreground)",
            borderColor: "var(--accent-gold)",
          }}
        >
          Some items were auto-extracted from the official PDF — verify them
          against the source document before relying on them.
        </p>
      )}

      {ratingSeaShore.map((text) => (
        <details key={text} className="text-xs apex-card p-4">
          <summary
            className="cursor-pointer"
            style={{ color: "var(--muted-foreground)" }}
          >
            Sea/shore — rating-level note, not specific to any one step
          </summary>
          <p
            className="mt-2 whitespace-pre-line break-words"
            style={{ color: "var(--muted-foreground)" }}
          >
            {text}
          </p>
        </details>
      ))}

      {applicable.length === 0 ? (
        <EmptyCard message="No applicable LaDR items for this rating and target paygrade." />
      ) : (
        blocks.map(renderBlock)
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="apex-btn-primary disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save checklist"}
        </button>
      </div>
    </div>
  );
}
