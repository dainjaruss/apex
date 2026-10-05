import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  buildWorkspaceSqlite,
  importWorkspaceSqlite,
  installWorkspaceWasmForTests,
  WorkspaceReplaceNeeded,
} from "./workspaceSqlite";
import { markWorkspaceDirty, noteWorkspaceLoaded, noteWorkspaceIdentity, readWorkspaceIdentity } from "./workspaceSession";
import type { Evaluation } from "@/types";

function evalRow(id: string, name: string): Evaluation {
  return {
    id,
    report_type: "EVAL",
    member_name: name,
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
    lock_holder_name: "KIRK, J",
    lock_token: `token-${id}`,
    lock_ratchet: `ratchet-${id}`,
    lock_activity_at: "2026-10-05T12:00:00.000Z",
    created_at: "2026-10-05T12:00:00.000Z",
    updated_at: "2026-10-05T12:00:00.000Z",
  };
}

beforeAll(() => {
  // Node's builtin loader, reached without a static node: import so the app tsconfig stays browser-only.
  const proc = (
    globalThis as {
      process?: {
        cwd?: () => string;
        getBuiltinModule?: (name: string) => {
          readFileSync: (file: string) => Uint8Array;
        };
      };
    }
  ).process;
  const fs = proc?.getBuiltinModule?.("node:fs");
  if (!fs) throw new Error("The SQLite test needs Node to read the wasm file.");
  const buf = fs.readFileSync(`${proc?.cwd?.() ?? "."}/node_modules/sql.js/dist/sql-wasm.wasm`);
  installWorkspaceWasmForTests(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
});

beforeEach(async () => {
  localStorage.clear();
  await db.evaluations.clear();
  await db.summary_groups.clear();
  await db.continuity_records.clear();
  await db.rsca_records.clear();
  await db.brag_sheets.clear();
  await db.profiles.clear();
  await db.roster.clear();
  localStorage.clear();
});

describe("sqlite workspace file", () => {
  it("round-trips reports, including custody, and replaces the open workspace", async () => {
    const built = await buildWorkspaceSqlite({
      evaluations: [evalRow("eval-1", "UHURA, NYOTA")],
      summaryGroups: [],
      continuityRecords: [],
      rscaRecords: [],
      bragSheets: [
        {
          id: "brag-1",
          member_dod_id: "",
          member_name: "UHURA, NYOTA",
          cycle_year: "2026",
          items: [],
          updated_at: "2026-10-05T12:00:00.000Z",
        },
      ],
      profiles: [],
      previousRatchet: "0",
      exportedAt: "2026-10-05T12:00:00.000Z",
    });
    expect(built.fileRatchet).not.toBe("0");

    await db.evaluations.put(evalRow("eval-old", "OLD, RECORD"));
    const summary = await importWorkspaceSqlite(built.bytes, { force: true });
    expect(summary.evalCount).toBe(1);
    expect(summary.bragCount).toBe(1);
    expect(await db.evaluations.get("eval-old")).toBeUndefined();
    const restored = await db.evaluations.get("eval-1");
    expect(restored?.member_name).toBe("UHURA, NYOTA");
    expect(restored?.lock_holder_name).toBe("KIRK, J");
    expect(restored?.lock_ratchet).toBe("ratchet-eval-1");
    expect((await db.brag_sheets.get("brag-1"))?.member_name).toBe("UHURA, NYOTA");
    expect(localStorage.getItem("apex_v2_file_ratchet")).toBe(built.fileRatchet);
    expect(localStorage.getItem("apex_v2_workspace_dirty")).toBeNull();
  });

  it("refuses to replace a dirty workspace when the file ratchet moved on", async () => {
    const built = await buildWorkspaceSqlite({
      evaluations: [evalRow("eval-1", "UHURA, NYOTA")],
      summaryGroups: [],
      continuityRecords: [],
      rscaRecords: [],
      bragSheets: [],
      profiles: [],
      previousRatchet: "0",
      exportedAt: "2026-10-05T12:00:00.000Z",
    });
    noteWorkspaceLoaded("earlier-ratchet");
    markWorkspaceDirty();
    await expect(importWorkspaceSqlite(built.bytes)).rejects.toBeInstanceOf(WorkspaceReplaceNeeded);
    expect(await db.evaluations.count()).toBe(0);
  });

  it("round-trips scope, the holder, and the roster", async () => {
    const identity = {
      scope: "command" as const,
      workspaceId: "ws-command",
      holderName: "KIRK, JAMES T",
      holderRole: "Reporting Senior" as const,
    };
    const built = await buildWorkspaceSqlite({
      evaluations: [],
      summaryGroups: [],
      continuityRecords: [],
      rscaRecords: [],
      bragSheets: [],
      profiles: [],
      roster: [{ id: "ws-sailor", holder_name: "UHURA, NYOTA", holder_role: "Sailor" }],
      identity,
      previousRatchet: "0",
      exportedAt: "2026-10-05T12:00:00.000Z",
    });
    await importWorkspaceSqlite(built.bytes, { force: true });
    expect(readWorkspaceIdentity()).toEqual(identity);
    expect(await db.roster.get("ws-sailor")).toMatchObject({
      holder_name: "UHURA, NYOTA",
      holder_role: "Sailor",
    });
  });

  it("clears workspace identity when the file has no scope", async () => {
    noteWorkspaceIdentity({
      scope: "member",
      workspaceId: "ws-sailor",
      holderName: "UHURA, NYOTA",
      holderRole: "Sailor",
    });
    const built = await buildWorkspaceSqlite({
      evaluations: [],
      summaryGroups: [],
      continuityRecords: [],
      rscaRecords: [],
      bragSheets: [],
      profiles: [],
      previousRatchet: "0",
      exportedAt: "2026-10-05T12:00:00.000Z",
    });
    await importWorkspaceSqlite(built.bytes, { force: true });
    expect(readWorkspaceIdentity()).toBeNull();
  });
});
