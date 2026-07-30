/**
 * "Considerations for advancement" transcription helper (LaDR career-path
 * pages) — shared by the curated rating datasets.
 *
 * WHAT THIS ENCODES
 * Every Navy LaDR ends its career-path pages with "Considerations for
 * advancement from E6 to E7 / E7 to E8 / E8 to E9". That section is where a
 * CPO board's selection emphasis actually lives, which is why
 * LADR_CATEGORY_WEIGHTS gives `advancement_consideration` the heaviest weight
 * (30). Rows built here are verbatim transcriptions of that section — nothing
 * is summarized away: `item` is an editorial short label for the checklist UI,
 * `detail.notes` carries the source sentence unmodified, and
 * `detail.examples` keeps every parenthetical list whole.
 *
 * applies_to_paygrades — [target paygrade of the step]. "…from E6 to E7"
 * describes what an E6 must show to be selected for E7, so it is encoded [7],
 * matching the dataset convention that a row carries the paygrade it is a
 * gate *for* (cf. it_e1_e9.ts "CPO Selectee Leadership Course" → [7]). The
 * applicability rule in lib/boardConfidence/service.ts is
 * min(applies_to_paygrades) <= target_paygrade, so [7] surfaces for an E6
 * targeting E7 (target 7) and, cumulatively, for E8/E9 targets — which the
 * source itself endorses ("Must meet preceding E7 FULLY QUALIFIED criteria").
 * Encoding the *printed* block instead ([6]) would leak E7 criteria to an E5
 * targeting E6, which is wrong.
 *
 * Component — the sections repeat once per service component (Active,
 * TAR/Full Time Support, SELRES) with materially different text. Only the
 * ACTIVE component is transcribed; the data model has no component dimension
 * and merging them would show a Sailor criteria that do not apply. See each
 * dataset's header for the component heading transcribed.
 */
import type { LadrSeedMilestone } from "../seed-ladr";

/**
 * The source's own sorting of candidates. `unspecified` is used verbatim-
 * honestly for LaDRs (e.g. BM) whose section is organized by assignment type
 * and prints no Fully/Best Qualified split — the tier is NOT inferred.
 */
export type ConsiderationTier =
  "fully_qualified" | "best_qualified" | "unspecified";

export interface ConsiderationStep {
  /** Verbatim step heading, e.g. "E6 to E7". */
  step: string;
  /** Target paygrade of the step — the value that goes in applies_to_paygrades. */
  paygrade: number;
  /** Verbatim career-path page heading identifying the service component. */
  component: string;
  /**
   * Verbatim sea/shore assignment guidance printed for this step. Null only
   * when the LaDR prints none under the section (then `preamble`/the dataset
   * header explains what the source does instead) — never invented.
   */
  seaShore: string | null;
  /**
   * Where `seaShore` is printed: under the step's own heading ("step",
   * default), or as a rating-level note the section does not repeat per step
   * ("rating" — HM), or "row" when the section's whole content IS the
   * sea/shore guidance and it therefore lives per row in detail.group +
   * detail.notes (BM). Surfaced as detail.sea_shore_scope so the text is never
   * mistaken for step-specific guidance.
   */
  seaShoreScope?: "step" | "rating" | "row";
  /** Verbatim lead-in sentence(s) the section prints above the tiers, if any. */
  preamble?: string;
  /**
   * Verbatim lead-in the source prints above ONE tier's bullets — IT's
   * "Best Qualified Candidates: … as well as those from the Fully Qualified
   * list.", the only place the LaDR states that BQ is a superset of FQ rather
   * than an alternative to it. Resolved into detail.preamble, most specific
   * first, so an FQ row never carries the BQ heading's text.
   */
  tierPreamble?: Partial<Record<ConsiderationTier, string>>;
  /** "Revised: <Month YYYY>" footer of the transcribed career-path pages. */
  pageRevision: string;
}

export interface ConsiderationRow {
  /** Short scannable checklist label (editorial). Full text lives in detail.notes. */
  item: string;
  tier: ConsiderationTier;
  /** The source bullet, verbatim and untruncated. */
  notes: string;
  /** Parenthetical example lists, each kept whole and verbatim. */
  examples?: string[];
  /** Assignment grouping the source prints the bullet under (BM's a./b./c. …). */
  group?: string;
}

const TIER_TAG: Record<ConsiderationTier, string> = {
  fully_qualified: "FQ",
  best_qualified: "BQ",
  unspecified: "",
};

/**
 * Build the `advancement_consideration` milestones for one paygrade step.
 * `item` is prefixed with the step (and tier, when the source prints one) so
 * the checklist stays readable: an E9 target sees the E7, E8 and E9 steps at
 * once, and LadrChecklist.tsx renders `item` only.
 */
export function considerations(
  step: ConsiderationStep,
  rows: ConsiderationRow[],
): LadrSeedMilestone[] {
  return rows.map((row) => {
    const tag = TIER_TAG[row.tier];
    const preamble = step.tierPreamble?.[row.tier] ?? step.preamble;
    return {
      category: "advancement_consideration" as const,
      item: `${step.step} ${tag ? `${tag} ` : ""}— ${row.item}`,
      item_code: null,
      applies_to_paygrades: [step.paygrade],
      detail: {
        // Transcribed from the source PDF — deliberately NOT "representative"
        // (docs/BOARD-CONFIDENCE.md) and NOT "auto_extracted" (ladrFetch.ts).
        source: "transcribed",
        board_emphasis: true,
        component: step.component,
        step: step.step,
        tier: row.tier,
        notes: row.notes,
        ...(row.examples ? { examples: row.examples } : {}),
        ...(row.group ? { group: row.group } : {}),
        sea_shore: step.seaShore,
        sea_shore_scope: step.seaShoreScope ?? "step",
        ...(preamble ? { preamble } : {}),
        source_page_revision: step.pageRevision,
      },
    };
  });
}
