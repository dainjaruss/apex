// tests/unit/seedChainSignable.test.ts
//
// Walks the full signature chain 42 -> 49 -> 51 -> 50 over the custody shape the
// seed scripts produce, and asserts every signature authorizes.
//
// This is the guard that was missing. canSignBlock requires the signer to be in
// the evaluation's own chain and never its subject, so a seeded record can look
// completely healthy and be signable by NOBODY. That is what happened to the
// CHIEFEVAL and FITREP showcase records: self-authored by the person who also
// held the only qualifying role, with `participants: [author]`. Nothing failed
// until a human clicked Sign during a demo.
//
// The custody here is built with participantsThrough() — the same helper the
// seeds now call — so the shape under test is the shape that gets written.

import { describe, it, expect } from "vitest";
import { participantsThrough } from "@/lib/routing";
import { authorizeSigner } from "@/lib/signing";
import { canSignBlock } from "@/lib/permissions";
import type { Evaluation, Profile } from "@/types";

const user = (id: string, role: Profile["preferred_role"]): Profile => ({
  id,
  first_name: id,
  last_name: id,
  preferred_role: role,
  assigned_roles: [role],
});

// The seeded roster (scripts/seed-e2e.ts E2E_USERS).
const roster = {
  sailor: user("sailor", "Sailor"),
  rater: user("rater", "Rater"),
  seniorRater: user("seniorRater", "Senior Rater"),
  reportingSenior: user("reportingSenior", "Reporting Senior"),
  admin: user("admin", "Admin"),
  williams: user("williams", "Sailor"),
  rodriguez: user("rodriguez", "Senior Rater"),
  chen: user("chen", "Reporting Senior"),
};

/** Mirrors showcaseCustody() in scripts/seed-e2e.ts. */
function showcase(member: string, seniorRater: string, rs: string): Evaluation {
  return {
    id: "e-1",
    created_by: member,
    routing_stage: "debrief",
    current_holder_id: rs,
    previous_holder_id: seniorRater,
    participants: participantsThrough("debrief", {
      sailor: member,
      rater: roster.rater.id,
      senior_rater: seniorRater,
      reporting_senior: rs,
    }),
    reviewer_id: null,
    form_definition_id: "EVAL",
    report_type: "EVAL",
    member_name: "X, Y Z",
    dod_id: "1234567890",
    grade_rate: "PO2",
    period_from: "2025-01-01",
    period_to: "2025-12-31",
    duty_status: "ACT",
    uic: "12345",
    ship_station: "USS NEVERSAIL",
    promotion_status: "Regular",
    comments: "",
    career_recommendations: [],
    promotion_recommendation: "Promotable",
    retention: "Recommended",
    status: "draft",
    block_values: {},
    trait_grades: {},
  } as Evaluation;
}

/** The NAVPERS signing order: Rater, Senior Rater, Member, Reporting Senior. */
const CHAIN_ORDER: Array<[number, keyof typeof roster | "member"]> = [
  [42, "rater"],
  [49, "seniorRater"],
  [51, "member"],
  [50, "reportingSenior"],
];

describe("participantsThrough", () => {
  it("produces the accumulated prefix, matching /api/eval-route", () => {
    const holders = {
      sailor: "s",
      rater: "r",
      senior_rater: "sr",
      reporting_senior: "rs",
    } as const;
    expect(participantsThrough("sailor", holders)).toEqual(["s"]);
    expect(participantsThrough("rater", holders)).toEqual(["s", "r"]);
    expect(participantsThrough("senior_rater", holders)).toEqual([
      "s",
      "r",
      "sr",
    ]);
    expect(participantsThrough("reporting_senior", holders)).toEqual([
      "s",
      "r",
      "sr",
      "rs",
    ]);
  });

  it("carries the whole chain into the terminal debrief/locked stages", () => {
    const holders = {
      sailor: "s",
      rater: "r",
      senior_rater: "sr",
      reporting_senior: "rs",
    } as const;
    expect(participantsThrough("debrief", holders)).toEqual([
      "s",
      "r",
      "sr",
      "rs",
    ]);
    expect(participantsThrough("locked", holders)).toEqual(
      participantsThrough("debrief", holders),
    );
  });

  it("dedupes when one person holds two stages", () => {
    expect(
      participantsThrough("reporting_senior", {
        sailor: "s",
        rater: "r",
        senior_rater: "r", // dual-hatted in a small command
        reporting_senior: "rs",
      }),
    ).toEqual(["s", "r", "rs"]);
  });
});

describe("seeded showcase records are signable end to end", () => {
  // Exactly the four records scripts/seed-e2e.ts builds via showcaseCustody().
  const records: Array<[string, Evaluation, Record<string, Profile>]> = [
    [
      "CHIEFEVAL — SMITH, BETTY L (member is the Senior Rater)",
      showcase(
        roster.seniorRater.id,
        roster.rodriguez.id,
        roster.reportingSenior.id,
      ),
      {
        member: roster.seniorRater,
        rater: roster.rater,
        seniorRater: roster.rodriguez,
        reportingSenior: roster.reportingSenior,
      },
    ],
    [
      "FITREP — JONES, CARL R (member is the Reporting Senior)",
      showcase(
        roster.reportingSenior.id,
        roster.seniorRater.id,
        roster.chen.id,
      ),
      {
        member: roster.reportingSenior,
        rater: roster.rater,
        seniorRater: roster.seniorRater,
        reportingSenior: roster.chen,
      },
    ],
    [
      "CHIEFEVAL — RODRIGUEZ, MARCOS E",
      showcase(
        roster.rodriguez.id,
        roster.seniorRater.id,
        roster.reportingSenior.id,
      ),
      {
        member: roster.rodriguez,
        rater: roster.rater,
        seniorRater: roster.seniorRater,
        reportingSenior: roster.reportingSenior,
      },
    ],
    [
      "FITREP — CHEN, DAVID T",
      showcase(
        roster.chen.id,
        roster.seniorRater.id,
        roster.reportingSenior.id,
      ),
      {
        member: roster.chen,
        rater: roster.rater,
        seniorRater: roster.seniorRater,
        reportingSenior: roster.reportingSenior,
      },
    ],
  ];

  it.each(records)("walks 42 → 49 → 51 → 50 on %s", (_name, ev, signers) => {
    for (const [block, who] of CHAIN_ORDER) {
      const signer = signers[who];
      const denial = authorizeSigner(signer, block, ev);
      expect(
        denial,
        `Block ${block} denied for ${signer.id}: ${denial?.error}`,
      ).toBeNull();
    }
  });

  it.each(records)(
    "has a signer on the roster for every block of %s",
    (_name, ev) => {
      const all = Object.values(roster);
      for (const [block] of CHAIN_ORDER) {
        expect(
          all.filter((p) => canSignBlock(p, block, ev)).length,
          `Block ${block} is signable by nobody`,
        ).toBeGreaterThan(0);
      }
    },
  );

  // The exact bug: self-authored, author is the only participant.
  it("fails on the OLD seed shape — proves this test would have caught it", () => {
    const broken = {
      ...showcase(
        roster.seniorRater.id,
        roster.rodriguez.id,
        roster.reportingSenior.id,
      ),
      routing_stage: "sailor" as const,
      current_holder_id: roster.seniorRater.id,
      previous_holder_id: null,
      participants: [roster.seniorRater.id],
    };
    const all = Object.values(roster);
    for (const block of [42, 49, 50, 52]) {
      expect(
        all.filter((p) => canSignBlock(p, block, broken)),
        `Block ${block} should have been signable by nobody`,
      ).toHaveLength(0);
    }
    // ...and the member could still sign their own member block, which is why
    // this looked fine in a smoke test.
    expect(canSignBlock(roster.seniorRater, 51, broken)).toBe(true);
  });
});

describe("stress-seed custody supports the whole chain", () => {
  // scripts/seed-stress.ts parks evals at sailor / rater / senior_rater /
  // reporting_senior. The old `[creator, holder]` pair dropped the intermediate
  // holders, so 42 -> 49 broke at the second signature.
  const holders = {
    sailor: roster.williams.id, // stress evals are authored by the member
    rater: roster.rater.id,
    senior_rater: roster.seniorRater.id,
    reporting_senior: roster.reportingSenior.id,
  } as const;

  const at = (stage: "senior_rater" | "reporting_senior"): Evaluation =>
    ({
      ...showcase(
        roster.williams.id,
        roster.seniorRater.id,
        roster.reportingSenior.id,
      ),
      routing_stage: stage,
      participants: participantsThrough(stage, holders),
    }) as Evaluation;

  it("lets the Rater sign 42 on an eval that has moved past them", () => {
    expect(authorizeSigner(roster.rater, 42, at("senior_rater"))).toBeNull();
    expect(
      authorizeSigner(roster.rater, 42, at("reporting_senior")),
    ).toBeNull();
  });

  it("walks the full chain at reporting_senior", () => {
    const ev = at("reporting_senior");
    expect(authorizeSigner(roster.rater, 42, ev)).toBeNull();
    expect(authorizeSigner(roster.seniorRater, 49, ev)).toBeNull();
    expect(authorizeSigner(roster.williams, 51, ev)).toBeNull();
    expect(authorizeSigner(roster.reportingSenior, 50, ev)).toBeNull();
  });

  it("breaks on the OLD two-element participants set", () => {
    const old = {
      ...at("reporting_senior"),
      participants: [roster.williams.id, roster.reportingSenior.id],
    };
    expect(authorizeSigner(roster.reportingSenior, 50, old)).toBeNull(); // holder: ok
    expect(authorizeSigner(roster.rater, 42, old)).not.toBeNull(); // dropped
    expect(authorizeSigner(roster.seniorRater, 49, old)).not.toBeNull(); // dropped
  });
});
