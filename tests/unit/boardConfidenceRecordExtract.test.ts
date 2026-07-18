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

  it("extracts PFA cycles with results, deduped by cycle, dates member-editable", () => {
    expect(s.pfa.map((p) => `${p.cycle}:${p.result}`).sort()).toEqual([
      "2023-1:pass",
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
});
