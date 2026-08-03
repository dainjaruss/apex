// tests/unit/boardConfidenceNarrative.test.ts
//
// generateNarrative / fallbackNarrative (spec §4.3, §14): the keyless
// deterministic fallback, the mocked AI-SDK call shape (gateway string and
// direct provider object), failure → fallback, the §4.3.4 privacy floor, and
// the two v2 gates — NO score leakage (the narrative may not print or let a
// reader reconstruct a composite the readiness layer suppressed) and
// citation-or-delete (a bracket that resolves to nothing is deleted, not shown).
// NO live API calls: ai.generateText is mocked; credentials are set per test.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateText: h.generateText };
});

import {
  generateNarrative,
  fallbackNarrative,
  narrativePayload,
  applyCitationGate,
  citationPaths,
  NarrativeSchema,
  NARRATIVE_SYSTEM_PROMPT,
  DEFAULT_NARRATIVE_MODEL,
  narrativeModelId,
  type ModelNarrative,
  type SubjectKey,
} from "@/lib/boardConfidence/narrative";
import {
  DEFAULT_RUBRIC_CONFIG as CFG,
  scoreBoardConfidence,
} from "@/lib/boardConfidence/rubric";
import { buildReadinessReport } from "@/lib/boardConfidence/readiness";
import type { RubricInputs } from "@/lib/boardConfidence/types";

// Sentinel strings planted in the fixture: none may ever reach the model.
const SENTINEL_MEMBER_NAME = "SAILOR, SENTINEL Q";
const SENTINEL_DOD_ID = "9876543210";
const SENTINEL_AWARD_TITLE = "SENTINEL ACHIEVEMENT MEDAL";
const SENTINEL_TOUR_TITLE = "SENTINEL TOUR BRAVO";
const SENTINELS = [
  SENTINEL_MEMBER_NAME,
  SENTINEL_DOD_ID,
  SENTINEL_AWARD_TITLE,
  SENTINEL_TOUR_TITLE,
];

const annual = (endYear: number, rec: any, ita: number) => ({
  period_from: `${endYear - 1}-03-16`,
  period_to: `${endYear}-03-15`,
  report_type: "EVAL" as const,
  promotion_recommendation: rec,
  trait_average: ita,
  summary_group_average: null,
  rsca: null,
  sea_duty: false,
  ep_count: null,
  group_size: null,
});

const fixtureInputs: RubricInputs = {
  boardDate: "2026-09-01",
  evals: [2022, 2023, 2024, 2025, 2026].map((y) => annual(y, "Promotable", 3.8)),
  psr: {
    entered: true,
    awards: [
      { title: SENTINEL_AWARD_TITLE, level: "personal_achievement", date_awarded: "2024-01-01", verified_in_ompf: false },
    ],
    necs: [{ code: "742A", verified_in_ompf: true }],
    education: [{ kind: "degree", title: "Associate of Science", verified_in_ompf: true }],
    tours: [{ title: SENTINEL_TOUR_TITLE, start: "2021-01-01", end: null, sea_duty: true, leadership: true }],
    pfa: [
      { cycle: "a", date: "2024-04-01", result: "pass" },
      { cycle: "b", date: "2024-10-01", result: "pass" },
      { cycle: "c", date: "2025-04-01", result: "pass" },
    ],
    adverse: [],
  },
  ladr: [
    { milestone_id: "m-warfare", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "Information Warfare (EIWS)" },
    { milestone_id: "m-pme", category: "pme_required", status: "met", verified_in_ompf: true, item: "PO1 Selectee Leadership Course" },
    { milestone_id: "m-cert", category: "credential", status: "not_met", verified_in_ompf: false, item: "CompTIA Security+", typical_months: 2 },
    { milestone_id: "m-deg", category: "education_degree", status: "not_met", verified_in_ompf: false, item: "Occupational-related Associate degree", typical_months: 18 },
  ],
  preceptFlags: ["warfighting", "leadership_positions", "education", "sea_duty", "technical_expertise"],
};

const fixtureResult = scoreBoardConfidence(fixtureInputs, CFG);
const fixtureReport = buildReadinessReport(fixtureResult, fixtureInputs, CFG, {
  asOf: "2026-04-01",
});

// Warnings are server-composed strings shown only to the record owner; they
// carry the sentinels and must never be forwarded to the model.
const fixtureWarnings = [
  `Excluded 1 report for ${SENTINEL_MEMBER_NAME} (dod_id ${SENTINEL_DOD_ID}).`,
];
const resultWithWarnings = { ...fixtureResult, warnings: fixtureWarnings };

/**
 * Wrap plain strings as model items.
 *
 * The default subject is `record`, which ABSTAINS from the subject rule — so
 * every test below that was written to pin the PATH rule keeps pinning exactly
 * that rule, and nothing here passes or fails for the new reason by accident.
 * The subject rule has its own tests, which pass a subject explicitly.
 */
const modelItems = (texts: string[], subject: SubjectKey = "record") =>
  texts.map((text) => ({ text, subject }));

/** A model reply whose every item cites a path that really is in the payload. */
const citedNarrative = (): ModelNarrative => ({
  strengths: modelItems(["Your reporting periods run without a break. [areas.continuity]"]),
  gaps: modelItems(["Most of your rating's roadmap is still open. [areas.development]"]),
  recommendations: ["Complete CompTIA Security+. [actions.ladr:m-cert:meet]"],
  factor_commentary: {
    performance: "Solid recent reports. [areas.performance]",
    leadership: "Sea time and a leadership billet. [areas.leadership]",
    development: "Two milestones still open. [unmet.m-cert]",
    continuity: "No break between reports. [areas.continuity]",
    completeness: "Most sections entered. [areas.completeness]",
    precept: "Emphasis areas partly covered. [areas.precept]",
  },
});

const ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "BOARD_NARRATIVE_MODEL",
  "BOARD_NARRATIVE_BASE_URL",
  "BOARD_NARRATIVE_API_KEY",
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

const run = (r = fixtureResult) => generateNarrative(fixtureReport, r);

describe("the model id must actually resolve", () => {
  it("is a hyphenated gateway id — Anthropic model ids never contain a dot", () => {
    // "anthropic/claude-opus-4.8" was malformed in BOTH modes and could never
    // resolve, so the default silently guaranteed the keyless fallback.
    expect(DEFAULT_NARRATIVE_MODEL).toBe("anthropic/claude-opus-5");
    expect(DEFAULT_NARRATIVE_MODEL).not.toMatch(/\d\.\d/);
    expect(DEFAULT_NARRATIVE_MODEL.split("/")).toHaveLength(2);
  });
});

describe("generateNarrative — keyless fallback (feature works without credentials)", () => {
  it("resolves the fallback outcome without touching the AI SDK", async () => {
    const out = await run();
    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(out.fallbackReason).toBe("no_key");
    expect(NarrativeSchema.safeParse(out.narrative).success).toBe(true);
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("is deterministic and pure", async () => {
    const a = await run();
    const b = await run();
    expect(a.narrative).toEqual(b.narrative);
    expect(a.narrative).toEqual(fallbackNarrative(fixtureReport, fixtureResult.warnings));
    expect(NarrativeSchema.safeParse(fallbackNarrative(fixtureReport)).success).toBe(true);
  });
});

describe("no score leakage — the narrative may not reconstruct the suppressed composite", () => {
  // What leaks is NUMBERS and rubric vocabulary — not the English verb "score".
  // "Your recent reports score low against this rubric's scales" is an honest
  // qualitative sentence with nothing to add up; "Contributed 33.5 of 40.0
  // possible points" is the composite in disguise.
  const NUMBERS_THAT_LEAK =
    /\d+\.\d|\bcontribut|possible points|\bweighted?\b|\bconfidence\b|\bpoints\b|out of \d/i;

  it("the fallback prints no contributions, weights, or point totals", () => {
    // The old fallback emitted "Contributed 33.5 of 40.0 possible points" for
    // ALL SIX factors, which sums straight back to the suppressed number.
    const text = JSON.stringify(fallbackNarrative(fixtureReport, fixtureResult.warnings));
    expect(text).not.toMatch(NUMBERS_THAT_LEAK);
    expect(text).not.toContain(String(fixtureResult.final));
  });

  it("the fallback stays clean on a record whose score is suppressed", () => {
    const empty: RubricInputs = {
      boardDate: "2026-09-01",
      evals: [],
      psr: { entered: false, awards: null, necs: null, education: null, tours: null, pfa: null, adverse: [] },
      ladr: [],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(empty, CFG);
    const rep = buildReadinessReport(r, empty, CFG);
    expect(rep.score).toBeNull();

    const text = JSON.stringify(fallbackNarrative(rep, r.warnings));
    expect(text).not.toMatch(NUMBERS_THAT_LEAK);
    expect(text).not.toContain("Drop-from-consideration risk");
  });

  it("the model payload carries no per-factor numbers, no worth, and no score", () => {
    const payload = narrativePayload(fixtureReport, fixtureResult);
    const text = JSON.stringify(payload);

    expect(text).not.toContain('"contribution"');
    expect(text).not.toContain('"weight"');
    expect(text).not.toContain('"worth"');
    expect(text).not.toContain('"detail"');
    expect(text).not.toContain('"bandLabel"');
    // `scored` is a bare boolean — the number itself never leaves the server.
    expect(payload.scored).toBe(fixtureReport.score !== null);
    expect(text).not.toContain(String(fixtureResult.final));
    for (const a of payload.areas) expect(a).not.toHaveProperty("detail");
    for (const a of payload.actions) expect(a).not.toHaveProperty("worth");
  });

  it("the system prompt forbids stating or implying a score", () => {
    const out = fallbackNarrative(fixtureReport);
    expect(NarrativeSchema.safeParse(out).success).toBe(true);
    // The instruction itself is pinned so it cannot be quietly dropped.
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/NEVER state, estimate, imply or reconstruct an overall score/);
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/not_enough_entered/);
  });
});

describe("guards that ship with this change", () => {
  // N8 — a suppressed record must not be advertised to the model as scored.
  it("`scored` tracks the readiness gate, it is not hardcoded true", () => {
    const empty: RubricInputs = {
      boardDate: "2026-09-01",
      evals: [],
      psr: { entered: false, awards: null, necs: null, education: null, tours: null, pfa: null, adverse: [] },
      ladr: [],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(empty, CFG);
    const rep = buildReadinessReport(r, empty, CFG);
    expect(rep.score).toBeNull();
    expect(narrativePayload(rep, r).scored).toBe(false);
    expect(narrativePayload(fixtureReport, fixtureResult).scored).toBe(true);
  });

  // N12 — the headline rule of §14.4: missing data is never a deficiency.
  it("never routes `not_enough_entered` into gaps", () => {
    const thin: RubricInputs = {
      boardDate: "2026-09-01",
      evals: [],
      psr: { entered: true, awards: null, necs: null, education: null, tours: null, pfa: null, adverse: [] },
      ladr: [],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(thin, CFG);
    const rep = buildReadinessReport(r, thin, CFG);
    const unknown = rep.areas.filter((a) => a.status === "not_enough_entered");
    expect(unknown.length).toBeGreaterThan(0);

    const n = fallbackNarrative(rep);
    for (const a of unknown) expect(n.gaps.join(" ")).not.toContain(a.summary);
    // ...and the guidance for them is offered instead.
    expect(n.recommendations.length).toBeGreaterThan(0);
  });

  // N13 — only `strong` is a strength; `on_track` is middling, not praise.
  it("keys strengths on `strong` alone, never on `on_track`", () => {
    const onTrackOnly = {
      ...fixtureReport,
      areas: fixtureReport.areas.map((a) => ({ ...a, status: "on_track" as const })),
    };
    expect(fallbackNarrative(onTrackOnly).strengths).toEqual([]);

    const allStrong = {
      ...fixtureReport,
      areas: fixtureReport.areas.map((a) => ({ ...a, status: "strong" as const })),
    };
    expect(fallbackNarrative(allStrong).strengths).toHaveLength(5); // six areas, capped at MAX_ITEMS
  });

  // N14 — a milestone with no threaded text must not reach the model as item: "".
  it("drops unnamed milestones from the payload rather than sending empty text", () => {
    const unnamed: RubricInputs = {
      ...fixtureInputs,
      ladr: [
        { milestone_id: "no-name", category: "credential", status: "not_met", verified_in_ompf: false },
        { milestone_id: "named", category: "credential", status: "not_met", verified_in_ompf: false, item: "CompTIA Security+" },
      ],
    };
    const r = scoreBoardConfidence(unnamed, CFG);
    const rep = buildReadinessReport(r, unnamed, CFG);
    const ids = narrativePayload(rep, r).unmet.map((u) => u.milestone_id);
    expect(ids).toEqual(["named"]);
    expect(r.ladrUnmet!.map((u) => u.milestone_id)).toContain("no-name"); // the engine still knows
  });

  // A long action list must not starve the "enter this section" guidance.
  it("interleaves recommendations so many actions cannot crowd out missing-data guidance", () => {
    const many = {
      ...fixtureReport,
      actions: Array.from({ length: 8 }, (_, i) => ({
        ...fixtureReport.actions[0],
        id: `a-${i}`,
        action: `ACTION ${i}`,
      })),
      coverage: {
        ...fixtureReport.coverage,
        missing: [
          { area: "leadership" as const, label: "your tours and awards", unlocks: "leadership assessment", howTo: "MISSING-HOWTO-1" },
          { area: "precept" as const, label: "the board emphasis areas", unlocks: "the board emphasis check", howTo: "MISSING-HOWTO-2" },
        ],
      },
    };
    const recs = fallbackNarrative(many).recommendations.join(" | ");
    // Concatenate-then-slice showed zero of these; both must survive the cap.
    expect(recs).toContain("MISSING-HOWTO-1");
    expect(recs).toContain("MISSING-HOWTO-2");
  });
});

describe("the payload names unmet milestones — this is what makes output specific", () => {
  it("carries public Navy COOL milestone names, and no point values", () => {
    const payload = narrativePayload(fixtureReport, fixtureResult);
    expect(payload.unmet.map((u) => u.item).sort()).toEqual([
      "CompTIA Security+",
      "Occupational-related Associate degree",
    ]);
    for (const u of payload.unmet) expect(u).not.toHaveProperty("marginal_points");
  });

  it("action text quotes the milestone by name", () => {
    const payload = narrativePayload(fixtureReport, fixtureResult);
    expect(payload.actions.some((a) => a.action.includes("CompTIA Security+"))).toBe(true);
  });
});

describe("citation-or-delete — a bracket pointing at nothing is worse than no bracket", () => {
  const payload = () => narrativePayload(fixtureReport, fixtureResult);

  it("the valid path set is built from the payload actually sent", () => {
    const paths = citationPaths(payload());
    expect(paths.has("areas.performance")).toBe(true);
    expect(paths.has("unmet.m-cert")).toBe(true);
    expect(paths.has("actions.ladr:m-cert:meet")).toBe(true);
    // The old prompt's exemplars — never in any payload.
    expect(paths.has("performance.detail.P1")).toBe(false);
    expect(paths.has("development.detail.categories.qual_warfare")).toBe(false);
  });

  it("keeps cited items, strips the trailing citation, and deletes unciteable ones", () => {
    const deterministic = fallbackNarrative(fixtureReport);
    const gated = applyCitationGate(
      {
        ...citedNarrative(),
        strengths: modelItems([
          "Your reporting periods run without a break. [areas.continuity]",
          "Invented claim about a medal. [performance.detail.P1]",
          "No citation at all here.",
        ]),
      },
      payload(),
      deterministic,
    );

    expect(gated.strengths).toEqual(["Your reporting periods run without a break."]);
    const items = [
      ...gated.strengths,
      ...gated.gaps,
      ...gated.recommendations,
      ...Object.values(gated.factor_commentary),
    ];
    // No surviving item still shows a bracketed PATH to the Sailor.
    for (const t of items) expect(t).not.toMatch(/\[(areas|actions|unmet|coverage)\./);
    expect(items.join(" ")).not.toContain("Invented claim");
  });

  it("EVERY cited path must resolve — one valid path may not launder a fabrication", () => {
    // A model that appends one safe citation to a fabricated sentence walked
    // straight through the old `some()` check, while the system prompt promised
    // the model that any item citing an unknown path is deleted.
    //
    // Both citations here name areas the SEMANTIC gate is happy with (continuity
    // and completeness are `strong`, and these are strengths). That is
    // deliberate: cite a `needs_attention` area and the semantic gate drops the
    // item too, so `every`→`some` would still be "killed" and this test would
    // no longer pin the structural guard it is named for.
    const deterministic = fallbackNarrative(fixtureReport);
    const gated = applyCitationGate(
      {
        ...citedNarrative(),
        strengths: modelItems([
          "You failed your PFA and hold no warfare device. [areas.continuity, awards.fabricated]",
          "Both of these resolve. [areas.continuity, areas.completeness]",
        ]),
      },
      payload(),
      deterministic,
    );
    expect(gated.strengths).toEqual(["Both of these resolve."]);
  });

  it("leaves bracketed NEC/CIN codes in the prose alone — only the trailing group is a citation", () => {
    // PR #22 transcribed 80 milestones whose text carries bracketed codes; a
    // global strip ate them: `Complete "X [NEC 742A]".` → `Complete "X ".`
    const deterministic = fallbackNarrative(fixtureReport);
    const gated = applyCitationGate(
      {
        ...citedNarrative(),
        recommendations: [
          'Complete "Advanced Network Analyst [NEC 742A]". [actions.ladr:m-cert:meet]',
          'Prose bracket with no citation at all [NEC 742A].',
        ],
      },
      payload(),
      deterministic,
    );
    expect(gated.recommendations).toEqual([
      'Complete "Advanced Network Analyst [NEC 742A]".',
    ]);
  });

  it("falls back to deterministic text for an unciteable factor_commentary entry", () => {
    // The schema requires all six keys, so they cannot be deleted — but an
    // unsupported one must not be rendered either.
    const deterministic = fallbackNarrative(fixtureReport);
    const bad = citedNarrative();
    bad.factor_commentary.performance = "Ungrounded claim. [performance.detail.P1]";

    const gated = applyCitationGate(bad, payload(), deterministic);
    expect(gated.factor_commentary.performance).toBe(
      deterministic.factor_commentary.performance,
    );
    expect(gated.factor_commentary.continuity).toBe("No break between reports.");
  });

  it("the model path runs the gate on real output", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
    h.generateText.mockResolvedValue({
      output: { ...citedNarrative(), gaps: modelItems(["Fabricated. [nonsense.path]"]) },
    });

    const out = await run();
    expect(out.source).toBe("model");
    expect(out.narrative.gaps).toEqual([]);
    expect(out.narrative.strengths[0]).toBe("Your reporting periods run without a break.");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The citation must AGREE with the area it names, not merely resolve to it.
//
// Fixture statuses (asserted below so these tests fail loudly rather than
// vacuously if the rubric moves):
//   strong             continuity, completeness
//   on_track           development
//   needs_attention    performance, leadership
//   not_enough_entered precept
// ───────────────────────────────────────────────────────────────────────────
describe("the citation must agree with the status of the area it cites", () => {
  const payload = () => narrativePayload(fixtureReport, fixtureResult);
  /**
   * Lists as plain strings, wrapped into model items at the boundary. `subject`
   * defaults to `record` so these tests keep measuring the CITATION rule alone;
   * the subject rule's own tests pass one explicitly.
   */
  type Lists = { strengths?: string[]; gaps?: string[]; recommendations?: string[] };
  const asModel = (n: Lists, subject: SubjectKey) => ({
    ...citedNarrative(),
    strengths: modelItems(n.strengths ?? [], subject),
    gaps: modelItems(n.gaps ?? [], subject),
    recommendations: n.recommendations ?? [],
  });
  const gate = (n: Lists, subject: SubjectKey = "record") =>
    applyCitationGate(asModel(n, subject), payload(), fallbackNarrative(fixtureReport));
  const statusOfArea = (key: string) =>
    fixtureReport.areas.find((a) => a.key === key)!.status;

  // A SECOND fixture, because the main one no longer reaches
  // `not_enough_entered`. PR #37 re-scored precept, which had been this file's
  // only source of that status — and the guard below is what caught it.
  //
  // `evals: []` puts performance and continuity there instead, and unlike
  // precept those are `shown`, so they also populate `coverage.missing` — which
  // the main fixture no longer does at all. Two precept flags keep a
  // `needs_attention` area in the SAME payload, which is what lets the asymmetry
  // test contrast the two statuses rather than assert them on separate records.
  const sparseInputs: RubricInputs = { ...fixtureInputs, evals: [], preceptFlags: ["warfighting", "education"] };
  const sparseResult = scoreBoardConfidence(sparseInputs, CFG);
  const sparseReport = buildReadinessReport(sparseResult, sparseInputs, CFG, { asOf: "2026-04-01" });
  const sparsePayload = () => narrativePayload(sparseReport, sparseResult);
  const sparseGate = (n: Lists, subject: SubjectKey = "record") =>
    applyCitationGate(asModel(n, subject), sparsePayload(), fallbackNarrative(sparseReport));

  it("the two fixtures between them carry all four statuses", () => {
    // Without this, every test below could be asserting on a status the rubric
    // no longer produces and still pass by dropping everything. It has already
    // fired once, on #37.
    expect(Object.fromEntries(fixtureReport.areas.map((a) => [a.key, a.status]))).toEqual({
      performance: "needs_attention",
      leadership: "needs_attention",
      development: "on_track",
      continuity: "strong",
      completeness: "strong",
      precept: "on_track",
    });
    expect(Object.fromEntries(sparseReport.areas.map((a) => [a.key, a.status]))).toEqual({
      performance: "not_enough_entered",
      leadership: "needs_attention",
      development: "on_track",
      continuity: "not_enough_entered",
      completeness: "on_track",
      precept: "needs_attention",
    });
    const all = new Set([
      ...fixtureReport.areas.map((a) => a.status),
      ...sparseReport.areas.map((a) => a.status),
    ]);
    expect(Array.from(all).sort()).toEqual([
      "needs_attention",
      "not_enough_entered",
      "on_track",
      "strong",
    ]);
    // …and the sparse fixture must really populate coverage.missing, or the
    // `coverage.missing.<key>` tests below pass by dropping on structure.
    expect(sparseReport.coverage.missing.map((m) => m.area).sort()).toEqual([
      "continuity",
      "performance",
    ]);
  });

  it("drops a strength praising a `needs_attention` area — THE defect", () => {
    // "Your leadership record stands out." printed one viewport above the
    // leadership card reading NEEDS ATTENTION. The path resolves; the payload
    // says the opposite.
    const gated = gate({
      strengths: [
        "Your leadership record stands out. [areas.leadership]",
        "Your reporting periods run without a break. [areas.continuity]",
      ],
    });
    expect(gated.strengths).toEqual(["Your reporting periods run without a break."]);
  });

  it("keeps a strength on a `strong` area and one on an `on_track` area", () => {
    // The gate must not simply empty the list: `on_track` is not a contradiction
    // of "what is working", and deleting it would be the same over-correction in
    // the other direction.
    const gated = gate({
      strengths: [
        "Almost everything APEX asks for is entered. [areas.completeness]",
        "You are answering your roadmap steadily. [areas.development]",
      ],
    });
    expect(gated.strengths).toHaveLength(2);
    expect(gated.withheld).toBe(0);
  });

  it("drops a gap that criticises a `strong` area", () => {
    const gated = gate({
      gaps: [
        "A board would notice the breaks between your reports. [areas.continuity]",
        "Most of your rating's roadmap is still open. [areas.development]",
      ],
    });
    expect(gated.gaps).toEqual(["Most of your rating's roadmap is still open."]);
  });

  it("keeps a gap on a `needs_attention` area", () => {
    const gated = gate({
      gaps: ["Few leadership billets and little sea time. [areas.leadership]"],
    });
    expect(gated.gaps).toEqual(["Few leadership billets and little sea time."]);
  });

  // ── not_enough_entered is NOT needs_attention ──────────────────────────────
  it("routes `not_enough_entered` out of BOTH lists but leaves recommendations alone", () => {
    // The two statuses must not collapse. This asserts the whole asymmetry in
    // one payload: the `needs_attention` gap survives, the `not_enough_entered`
    // gap does not, and the `not_enough_entered` recommendation — "enter the
    // data", the useful message — is untouched.
    // performance is `not_enough_entered` here and leadership is
    // `needs_attention` — same payload, so this contrasts the two statuses
    // rather than asserting them on separate records.
    const gated = sparseGate({
      strengths: ["Your reporting record is excellent. [areas.performance]"],
      gaps: [
        "A board would notice how thin your reports are. [areas.performance]",
        "Few leadership billets and little sea time. [areas.leadership]",
      ],
      recommendations: [
        "Enter your evaluations. [coverage.missing.performance]",
        "Complete CompTIA Security+. [actions.ladr:m-cert:meet]",
      ],
    });
    expect(gated.strengths).toEqual([]);
    expect(gated.gaps).toEqual(["Few leadership billets and little sea time."]);
    expect(gated.recommendations).toHaveLength(2);
  });

  it("does not polarity-gate recommendations at all", () => {
    // "Fill in your PSR" is equally true of a strong area and an empty one.
    // Gating recommendations would delete correct advice for no gain.
    const gated = gate({
      recommendations: [
        "Keep entering your reports. [areas.continuity]",
        "Get after your leadership exposure. [areas.leadership]",
        "Ask an admin to load the emphasis areas. [areas.precept]",
      ],
    });
    expect(gated.recommendations).toHaveLength(3);
  });

  it("factor_commentary is not polarity-gated — it survives on a weak area", () => {
    const bad = citedNarrative();
    bad.factor_commentary.leadership = "Sea time and a leadership billet. [areas.leadership]";
    const gated = applyCitationGate(bad, payload(), fallbackNarrative(fixtureReport));
    expect(gated.factor_commentary.leadership).toBe("Sea time and a leadership billet.");
  });

  // ── multi-path rule: unanimity across cited areas, non-areas abstain ───────
  it("drops a multi-area citation when ONE cited area disagrees", () => {
    // Appending a healthy area to a sentence about a weak one is the laundering
    // hole re-opened one level up. Ordering is varied so a first-path-wins or
    // last-path-wins implementation cannot pass.
    const gated = gate({
      strengths: [
        "Strong across the board. [areas.continuity, areas.leadership]",
        "Strong across the board, reversed. [areas.leadership, areas.continuity]",
        "Genuinely strong on both. [areas.continuity, areas.completeness]",
      ],
    });
    expect(gated.strengths).toEqual(["Genuinely strong on both."]);
  });

  it("a non-area path in the group abstains rather than vetoing", () => {
    // actions/unmet/coverage/monthsToBoard carry no status, so they have no
    // opinion to contradict — they must not silently sink an agreeing item.
    const gated = gate({
      strengths: [
        "Your reports are unbroken and your plan is short. [areas.continuity, actions.ladr:m-cert:meet]",
        "Unbroken reports, months to go. [areas.continuity, monthsToBoard]",
      ],
    });
    expect(gated.strengths).toHaveLength(2);
  });

  it("an item citing no area at all is left to the structural gate", () => {
    const gated = gate({
      strengths: ["Five months to prepare. [monthsToBoard]"],
      gaps: ["Two roadmap milestones are open. [unmet.m-cert]"],
    });
    expect(gated.strengths).toEqual(["Five months to prepare."]);
    expect(gated.gaps).toEqual(["Two roadmap milestones are open."]);
  });

  // ── a dropped item must not become a silent absence ────────────────────────
  it("counts withheld strengths and gaps, and ONLY those", () => {
    // The count is rendered to the Sailor, so it has to reconcile with the two
    // lists actually on screen. Recommendations are not rendered; counting a
    // dropped one would print a number nothing on the page explains.
    const gated = gate({
      strengths: [
        "Your leadership record stands out. [areas.leadership]", // semantic drop
        "Invented. [awards.fabricated]", // structural drop
        "Your reporting periods run without a break. [areas.continuity]", // kept
      ],
      gaps: ["A board would notice your broken reporting. [areas.continuity]"], // semantic drop
      recommendations: ["Invented too. [awards.fabricated]"], // dropped, NOT counted
    });
    expect(gated.strengths).toHaveLength(1);
    expect(gated.gaps).toEqual([]);
    expect(gated.recommendations).toEqual([]);
    expect(gated.withheld).toBe(3);
  });

  it("withheld is 0 when nothing is dropped", () => {
    expect(gate({ strengths: ["Unbroken reports. [areas.continuity]"] }).withheld).toBe(0);
  });

  // ── one extra bracket group must not switch the gate off ──────────────────
  it("checks EVERY citation group, not just the trailing one", () => {
    // The bypass: only the last group was examined, so the claim was judged
    // against `monthsToBoard` (statusless, abstains) while the citation that
    // contradicted it went unread — and `stripPathTokens` then erased the
    // unchecked `[areas.leadership]` at display time, so the Sailor saw the bare
    // sentence with withheld === 0. Reachable by construction; live frequency is
    // disputed (see narrative.ts) and is not what this pins.
    const gated = gate({
      strengths: [
        "Your leadership record stands out. [areas.leadership] [monthsToBoard]",
        "Your reporting periods run without a break. [areas.continuity] [monthsToBoard]",
      ],
    });
    expect(gated.strengths).toEqual([
      "Your reporting periods run without a break. [areas.continuity]",
    ]);
    expect(gated.withheld).toBe(1);
  });

  it("checks the LEADING group too, not merely 'more than the trailing one'", () => {
    // Every other multi-group fixture here puts the decisive group FIRST, so
    // `for (const cited of groups)` → `groups.slice(0, 1)` survived all of them
    // and the test above only pinned "not just the trailing one". Decisive group
    // LAST here, so a first-group-only implementation keeps it.
    const gated = gate({
      strengths: [
        "Your leadership record stands out. [monthsToBoard] [areas.leadership]",
        "Your reporting periods run without a break. [monthsToBoard] [areas.continuity]",
      ],
    });
    expect(gated.strengths).toEqual([
      "Your reporting periods run without a break. [monthsToBoard]",
    ]);
    expect(gated.withheld).toBe(1);
  });

  it("an item whose trailing bracket is PROSE is unciteable, as on main", () => {
    // Regression guard. `groups.length === 0` asked "is there a citation
    // ANYWHERE", so a mid-sentence citation with prose at the end survived and
    // the trailing strip then deleted the prose. main dropped both of these.
    const gated = gate({
      strengths: [
        "You hold a Bronze Star. [areas.continuity] [awards.fabricated]",
        "Solid record. [areas.continuity] [NEC 742A]",
      ],
    });
    expect(gated.strengths).toEqual([]);
    expect(gated.withheld).toBe(2);
  });

  it("an out-of-family path is validated wherever it sits, never read as prose", () => {
    // Otherwise the module's central promise is false for `awards.`/`psr.`/
    // `evals.`, and the raw token renders: the UI's stripper is anchored to the
    // known families, so it does not remove it either.
    const gated = gate({
      strengths: [
        "You hold a Bronze Star. [awards.fabricated] [areas.continuity]",
        "Your PSR is full. [psr.tours] [areas.continuity]",
      ],
    });
    expect(gated.strengths).toEqual([]);
  });

  it("still treats genuinely non-path brackets as prose, in any position", () => {
    // FOREIGN_PATH must not swallow Navy text or ordinary abbreviations.
    const gated = gate({
      recommendations: [
        "Recover the report per [1610.10H]. [actions.ladr:m-cert:meet]",
        "Sit [NEC 742A] and [CIN A-531-0009]. [actions.ladr:m-cert:meet]",
        "Pick a track [e.g., ESWS, EAWS, EIWS]. [actions.ladr:m-cert:meet]",
      ],
    });
    expect(gated.recommendations).toHaveLength(3);
  });

  it("checks a leading group structurally as well", () => {
    const gated = gate({ strengths: ["Solid. [areas.bogus] [areas.continuity]"] });
    expect(gated.strengths).toEqual([]);
  });

  it("a MIXED leading group cannot hide a fabrication behind a clean trailing one", () => {
    // #24's laundering case, moved into the multi-group world. If a group only
    // counts as a citation when EVERY token is path-shaped, then
    // `[areas.continuity, awards.fabricated]` is misread as prose, skipped, and
    // the clean `[monthsToBoard]` carries the item — the exact hole `some()`
    // exists to close. Mutation-found: this survived until it was written.
    const gated = gate({
      strengths: [
        "You hold a Bronze Star. [areas.continuity, awards.fabricated] [monthsToBoard]",
        "Unbroken reports. [areas.continuity] [monthsToBoard]",
      ],
    });
    expect(gated.strengths).toEqual(["Unbroken reports. [areas.continuity]"]);

    // The case that actually separates `some` from `every` now that
    // FOREIGN_PATH also classifies `awards.fabricated` as a citation: mix a real
    // path with genuine PROSE, in non-trailing position. Under `every` the group
    // is misread as prose and skipped entirely, and the clean trailing group
    // carries the item. A group naming a real path is a citation, and everything
    // in it must resolve.
    expect(
      gate({
        strengths: ["Solid on both counts [areas.continuity, NEC 742A]. [areas.completeness]"],
      }).strengths,
    ).toEqual([]);
  });

  it("still leaves NON-path bracket groups as prose, anywhere in the item", () => {
    // The reason only the trailing group was ever examined. Checking every group
    // must not start rejecting NEC/CIN codes and instruction numbers.
    const gated = gate({
      recommendations: [
        'Complete "Advanced Network Analyst [NEC 742A]" and [CIN A-531-0009]. [actions.ladr:m-cert:meet]',
        "Recover the report per [1610.10H]. [actions.ladr:m-cert:meet]",
      ],
    });
    expect(gated.recommendations).toEqual([
      'Complete "Advanced Network Analyst [NEC 742A]" and [CIN A-531-0009].',
      "Recover the report per [1610.10H].",
    ]);
  });

  // ── the other two path families that carry a status ───────────────────────
  it("`coverage.missing.<key>` carries its area's status, it does not abstain", () => {
    // It exists IFF the area is not_enough_entered, so this is just the more
    // natural spelling of the gaps item the areas.<key> form already blocks.
    //
    // MUST use the sparse fixture: the main one has an empty coverage.missing
    // post-#37, so these paths would not resolve and the test would pass on
    // STRUCTURE while claiming to test semantics. Asserted non-empty above.
    const gated = sparseGate({
      gaps: ["Your reporting history is thin. [coverage.missing.performance]"],
      strengths: ["APEX has all it needs on your reports. [coverage.missing.performance]"],
    });
    expect(gated.gaps).toEqual([]);
    expect(gated.strengths).toEqual([]);
    expect(gated.withheld).toBe(2);

    // …and it is looked up, not hardcoded to not_enough_entered: leadership is
    // needs_attention and has no coverage.missing entry, so the ONLY thing that
    // can make this pass is reading the area's real status.
    expect(sparsePayload().coverage.missing.map((m) => m.area)).not.toContain("leadership");
  });

  it("`actions.<id>` carries its own area's status, it does not abstain", () => {
    // actions[].area ships in the payload. Development is on_track here, so both
    // valences are allowed — what is pinned is that the status is CONSULTED.
    const dev = fixtureReport.actions.find((a) => a.area === "development")!;
    expect(statusOfArea("development")).toBe("on_track");
    const ok = gate({
      strengths: [`Your roadmap is moving. [actions.${dev.id}]`],
      gaps: [`Two roadmap milestones are still open. [actions.${dev.id}]`],
    });
    expect(ok.strengths).toHaveLength(1);
    expect(ok.gaps).toHaveLength(1);

    // …and on a payload where that action's area is needs_attention, it drops.
    const weak = {
      ...payload(),
      areas: payload().areas.map((a) =>
        a.key === "development" ? { ...a, status: "needs_attention" } : a,
      ),
    };
    const gatedWeak = applyCitationGate(
      {
        ...citedNarrative(),
        strengths: modelItems([`Your roadmap is moving. [actions.${dev.id}]`]),
        gaps: [],
        recommendations: [],
      },
      weak,
      fallbackNarrative(fixtureReport),
    );
    expect(gatedWeak.strengths).toEqual([]);
  });

  it("truly statusless paths still abstain", () => {
    const gated = gate({
      strengths: [
        "APEX can see most of your record. [coverage.measured]",
        "You have five months. [monthsToBoard]",
        "Two milestones are named. [unmet.m-cert]",
      ],
    });
    expect(gated.strengths).toHaveLength(3);
    expect(gated.withheld).toBe(0);
  });

  it("the system prompt states the agreement rule the gate enforces", () => {
    // The gate deletes silently. A model that is not told the rule loses items
    // it could have written correctly, so the prompt and the gate must agree.
    expect(NARRATIVE_SYSTEM_PROMPT).toContain("strong or on_track");
    expect(NARRATIVE_SYSTEM_PROMPT).toContain("on_track or needs_attention");
    expect(NARRATIVE_SYSTEM_PROMPT).toContain("EVERY cited area");
  });
});

describe("generateNarrative — mocked gateway model path", () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
  });

  it("calls generateText with the default gateway model string and NO sampling parameters", async () => {
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    const out = await run();

    expect(h.generateText).toHaveBeenCalledTimes(1);
    const args = h.generateText.mock.calls[0][0];
    expect(args.model).toBe(DEFAULT_NARRATIVE_MODEL);
    expect(args.maxRetries).toBe(1);
    expect(typeof args.system).toBe("string");
    expect(args.output).toBeDefined();
    // Sampling params are never sent — current Anthropic models reject them.
    expect(args).not.toHaveProperty("temperature");
    expect(args).not.toHaveProperty("topP");
    expect(args).not.toHaveProperty("topK");

    expect(out.source).toBe("model");
    expect(out.model).toBe(DEFAULT_NARRATIVE_MODEL);
    expect(out.fallbackReason).toBeNull();
  });

  it("BOARD_NARRATIVE_MODEL selects any gateway provider (e.g. xAI Grok)", async () => {
    process.env.BOARD_NARRATIVE_MODEL = "xai/grok-4.5";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    const out = await run();

    expect(narrativeModelId()).toBe("xai/grok-4.5");
    expect(h.generateText.mock.calls[0][0].model).toBe("xai/grok-4.5");
    expect(out.model).toBe("xai/grok-4.5");
  });

  it("privacy: the prompt and system text contain none of the planted sentinels (§4.3.4)", async () => {
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    await generateNarrative(fixtureReport, resultWithWarnings);

    const args = h.generateText.mock.calls[0][0];
    const serialized = JSON.stringify({ prompt: args.prompt, system: args.system });
    for (const sentinel of SENTINELS) expect(serialized).not.toContain(sentinel);
  });

  it("model failure → fallback outcome, never a throw", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.generateText.mockRejectedValue(new Error("429 rate limited"));

    const out = await run();

    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(out.fallbackReason).toBe("model_error");
    expect(out.narrative).toEqual(fallbackNarrative(fixtureReport, fixtureResult.warnings));
    errSpy.mockRestore();
  });

  it("missing output → fallback outcome", async () => {
    h.generateText.mockResolvedValue({ output: undefined });

    const out = await run();

    expect(out.source).toBe("fallback");
    expect(out.fallbackReason).toBe("model_error");
    expect(NarrativeSchema.safeParse(out.narrative).success).toBe(true);
  });

  it("OIDC-only environments (Vercel deployments) also take the model path", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.VERCEL_OIDC_TOKEN = "oidc-token";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    expect((await run()).source).toBe("model");
  });
});

describe("generateNarrative — direct OpenAI-compatible mode (zero Vercel services)", () => {
  it("BOARD_NARRATIVE_BASE_URL alone enables the model path — no gateway credentials", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://api.x.ai/v1";
    process.env.BOARD_NARRATIVE_API_KEY = "xai-test-key";
    process.env.BOARD_NARRATIVE_MODEL = "grok-4-fast";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    const out = await run();

    const args = h.generateText.mock.calls[0][0];
    // A provider model OBJECT, not a gateway string.
    expect(typeof args.model).toBe("object");
    expect(args.model.modelId).toBe("grok-4-fast");
    expect(out.model).toBe("grok-4-fast");
  });

  it("direct mode on Anthropic takes the NATIVE id, with no provider prefix", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://api.anthropic.com/v1";
    process.env.BOARD_NARRATIVE_API_KEY = "sk-test";
    process.env.BOARD_NARRATIVE_MODEL = "claude-opus-5";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    const out = await run();
    expect(h.generateText.mock.calls[0][0].model.modelId).toBe("claude-opus-5");
    expect(out.model).toBe("claude-opus-5");
  });

  it("works for keyless local endpoints (e.g. Ollama on the self-hosted box)", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "http://localhost:11434/v1";
    process.env.BOARD_NARRATIVE_MODEL = "llama3.3";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    expect((await run()).source).toBe("model");
    expect(h.generateText.mock.calls[0][0].model.modelId).toBe("llama3.3");
  });

  it("direct endpoint takes precedence over gateway credentials when both are set", async () => {
    process.env.AI_GATEWAY_API_KEY = "gateway-key";
    process.env.BOARD_NARRATIVE_BASE_URL = "https://api.x.ai/v1";
    process.env.BOARD_NARRATIVE_MODEL = "grok-4-fast";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    await run();
    expect(typeof h.generateText.mock.calls[0][0].model).toBe("object");
  });
});
