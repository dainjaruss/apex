import { describe, it, expect } from "vitest";
import { formatNavpersDate } from "@/lib/navyDate";

describe("formatNavpersDate", () => {
  it("formats ISO dates to YYMMMDD", () => {
    expect(formatNavpersDate("2025-07-17")).toBe("25JUL17");
    expect(formatNavpersDate("2024-01-01")).toBe("24JAN01");
    expect(formatNavpersDate("2026-12-31")).toBe("26DEC31");
  });

  it("passes non-ISO strings through uppercased", () => {
    expect(formatNavpersDate("25JAN15")).toBe("25JAN15");
    expect(formatNavpersDate("not req")).toBe("NOT REQ");
    expect(formatNavpersDate("NOT PERF")).toBe("NOT PERF");
    expect(formatNavpersDate("")).toBe("");
    expect(formatNavpersDate(undefined)).toBe("");
  });

  it("never interpolates 'undefined' for an out-of-range month", () => {
    // Regression: months[12] is undefined — 2025-13-01 used to render as
    // "25undefined01" on official PDFs and in the NAVFIT export.
    expect(formatNavpersDate("2025-13-01")).toBe("2025-13-01");
    expect(formatNavpersDate("2025-00-15")).toBe("2025-00-15");
    expect(formatNavpersDate("2025-99-09")).toBe("2025-99-09");
  });
});
