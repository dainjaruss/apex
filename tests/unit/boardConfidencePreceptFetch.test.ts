// tests/unit/boardConfidencePreceptFetch.test.ts
//
// Pure logic of the precept fetch-to-reference: the SSRF host allow-list and
// the keyword flag suggestion. Network fetch/PDF extraction is not exercised.

import { describe, it, expect } from "vitest";
import {
  isAllowedPreceptHost,
  suggestPreceptFlags,
  DEFAULT_PRECEPT_URL,
} from "@/lib/boardConfidence/preceptFetch";

describe("isAllowedPreceptHost — SSRF guard", () => {
  it("allows only https mynavyhr.navy.mil (incl. the default source)", () => {
    expect(isAllowedPreceptHost(DEFAULT_PRECEPT_URL)).toBe(true);
    expect(isAllowedPreceptHost("https://www.mynavyhr.navy.mil/x.pdf")).toBe(true);
  });

  it("rejects other hosts, schemes, and SSRF probes", () => {
    expect(isAllowedPreceptHost("http://mynavyhr.navy.mil/x.pdf")).toBe(false); // not https
    expect(isAllowedPreceptHost("https://evil.com/x.pdf")).toBe(false);
    expect(isAllowedPreceptHost("https://mynavyhr.navy.mil.evil.com/x")).toBe(false);
    expect(isAllowedPreceptHost("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedPreceptHost("file:///etc/passwd")).toBe(false);
    expect(isAllowedPreceptHost("not a url")).toBe(false);
  });
});

describe("suggestPreceptFlags — keyword suggestions with evidence", () => {
  it("suggests flags whose cues appear, each with a quote", () => {
    const text =
      "The board shall give due consideration to sustained superior performance, " +
      "documented leadership positions, completion of warfare qualification, and " +
      "arduous sea duty. Off-duty education is encouraged.";
    const s = suggestPreceptFlags(text);
    const flags = s.map((x) => x.flag).sort();
    expect(flags).toContain("warfighting");
    expect(flags).toContain("leadership_positions");
    expect(flags).toContain("sea_duty");
    expect(flags).toContain("education");
    for (const x of s) expect(x.evidence.length).toBeGreaterThan(0);
  });

  it("returns nothing for broad prose with no cue — never guesses", () => {
    expect(
      suggestPreceptFlags("Select the best and fully qualified; consider the whole person."),
    ).toEqual([]);
  });
});
