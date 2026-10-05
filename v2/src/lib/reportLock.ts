// Report custody. The workspace file can hold many reports. Each report has
// its own holder. This browser proves it holds a report by keeping the token
// that was minted when custody was taken. A closed file has no clock: the
// 24-hour limit is checked the next time someone opens the report.

import {
  forgetLockToken,
  recallLockToken,
  rememberLockToken,
} from "./workspaceSession";

export const REPORT_LOCK_TTL_MS = 24 * 60 * 60 * 1000;

export interface ReportLockFields {
  id: string;
  lock_holder_name?: string | null;
  lock_token?: string | null;
  lock_ratchet?: string | null;
  lock_activity_at?: string | null;
}

export type LockPatch = Pick<
  ReportLockFields,
  "lock_holder_name" | "lock_token" | "lock_ratchet" | "lock_activity_at"
>;

export type CustodyState =
  | { state: "open" }
  | { state: "ours"; holder: string }
  | { state: "expired"; holder: string }
  | { state: "theirs"; holder: string; until: string };

export type LockResult =
  | { ok: true; patch: LockPatch }
  | { ok: false; message: string };

export async function advanceRatchet(previous: string, material: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${previous}\n${material}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function activityMs(lock: ReportLockFields): number | null {
  if (!lock.lock_activity_at) return null;
  const parsed = Date.parse(lock.lock_activity_at);
  return Number.isNaN(parsed) ? null : parsed;
}

export function custodyStatus(
  lock: ReportLockFields,
  localToken: string | null,
  now: number,
): CustodyState {
  if (!lock.lock_token) return { state: "open" };
  const activity = activityMs(lock);
  const holder = lock.lock_holder_name?.trim() || "another user";
  if (activity === null || now - activity >= REPORT_LOCK_TTL_MS) {
    return { state: "expired", holder };
  }
  if (localToken && localToken === lock.lock_token) {
    return { state: "ours", holder };
  }
  return {
    state: "theirs",
    holder,
    until: new Date(activity + REPORT_LOCK_TTL_MS).toISOString(),
  };
}

export function custodyLabel(status: CustodyState): string {
  if (status.state === "open") return "Custody: open";
  if (status.state === "ours") return "Custody: you";
  if (status.state === "expired") return `Custody: ${status.holder} (expired)`;
  return `Custody: ${status.holder}`;
}

export async function takeReportCustody(
  stored: ReportLockFields,
  holderName: string,
  now: number,
): Promise<LockResult> {
  const status = custodyStatus(stored, recallLockToken(stored.id), now);
  if (status.state === "theirs") {
    return {
      ok: false,
      message: `${status.holder} has custody of this report until ${status.until}.`,
    };
  }
  const token =
    status.state === "ours" && stored.lock_token ? stored.lock_token : crypto.randomUUID();
  const lock_ratchet = await advanceRatchet(
    stored.lock_ratchet || "0",
    `acquire|${token}|${now}`,
  );
  rememberLockToken(stored.id, token);
  return {
    ok: true,
    patch: {
      lock_holder_name: holderName,
      lock_token: token,
      lock_ratchet,
      lock_activity_at: new Date(now).toISOString(),
    },
  };
}

export async function prepareReportSave(
  stored: ReportLockFields,
  formRatchet: string | null | undefined,
  now: number,
): Promise<LockResult> {
  if ((stored.lock_ratchet ?? "") !== (formRatchet ?? "")) {
    return {
      ok: false,
      message: "This report changed since you opened it. Reload it before saving.",
    };
  }
  const status = custodyStatus(stored, recallLockToken(stored.id), now);
  if (status.state !== "ours") {
    return {
      ok: false,
      message:
        status.state === "theirs"
          ? `${status.holder} has custody of this report until ${status.until}.`
          : "Take custody of this report before saving.",
    };
  }
  const lock_ratchet = await advanceRatchet(
    stored.lock_ratchet || "0",
    `save|${stored.lock_token}|${now}`,
  );
  return {
    ok: true,
    patch: {
      lock_holder_name: stored.lock_holder_name,
      lock_token: stored.lock_token,
      lock_ratchet,
      lock_activity_at: new Date(now).toISOString(),
    },
  };
}

/** Clear custody on handoff, or when the holder releases the report. */
export async function releaseReportLock(
  stored: ReportLockFields,
  now: number,
): Promise<LockResult> {
  const status = custodyStatus(stored, recallLockToken(stored.id), now);
  if (status.state === "theirs") {
    return {
      ok: false,
      message: `${status.holder} has custody of this report until ${status.until}.`,
    };
  }
  if (status.state !== "ours") {
    return { ok: true, patch: {} };
  }
  const lock_ratchet = await advanceRatchet(stored.lock_ratchet || "0", `release|${now}`);
  forgetLockToken(stored.id);
  return {
    ok: true,
    patch: {
      lock_holder_name: null,
      lock_token: null,
      lock_activity_at: null,
      lock_ratchet,
    },
  };
}
