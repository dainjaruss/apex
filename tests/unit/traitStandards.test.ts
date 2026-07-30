import { describe, it, expect } from "vitest";
import {
  TRAIT_STANDARDS,
  TRAIT_GRADE_LABELS,
  GRADE_SCALE_NOTE,
  ANCHOR_GRADES,
  SUBSTANTIATION_NOTE_CHIEFEVAL,
  SUBSTANTIATION_NOTE_EVAL,
  SUBSTANTIATION_NOTE_FITREP,
  TraitKey,
} from "../../lib/traitStandards";

// The 7 traits map to blocks 33-39 in order.
const EXPECTED_BLOCKS: Record<TraitKey, number> = {
  knowledge: 33,
  work: 34,
  eo: 35,
  bearing: 36,
  accomplishment: 37,
  teamwork: 38,
  leadership: 39,
};

describe("NAVPERS 1616/26 trait standards", () => {
  it("defines all 7 traits mapped to blocks 33-39", () => {
    const keys = Object.keys(TRAIT_STANDARDS) as TraitKey[];
    expect(keys).toHaveLength(7);
    for (const k of keys) {
      expect(TRAIT_STANDARDS[k].block).toBe(EXPECTED_BLOCKS[k]);
    }
  });

  it("provides non-empty 1.0 / 3.0 / 5.0 anchor verbiage for every trait", () => {
    for (const key of Object.keys(TRAIT_STANDARDS) as TraitKey[]) {
      const std = TRAIT_STANDARDS[key];
      expect(std.title.length).toBeGreaterThan(0);
      expect(std.definition.length).toBeGreaterThan(0);
      for (const grade of ANCHOR_GRADES) {
        const bullets = std.anchors[grade];
        expect(Array.isArray(bullets)).toBe(true);
        expect(bullets.length).toBeGreaterThan(0);
        bullets.forEach((b) => expect(b.trim().length).toBeGreaterThan(0));
      }
    }
  });

  it("only carries bullet text on the 1.0/3.0/5.0 anchors (2.0/4.0 are blank steps)", () => {
    expect(ANCHOR_GRADES).toEqual(["1.0", "3.0", "5.0"]);
    // The intermediate marks are described by the scale legend, not per-trait bullets.
    expect(GRADE_SCALE_NOTE["2.0"]).toMatch(/does not yet meet/i);
    expect(GRADE_SCALE_NOTE["4.0"]).toMatch(/exceeds most/i);
  });

  it("labels every grade column including NOB", () => {
    for (const g of ["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]) {
      expect(TRAIT_GRADE_LABELS[g]).toBeTruthy();
    }
    expect(TRAIT_GRADE_LABELS["1.0"]).toBe("Below Standards");
    expect(TRAIT_GRADE_LABELS["5.0"]).toBe("Greatly Exceeds Standards");
  });

  it("matches a known verbatim anchor (Block 34, 5.0) against the form", () => {
    expect(TRAIT_STANDARDS.work.anchors["5.0"]).toContain(
      "Always produces exceptional work",
    );
    expect(TRAIT_STANDARDS.knowledge.anchors["1.0"]).toContain(
      "Marginal knowledge of rating, specialty or job",
    );
  });

  it("does not invent a Block 43 obligation for 5.0 marks", () => {
    // The printed Blk 43 footnote covers 1.0 marks, three or more 2.0s, and a
    // 2.0 in Block 35. Written explanations of 1.0 AND 5.0 belong to the Block
    // 42/49 certifications, and para 13-4 never mentions 5.0 at all
    // (docs/navy-reference.md §3.11). This string used to open with the 5.0
    // claim, and the narrative coach repeated it to a user as fact.
    for (const note of [
      SUBSTANTIATION_NOTE_EVAL,
      SUBSTANTIATION_NOTE_CHIEFEVAL,
      SUBSTANTIATION_NOTE_FITREP,
    ])
      expect(note).not.toMatch(/5\.0/);
    expect(SUBSTANTIATION_NOTE_EVAL).toMatch(/all 1\.0 marks/i);
    expect(SUBSTANTIATION_NOTE_EVAL).toMatch(/block 35/i);
  });
});
