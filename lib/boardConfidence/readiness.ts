// lib/boardConfidence/readiness.ts
//
// v2 readiness layer — epic §3.4b, revised 2026-07-29 after the domain review of
// PR #21 returned BLOCKER. Pure: no I/O, no clock reads, no randomness. This
// sits ABOVE the rubric and changes none of its arithmetic.
//
// It exists because the composite alone cannot tell "we have no data" apart from
// "the record is bad": rubric.ts computes contribution = (weight/100)·S·conf and
// thresholds the sum against fixed bands with no renormalization by
// Σ(weight·conf), so conf = 0 and S = 0 are numerically identical.
//
// The domain review's finding was that the arithmetic was sound and the
// SENTENCES BOLTED TO IT were not. Every string below is gated on the data that
// actually supports it, because each of these was measured firing wrongly:
//   - a three-year Sailor with a perfect record told they had reporting gaps
//     (statusOf read f.score, which carries the leading-span penalty that v1.5
//     deliberately stopped treating as a real break — rubric.ts:374-389);
//   - a Sailor with four years of sea duty told that "little of what this cycle's
//     precept emphasizes" was in their record, from a precept APEX modeled;
//   - "the weakest part of what APEX can see" fired on performance while
//     leadership scored 32 points lower — a comparison nothing computes.

import {
  bandDeltas,
  monthsBefore,
  type BandDelta,
} from "@/lib/boardConfidence/rubric";
import {
  BOARD_DISCLAIMER,
  type BandVote,
  type FactorKey,
  type FactorResult,
  type LadrItemInput,
  type PreceptFlag,
  type RubricConfig,
  type RubricInputs,
  type RubricResult,
} from "@/lib/boardConfidence/types";

// ---------------------------------------------------------------------------
// Tunable constants — exported because every one is an assertion, not a
// measurement, and the domain reviewer must be able to move them.
// ---------------------------------------------------------------------------

/**
 * RETIRED as a gate. The aggregate coverage floor is gone; the per-factor
 * AREA_EVIDENCE_FLOOR below is the only gate.
 *
 * WHY, CORRECTED. An earlier revision of this note claimed the floor had been
 * withholding assessable records on `main` — a four-report record with the full
 * PSR entered and only the trait averages missing, "coverage 0.7455, withheld,
 * nothing blind". That is FALSE about `main`, and the way it is false matters:
 *
 *   main:  coverage 0.8444  ->  SCORED 57.7
 *   here:  coverage 0.7455  ->  would be withheld by a 0.75 floor
 *
 * `main` never withheld it. `coverage.measured` is the sum of weight*confidence
 * over the EFFECTIVE verdict weights, and this change set zeroes three of the
 * six — a different formula over a different denominator. The SAME record moves
 * from 0.8444 to 0.7455 because of the weight change, not because anything about
 * the Sailor changed, and the old note then cited that self-inflicted drop as
 * proof the floor was mis-calibrated. Circular, and it was the stated
 * justification for deleting a safety gate.
 *
 * The real reason survives the correction and is simpler: 0.75 was fitted against
 * a coverage formula that no longer exists. A constant calibrated on a six-factor
 * denominator and re-used unchanged against a three-factor one is not a threshold
 * any more, it is a number that happens to sit somewhere. Re-fitting it has no
 * target — the defect it protected against ("at most a quarter of the weighted
 * record may be scored as zeros it did not earn") cannot occur now that the
 * composite renormalizes by the sum of weight*confidence. The per-factor rule
 * below is the substantive protection and always was; an aggregate floor on top
 * of it was a second independently-fitted assertion, and once the denominator
 * moved it was the one doing damage.
 *
 * AND THE DELETION IS NOT WHAT RESCUES ANYONE. The records `main` actually
 * withheld are suppressed there by `development` confidence 0 tripping the
 * blind-spot gate — a TOOL gap for 80 of 82 ratings, not a fact about the Sailor
 * — and development now carries no weight, so it cannot blind anything. That is
 * the denominator change plus VERDICT_FACTORS doing the work.
 *
 * HOW BIG that effect is depends entirely on the generator, and an earlier
 * revision of this note reported "889 newly scored, 0 newly withheld, a strict
 * widening" as though it were a property of the change. It is not. The zero came
 * from one seed: the SAME generator at another seed gives 635 / 513, a realistic
 * one (hosted board_precepts empty, curated LaDR for 4 of 82 ratings) gives
 * 5993 / 0, and the reviewer's gives 725 / 1158. Any figure here is a
 * measurement of a generator, never of the change.
 *
 * No generator is needed to refute "strict widening" — two hand-built records do
 * it, run against origin/main and this branch:
 *
 *   tours blanked, everything else entered, no precept
 *       main SCORED 65.7  ->  here WITHHELD
 *   everything entered, LaDR empty (development conf 0)
 *       main WITHHELD     ->  here SCORED 62.5
 *
 * (Those two finals are from one hand-built pair measured against origin/main;
 * the DIRECTIONS are the claim and they are what no generator can wash out.)
 *
 * THIS CHANGE TIGHTENS AS WELL AS WIDENING, by two mechanisms that are both
 * deliberate safety work in this same PR: AREA_EVIDENCE_FLOOR 0.25 -> 0.50
 * withholds every record whose lowest verdict-factor confidence lands in
 * [0.25, 0.50) — the section-blanking gate doing its job — and scorePrecept
 * returns an honest computable/configured here against an unconditional conf: 1
 * on main. On the seed-B run those account for 329 and 184 of the 513
 * respectively.
 *
 * The old `coverageFloor` option and `coverage.floor` field are gone with it.
 * `coverage.measured` — the number that actually matters — is unchanged and is
 * still the headline the Results screen is built around.
 */

/**
 * No score at all while any factor carrying weight sits below
 * AREA_EVIDENCE_FLOOR. A near-blind factor is a blind spot, not low coverage:
 * almost its entire weight enters the composite as points the Sailor is charged
 * for and cannot earn.
 *
 * The threshold is AREA_EVIDENCE_FLOOR rather than zero, and that is the point —
 * the same constant that already decides an AREA is unassessable now also
 * decides the COMPOSITE is. A `=== 0` test let this through, measured on a
 * returning user who changed nothing while their rating's roadmap grew from 6 to
 * 86 milestones (80 transcribed advancement_consideration rows):
 *
 *   BEFORE  dev S=100.00 conf=1.000 contrib=15.00 -> FINAL 74.9 "Competitive"
 *   AFTER   dev S=100.00 conf=0.070 contrib= 1.05 -> FINAL 59.9 "Crunch"
 *
 * Their S is still 100 and their record did not change: −15 points and a full
 * band drop because APEX learned more about their rating. conf 0.070 slipped the
 * zero test, and coverage landed at 0.80 — above COVERAGE_FLOOR — so the band
 * silently regressed. Missing data rendered as a deficiency is the exact class
 * this layer exists to eliminate.
 */
export const BLIND_SPOT_GATE = true;

/**
 * A factor whose own confidence is below this is reported as `not_enough_entered`
 * rather than graded, and (per BLIND_SPOT_GATE) also suppresses the composite.
 * Performance with a single report has conf ≈ 0.12–0.23; calling that "needs
 * attention" is noise, not a finding.
 *
 * RAISED 0.25 → 0.50, and the value is the RULE, not a fit: an area must be at
 * least HALF observed before APEX will grade it. Exactly half passes; anything
 * less does not. Pinned from both sides — conf_P 0.4667 (two reports, no
 * breakout data) is withheld, conf_X 0.500 (two precept flags, one computable)
 * is scored — so the constant is bracketed to (0.4667, 0.50] by behaviour rather
 * than by a number copied out of a test run.
 *
 * WHAT THIS GATE DOES NOT DO — read before trusting it.
 *
 * It does NOT close the withholding surface, and no value of it can. The proof is
 * one line: `rsca`. A Sailor who types their reporting senior's cumulative
 * average honestly is scored against the tougher of it and the pooled peer
 * average; one who leaves it blank is not. Measured, SGA present:
 *
 *   rsca typed honestly (4.4)   score 60.6   coverage 1.0000
 *   rsca left blank             score 71.4   coverage 1.0000
 *
 * +10.8 with EVERY factor confidence identical. A removal that changes no
 * confidence cannot be seen by a threshold on confidence, whatever the threshold
 * is. That is the whole argument, and it is why the fix for `rsca` was to delete
 * the input from scoring (rubric.ts P2) rather than to tune this constant. That
 * deletion is not free — RSCA is a printed field (NAVPERS 1616/27 Block 44) and
 * the FY-27 precept directs the comparison — see rubric.ts P2 for what is lost.
 *
 * The granularity argument is the weaker, more general version of the same
 * point: this gate reads a FACTOR's confidence, while the exploit removes a
 * SUB-COMPONENT, and sub-components are strictly smaller than their containers.
 * Removable units, with the confidence each leaves behind — note the N-dependence,
 * which an earlier revision of this note dropped by generalising one measured
 * record at N >= 4 into a table:
 *
 *   leadership: tours (L1+L3)     conf_L 0.30   (any N)
 *   leadership: awards (L2)       conf_L 0.70   (any N)
 *   performance: trait averages   conf_P 0.65 at N>=4, 0.5000 at N=3, 0.3333 at N=2
 *   performance: summary group    conf_P 0.85 at N>=4, 0.7000 at N=3
 *   precept: the LaDR             conf_X 1.0 -> 0.4 on a five-flag precept
 *   precept: tours                conf_X 1.0 -> 0.6, while S_X RISES 70.0 -> 100.0
 *   rsca                          no confidence signature at all
 *
 * At N >= 4 a floor in (0.30, 0.70] catches the tours removal and leaves awards;
 * push past 0.70 and it starts rejecting a merely UNLINKED summary group at 0.85.
 * At N = 3 those two constraints meet exactly at 0.70 and the window between them
 * closes entirely; at N = 2 every listed removal is already caught. So the
 * separable interval is not even a fixed target — it moves with the number of
 * reports. And the precept factor steps in units of 1/|flags| — 0.2 on a
 * five-flag precept, FINER than the 0.30/0.70 leadership split the whole
 * granularity argument was built on, with the second row raising the factor's
 * score while lowering its confidence.
 *
 * So there is nothing to tune toward. Closing this class needs a mechanism that
 * is not a threshold on `conf`: either delete the self-reported input (what was
 * done for `rsca`, and the only complete fix available) or corroborate it against
 * a source APEX does not have — see the withholding proof on scoreBoardConfidence.
 *
 * This gate remains a MITIGATION with a measured ceiling. It catches the largest
 * single-section removal in the leadership factor. It does not catch blanking
 * awards, unlinking a summary group, deleting a weak report, or omitting adverse
 * material. All are published with numbers in
 * tests/unit/boardConfidenceWithholding.test.ts.
 */
export const AREA_EVIDENCE_FLOOR = 0.5;

/** S_f cut points for the graded statuses. Assertions, not calibration. */
export const AREA_STATUS_THRESHOLDS = { strong: 80, on_track: 55 } as const;

// ---------------------------------------------------------------------------
// Contract (epic §3.4b as revised), plus additive fields marked v2+
// ---------------------------------------------------------------------------

/**
 * `adequate` is retired. In eval vocabulary "adequate"/"satisfactory" is where
 * 3.0 lives (Meets Standards), which to an E7 candidate reads as "you will not
 * be selected". `not_enough_entered` is a DATA STATE on a separate axis — never
 * the bottom rung of the graded scale.
 */
export type AreaStatus = "strong" | "on_track" | "needs_attention" | "not_enough_entered";

/**
 * EVIDENCE TIERS. The epic's original union ("corroborated" / "attested" /
 * "unknown") was replaced outright by the domain review, and all three were
 * wrong:
 *
 *   - Nothing here is "corroborated". Evals are selected
 *     `.eq("created_by", subjectUserId)` (subject-drafted); "finalized" is an
 *     APEX workflow state with no OMPF relationship; `rsca` is self-typed into
 *     member_board_records.eval_context; `verified_in_ompf` is a self-ticked box;
 *     the precept is modeled; only 2 of 82 ratings have a verified LaDR seed.
 *   - "Attested" reads STRONGER than "the Sailor typed it" and collides with the
 *     existing PSR attestation checkbox.
 *   - "Unknown" reads as a negative finding rather than a data state.
 *
 * Only `performance` may ever be `peer_compared`, and only against a group with
 * someone else in it — continuity touches NO peer data at all, so tagging it
 * from another factor's inputs is fabricated provenance. These are three
 * provenance labels, never a quality ladder.
 */
export type EvidenceTier = "self_reported" | "peer_compared" | "not_entered";

export type ActionHorizon = "before_board" | "next_cycle" | "blocked";

/** How `horizon` was decided — so the UI never implies a duration APEX guessed. */
export type HorizonBasis =
  | "blocked_unless"     // ladr_milestones.detail.blocked_unless is set
  | "typical_months"     // a real duration was compared to monthsToBoard
  | "administrative"     // answering a checklist row — no duration to estimate
  | "unknown_duration";  // no typical_months: "start now", and say we don't know

export interface ReadinessAction {
  id: string;
  action: string;
  // Narrowed from the wider forward-looking contract (`FactorKey`, and a
  // three-way source kind): with the verification flips removed every action is
  // a LaDR row, so `record_field` and `eval` were unreachable. Widen both again
  // when non-LaDR candidates return in P1b.
  area: "development";
  worth: number;                 // marginal composite points, from bandDeltas()
  horizon: ActionHorizon;
  blockedBy: string | null;
  source: { kind: "ladr_milestone"; id: string };
  horizonBasis: HorizonBasis;    // v2+
}

export interface ReadinessArea {
  key: FactorKey;
  label: string;
  status: AreaStatus;
  evidence: EvidenceTier;
  evidenceLabel: string;         // v2+ — the UI string for the tier
  summary: string;               // plain language — NO engine internals
  evidenceNote: string;          // v2+ — provenance, rendered inline not in a tooltip
  detail: FactorResult;          // behind "show the math"
}

export interface ReadinessReport {
  coverage: {
    measured: number;            // Σ(w·conf)/100 in [0,1]
    areasKnown: number;
    areasTotal: number;
    missing: Array<{ area: FactorKey; label: string; unlocks: string; howTo: string }>;
  };
  actions: ReadinessAction[];
  areas: ReadinessArea[];
  boardDate: string;
  monthsToBoard: number;
  score: { value: number; band: BandVote; label: string } | null;
  /** v2+ — plain-language reason `score` is null. Null when a score was emitted. */
  scoreNote: string | null;
  /**
   * v2+ — UNSCORED. Entries the Sailor has ticked met/earned but not yet
   * confirmed in their OMPF. Deliberately carries no `worth`: see BandDeltaKind.
   */
  confirmInOmpf: { count: number; items: string[]; note: string } | null;
  /** v2+ — §1.1 normative text; types.ts:5-7 requires it on every results view. */
  disclaimer: string;
}

export interface ReadinessOptions {
  /**
   * The caller's "today", YYYY-MM-DD. The engine reads no clock; a route passes
   * this in. NOTE the brief specified monthsToBoard "from boardDate and the run's
   * T" — but in this engine T IS inputs.boardDate (types.ts:94), so that is
   * always 0. Absent or malformed, this falls back to the board date itself,
   * giving monthsToBoard = 0 so nothing is promised as achievable. An earlier
   * revision defaulted to the latest evaluation period_to, which is always in the
   * past and therefore OVERSTATES the time remaining — it failed unsafe.
   */
  asOf?: string;
  /**
   * `board_precepts.source_url` for the active precept. Null/absent means the
   * emphasis flags were entered by hand rather than taken from a convening
   * order, and every precept string is prefixed to say so. Defaulting to null is
   * deliberate: a caller that does not pass it gets the cautious rendering.
   */
  preceptSourceUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Plain-language copy. A data table on purpose: these strings are what the
// domain reviewer rewrites, and none of them should require reading code.
// No engine internals (P1..P4, aP, wSum, coveredDays, availableSubweight) may
// appear here — those stay in `detail` behind "show the math".
//
// No string may assert a comparison the engine does not compute (no "your
// weakest area" — nothing ranks areas against each other) or describe content
// APEX has not read (no "what this cycle's precept emphasizes" — see below).
// ---------------------------------------------------------------------------

type AreaCopy = {
  label: string;
  missingLabel: string;
  unlocks: string;
  howTo: string;
  // Partial by design: not every area can reach every status.
  statuses: Partial<Record<AreaStatus, string>>;
};

const AREA_COPY: Record<FactorKey, AreaCopy> = {
  performance: {
    label: "Performance",
    missingLabel: "your evaluations",
    unlocks: "performance assessment",
    howTo: "Finalize your evaluations under Evaluations, then run the review again.",
    statuses: {
      strong: "Your recent reports sit at the top of what this rubric measures.",
      on_track: "Your recent reports are solid, without standing out from the middle.",
      needs_attention:
        "Your recent reports score low against this rubric's promotion-recommendation and trait scales.",
      not_enough_entered:
        "APEX holds too few finalized reports to say anything about your performance.",
    },
  },
  leadership: {
    label: "Leadership and impact",
    missingLabel: "your tours and awards",
    unlocks: "leadership assessment",
    howTo: "Record Entry tab — add your tours and your awards.",
    statuses: {
      strong: "Your tours and awards show sustained leadership and sea time.",
      on_track: "Your tours and awards show leadership, with room to add more.",
      needs_attention:
        "The tours and awards you have entered show few leadership billets and little sea time.",
      not_enough_entered: "You have not entered any tours or awards yet.",
    },
  },
  development: {
    label: "Professional development",
    missingLabel: "your development checklist",
    unlocks: "your development plan",
    howTo: "LaDR Checklist tab — answer every row, including the ones that do not apply.",
    statuses: {
      strong: "You have closed most of the milestones your rating's roadmap lists.",
      on_track: "You have closed some of your rating's milestones and several are still open.",
      needs_attention: "Most of the milestones your rating's roadmap lists are still open.",
      // not_enough_entered is supplied by developmentNotEnough(): the honest
      // sentence depends on whether APEX holds a roadmap at all, and a fixed
      // string blamed returning users for rows that did not exist last time.
    },
  },
  continuity: {
    // Status here keys on recordGapCount, NEVER on the factor score: the score
    // carries a penalty for the span before a Sailor's first report, which is
    // not a break in anyone's record. v1.5 already separated the two
    // (rubric.ts:374-389) and this layer must not re-merge them.
    label: "Reporting continuity",
    missingLabel: "your reporting periods",
    unlocks: "the reporting continuity check",
    howTo:
      "Under Evaluations, finalize any report you have not entered yet. If a period is genuinely missing from your official record, your command's admin office files the correction — APEX cannot.",
    statuses: {
      strong: "APEX found no break between the reports you have entered.",
      on_track:
        "APEX found no break between the reports you have entered, and does not yet hold a full five years of them.",
      needs_attention:
        "There is a break between the reports you have entered. Check BOL and NSIPS, and be ready to explain it.",
      not_enough_entered: "APEX holds no reporting periods, so continuity cannot be checked.",
    },
  },
  completeness: {
    // NEVER `needs_attention`. This is the one area whose every string is a
    // statement about ENTRY VOLUME rather than about a record — and the Results
    // screen's coverage card promises, directly above these cards, that "nothing
    // below is a grade on what you have not entered." A NEEDS ATTENTION pill
    // reading "Large parts of your record are not entered yet" three cards down
    // is exactly that grade, printed under its own contradiction.
    //
    // The asymmetry was structural, not accidental: this factor reports conf = 1
    // whether or not anything is behind it (scoreCompleteness), so the ONE area
    // that is purely a data-entry measure was the one guaranteed to be graded
    // rather than excluded. Development's absence renders "Not entered";
    // completeness's absence rendered "Needs attention". Same cause, opposite
    // treatment. Below the on_track cut it is now a data state, and it joins
    // coverage.missing so the plan asks for the sections instead.
    label: "Record completeness",
    missingLabel: "your record sections",
    unlocks: "the record completeness check",
    howTo: "Record Entry tab — fill in every section.",
    statuses: {
      strong: "Almost everything APEX asks for is entered.",
      on_track: "Most of your record is entered; some sections are still empty.",
      not_enough_entered:
        "You have not entered enough of your record yet for APEX to check it against what a board looks at.",
    },
  },
  precept: {
    // "Alignment" overclaims: APEX maps five booleans to five crude indicators.
    // No string here describes what the board emphasizes, because a precept
    // carrying source_url: null is modeled rather than transcribed, and
    // asserting its content would put invented doctrine in front of a Sailor.
    // (v1.6: the modeled FY27 seed row is deleted — scripts/set-precept.ts is
    // now the only writer, and it refuses the placeholder cycle.) See
    // PRECEPT_UNSOURCED_PREFIX.
    label: "Board emphasis areas",
    missingLabel: "the board emphasis areas",
    unlocks: "the board emphasis check",
    howTo:
      "An APEX Admin loads the board emphasis areas for your cycle. Until then APEX leaves this out of the review.",
    statuses: {
      strong: "Your record covers the emphasis areas APEX is set up to look for.",
      on_track: "Your record covers some of the emphasis areas APEX is set up to look for.",
      needs_attention:
        "Your record covers few of the emphasis areas APEX is set up to look for.",
      not_enough_entered:
        "APEX cannot check the emphasis areas: either none are loaded, or your record does not yet contain what they are measured from.",
    },
  },
};

const EVIDENCE_LABEL: Record<EvidenceTier, string> = {
  self_reported: "From your entries",
  peer_compared: "From your entries, compared to your summary group",
  not_entered: "Not entered",
};

const EVIDENCE_NOTE: Record<EvidenceTier, string> = {
  self_reported:
    "You entered this. APEX has not checked it against your OMPF, PSR, or NSIPS.",
  peer_compared:
    "You entered this. The comparison uses evaluations other APEX users entered for the same summary group — those are not checked against any official record either.",
  not_entered: "You have not entered this yet, so APEX left it out.",
};

/**
 * Precept strings are prefixed unless the active precept cites a source. The
 * shipped seed is hand-set booleans titled "(modeled)" with source_url: null.
 */
export const PRECEPT_UNSOURCED_PREFIX =
  "Emphasis areas are entered by an APEX Admin and are not taken from the board's convening order. ";


// ---------------------------------------------------------------------------

const byKey = (result: RubricResult): Record<FactorKey, FactorResult> =>
  Object.fromEntries(result.factors.map((f) => [f.key, f])) as Record<FactorKey, FactorResult>;


/**
 * Does this area rest on ANY underlying row? Confidence alone cannot answer it:
 * continuity, completeness and precept all report conf = 1 whether or not there
 * is anything behind them, which is the miniature of the bug this file contains.
 *
 * EVERY arm reads what the engine ACTUALLY SCORED — a factor's own confidence, or
 * a value from its own detail — and never the raw `inputs` arrays. That is not a
 * style rule: scoreBoardConfidence scores a FILTERED copy of the inputs that this
 * layer never sees (future-dated reports are dropped from every factor, dateless
 * awards and tours from theirs), so the two counts diverge. Reading
 * `inputs.evals.length` told a Sailor whose ONLY report was excluded as "dated
 * after the board date" that APEX had found no break between the reports they had
 * entered — a confident claim from zero usable data, on the same screen where
 * Performance correctly reported holding too few reports. Fabricating confidence
 * is a worse failure than the pessimism this layer exists to remove.
 *
 * `inputs` is still read for preceptFlags, which the engine does not filter.
 */
function hasEvidence(key: FactorKey, result: RubricResult, inputs: RubricInputs): boolean {
  const f = byKey(result)[key];
  switch (key) {
    case "performance":
      return Number(f.detail.nObserved ?? 0) > 0;
    // leadership and development test their OWN confidence, which makes these
    // two arms provably unable to change any output at the default
    // AREA_EVIDENCE_FLOOR: hasEvidence is consulted only by statusOf, whose very
    // next non-continuity check is `confidence < AREA_EVIDENCE_FLOOR`, and
    // conf === 0 implies conf < 0.25. A mutation of either arm to `true` is an
    // EQUIVALENT mutant — no test can kill it, and none should be written to try.
    // They are kept because AREA_EVIDENCE_FLOOR is an exported tunable: set it to
    // 0 and these arms become the only thing separating "no data" from "graded".
    case "leadership":
      return f.confidence > 0;
    case "development":
      return f.confidence > 0;
    case "continuity":
      // Days actually covered by in-window reports — 0 when every report was
      // filtered out, or dated entirely outside the five-year window.
      return Number(f.detail.coveredDays ?? 0) > 0;
    case "completeness":
      // An empty record genuinely IS incomplete, so there is always something to
      // report — but see statusOf: what gets reported is a DATA STATE, never a
      // grade. Every completeness string is a statement about entry volume.
      return true;
    case "precept":
      // Same rule as every other factor: the FRACTION of the precept APEX could
      // compute, which is exactly conf_X. It used to require EVERY configured
      // flag to be computable, and that produced this epic's own defect class
      // inverted — with two flags configured and no LaDR, precept contributed
      // 3.85 weighted points to an emitted score of 64.9 while this arm returned
      // false, so the card rendered the dashed "Not entered" pill, said "APEX
      // cannot check the emphasis areas", and listed itself under Missing. APEX
      // had checked them, and the check moved the score: scored data shown as
      // missing. Now a partially-computable precept is graded like anything else,
      // and one below AREA_EVIDENCE_FLOOR blinds the whole composite rather than
      // contributing to a score while claiming to be absent.
      //
      // The length guard is NOT redundant and dropping it was a regression on
      // 100% of live runs. With no precept loaded the engine substitutes the
      // placeholder { S: 0, conf: 1, detail: { excluded: true } } (rubric.ts), so
      // `f.confidence > 0` alone is true, the confidence gate passes, and S = 0
      // falls through to `needs_attention` — telling a flawless record it
      // "covers few of the emphasis areas" about a precept that was never
      // configured. The area CARD filters on preceptConfigured, but narrative.ts
      // pushes any needs_attention area into `gaps`, so it reached the Sailor
      // under "What a board would notice": a deficiency asserted from an absence,
      // this epic's own defect class, about the one thing they cannot act on.
      // Hosted board_precepts has 0 rows.
      return inputs.preceptFlags.length > 0 && f.confidence > 0;
  }
}

function statusOf(key: FactorKey, result: RubricResult, inputs: RubricInputs): AreaStatus {
  const f = byKey(result)[key];
  if (!hasEvidence(key, result, inputs)) return "not_enough_entered";

  // Continuity is graded from the GAP COUNT, never from f.score. f.score carries
  // the leading-span penalty, which made the engine tell a three-year Sailor with
  // three consecutive Must Promotes and nothing missing that their "reporting
  // periods leave gaps a board would ask about" — measured recordGapCount 0,
  // continuityGap false, advisory null, score 45.02.
  if (key === "continuity") {
    if (Number(f.detail.recordGapCount ?? 0) > 0 || result.continuityGap)
      return "needs_attention";
    // No break — but "strong" is the token a UI paints green, and APEX holding
    // 3 of the 5 window years is not the same claim as holding all of them.
    // 0.95 is the engine's own "continuity is complete" threshold
    // (COMPLETENESS_POINTS.continuity95), reused rather than invented.
    return Number(f.detail.coverage ?? 0) >= 0.95 ? "strong" : "on_track";
  }

  // STRICTLY below, matching the blind-spot gate exactly. conf === 0.5 is
  // reachable (a two-flag precept with one computable indicator) and is graded
  // by both, so a record can never be scored while a card calls the same factor
  // "not entered". Mutating either comparison to <= breaks that agreement.
  if (f.confidence < AREA_EVIDENCE_FLOOR) return "not_enough_entered";
  if (f.score >= AREA_STATUS_THRESHOLDS.strong) return "strong";
  if (f.score >= AREA_STATUS_THRESHOLDS.on_track) return "on_track";
  // Completeness measures data entry and nothing else, so its bottom rung is a
  // data state rather than a finding — see AREA_COPY.completeness.
  return key === "completeness" ? "not_enough_entered" : "needs_attention";
}

function evidenceOf(key: FactorKey, status: AreaStatus, inputs: RubricInputs): EvidenceTier {
  if (status === "not_enough_entered") return "not_entered";
  // ONLY performance, and only against a group with someone else in it. A
  // single-member group yields a summary-group average equal to the Sailor's own
  // trait average (service.ts does not exclude the subject's own rows), which is
  // a comparison with themselves.
  const peerCompared = inputs.evals.some(
    (e) => e.summary_group_average != null && (e.group_size ?? 0) >= 2,
  );
  return key === "performance" && peerCompared ? "peer_compared" : "self_reported";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * asOf is a trust boundary — a route hands it in from a query string or a
 * client. A malformed value makes monthsBefore return NaN, and every
 * `typical_months <= NaN` comparison false, silently pushing every action to
 * next_cycle. Fall back to the board date, which promises nothing.
 */
function resolveAsOf(asOf: string | undefined, boardDate: string): string {
  if (!asOf || !ISO_DATE.test(asOf) || Number.isNaN(Date.parse(asOf))) return boardDate;
  return asOf;
}

function actionTextFor(d: BandDelta): string {
  return d.kind === "ladr_answer"
    ? // Deliberately does NOT quote the payout for answering "met": that coaches
      // the Sailor on what a self-report is worth.
      `Answer "${d.label}" on your LaDR checklist — APEX cannot score this area until it is answered either way.`
    : `Complete "${d.label}".`;
}

function horizonFor(
  d: BandDelta,
  item: LadrItemInput | undefined,
  monthsToBoard: number,
): { horizon: ActionHorizon; blockedBy: string | null; horizonBasis: HorizonBasis } {
  // Answering a checklist row is paperwork: no duration to estimate, nothing
  // that can block it.
  if (d.kind === "ladr_answer")
    return { horizon: "before_board", blockedBy: null, horizonBasis: "administrative" };
  if (item?.blocked_unless)
    return { horizon: "blocked", blockedBy: item.blocked_unless, horizonBasis: "blocked_unless" };
  const months = item?.typical_months;
  if (months == null)
    // No duration on the milestone. APEX does NOT invent one: "start now" is the
    // only advice that cannot be wrong, and horizonBasis says why.
    return { horizon: "next_cycle", blockedBy: null, horizonBasis: "unknown_duration" };
  return {
    horizon: months <= monthsToBoard ? "before_board" : "next_cycle",
    blockedBy: null,
    horizonBasis: "typical_months",
  };
}

/**
 * The development area's `not_enough_entered` sentence. A fixed string cannot be
 * honest here: "your rating's development checklist is unanswered" blames the
 * Sailor for rows that did not exist the last time they looked. APEX holds no
 * history and cannot tell "the roadmap grew" from "you never answered it", so it
 * states the counts and names both possibilities instead of picking one.
 */
function developmentNotEnough(f: FactorResult, inputs: RubricInputs): string {
  if (inputs.ladr.length === 0)
    return "APEX does not have your rating's development roadmap yet, so there is nothing to assess.";
  const answered = Number(f.detail.answered ?? 0);
  const applicable = Number(f.detail.applicable ?? 0);
  return `${answered} of ${applicable} milestones on your rating's roadmap are answered — too few for APEX to assess this area. Answer the rest either way. This list grows when APEX loads newer roadmap data for your rating, so items can appear that were not here before.`;
}

/** Unscored: entries ticked met/earned but not yet confirmed in the OMPF. */
function confirmList(inputs: RubricInputs): ReadinessReport["confirmInOmpf"] {
  const items = [
    ...(inputs.psr.awards ?? []).filter((a) => !a.verified_in_ompf).map((a) => a.title),
    ...inputs.ladr
      .filter((i) => i.status === "met" && !i.verified_in_ompf)
      .map((i) => i.item || i.milestone_id),
  ];
  if (items.length === 0) return null;
  const one = items.length === 1;
  return {
    count: items.length,
    items,
    note: `You have ${items.length} ${one ? "entry" : "entries"} not yet confirmed in your OMPF. A board sees only your OMPF — confirm ${one ? "it" : "these"} on BOL/NDAWS before the board.`,
  };
}

/**
 * The v2 output. `result` must be the run of `inputs` under `config`.
 *
 * `config` is REQUIRED: defaulting it silently scored operator-tuned installs
 * against the stock weights, which produced action values wrong by multiples and
 * could invert the ranking.
 */
export function buildReadinessReport(
  result: RubricResult,
  inputs: RubricInputs,
  config: RubricConfig,
  opts: ReadinessOptions = {},
): ReadinessReport {
  const preceptPrefix = opts.preceptSourceUrl ? "" : PRECEPT_UNSOURCED_PREFIX;

  // §3.1 — Σ(weight·conf)/100. The weights are the EFFECTIVE ones (after the
  // ×100/90 redistribution when no precept is loaded), so this stays in [0,1].
  const measured = result.factors.reduce((a, f) => a + f.weight * f.confidence, 0) / 100;

  const areas: ReadinessArea[] = result.factors.map((f) => {
    const status = statusOf(f.key, result, inputs);
    const evidence = evidenceOf(f.key, status, inputs);
    const copy = AREA_COPY[f.key];
    // Non-null: every area supplies copy for every status it can actually reach
    // (completeness omits not_enough_entered, which hasEvidence makes impossible;
    // development's is computed because a fixed string cannot be honest there).
    const base =
      f.key === "development" && status === "not_enough_entered"
        ? developmentNotEnough(f, inputs)
        : copy.statuses[status]!;
    return {
      key: f.key,
      label: copy.label,
      status,
      evidence,
      evidenceLabel: EVIDENCE_LABEL[evidence],
      summary: f.key === "precept" ? preceptPrefix + base : base,
      evidenceNote: EVIDENCE_NOTE[evidence],
      detail: f,
    };
  });

  // A weight-0 factor is a TOOL configuration gap, not a gap in the Sailor's
  // record: with no precept loaded the headline otherwise read "APEX can see
  // 5 of 6 areas of your record" for a fully-entered one.
  // TWO different questions, and one filter used to answer both wrongly.
  //
  //   verdict  — does this factor carry weight in the composite? Only these may
  //              suppress the score, because only these can distort it. A missing
  //              LaDR must never block a number it cannot move.
  //   shown    — is this an area of the SAILOR'S RECORD? Everything except a
  //              precept the admin never configured, which is a tool gap the
  //              Sailor cannot act on and must not be blamed for.
  //
  // `weight > 0` answered both until development, completeness and continuity
  // came off the verdict axis. They are still the Sailor's record, still carry a
  // how-to, and still belong in the coverage headline and the missing list.
  const verdict = areas.filter((a) => a.detail.weight > 0);
  const shown = areas.filter((a) => a.detail.detail.excluded !== true);

  const missing = shown
    .filter((a) => a.status === "not_enough_entered")
    .map((a) => ({
      area: a.key,
      label: AREA_COPY[a.key].missingLabel,
      unlocks: AREA_COPY[a.key].unlocks,
      // ponytail: plain instruction, not a URL — the Results screen does not read
      // a ?tab query param yet (app/board-confidence/page.tsx:414). Make these
      // hrefs when the UI task wires tab deep-linking.
      howTo: AREA_COPY[a.key].howTo,
    }));

  const asOf = resolveAsOf(opts.asOf, inputs.boardDate);
  const monthsToBoard = Math.max(0, monthsBefore(asOf, inputs.boardDate));

  const byMilestone = new Map(inputs.ladr.map((i) => [i.milestone_id, i]));
  const actions: ReadinessAction[] = bandDeltas(result, inputs, config)
    // Only improvements. A flip can come out negative — measured −29/120, which
    // is entirely the warfighting precept indicator diluting as an unverified row
    // joins its category — and "do this, lose 0.24 points" is not advice.
    .filter((d) => d.delta > 0)
    .map((d) => ({
      id: d.id,
      action: actionTextFor(d),
      area: d.area,
      worth: d.delta,
      source: { kind: "ladr_milestone" as const, id: d.milestoneId },
      ...horizonFor(d, byMilestone.get(d.milestoneId), monthsToBoard),
    }))
    .sort((a, b) => b.worth - a.worth);

  // The two gates on emitting a number at all. The blind-spot test is
  // `< AREA_EVIDENCE_FLOOR`, NOT `=== 0`: a factor at conf 0.07 carries almost
  // its whole weight into the composite as unearned zeros, and `=== 0` let a
  // returning user's band silently drop when their rating's roadmap grew.
  const blind = verdict.filter((a) => a.detail.confidence < AREA_EVIDENCE_FLOOR);
  let scoreNote: string | null = null;
  if (BLIND_SPOT_GATE && blind.length > 0) {
    // The development-specific branches that used to live here are DELETED, not
    // moved: `blind` is drawn from `verdict`, development always has weight 0,
    // so `blind[0].key === "development"` was unreachable. Measured across 4,000
    // records it fired 0 times against 1,280 on main. The Sailor is still told
    // their roadmap is missing — on the coverage axis, by the development area's
    // own summary, which is where a factor that cannot move the score belongs.
    scoreNote = `APEX cannot score your record yet: too little is entered for ${blind
      .map((a) => a.label.toLowerCase())
      .join(", ")}. Here is what APEX can see in the meantime:`;
  }

  return {
    coverage: {
      measured,
      areasKnown: shown.filter((a) => a.status !== "not_enough_entered").length,
      areasTotal: shown.length,
      missing,
    },
    actions,
    areas,
    boardDate: inputs.boardDate,
    monthsToBoard,
    score:
      scoreNote === null
        ? { value: result.final, band: result.band, label: result.bandLabel }
        : null,
    scoreNote,
    confirmInOmpf: confirmList(inputs),
    disclaimer: BOARD_DISCLAIMER,
  };
}
