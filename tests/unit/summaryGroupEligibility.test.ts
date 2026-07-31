import { describe, it, expect } from "vitest";
import {
  dutyStatusBucket,
  isEvalEligibleForSummaryGroup,
  visibleSummaryGroupsForEval,
} from "@/lib/summaryGroupEligibility";
import { SummaryGroupWithRs } from "@/lib/summaryGroupEligibility";

const baseEval = {
  grade_rate: "PO2",
  promotion_status: "Regular",
  period_to: "2025-12-31",
  report_type: "EVAL" as const,
  uic: "12345",
  duty_status: "ACT",
  summary_group_id: null as string | null,
  block_values: {
    reporting_senior_dod_id: "4567890123",
    billet_subcategory: "NA",
  },
};

const matchingGroup: SummaryGroupWithRs = {
  id: "g1",
  name: "E-5 Regular FY25",
  reporting_senior_id: "rs-1",
  period_to: "2025-12-31",
  grade_rate: "PO2",
  promotion_status: "Regular",
  command_employment: "LEAD LPO",
  report_type: "EVAL",
  status: "open",
  reporting_senior_dod_id: "4567890123",
};

describe("isEvalEligibleForSummaryGroup", () => {
  it("accepts a group that matches all BUPERS shared fields", () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, matchingGroup)).toBe(true);
  });

  it("rejects a group for a different paygrade (PO2 vs PO1)", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g2",
        grade_rate: "PO1",
      }),
    ).toBe(false);
  });

  it("rejects a group with different promotion status", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g3",
        promotion_status: "Frocked",
      }),
    ).toBe(false);
  });

  it("rejects a group with a different ending date", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g4",
        period_to: "2024-12-31",
      }),
    ).toBe(false);
  });

  it("rejects a group for a different reporting senior", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g5",
        reporting_senior_dod_id: "9999999999",
      }),
    ).toBe(false);
  });

  it("rejects closed groups unless already attached", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        status: "closed",
      }),
    ).toBe(false);
    expect(
      isEvalEligibleForSummaryGroup(
        { ...baseEval, summary_group_id: "g1" },
        { ...matchingGroup, status: "closed" },
      ),
    ).toBe(true);
  });

  it("filters UIC when the group specifies a breakout UIC", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g6",
        uic: "12345",
      }),
    ).toBe(true);
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g7",
        uic: "99999",
      }),
    ).toBe(false);
  });

  // ── Table 1-4 Block 5 Duty/Competitive Status ────────────────────────────
  // "For enlisted, group ACT and TAR together, group INACT, AT/ADOS separately."
  it("groups enlisted ACT and TAR together (Block 5, Table 1-4)", () => {
    const tarGroup = { ...matchingGroup, id: "g-tar", duty_status: "TAR" };
    expect(isEvalEligibleForSummaryGroup(baseEval, tarGroup)).toBe(true);
    expect(
      isEvalEligibleForSummaryGroup(
        { ...baseEval, duty_status: "TAR" },
        { ...matchingGroup, id: "g-act", duty_status: "ACT" },
      ),
    ).toBe(true);
  });

  it("separates enlisted INACT and AT/ADOS from ACT/TAR (Block 5, Table 1-4)", () => {
    for (const separate of ["INACT", "AT/ADOS"]) {
      expect(
        isEvalEligibleForSummaryGroup(baseEval, {
          ...matchingGroup,
          id: `g-${separate}`,
          duty_status: separate,
        }),
        `ACT eval must not join a ${separate} group`,
      ).toBe(false);
    }
    // ...and INACT and AT/ADOS are separate from each other.
    expect(
      isEvalEligibleForSummaryGroup(
        { ...baseEval, duty_status: "INACT" },
        { ...matchingGroup, id: "g-at", duty_status: "AT/ADOS" },
      ),
    ).toBe(false);
  });

  it("does NOT merge ACT and TAR for officers (Table 1-3 groups by the box marked)", () => {
    const fitrepEval = {
      ...baseEval,
      grade_rate: "LCDR",
      report_type: "FITREP" as const,
    };
    const fitrepGroup: SummaryGroupWithRs = {
      ...matchingGroup,
      id: "g-off",
      grade_rate: "LCDR",
      report_type: "FITREP",
    };
    expect(
      isEvalEligibleForSummaryGroup(fitrepEval, {
        ...fitrepGroup,
        duty_status: "ACT",
      }),
    ).toBe(true);
    expect(
      isEvalEligibleForSummaryGroup(fitrepEval, {
        ...fitrepGroup,
        id: "g-off-tar",
        duty_status: "TAR",
      }),
    ).toBe(false);
  });

  it("bucket helper implements the enlisted/officer Block 5 split", () => {
    expect(dutyStatusBucket("ACT", "EVAL")).toBe("ACT/TAR");
    expect(dutyStatusBucket("TAR", "CHIEFEVAL")).toBe("ACT/TAR");
    expect(dutyStatusBucket("INACT", "EVAL")).toBe("INACT");
    expect(dutyStatusBucket("AT/ADOS", "EVAL")).toBe("AT/ADOS");
    expect(dutyStatusBucket("ACT", "FITREP")).toBe("ACT");
    expect(dutyStatusBucket("TAR", "FITREP")).toBe("TAR");
  });

  // ── Table 1-4 Block 21 Billet ────────────────────────────────────────────
  // "Group by entry in this block."
  it("splits groups by Block 21 billet", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g-billet-na",
        billet_subcategory: "NA",
      }),
    ).toBe(true);
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g-billet-inst",
        billet_subcategory: "INSTRUCTOR",
      }),
    ).toBe(false);
  });

  // The blank forms in public/ print "21. Billet Subcategory (if any)", so NO entry is
  // itself an entry, and "Group by entry in this block" makes blank group with blank.
  // A group that STATES a blank Block 21 ('') must therefore reject a report that has
  // one ("NA"), which a truthiness guard — `if (group.billet_subcategory && …)` — cannot
  // do, because '' is falsy. This test is the difference between the two.
  it("treats a stated-blank Block 21 as an entry, not as 'unrestricted'", () => {
    const blankBilletGroup: SummaryGroupWithRs = {
      ...matchingGroup,
      id: "g-billet-blank",
      duty_status: "ACT",
      billet_subcategory: "",
    };
    // Eval HAS a Block 21 entry ("NA") — the group's entry is blank, so it does not match.
    expect(isEvalEligibleForSummaryGroup(baseEval, blankBilletGroup)).toBe(
      false,
    );
    // Eval has NO Block 21 entry — same entry as the group, so it joins.
    expect(
      isEvalEligibleForSummaryGroup(
        {
          ...baseEval,
          block_values: { reporting_senior_dod_id: "4567890123" },
        },
        blankBilletGroup,
      ),
    ).toBe(true);
  });

  // Migration 012 carve-out, stated honestly rather than implemented quietly: the 12
  // groups that predate the columns have null Block 5 / Block 21 because their reporting
  // senior never stated either. Those stay unrestricted on both — the alternative was
  // inventing the values, which would silently mis-bucket live reports.
  it("leaves a pre-012 group (null Block 5 / Block 21) unrestricted on both", () => {
    expect(matchingGroup.duty_status).toBeUndefined();
    expect(matchingGroup.billet_subcategory).toBeUndefined();
    for (const ds of ["ACT", "TAR", "INACT", "AT/ADOS"]) {
      expect(
        isEvalEligibleForSummaryGroup(
          { ...baseEval, duty_status: ds },
          matchingGroup,
        ),
        `pre-012 group must not reject a ${ds} report`,
      ).toBe(true);
    }
    expect(
      isEvalEligibleForSummaryGroup(
        {
          ...baseEval,
          block_values: {
            reporting_senior_dod_id: "4567890123",
            billet_subcategory: "INSTRUCTOR",
          },
        },
        matchingGroup,
      ),
    ).toBe(true);
  });

  // ── Table 1-4 Block 6 UIC — permissive, and deliberately so ──────────────
  // "If reporting seniors have more than one UIC, but desire to group all enlisted
  // personnel together, they may do so." Table 1-3 has no Block 6 row at all. So an
  // unset UIC means "not splitting by UIC" — NOT the pre-012 "never stated" gap. If
  // someone ever "fixes" this guard to match Block 5/21's `!= null` shape for symmetry,
  // this fails.
  it("does not restrict by Block 6 UIC when the group leaves it unset", () => {
    // null is what the database returns for a group that is not splitting by UIC;
    // "" is what an unconverted form field would supply. Neither may start demanding
    // that a report's Block 6 be blank — that is the opposite of "they may do so".
    for (const groupUic of [null, "", undefined as any]) {
      for (const evalUic of ["12345", "99999", ""]) {
        expect(
          isEvalEligibleForSummaryGroup(
            { ...baseEval, uic: evalUic },
            { ...matchingGroup, uic: groupUic },
          ),
          `a group with Block 6 ${JSON.stringify(groupUic)} must accept a report with UIC "${evalUic}"`,
        ).toBe(true);
      }
    }
  });
});

// Every characteristic in Tables 1-3/1-4 that APEX claims to model must actually reject a
// report that differs on it. One row per guard: delete any single guard from
// isEvalEligibleForSummaryGroup and exactly one of these fails, which is what a whole
// third of this module silently not executing looked like.
describe("Tables 1-3/1-4 — each modelled characteristic rejects on its own", () => {
  const fullGroup: SummaryGroupWithRs = {
    ...matchingGroup,
    id: "g-full",
    uic: "12345",
    duty_status: "ACT",
    billet_subcategory: "NA",
  };

  const rows: Array<{
    block: string;
    quote: string;
    differing: Partial<typeof baseEval>;
  }> = [
    {
      block: "Blk 2 Rate",
      quote: "Group by current paygrade, regardless of rating.",
      differing: { grade_rate: "PO1" },
    },
    {
      block: "Blk 5 Duty/Competitive Status",
      quote:
        "For enlisted, group ACT and TAR together, group INACT, AT/ADOS separately.",
      differing: { duty_status: "INACT" },
    },
    {
      block: "Blk 6 UIC",
      quote: "Block 6 should match the primary UIC of the reporting senior",
      differing: { uic: "99999" },
    },
    {
      block: "Blk 8 Promotion Status",
      quote: "Group by promotion status.",
      differing: { promotion_status: "Frocked" },
    },
    {
      block: "Blk 15 To",
      quote: "Group by ending date of report.",
      differing: { period_to: "2024-12-31" },
    },
    {
      block: "Blk 17-18 Type of Report",
      quote: "Group by type of report.",
      differing: { report_type: "CHIEFEVAL" as any },
    },
    {
      block: "Blk 21 Billet",
      quote: "Group by entry in this block.",
      differing: {
        block_values: {
          reporting_senior_dod_id: "4567890123",
          billet_subcategory: "INSTRUCTOR",
        },
      },
    },
    {
      block: "Blk 22 Reporting Senior",
      quote: "Group by reporting senior.",
      differing: {
        block_values: {
          reporting_senior_dod_id: "9999999999",
          billet_subcategory: "NA",
        },
      },
    },
  ];

  it("accepts a report matching the group on every characteristic", () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, fullGroup)).toBe(true);
  });

  it.each(rows)("$block — $quote", ({ differing }) => {
    expect(
      isEvalEligibleForSummaryGroup({ ...baseEval, ...differing }, fullGroup),
    ).toBe(false);
  });
});

describe("visibleSummaryGroupsForEval", () => {
  it("returns only eligible open groups for PO2 Doe", () => {
    const groups: SummaryGroupWithRs[] = [
      matchingGroup,
      { ...matchingGroup, id: "g-wrong-pg", grade_rate: "PO1" },
      { ...matchingGroup, id: "g-wrong-date", period_to: "2024-12-31" },
    ];
    const visible = visibleSummaryGroupsForEval(baseEval, groups);
    expect(visible.map((g) => g.id)).toEqual(["g1"]);
  });
});
