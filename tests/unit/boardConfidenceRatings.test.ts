// tests/unit/boardConfidenceRatings.test.ts
//
// The static Navy rating catalog (v1.4) drives the Record Entry dropdown and
// validates the LaDR-fetch route — it must be complete enough to be useful and
// structurally sound.
import { describe, it, expect } from "vitest";
import {
  NAVY_RATINGS,
  ratingName,
  isKnownRating,
} from "@/lib/boardConfidence/ratings";

describe("NAVY_RATINGS catalog", () => {
  it("is a substantial catalog (the dropdown must never be empty again)", () => {
    expect(NAVY_RATINGS.length).toBeGreaterThanOrEqual(80);
  });

  it("contains the seeded and common ratings", () => {
    for (const r of ["IT", "BM", "HM", "YN", "LS", "MA", "CTR", "OS"]) {
      expect(isKnownRating(r)).toBe(true);
    }
  });

  it("has unique, sorted, well-formed entries", () => {
    const abbrevs = NAVY_RATINGS.map((r) => r.abbrev);
    expect(new Set(abbrevs).size).toBe(abbrevs.length);
    expect(abbrevs).toEqual([...abbrevs].sort());
    for (const r of NAVY_RATINGS) {
      expect(r.abbrev).toMatch(/^[A-Z]{2,4}$/);
      expect(r.name.length).toBeGreaterThan(3);
    }
  });

  it("ratingName resolves case-insensitively and rejects unknowns", () => {
    expect(ratingName("yn")).toBe("Yeoman");
    expect(ratingName("IT")).toBe("Information Systems Technician");
    expect(ratingName("ZZ")).toBeNull();
    expect(isKnownRating("ZZ")).toBe(false);
  });
});
