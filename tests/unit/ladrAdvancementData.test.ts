// tests/unit/ladrAdvancementData.test.ts
//
// Curated LaDR datasets — structural conformance of the transcribed
// "Considerations for advancement" rows (scripts/ladr-data/advancement.ts).
// These rows carry the heaviest LADR_CATEGORY_WEIGHTS entry (advancement_
// consideration = 30) and are the only place the LaDR's Fully/Best Qualified
// framing is captured, so the shape is pinned here: correct target paygrade,
// tier recorded (never inferred), verbatim text preserved, and carry-forward
// keys unique (scripts/seed-ladr.ts remaps checklists on
// `category|item_code ?? item` — a duplicate silently drops a user's answer).

import { describe, it, expect } from "vitest";
import { itE1E9 } from "@/scripts/ladr-data/it_e1_e9";
import { bmE1E9 } from "@/scripts/ladr-data/bm_e1_e9";
import { hmE1E9 } from "@/scripts/ladr-data/hm_e1_e9";
import { LADR_CATEGORY_WEIGHTS } from "@/lib/boardConfidence/rubric";
import type { LadrSeed, LadrSeedMilestone } from "@/scripts/seed-ladr";

const SEEDS: Array<[string, LadrSeed]> = [
  ["IT", itE1E9],
  ["BM", bmE1E9],
  ["HM", hmE1E9],
];

// "…from E6 to E7" is a gate FOR E7, so it is encoded [7] — service.ts filters
// on min(applies_to_paygrades) <= target_paygrade.
const STEP_PAYGRADE: Record<string, number> = {
  "E6 to E7": 7,
  "E7 to E8": 8,
  "E8 to E9": 9,
};

const advancementRows = (seed: LadrSeed): LadrSeedMilestone[] =>
  seed.milestones.filter((m) => m.category === "advancement_consideration");

describe("curated LaDR datasets", () => {
  it.each(SEEDS)("%s parses and every row is well-formed", (_abbrev, seed) => {
    expect(seed.milestones.length).toBeGreaterThan(0);
    for (const m of seed.milestones) {
      expect(LADR_CATEGORY_WEIGHTS[m.category]).toBeTypeOf("number");
      expect(m.item.trim()).not.toBe("");
      expect(m.applies_to_paygrades.length).toBeGreaterThan(0);
      for (const pg of m.applies_to_paygrades) {
        expect(Number.isInteger(pg)).toBe(true);
        expect(pg).toBeGreaterThanOrEqual(1);
        expect(pg).toBeLessThanOrEqual(9);
      }
    }
  });

  it.each(SEEDS)(
    "%s carry-forward keys are unique (seed-ladr.ts §10.3 remap)",
    (_abbrev, seed) => {
      const keys = seed.milestones.map(
        (m) => `${m.category}|${m.item_code ?? m.item}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    },
  );
});

describe("transcribed advancement considerations", () => {
  it.each(SEEDS)("%s has advancement_consideration rows", (_abbrev, seed) => {
    expect(advancementRows(seed).length).toBeGreaterThan(0);
  });

  it.each(SEEDS)(
    "%s rows carry the required detail fields",
    (_abbrev, seed) => {
      for (const m of advancementRows(seed)) {
        const d = m.detail as Record<string, unknown>;
        expect(d, m.item).toBeDefined();

        // Provenance: from the source PDF — never "representative" (a dataset
        // that was not transcribed) nor "auto_extracted" (the ladrFetch parser).
        expect(d.source).toBe("transcribed");
        expect(d.board_emphasis).toBe(true);
        expect(d.component).toBeTypeOf("string");
        expect(d.source_page_revision).toBeTypeOf("string");

        // Tier is the LaDR's own sorting of candidates; "unspecified" is used
        // only where the source prints no Fully/Best Qualified split.
        expect(["fully_qualified", "best_qualified", "unspecified"]).toContain(
          d.tier,
        );

        // Verbatim criterion text, not the short UI label.
        expect(d.notes).toBeTypeOf("string");
        expect((d.notes as string).length).toBeGreaterThan(20);

        // Sea/shore guidance is always recorded, including its scope so
        // rating-level text is not read as step-specific.
        expect(d).toHaveProperty("sea_shore");
        expect(["step", "rating", "row"]).toContain(d.sea_shore_scope);
        if (d.sea_shore_scope === "step")
          expect(d.sea_shore).toBeTypeOf("string");

        // Parenthetical example lists are kept whole, never truncated.
        if (d.examples !== undefined) {
          expect(Array.isArray(d.examples)).toBe(true);
          for (const ex of d.examples as string[]) {
            expect(ex).toBeTypeOf("string");
            expect(d.notes as string).toContain(ex);
          }
        }
      }
    },
  );

  it.each(SEEDS)(
    "%s rows target the paygrade the step is a gate for",
    (_abbrev, seed) => {
      for (const m of advancementRows(seed)) {
        const step = (m.detail as Record<string, unknown>).step as string;
        expect(STEP_PAYGRADE, m.item).toHaveProperty(step);
        expect(m.applies_to_paygrades).toEqual([STEP_PAYGRADE[step]]);
      }
    },
  );

  it("IT keeps the Best Qualified additivity sentence on BQ rows only", () => {
    // The only place the IT LaDR states BQ ⊇ FQ; without it `tier:
    // best_qualified` reads as an alternative to Fully Qualified.
    const ADDITIVITY = "as well as those from the Fully Qualified list.";
    const rows = advancementRows(itE1E9);
    const bq = rows.filter((m) => (m.detail as any).tier === "best_qualified");
    const fq = rows.filter((m) => (m.detail as any).tier === "fully_qualified");
    expect(bq.length).toBeGreaterThan(0);
    for (const m of bq)
      expect((m.detail as any).preamble, m.item).toContain(ADDITIVITY);
    // Never attached to a Fully Qualified row — that heading is not its source.
    for (const m of fq)
      expect((m.detail as any).preamble ?? "", m.item).not.toContain(
        ADDITIVITY,
      );
  });

  it("every document records the sha256 of the PDF it was transcribed from", () => {
    for (const [, seed] of SEEDS)
      expect(seed.document.source_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("IT and HM preserve the source's Fully/Best Qualified split", () => {
    for (const seed of [itE1E9, hmE1E9]) {
      const tiers = new Set(
        advancementRows(seed).map((m) => (m.detail as any).tier),
      );
      expect(tiers).toEqual(new Set(["fully_qualified", "best_qualified"]));
    }
  });

  it("BM does not invent a tier its LaDR never prints", () => {
    const tiers = new Set(
      advancementRows(bmE1E9).map((m) => (m.detail as any).tier),
    );
    expect(tiers).toEqual(new Set(["unspecified"]));
  });

  it("every step of every rating is covered", () => {
    for (const [, seed] of SEEDS) {
      const steps = new Set(
        advancementRows(seed).map((m) => (m.detail as any).step),
      );
      expect(steps).toEqual(new Set(Object.keys(STEP_PAYGRADE)));
    }
  });
});
