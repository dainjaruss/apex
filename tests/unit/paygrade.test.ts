// tests/unit/paygrade.test.ts
import { describe, it, expect } from "vitest";
import { paygradeOf, samePaygrade } from "@/lib/paygrade";

describe("paygradeOf", () => {
  it("maps canonical registration rank codes to paygrades", () => {
    expect(paygradeOf("SR")).toBe("E-1");
    expect(paygradeOf("SA")).toBe("E-2");
    expect(paygradeOf("SN")).toBe("E-3");
    expect(paygradeOf("PO3")).toBe("E-4");
    expect(paygradeOf("PO2")).toBe("E-5");
    expect(paygradeOf("PO1")).toBe("E-6");
    expect(paygradeOf("CPO")).toBe("E-7");
    expect(paygradeOf("SCPO")).toBe("E-8");
    expect(paygradeOf("MCPO")).toBe("E-9");
  });

  it("reads explicit paygrade tokens in any common form", () => {
    expect(paygradeOf("E-6")).toBe("E-6");
    expect(paygradeOf("E6")).toBe("E-6");
    expect(paygradeOf("e3")).toBe("E-3");
    expect(paygradeOf("PO1 (E-6)")).toBe("E-6");
    expect(paygradeOf("W-2")).toBe("W-2");
    expect(paygradeOf("O-5")).toBe("O-5");
  });

  it("decodes full rating abbreviations by their paygrade suffix", () => {
    expect(paygradeOf("IT1")).toBe("E-6");
    expect(paygradeOf("BM2")).toBe("E-5");
    expect(paygradeOf("YN3")).toBe("E-4");
    expect(paygradeOf("SO1")).toBe("E-6"); // \b guard: not misread as O-1
    expect(paygradeOf("HMC")).toBe("E-7");
    expect(paygradeOf("ITCS")).toBe("E-8");
    expect(paygradeOf("ITCM")).toBe("E-9");
    expect(paygradeOf("FN")).toBe("E-3"); // Fireman
    expect(paygradeOf("AA")).toBe("E-2"); // Airman Apprentice
  });

  it("is case- and whitespace-insensitive", () => {
    expect(paygradeOf("  po1  ")).toBe("E-6");
    expect(paygradeOf("sn")).toBe("E-3");
  });

  it("returns null when the paygrade cannot be determined", () => {
    expect(paygradeOf("")).toBeNull();
    expect(paygradeOf(null)).toBeNull();
    expect(paygradeOf(undefined)).toBeNull();
    expect(paygradeOf("XYZ")).toBeNull();
  });
});

describe("samePaygrade (the gate)", () => {
  it("does NOT match an E-3 against an E-6 group", () => {
    expect(samePaygrade("SN", "PO1")).toBe(false);
    expect(samePaygrade("E-3", "E-6")).toBe(false);
    expect(samePaygrade("SN", "IT1")).toBe(false);
  });

  // BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCK 2 GRADE/RATE" (p. 1-1) and
  // "BLOCK 23 GRADE" (p. 1-10) both spell the warrant grades CWO5, CWO4, CWO3, CWO2, WO1.
  // Without an explicit rule these fall through to the rating-suffix heuristic and decode as
  // enlisted paygrades ("CWO2" -> E-5, "WO1" -> E-6), which then applies the wrong forced-
  // distribution band: a false 60% cap where the instruction says "No limit", and no cap at
  // all for the W3-W5 50% band this PR added.
  it("decodes warrant officer grades in both the instruction and registration spellings", () => {
    expect(paygradeOf("WO1")).toBe("W-1");
    expect(paygradeOf("CWO2")).toBe("W-2");
    expect(paygradeOf("CWO3")).toBe("W-3");
    expect(paygradeOf("CWO4")).toBe("W-4");
    expect(paygradeOf("CWO5")).toBe("W-5");
    // Registration-list spellings (RANK_LABELS uses WO2-WO5) resolve to the same bands.
    expect(paygradeOf("WO3")).toBe("W-3");
    expect(samePaygrade("CWO3", "WO3")).toBe(true);
    expect(samePaygrade("CWO2", "W-2")).toBe(true);
    // Spaced and O/0-typo'd free text (summary_groups.grade_rate is not validated) must not
    // silently decode as an enlisted paygrade — that picks the wrong forced-distribution band.
    expect(paygradeOf("CWO 3")).toBe("W-3");
    expect(paygradeOf("WO 1")).toBe("W-1");
    expect(paygradeOf("CW03")).toBe("W-3");
    // Not warrant officers — the enlisted/officer paths must be untouched. The match stays
    // anchored so AWO1 (Naval Aircrewman Operator) keeps resolving as a petty officer.
    expect(paygradeOf("AWO1")).toBe("E-6");
    expect(paygradeOf("PO1")).toBe("E-6");
    expect(paygradeOf("IT2")).toBe("E-5");
  });

  it("matches the same paygrade written differently", () => {
    expect(samePaygrade("PO1", "E-6")).toBe(true);
    expect(samePaygrade("IT1", "PO1")).toBe(true);
    expect(samePaygrade("SN", "E3")).toBe(true);
  });

  it("is false when either side is unknown", () => {
    expect(samePaygrade("SN", "XYZ")).toBe(false);
    expect(samePaygrade("", "PO1")).toBe(false);
  });
});
