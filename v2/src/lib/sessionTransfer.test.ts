import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { buildEvalTransferPackage, importSingleEvalTransfer } from "./sessionTransfer";
import { noteWorkspaceIdentity } from "./workspaceSession";
import type { Evaluation } from "@/types";

function evalRow(id: string, ratchet: string): Evaluation {
  return {
    id,
    report_type: "EVAL",
    member_name: "UHURA, NYOTA",
    dod_id: "",
    grade_rate: "CTN1",
    period_from: "2025-10-01",
    period_to: "2026-10-01",
    duty_status: "ACT",
    uic: "00024",
    ship_station: "NAVSEA",
    promotion_status: "Regular",
    trait_grades: {},
    comments: "",
    career_recommendations: ["", ""],
    promotion_recommendation: "Promotable",
    retention: "Recommended",
    status: "draft",
    block_values: {},
    lock_ratchet: ratchet,
    created_at: "2026-10-05T12:00:00.000Z",
    updated_at: "2026-10-05T12:00:00.000Z",
  };
}

function transferFile(evaluation: Evaluation, baseRatchet?: string): File {
  return new File(
    [
      JSON.stringify({
        format: "APEX_EVAL_TRANSFER",
        version: "2.0.0",
        evaluation,
        ...(baseRatchet === undefined ? {} : { base_ratchet: baseRatchet }),
      }),
    ],
    "route.apex.json",
    { type: "application/json" },
  );
}

beforeEach(async () => {
  localStorage.clear();
  await db.evaluations.clear();
});

describe("single-report return", () => {
  it("refuses a copy made before the workspace copy moved on", async () => {
    await db.evaluations.put(evalRow("eval-1", "newer"));
    await expect(
      importSingleEvalTransfer(transferFile(evalRow("eval-1", "older"), "older")),
    ).rejects.toThrow(/changed after that copy was made/);
    expect((await db.evaluations.get("eval-1"))?.lock_ratchet).toBe("newer");
  });

  it("still accepts a legacy transfer that has no base ratchet", async () => {
    await db.evaluations.put(evalRow("eval-1", "newer"));
    const imported = await importSingleEvalTransfer(transferFile(evalRow("eval-1", "older")));
    expect(imported.lock_ratchet).toBe("older");
  });
});

function rankedRow(id: string): Evaluation {
  return {
    ...evalRow(id, "same"),
    trait_average: 4,
    summary_group_average: 3.5,
    summary_group_distribution: {
      "Significant Problems": 0,
      Progressing: 0,
      Promotable: 2,
      "Must Promote": 0,
      "Early Promote": 1,
    },
    promotion_recommendation: "Early Promote",
  };
}

describe("release copies", () => {
  it("member draft export omits ranking and keeps the trait average", async () => {
    noteWorkspaceIdentity({
      scope: "member",
      workspaceId: "ws-sailor",
      holderName: "UHURA, NYOTA",
      holderRole: "Sailor",
    });
    await db.evaluations.put(rankedRow("eval-draft"));
    const pkg = await buildEvalTransferPackage("eval-draft");
    expect(pkg.release).toBe("draft");
    expect(pkg.evaluation.promotion_recommendation).toBeUndefined();
    expect(pkg.evaluation.summary_group_average).toBeUndefined();
    expect(pkg.evaluation.summary_group_distribution).toBeUndefined();
    expect(pkg.evaluation.trait_average).toBe(4);
    expect(pkg.evaluation.ranking_released).toBe(false);
    expect((await db.evaluations.get("eval-draft"))?.promotion_recommendation).toBe("Early Promote");
  });

  it("review export strips the same three fields", async () => {
    noteWorkspaceIdentity({
      scope: "reviewer",
      workspaceId: "ws-rater",
      holderName: "KIRK, J",
      holderRole: "Rater",
    });
    await db.evaluations.put(rankedRow("eval-review"));
    const pkg = await buildEvalTransferPackage("eval-review");
    expect(pkg.release).toBe("review");
    expect(pkg.evaluation.promotion_recommendation).toBeUndefined();
    expect(pkg.evaluation.summary_group_average).toBeUndefined();
    expect(pkg.evaluation.summary_group_distribution).toBeUndefined();
    expect(pkg.evaluation.trait_average).toBe(4);
  });
});

describe("addressed import", () => {
  it("refuses a report addressed to a different workspace and leaves the local row", async () => {
    noteWorkspaceIdentity({
      scope: "member",
      workspaceId: "ws-sailor",
      holderName: "UHURA, NYOTA",
      holderRole: "Sailor",
    });
    await db.evaluations.put(evalRow("eval-1", "same"));
    const file = new File(
      [
        JSON.stringify({
          format: "APEX_EVAL_TRANSFER",
          version: "2.0.0",
          release: "draft",
          addressed_to: "ws-other",
          evaluation: { ...evalRow("eval-1", "same"), comments: "replaced" },
          base_ratchet: "same",
        }),
      ],
      "route.apex.json",
      { type: "application/json" },
    );
    await expect(importSingleEvalTransfer(file)).rejects.toThrow(/different workspace/);
    expect((await db.evaluations.get("eval-1"))?.comments).toBe("");
  });

  it("refuses a debrief copy in a reviewer workspace", async () => {
    noteWorkspaceIdentity({
      scope: "reviewer",
      workspaceId: "ws-rater",
      holderName: "KIRK, J",
      holderRole: "Rater",
    });
    await db.evaluations.put(evalRow("eval-1", "same"));
    const file = new File(
      [
        JSON.stringify({
          format: "APEX_EVAL_TRANSFER",
          version: "2.0.0",
          release: "debrief",
          addressed_to: "ws-rater",
          evaluation: {
            ...evalRow("eval-1", "same"),
            comments: "debrief",
            promotion_recommendation: "Early Promote",
            summary_group_average: 4,
            ranking_released: true,
          },
          base_ratchet: "same",
        }),
      ],
      "debrief.apex.json",
      { type: "application/json" },
    );
    await expect(importSingleEvalTransfer(file)).rejects.toThrow(/debrief copy opens only/);
    expect((await db.evaluations.get("eval-1"))?.comments).toBe("");
    expect((await db.evaluations.get("eval-1"))?.ranking_released).toBeUndefined();
  });
});
