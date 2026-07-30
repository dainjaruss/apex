// tests/unit/forcedDistribution.test.ts
import { describe, it, expect } from "vitest";
import {
  tallyRecommendations,
  checkForcedDistribution,
  emptyDistribution,
} from "@/lib/forcedDistribution";

describe("tallyRecommendations (Block 46 counts)", () => {
  it("counts the five observed categories and excludes NOB/blank", () => {
    const { distribution, observedCount } = tallyRecommendations([
      "Promotable",
      "Promotable",
      "Early Promote",
      "Must Promote",
      "NOB",
      null,
      undefined,
      "",
    ]);
    expect(distribution["Promotable"]).toBe(2);
    expect(distribution["Early Promote"]).toBe(1);
    expect(distribution["Must Promote"]).toBe(1);
    expect(observedCount).toBe(4); // the NOB / blanks do not count toward the summary group
  });

  it("starts from an all-zero distribution", () => {
    expect(emptyDistribution()).toEqual({
      "Significant Problems": 0,
      Progressing: 0,
      Promotable: 0,
      "Must Promote": 0,
      "Early Promote": 0,
    });
  });
});

describe("checkForcedDistribution — Early Promote ≤ 20% (all E1–E6, rounded up)", () => {
  const dist = (ep: number, mp = 0, observedFiller = 0) => ({
    "Significant Problems": 0,
    Progressing: observedFiller,
    Promotable: 0,
    "Must Promote": mp,
    "Early Promote": ep,
  });

  it("rounds the EP cap UP (3-person group allows 1 EP, not 0)", () => {
    // N=3 → ceil(0.20*3)=1
    expect(checkForcedDistribution(dist(1, 0, 2), "PO1").earlyPromoteMax).toBe(
      1,
    );
    expect(checkForcedDistribution(dist(1, 0, 2), "PO1").compliant).toBe(true);
    expect(checkForcedDistribution(dist(2, 0, 1), "PO1").compliant).toBe(false); // 2 EP in a group of 3
  });

  it("applies the EP cap to E1–E4 as well (rate SN = E-3)", () => {
    // N=5, EP max = ceil(1.0) = 1
    expect(checkForcedDistribution(dist(2, 0, 3), "SN").compliant).toBe(false);
    expect(checkForcedDistribution(dist(1, 0, 4), "SN").compliant).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Table 1-2 (BUPERSINST 1610.10H, Encl (2), ch. 1, p. 1-18), transcribed verbatim.
// Columns: summary-group size 1..30 → [Early Promote max, MP@60% tier, MP@50% tier, MP@40% tier].
// A blank MP cell in the printed table for N=1 is represented as null (no row for N=1 in the
// MP columns). N=2 carries Note 1: "All summary groups of two can receive one Early Promote
// and Must Promote."
// ─────────────────────────────────────────────────────────────────────────────
const TABLE_1_2: Array<[number, number, number, number, number]> = [
  // [N, EP, MP 60% (E5-E6/O3), MP 50% (E7-E9/W3-W5/O4), MP 40% (O5-O6)]
  [2, 1, 1, 1, 1],
  [3, 1, 1, 1, 1],
  [4, 1, 2, 1, 1],
  [5, 1, 2, 2, 1],
  [6, 2, 2, 1, 1],
  [7, 2, 3, 2, 1],
  [8, 2, 3, 2, 2],
  [9, 2, 4, 3, 2],
  [10, 2, 4, 3, 2],
  [11, 3, 4, 3, 2],
  [12, 3, 5, 3, 2],
  [13, 3, 5, 4, 3],
  [14, 3, 6, 4, 3],
  [15, 3, 6, 5, 3],
  [16, 4, 6, 4, 3],
  [17, 4, 7, 5, 3],
  [18, 4, 7, 5, 4],
  [19, 4, 8, 6, 4],
  [20, 4, 8, 6, 4],
  [21, 5, 8, 6, 4],
  [22, 5, 9, 6, 4],
  [23, 5, 9, 7, 5],
  [24, 5, 10, 7, 5],
  [25, 5, 10, 8, 5],
  [26, 6, 10, 7, 5],
  [27, 6, 11, 8, 5],
  [28, 6, 11, 8, 6],
  [29, 6, 12, 9, 6],
  [30, 6, 12, 9, 6],
];

const groupOf = (n: number) => ({
  "Significant Problems": 0,
  Progressing: n,
  Promotable: 0,
  "Must Promote": 0,
  "Early Promote": 0,
});

// One representative grade string per paygrade band named in the p. 1-17 limits.
const BANDS: Array<{
  label: string;
  grade: string;
  paygrade: string;
  /** null = the instruction says "No limit" for the combined EP+MP cap. */
  cap: number | null;
  /** Index into a TABLE_1_2 row for this band's Must-Promote column, when capped. */
  mpCol?: 2 | 3 | 4;
}> = [
  { label: "E1–E4 (no limit)", grade: "PO3", paygrade: "E-4", cap: null },
  { label: "E5–E6 (60%)", grade: "PO1", paygrade: "E-6", cap: 0.6, mpCol: 2 },
  { label: "E7–E9 (50%)", grade: "MCPO", paygrade: "E-9", cap: 0.5, mpCol: 3 },
  { label: "W1–W2 (no limit)", grade: "W-2", paygrade: "W-2", cap: null },
  { label: "W3–W5 (50%)", grade: "W-4", paygrade: "W-4", cap: 0.5, mpCol: 3 },
  { label: "O1–O2 (no limit)", grade: "ENS", paygrade: "O-1", cap: null },
  { label: "O3 (60%)", grade: "LT", paygrade: "O-3", cap: 0.6, mpCol: 2 },
  { label: "O4 (50%)", grade: "LCDR", paygrade: "O-4", cap: 0.5, mpCol: 3 },
  { label: "O5–O6 (40%)", grade: "CAPT", paygrade: "O-6", cap: 0.4, mpCol: 4 },
];

describe("checkForcedDistribution — combined EP+MP cap, per paygrade band (p. 1-17)", () => {
  for (const band of BANDS) {
    describe(band.label, () => {
      it("resolves the paygrade and the instruction's combined cap", () => {
        const r = checkForcedDistribution(groupOf(10), band.grade);
        expect(r.paygrade).toBe(band.paygrade);
        expect(r.combinedCapPct).toBe(band.cap);
      });

      if (band.cap == null) {
        it("applies no combined cap, but still caps Early Promote at 20%", () => {
          // 10 Must Promote in a group of 10 is legal for an uncapped band.
          const ok = checkForcedDistribution(
            { ...groupOf(0), "Must Promote": 10 },
            band.grade,
          );
          expect(ok.combinedMax).toBeNull();
          expect(ok.compliant).toBe(true);
          // ...but 3 Early Promote in a group of 10 (max 2) is still a violation.
          const bad = checkForcedDistribution(
            { ...groupOf(7), "Early Promote": 3 },
            band.grade,
          );
          expect(bad.compliant).toBe(false);
        });
      } else {
        it("reproduces every Table 1-2 row (EP max and MP max = combined − EP)", () => {
          for (const row of TABLE_1_2) {
            const [n, ep] = row;
            const mp = row[band.mpCol!];
            const r = checkForcedDistribution(groupOf(n), band.grade);
            expect(
              { n, ep: r.earlyPromoteMax, mp: r.combinedMax! - r.earlyPromoteMax },
              `Table 1-2 row N=${n} for ${band.label}`,
            ).toEqual({ n, ep, mp });
          }
        });

        it("REJECTS a group that exceeds the combined cap", () => {
          // A group of 10: combined max is ceil(10*cap). One over must be a violation.
          const combined = Math.ceil(10 * band.cap!) + 1;
          const r = checkForcedDistribution(
            {
              ...groupOf(10 - combined),
              "Early Promote": 1,
              "Must Promote": combined - 1,
            },
            band.grade,
          );
          expect(r.observedCount).toBe(10);
          expect(r.compliant).toBe(false);
          expect(
            r.violations.some((v) => v.category === "Must Promote (combined)"),
          ).toBe(true);
        });
      }
    });
  }

  it("honours Table 1-2 Note 1 — a group of two may take one EP and one MP in every band", () => {
    for (const band of BANDS) {
      const r = checkForcedDistribution(
        { ...groupOf(0), "Early Promote": 1, "Must Promote": 1 },
        band.grade,
      );
      expect(r.observedCount).toBe(2);
      expect(r.compliant, `${band.label} group of two`).toBe(true);
    }
  });

  it("asserts no combined cap when the grade/rate cannot be resolved", () => {
    const r = checkForcedDistribution(
      { ...groupOf(0), "Must Promote": 10 },
      "not-a-rank",
    );
    expect(r.paygrade).toBeNull();
    expect(r.combinedCapPct).toBeNull();
    expect(r.combinedMax).toBeNull();
    expect(r.compliant).toBe(true);
  });
});

describe("checkForcedDistribution — EP+MP combined ≤ 60% (E5–E6 only)", () => {
  it("reproduces Table 1-2 maxima for E5–E6", () => {
    const cases: Array<[number, number, number]> = [
      // [observedCount, expectedEPmax, expectedCombinedMax]
      [1, 1, 1],
      [2, 1, 2],
      [3, 1, 2],
      [4, 1, 3],
      [5, 1, 3],
      [6, 2, 4],
      [10, 2, 6],
      [20, 4, 12],
      [30, 6, 18],
      [42, 9, 26],
    ];
    for (const [n, epMax, combinedMax] of cases) {
      const r = checkForcedDistribution(
        {
          "Significant Problems": 0,
          Progressing: n,
          Promotable: 0,
          "Must Promote": 0,
          "Early Promote": 0,
        },
        "PO1", // E-6
      );
      expect(r.observedCount).toBe(n);
      expect(r.earlyPromoteMax).toBe(epMax);
      expect(r.combinedMax).toBe(combinedMax);
      // Table 1-2 Must-Promote max = combined − EP
      expect((r.combinedMax as number) - r.earlyPromoteMax).toBe(
        combinedMax - epMax,
      );
    }
  });

  it("flags an over-cap combined EP+MP for E5–E6", () => {
    // N=5 → EP max 1, combined max 3. 1 EP + 3 MP = 4 > 3 → violation.
    const r = checkForcedDistribution(
      {
        "Significant Problems": 0,
        Progressing: 1,
        Promotable: 0,
        "Must Promote": 3,
        "Early Promote": 1,
      },
      "PO1",
    );
    expect(r.compliant).toBe(false);
    expect(
      r.violations.some((v) => v.category === "Must Promote (combined)"),
    ).toBe(true);
  });

  it("does NOT apply a Must-Promote/combined cap to E1–E4", () => {
    // E-4 (PO3) group of 5: 5 Must Promote is allowed (no MP limit); only EP is capped.
    const r = checkForcedDistribution(
      {
        "Significant Problems": 0,
        Progressing: 0,
        Promotable: 0,
        "Must Promote": 5,
        "Early Promote": 0,
      },
      "PO3",
    );
    expect(r.combinedCapPct).toBeNull();
    expect(r.combinedMax).toBeNull();
    expect(r.compliant).toBe(true);
  });

  it("never caps Promotable (no enlisted Promotable limit)", () => {
    const r = checkForcedDistribution(
      {
        "Significant Problems": 0,
        Progressing: 0,
        Promotable: 10,
        "Must Promote": 0,
        "Early Promote": 0,
      },
      "PO1",
    );
    expect(r.compliant).toBe(true);
  });
});
