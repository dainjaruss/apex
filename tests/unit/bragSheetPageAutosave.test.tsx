// tests/unit/bragSheetPageAutosave.test.tsx
//
// v1.1 review fix (spec §6): the brag-sheet page's debounced autosave captures
// { sheetId, data } at EDIT time — never "whichever sheet is active when the
// timer fires" — and pending saves are FLUSHED (not cancelled) on sheet switch
// and on unmount. Reproduces the edit-A-then-switch-to-B-within-the-debounce
// race: A's edit must persist under A's id and B must never be written.
//
// BragSheetEditor is replaced with a one-button stub that fires onChange with
// a sentinel edit; everything else on the page renders for real. The service
// layer is mocked (repo convention — real calls are mocked per-suite).

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const svc = vi.hoisted(() => ({
  listMyBragSheets: vi.fn(),
  saveBragSheet: vi.fn(),
  createBragSheet: vi.fn(),
  extractBragPdf: vi.fn(),
  getAutofillAvailability: vi.fn(),
  recordAiConsent: vi.fn(),
  runBragAutofillRequest: vi.fn(),
  applyBragDraft: vi.fn(),
}));
vi.mock("@/lib/bragSheetService", () => svc);

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getSession: auth.getSession,
    signOut: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/supabaseClient", () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: "u1",
              navy_rank: "IT1",
              last_name: "SAILOR",
              preferred_role: "Sailor",
            },
          }),
        }),
      }),
    }),
  }),
}));

// One-button editor stub: clicking it edits the ACTIVE sheet's data.
vi.mock("@/components/brag/BragSheetEditor", async () => {
  const R = await vi.importActual<typeof import("react")>("react");
  return {
    default: ({ data, onChange }: any) =>
      R.createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            onChange({
              ...data,
              job: { ...data.job, responsibilities: "EDITED BY TEST" },
            }),
        },
        "test-edit",
      ),
  };
});

import BragSheetPage from "@/app/brag-sheet/page";
import { emptyBragSheetData } from "@/lib/bragSheet/template";
import { BRAG_SHEET_VERSION, type BragSheet } from "@/lib/bragSheet/types";

const makeSheet = (id: string, period_to: string): BragSheet => ({
  id,
  user_id: "u1",
  report_type: "EVAL",
  period_from: "2025-03-16",
  period_to,
  template_version: BRAG_SHEET_VERSION,
  data: emptyBragSheetData(),
  status: "draft",
});

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ user: { id: "u1" } });
  // Sheet A loads first and becomes active; B is the switch target.
  svc.listMyBragSheets.mockResolvedValue([
    makeSheet("sheet-a", "2026-03-15"),
    makeSheet("sheet-b", "2025-03-15"),
  ]);
  svc.saveBragSheet.mockResolvedValue(makeSheet("sheet-a", "2026-03-15"));
  svc.getAutofillAvailability.mockResolvedValue({
    available: false,
    model: null,
  });
});

describe("brag-sheet page — debounced autosave race (spec §6, v1.1 review fix)", () => {
  it("edit A then switch to B within the debounce: A's edit is flushed under A's id, B never written", async () => {
    render(<BragSheetPage />);

    // Page loaded with sheet A active.
    fireEvent.click(await screen.findByRole("button", { name: "test-edit" }));
    expect(svc.saveBragSheet).not.toHaveBeenCalled(); // still inside the debounce

    // Switch to sheet B well inside the 800 ms debounce window.
    fireEvent.click(screen.getByRole("button", { name: /EVAL · 2025-03-15/ }));

    // The pending save was FLUSHED immediately — captured { id, data } from
    // edit time, so it targets A even though B is now active.
    await screen.findByText("Saved.");
    expect(svc.saveBragSheet).toHaveBeenCalledTimes(1);
    const [savedId, patch] = svc.saveBragSheet.mock.calls[0];
    expect(savedId).toBe("sheet-a");
    expect(patch.data.job.responsibilities).toBe("EDITED BY TEST");

    // Let the original debounce window elapse: the flushed save must not
    // double-fire, and no call may ever target sheet B.
    await new Promise((r) => setTimeout(r, 900));
    expect(svc.saveBragSheet).toHaveBeenCalledTimes(1);
    for (const [id] of svc.saveBragSheet.mock.calls) {
      expect(id).toBe("sheet-a");
    }
  });

  it("a pending save is flushed (not cancelled) on unmount", async () => {
    const { unmount } = render(<BragSheetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "test-edit" }));
    expect(svc.saveBragSheet).not.toHaveBeenCalled();

    unmount(); // cleanup must flush, not clearTimeout-and-drop

    expect(svc.saveBragSheet).toHaveBeenCalledTimes(1);
    const [savedId, patch] = svc.saveBragSheet.mock.calls[0];
    expect(savedId).toBe("sheet-a");
    expect(patch.data.job.responsibilities).toBe("EDITED BY TEST");

    // The cleared timer must not fire a second save after unmount.
    await new Promise((r) => setTimeout(r, 900));
    expect(svc.saveBragSheet).toHaveBeenCalledTimes(1);
  });
});
