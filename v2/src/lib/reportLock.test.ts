import { beforeEach, describe, expect, it } from "vitest";
import {
  REPORT_LOCK_TTL_MS,
  custodyStatus,
  prepareReportSave,
  releaseReportLock,
  takeReportCustody,
  type ReportLockFields,
} from "./reportLock";
import { recallLockToken } from "./workspaceSession";

const now = Date.parse("2026-10-05T12:00:00.000Z");

function report(overrides: Partial<ReportLockFields> = {}): ReportLockFields {
  return {
    id: "eval-1",
    lock_holder_name: null,
    lock_token: null,
    lock_ratchet: null,
    lock_activity_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("report custody", () => {
  it("lets this browser take an open report and then save it", async () => {
    const taken = await takeReportCustody(report(), "KIRK, J", now);
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    expect(taken.patch.lock_holder_name).toBe("KIRK, J");
    expect(taken.patch.lock_token).toBeTruthy();
    expect(recallLockToken("eval-1")).toBe(taken.patch.lock_token);

    const held = report(taken.patch);
    const saved = await prepareReportSave(held, held.lock_ratchet, now + 1000);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.patch.lock_token).toBe(held.lock_token);
    expect(saved.patch.lock_ratchet).not.toBe(held.lock_ratchet);
  });

  it("refuses a save from a browser that does not hold the token", async () => {
    const taken = await takeReportCustody(report(), "KIRK, J", now);
    if (!taken.ok) throw new Error("expected custody");
    localStorage.clear();
    const held = report(taken.patch);
    const saved = await prepareReportSave(held, held.lock_ratchet, now + 1000);
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.message).toContain("KIRK, J");
    expect(custodyStatus(held, null, now + 1000).state).toBe("theirs");
  });

  it("lets the next person take the report 24 hours after the last save", async () => {
    const taken = await takeReportCustody(report(), "KIRK, J", now);
    if (!taken.ok) throw new Error("expected custody");
    localStorage.clear();
    const held = report(taken.patch);
    const later = now + REPORT_LOCK_TTL_MS;
    expect(custodyStatus(held, null, later).state).toBe("expired");
    const next = await takeReportCustody(held, "UHURA, N", later);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.patch.lock_holder_name).toBe("UHURA, N");
    expect(next.patch.lock_token).not.toBe(held.lock_token);
  });

  it("refuses a save after the report changed under this editor", async () => {
    const taken = await takeReportCustody(report(), "KIRK, J", now);
    if (!taken.ok) throw new Error("expected custody");
    const held = report({ ...taken.patch, lock_ratchet: "someone-else-saved" });
    const saved = await prepareReportSave(held, taken.patch.lock_ratchet, now + 1000);
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.message).toContain("Reload");
  });

  it("releases custody so another browser can take the report", async () => {
    const taken = await takeReportCustody(report(), "KIRK, J", now);
    if (!taken.ok) throw new Error("expected custody");
    const released = await releaseReportLock(report(taken.patch), now + 1000);
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.patch.lock_token).toBeNull();
    expect(recallLockToken("eval-1")).toBeNull();
    localStorage.clear();
    const next = await takeReportCustody(report(released.patch), "UHURA, N", now + 2000);
    expect(next.ok).toBe(true);
  });
});
