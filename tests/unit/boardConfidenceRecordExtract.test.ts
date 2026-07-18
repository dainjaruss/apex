// tests/unit/boardConfidenceRecordExtract.test.ts
//
// v1.5 upload-driven record extraction: suggestRecordFromText heuristics over
// ESR/PSR-style text. Everything must come back verified_in_ompf=false (the
// member reviews in the form before anything is scored) and dedup/caps hold.

import { describe, it, expect } from "vitest";
import { suggestRecordFromText } from "@/lib/boardConfidence/recordExtract";

const ESR_FIXTURE = `
ELECTRONIC SERVICE RECORD — TRAINING, EDUCATION AND QUALIFICATIONS
Awards: Navy and Marine Corps Achievement Medal (2), Navy and Marine Corps
Commendation Medal, Meritorious Unit Commendation
NECs: 741A - Flag Officer Writer H04A - Advanced Network Analyst
Education: Bachelor of Science in Cybersecurity, American Military University
Physical Readiness:
2024-1 PRT OUTSTANDING PASS
2024 CYCLE 2 PASS
2023-1 BCA PASS PRT FAIL
`;

describe("suggestRecordFromText", () => {
  const s = suggestRecordFromText(ESR_FIXTURE);

  it("maps known award names to rubric levels, one per distinct name", () => {
    expect(s.awards.map((a) => a.level).sort()).toEqual([
      "personal_achievement",
      "personal_commendation",
      "unit",
    ]);
    for (const a of s.awards) expect(a.verified_in_ompf).toBe(false);
  });

  it("pulls NEC code-title rows from the NEC anchor window", () => {
    expect(s.necs.map((n) => n.code).sort()).toEqual(["741A", "H04A"]);
    expect(s.necs.find((n) => n.code === "741A")!.title).toContain(
      "Flag Officer Writer",
    );
    for (const n of s.necs) expect(n.verified_in_ompf).toBe(false);
  });

  it("extracts one degree suggestion per tier", () => {
    expect(s.education).toHaveLength(1);
    expect(s.education[0]).toMatchObject({
      kind: "degree",
      title: expect.stringContaining("Bachelor of Science in Cybersecurity"),
      verified_in_ompf: false,
    });
  });

  it("extracts PFA cycles; a cycle listing BCA PASS before PRT FAIL scores FAIL (never inflate)", () => {
    // "2023-1 BCA PASS PRT FAIL" is an official PFA FAILURE — the overall cycle
    // result is the WORST token in the window, not the first (the old bug).
    expect(s.pfa.map((p) => `${p.cycle}:${p.result}`).sort()).toEqual([
      "2023-1:fail",
      "2024-1:pass",
      "2024-2:pass",
    ]);
    expect(s.pfa.find((p) => p.cycle === "2024-1")!.date).toBe("2024-06-30");
    expect(s.pfa.find((p) => p.cycle === "2024-2")!.date).toBe("2024-12-31");
  });

  it("returns empty suggestions on unrelated text — never guesses", () => {
    const empty = suggestRecordFromText("lorem ipsum quarterly newsletter");
    expect(empty).toEqual({ awards: [], necs: [], education: [], pfa: [] });
  });

  // Regressions for the v1.5 adversarial-review parser findings (space-collapsed,
  // often all-caps real OMPF/ESR text — no newlines survive extraction).
  describe("real-extract robustness", () => {
    it("keeps the last/only NEC when there is no newline terminator", () => {
      const one = suggestRecordFromText(
        "NEC UTILIZATION H04A - Information Systems Technician Journeyman advancement history follows",
      );
      expect(one.necs.map((n) => n.code)).toEqual(["H04A"]);
    });

    it("does not read 'Master Chief' as a degree, and finds the real degree instead", () => {
      const e = suggestRecordFromText(
        "Reporting Senior: Command Master Chief Petty Officer SMITH. Member earned Master of Science Information Technology.",
      ).education;
      expect(e).toHaveLength(1);
      expect(e[0].title).toBe("Master of Science Information Technology");
    });

    it("extracts all-caps degrees (dominant style in these documents)", () => {
      const e = suggestRecordFromText(
        "EDUCATION: BACHELOR OF SCIENCE NURSING, EXCELSIOR COLLEGE",
      ).education;
      expect(e).toHaveLength(1);
      expect(e[0].title).toBe("BACHELOR OF SCIENCE NURSING");
    });

    it("extracts the cycle-first PFA layout ('CYCLE 2 2023 FAIL')", () => {
      const pfa = suggestRecordFromText(
        "PFA HISTORY CYCLE 2 2023 FAIL CYCLE 1 2024 PASS",
      ).pfa;
      expect(pfa.map((p) => `${p.cycle}:${p.result}`).sort()).toEqual([
        "2023-2:fail",
        "2024-1:pass",
      ]);
    });

    it("does not let one cycle's result bleed into the next", () => {
      const pfa = suggestRecordFromText(
        "2025-1 PRT PASS 2024-2 BCA PASS PRT FAIL",
      ).pfa;
      expect(pfa.find((p) => p.cycle === "2025-1")!.result).toBe("pass");
      expect(pfa.find((p) => p.cycle === "2024-2")!.result).toBe("fail");
    });
  });
});
