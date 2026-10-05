// The SQLite file is the workspace record. While it is open, the browser copy
// in IndexedDB is what the screens read. Save writes a new file and advances
// the file ratchet so a later open can tell that the shared copy moved on.

import initSqlJs from "sql.js";
import { db } from "./db";
import { advanceRatchet } from "./reportLock";
import {
  isWorkspaceDirty,
  noteWorkspaceIdentity,
  noteWorkspaceLoaded,
  openConflictMessage,
  readFileRatchet,
  readWorkspaceIdentity,
  type WorkspaceIdentity,
} from "./workspaceSession";
import type {
  BragSheet,
  ContinuityRecord,
  Evaluation,
  Profile,
  RscaHistoricalRecord,
  RosterEntry,
  SummaryGroup,
} from "@/types";

const FORMAT = "APEX_WORKSPACE_SQLITE";
const VERSION = "1";

type SqlDatabase = {
  run(sql: string, params?: Array<string | number | null>): void;
  prepare(sql: string): {
    bind(params: Array<string | number | null>): void;
    step(): boolean;
    getAsObject(): Record<string, string | number | Uint8Array | null>;
    free(): void;
  };
  export(): Uint8Array;
  close(): void;
};

type SqlStatic = {
  Database: new (data?: ArrayLike<number> | null) => SqlDatabase;
};

export class WorkspaceReplaceNeeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceReplaceNeeded";
  }
}

export interface WorkspaceFileSummary {
  fileRatchet: string;
  evalCount: number;
  groupCount: number;
  continuityCount: number;
  rscaCount: number;
  bragCount: number;
  profileCount: number;
}

let sqlPromise: Promise<SqlStatic> | null = null;
let wasmOverride: ArrayBuffer | null = null;

/** Vitest loads the wasm from disk and hands it here. The browser fetches the bundled file. */
export function installWorkspaceWasmForTests(binary: ArrayBuffer): void {
  wasmOverride = binary;
  sqlPromise = null;
}

async function loadWasmBinary(): Promise<ArrayBuffer> {
  if (wasmOverride) return wasmOverride;
  const wasmMod = await import("sql.js/dist/sql-wasm.wasm?url");
  const response = await fetch(wasmMod.default);
  if (!response.ok) throw new Error("Could not load the SQLite engine.");
  return response.arrayBuffer();
}

async function loadSql(): Promise<SqlStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const wasmBinary = await loadWasmBinary();
      return (await initSqlJs({ wasmBinary })) as unknown as SqlStatic;
    })();
  }
  return sqlPromise;
}

function readMeta(database: SqlDatabase): Record<string, string> {
  const meta: Record<string, string> = {};
  const stmt = database.prepare("SELECT key, value FROM meta");
  while (stmt.step()) {
    const row = stmt.getAsObject();
    meta[String(row.key)] = String(row.value ?? "");
  }
  stmt.free();
  return meta;
}

function rowsOf(database: SqlDatabase, collection: string): string[] {
  const bodies: string[] = [];
  const stmt = database.prepare(
    "SELECT body FROM records WHERE collection = ? ORDER BY id",
  );
  stmt.bind([collection]);
  while (stmt.step()) {
    bodies.push(String(stmt.getAsObject().body ?? ""));
  }
  stmt.free();
  return bodies;
}

function summaryFrom(database: SqlDatabase): WorkspaceFileSummary {
  const meta = readMeta(database);
  if (meta.format !== FORMAT) {
    throw new Error("This file is not an APEX workspace.");
  }
  return {
    fileRatchet: meta.file_ratchet || "0",
    evalCount: rowsOf(database, "evaluations").length,
    groupCount: rowsOf(database, "summary_groups").length,
    continuityCount: rowsOf(database, "continuity_records").length,
    rscaCount: rowsOf(database, "rsca_records").length,
    bragCount: rowsOf(database, "brag_sheets").length,
    profileCount: rowsOf(database, "profiles").length,
  };
}

async function withDatabase<T>(
  bytes: Uint8Array | null,
  run: (database: SqlDatabase) => T,
): Promise<T> {
  const SQL = await loadSql();
  const database = bytes ? new SQL.Database(bytes) : new SQL.Database();
  try {
    return run(database);
  } finally {
    database.close();
  }
}

export function isSqliteWorkspace(bytes: Uint8Array): boolean {
  const header = new TextDecoder().decode(bytes.slice(0, 15));
  return header === "SQLite format 3";
}

export async function readWorkspaceSummary(bytes: Uint8Array): Promise<WorkspaceFileSummary> {
  return withDatabase(bytes, summaryFrom);
}

export async function buildWorkspaceSqlite(input: {
  evaluations: Evaluation[];
  summaryGroups: SummaryGroup[];
  continuityRecords: ContinuityRecord[];
  rscaRecords: RscaHistoricalRecord[];
  bragSheets: BragSheet[];
  profiles: Profile[];
  roster?: RosterEntry[];
  identity?: WorkspaceIdentity | null;
  previousRatchet: string;
  exportedAt: string;
}): Promise<{ bytes: Uint8Array; fileRatchet: string }> {
  const fileRatchet = await advanceRatchet(
    input.previousRatchet || "0",
    `file|${input.exportedAt}|${input.evaluations.length}`,
  );
  const bytes = await withDatabase(null, (database) => {
    database.run(
      "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    database.run(
      "CREATE TABLE records (collection TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (collection, id))",
    );
    const meta: Array<[string, string]> = [
      ["format", FORMAT],
      ["version", VERSION],
      ["file_ratchet", fileRatchet],
      ["exported_at", input.exportedAt],
    ];
    if (input.identity) {
      meta.push(
        ["scope", input.identity.scope],
        ["workspace_id", input.identity.workspaceId],
        ["holder_name", input.identity.holderName],
        ["holder_role", input.identity.holderRole],
      );
    }
    for (const [key, value] of meta) {
      database.run("INSERT INTO meta (key, value) VALUES (?, ?)", [key, value]);
    }
    const insert = (
      collection: string,
      rows: Array<{ id: string }>,
    ) => {
      for (const row of rows) {
        database.run("INSERT INTO records (collection, id, body) VALUES (?, ?, ?)", [
          collection,
          row.id,
          JSON.stringify(row),
        ]);
      }
    };
    insert("evaluations", input.evaluations);
    insert("summary_groups", input.summaryGroups);
    insert("continuity_records", input.continuityRecords);
    insert("rsca_records", input.rscaRecords);
    insert("brag_sheets", input.bragSheets);
    insert("profiles", input.profiles);
    insert("roster", input.roster ?? []);
    return database.export();
  });
  return { bytes, fileRatchet };
}

export async function exportOpenWorkspace(): Promise<Uint8Array> {
  const exportedAt = new Date().toISOString();
  const { bytes, fileRatchet } = await buildWorkspaceSqlite({
    evaluations: await db.evaluations.toArray(),
    summaryGroups: await db.summary_groups.toArray(),
    continuityRecords: await db.continuity_records.toArray(),
    rscaRecords: await db.rsca_records.toArray(),
    bragSheets: await db.brag_sheets.toArray(),
    profiles: await db.profiles.toArray(),
    roster: await db.roster.toArray(),
    identity: readWorkspaceIdentity(),
    previousRatchet: readFileRatchet() || "0",
    exportedAt,
  });
  noteWorkspaceLoaded(fileRatchet);
  return bytes;
}

export async function downloadOpenWorkspace(fileNamePrefix = "APEX_Navy_Workspace"): Promise<void> {
  const bytes = await exportOpenWorkspace();
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/vnd.sqlite3" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().split("T")[0];
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileNamePrefix}_${dateStr}.sqlite`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseRows<T>(bodies: string[]): T[] {
  return bodies.map((body) => JSON.parse(body) as T);
}

export async function importWorkspaceSqlite(
  bytes: Uint8Array,
  options?: { force?: boolean },
): Promise<WorkspaceFileSummary> {
  const summary = await readWorkspaceSummary(bytes);
  if (!options?.force) {
    const message = openConflictMessage(summary.fileRatchet);
    if (message) throw new WorkspaceReplaceNeeded(message);
  }
  const loaded = await withDatabase(bytes, (database) => ({
    evaluations: parseRows<Evaluation>(rowsOf(database, "evaluations")),
    summaryGroups: parseRows<SummaryGroup>(rowsOf(database, "summary_groups")),
    continuityRecords: parseRows<ContinuityRecord>(rowsOf(database, "continuity_records")),
    rscaRecords: parseRows<RscaHistoricalRecord>(rowsOf(database, "rsca_records")),
    bragSheets: parseRows<BragSheet>(rowsOf(database, "brag_sheets")),
    profiles: parseRows<Profile>(rowsOf(database, "profiles")),
    roster: parseRows<RosterEntry>(rowsOf(database, "roster")),
    meta: readMeta(database),
  }));
  await db.transaction(
    "rw",
    [
      db.evaluations,
      db.summary_groups,
      db.continuity_records,
      db.rsca_records,
      db.brag_sheets,
      db.profiles,
      db.roster,
    ],
    async () => {
      await db.evaluations.clear();
      await db.summary_groups.clear();
      await db.continuity_records.clear();
      await db.rsca_records.clear();
      await db.brag_sheets.clear();
      await db.profiles.clear();
      await db.roster.clear();
      if (loaded.evaluations.length) await db.evaluations.bulkPut(loaded.evaluations);
      if (loaded.summaryGroups.length) await db.summary_groups.bulkPut(loaded.summaryGroups);
      if (loaded.continuityRecords.length) await db.continuity_records.bulkPut(loaded.continuityRecords);
      if (loaded.rscaRecords.length) await db.rsca_records.bulkPut(loaded.rscaRecords);
      if (loaded.bragSheets.length) await db.brag_sheets.bulkPut(loaded.bragSheets);
      if (loaded.profiles.length) await db.profiles.bulkPut(loaded.profiles);
      if (loaded.roster.length) await db.roster.bulkPut(loaded.roster);
    },
  );
  const meta = loaded.meta;
  if (meta.scope === "member" || meta.scope === "reviewer" || meta.scope === "command") {
    noteWorkspaceIdentity({
      scope: meta.scope,
      workspaceId: meta.workspace_id || "",
      holderName: meta.holder_name || "",
      holderRole:
        meta.holder_role === "Sailor" ||
        meta.holder_role === "Rater" ||
        meta.holder_role === "Senior Rater" ||
        meta.holder_role === "Reporting Senior"
          ? meta.holder_role
          : "Sailor",
    });
  } else {
    noteWorkspaceIdentity(null);
  }
  noteWorkspaceLoaded(summary.fileRatchet);
  return summary;
}

export function workspaceHasUnsavedEdits(): boolean {
  return isWorkspaceDirty();
}
