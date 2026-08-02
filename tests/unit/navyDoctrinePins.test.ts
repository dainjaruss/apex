// tests/unit/navyDoctrinePins.test.ts
//
// REGRESSION PINS for user-visible Navy doctrine that APEX previously stated
// INCORRECTLY, attributed to Navy's own sources. Each block below pins the
// corrected claim AND asserts the old wrong text is absent, so a future edit
// cannot silently reintroduce it.
//
// Sources of record:
//   - public/chiefEvalBlank.pdf   (NAVPERS 1616/27 REV 05-2025 — the blank form)
//   - PERS-803 Enlisted Selection Board Brief, "Board Process" slide
//   - BUPERSINST 1610.10H para 17-6 (+ 17-6a / 17-6b, Exhibit 17-4)
//   - docs/navy-reference.md §1.3, §1.4, §3.1, §3.2, §3.7
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { BOARD_DISCLAIMER } from "@/lib/boardConfidence/types";
import {
  CHIEFEVAL_TRAIT_STANDARDS,
  CHIEFEVAL_TRAIT_ORDER,
  getTraitStandard,
} from "@/lib/traitStandards";
import {
  CHIEFEVAL_TRAIT_KEYS,
  FITREP_TRAIT_KEYS,
  TRAIT_KEYS as EVAL_TRAIT_KEYS,
} from "@/types/navpers";
import { buildValidEval } from "../fixtures/validEval";
import { getBlockForField } from "@/lib/validationEngine";
import { NAVFIT_TRAIT_MAP } from "@/lib/navfit98/constants";
import { TRAIT_KEYS } from "@/lib/traitAverage";
import { OVERLAY_TRAIT_KEYS } from "@/lib/chiefEvalOverlay";

// ---------------------------------------------------------------------------
// 1. BOARD_DISCLAIMER — enlisted boards do NOT "vote slates"
// ---------------------------------------------------------------------------
describe("BOARD_DISCLAIMER — enlisted board procedure (navy-reference §1.3)", () => {
  it('never claims boards "vote slates" — the word appears in no Navy source', () => {
    // PERS-803, the FY-27 precept and both FY-27 convening orders: zero hits for
    // "slate". APEX asserted it and cited PERS-803, which says the opposite.
    expect(BOARD_DISCLAIMER).not.toMatch(/slate/i);
  });

  it("states the individual-record procedure PERS-803 actually describes", () => {
    expect(BOARD_DISCLAIMER).toMatch(/individually/i);
    expect(BOARD_DISCLAIMER).toMatch(/rating\s+panel/i);
    expect(BOARD_DISCLAIMER).toMatch(/scattergram/i);
  });

  it("does not narrow a panel to a single rating (§1.5)", () => {
    // PERS-803's example panels each span SEVERAL rating communities — Admin/Supply,
    // Nuke/SPECWAR, Aviation, Surface Ops/Engineering, Submarine, Combat Systems/IW.
    // "within a rating panel" alone reads as one panel per rating to a Navy reader,
    // which is narrower than the brief.
    expect(BOARD_DISCLAIMER).toMatch(/groups several rating communities/i);
    expect(BOARD_DISCLAIMER).toMatch(/rather than one panel per rating/i);
  });

  it("scopes the 100/75/50/25/0 confidence bands to officer boards (§1.4)", () => {
    expect(BOARD_DISCLAIMER).toMatch(/100\/75\/50\/25\/0/);
    expect(BOARD_DISCLAIMER).toMatch(/officer boards only/i);
    expect(BOARD_DISCLAIMER).toMatch(/no numeric vote scale is published for/i);
  });

  it("keeps the unofficial-tool warning at full force", () => {
    expect(BOARD_DISCLAIMER).toMatch(/UNOFFICIAL TOOL — NOT A SELECTION BOARD/);
    expect(BOARD_DISCLAIMER).toMatch(
      /not affiliated with, endorsed by, or predictive of/i,
    );
    expect(BOARD_DISCLAIMER).toMatch(
      /an approximation, not actual board procedure/i,
    );
    expect(BOARD_DISCLAIMER).toMatch(/Verify your record on BOL and NSIPS/i);
  });
});

// ---------------------------------------------------------------------------
// 2. CHIEFEVAL trait table — seven traits, transcribed from the blank form
// ---------------------------------------------------------------------------
// Extracted with `pdftotext -layout public/chiefEvalBlank.pdf`:
//   33 TECHNICAL MASTERY (COMPETENCY)      37 ACCOUNTABILITY (CHARACTER)
//   34 INSTITUTIONAL EXPERTISE (COMPETENCY) 38 DECKPLATE LEADERSHIP (CULTURE)
//   35 PROFESSIONALISM (CHARACTER)          39 TEAM EFFECTIVENESS (CULTURE)
//   36 INTEGRITY (CHARACTER)
const FORM_TRAITS: ReadonlyArray<readonly [string, number, string]> = [
  ["technical_mastery", 33, "Technical Mastery"],
  ["institutional_expertise", 34, "Institutional Expertise"],
  ["professionalism", 35, "Professionalism"],
  ["integrity", 36, "Integrity"],
  ["accountability", 37, "Accountability"],
  ["deckplate_leadership", 38, "Deckplate Leadership"],
  ["team_effectiveness", 39, "Team Effectiveness"],
];

describe("CHIEFEVAL_TRAIT_STANDARDS — NAVPERS 1616/27 (navy-reference §3.1)", () => {
  it("defines exactly SEVEN traits", () => {
    expect(Object.keys(CHIEFEVAL_TRAIT_STANDARDS)).toHaveLength(7);
  });

  it.each(FORM_TRAITS)(
    "%s is Block %i, titled %s — as printed on the form",
    (key, block, title) => {
      const std = CHIEFEVAL_TRAIT_STANDARDS[key];
      expect(std, `missing CHIEFEVAL trait "${key}"`).toBeDefined();
      expect(std.block).toBe(block);
      expect(std.title).toBe(title);
      // 1616/27 prints no 1.0/3.0/5.0 anchor columns — never synthesize them.
      expect(std.anchors).toBeUndefined();
      expect(std.standards?.length ?? 0).toBeGreaterThan(0);
    },
  );

  it("drops the four fabricated traits that were never on the form", () => {
    for (const bogus of [
      "mission_accomplishment",
      "human_development",
      "eo_climate",
      "retention",
    ]) {
      expect(CHIEFEVAL_TRAIT_STANDARDS[bogus]).toBeUndefined();
    }
  });

  it('never labels a CHIEFEVAL trait "Equal Opportunity" or "Command Climate"', () => {
    // The string "EQUAL OPPORTUNITY" does not appear anywhere on 1616/27; that is
    // the instruction's wording for the FITREP/EVAL trait, not a CHIEFEVAL trait.
    const blob = JSON.stringify(CHIEFEVAL_TRAIT_STANDARDS);
    expect(blob).not.toMatch(/equal opportunity/i);
    expect(blob).not.toMatch(/command climate/i);
  });

  it("puts the 3.0 advancement gate on Block 37 = Accountability (§3.2)", () => {
    expect(CHIEFEVAL_TRAIT_STANDARDS.accountability.block).toBe(37);
    expect(CHIEFEVAL_TRAIT_STANDARDS.accountability.title).toBe("Accountability");
  });

  it("no longer shadows the EVAL Teamwork/Leadership rows", () => {
    // Old table stopped at five entries, so CHIEFEVAL blocks 38/39 fell through to
    // the 1616/26 EVAL rows. Resolution is per form now, so the EVAL keys must
    // answer with EVAL blocks and the CHIEFEVAL keys with CHIEFEVAL blocks — and
    // neither form may answer for the other's keys at all.
    expect(getTraitStandard("EVAL", "teamwork")?.block).toBe(38);
    expect(getTraitStandard("EVAL", "teamwork")?.title).toBe("Teamwork");
    expect(getTraitStandard("EVAL", "leadership")?.block).toBe(39);
    expect(getTraitStandard("CHIEFEVAL", "deckplate_leadership")?.block).toBe(38);
    expect(getTraitStandard("CHIEFEVAL", "professionalism")?.block).toBe(35);
    expect(getTraitStandard("CHIEFEVAL", "teamwork")).toBeUndefined();
    expect(getTraitStandard("EVAL", "deckplate_leadership")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2b. Every consumer of the trait table agrees with it
// ---------------------------------------------------------------------------
describe("CHIEFEVAL trait consumers agree with the form", () => {
  const keys = FORM_TRAITS.map(([k]) => k);

  it("CHIEFEVAL_TRAIT_KEYS (Zod schema + form state) is the form's seven, in block order", () => {
    expect([...CHIEFEVAL_TRAIT_KEYS]).toEqual(keys);
    expect([...CHIEFEVAL_TRAIT_ORDER]).toEqual(keys);
  });

  it("validationEngine resolves each key to its printed block number", () => {
    for (const [key, block] of FORM_TRAITS) {
      expect(getBlockForField(`trait_grades.${key}`)).toBe(block);
    }
  });

  it("the NAVFIT 98A export maps the same seven keys to blocks 33-39", () => {
    expect(NAVFIT_TRAIT_MAP.CHIEFEVAL.map((e) => e.key)).toEqual(keys);
    expect(NAVFIT_TRAIT_MAP.CHIEFEVAL.map((e) => e.block)).toEqual([
      33, 34, 35, 36, 37, 38, 39,
    ]);
  });

  it("computeTraitAverage knows every CHIEFEVAL key (else grades vanish from Block 40)", () => {
    for (const k of keys) expect(TRAIT_KEYS).toContain(k);
  });

  it("the PDF overlay has a grade-box coordinate for every key, split 4/3 by page", () => {
    // 1616/27 prints Blocks 33-36 on page 1 and 37-39 on page 2.
    expect(OVERLAY_TRAIT_KEYS).toEqual(keys);
    expect(OVERLAY_TRAIT_KEYS.slice(0, 4)).toEqual(keys.slice(0, 4));
  });
});

// ---------------------------------------------------------------------------
// 3. Fetchers send the full browser header set
// ---------------------------------------------------------------------------
// A missing header set was blamed for "MyNavyHR is blocked" and motivated a whole
// upload feature. Pin the set so a future "simplify the headers" edit is caught.
const REQUIRED_HEADERS = [
  "User-Agent",
  "Accept",
  "Accept-Language",
  "Accept-Encoding",
  "Upgrade-Insecure-Requests",
  "Sec-Fetch-Dest",
  "Sec-Fetch-Mode",
  "Sec-Fetch-Site",
  "Sec-Fetch-User",
];

const fetchSpy = vi.fn();
// Only section 5 (the LaDR route) needs these; nothing else in this file touches
// Supabase, so the module mock is inert for the rest.
vi.mock("@/lib/supabaseClient", () => ({
  getRouteUserId: vi.fn(async () => "user-1"),
  createAdminClient: vi.fn(() => ({})),
  createBrowserClient: vi.fn(() => ({})),
}));
vi.mock("undici", () => ({
  fetch: (...args: unknown[]) => fetchSpy(...args),
  Agent: class {
    constructor(public opts?: unknown) {}
  },
}));

function pdfResponse() {
  const body = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 0x20)]);
  return {
    status: 200,
    ok: true,
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

describe("Navy fetchers send the full browser header set", () => {
  beforeEach(() => fetchSpy.mockReset());

  it("ladrFetch sends every required header", async () => {
    fetchSpy.mockResolvedValue(pdfResponse());
    const { fetchLadrPdf } = await import("@/lib/boardConfidence/ladrFetch");
    await fetchLadrPdf("IT");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    for (const h of REQUIRED_HEADERS) expect(headers[h]).toBeTruthy();
    expect(headers["User-Agent"]).toMatch(/Mozilla\/5\.0/);
  });

  it("preceptFetch sends every required header", async () => {
    fetchSpy.mockResolvedValue(pdfResponse());
    const { fetchPreceptText, DEFAULT_PRECEPT_URL } = await import(
      "@/lib/boardConfidence/preceptFetch"
    );
    await fetchPreceptText(DEFAULT_PRECEPT_URL);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    for (const h of REQUIRED_HEADERS) expect(headers[h]).toBeTruthy();
  });

  it("both fetchers send the SAME header set (no drift)", async () => {
    fetchSpy.mockResolvedValue(pdfResponse());
    const { fetchLadrPdf } = await import("@/lib/boardConfidence/ladrFetch");
    const { fetchPreceptText, DEFAULT_PRECEPT_URL } = await import(
      "@/lib/boardConfidence/preceptFetch"
    );
    await fetchLadrPdf("IT");
    await fetchPreceptText(DEFAULT_PRECEPT_URL);
    expect(fetchSpy.mock.calls[1][1].headers).toEqual(
      fetchSpy.mock.calls[0][1].headers,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. LaDR URL construction — _e7.pdf, and 403 means "not published"
// ---------------------------------------------------------------------------
describe("fetchLadrPdf — Navy COOL URL and 403 handling", () => {
  beforeEach(() => fetchSpy.mockReset());

  it("requests <rating>_e7.pdf, not the combined _e1_e9 file", async () => {
    fetchSpy.mockResolvedValue(pdfResponse());
    const { fetchLadrPdf } = await import("@/lib/boardConfidence/ladrFetch");
    // ND is one of the 17 ratings whose _e1_e9.pdf 403s on COOL.
    const res = await fetchLadrPdf("ND");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://www.cool.osd.mil/usn/LaDR/nd_e7.pdf",
    );
    expect(fetchSpy.mock.calls[0][0]).not.toMatch(/_e1_e9/);
    expect(res.status).toBe("ok");
  });

  it("maps COOL's 403 to not_found — it returns 403, not 404, for a missing PDF", async () => {
    fetchSpy.mockResolvedValue({ status: 403, ok: false });
    const { fetchLadrPdf } = await import("@/lib/boardConfidence/ladrFetch");
    // EMN has no plain _e7.pdf (COOL splits nuclear ratings by platform).
    expect((await fetchLadrPdf("EMN")).status).toBe("not_found");
  });

  it("still maps 404 to not_found and other codes to error", async () => {
    const { fetchLadrPdf } = await import("@/lib/boardConfidence/ladrFetch");
    fetchSpy.mockResolvedValue({ status: 404, ok: false });
    expect((await fetchLadrPdf("IT")).status).toBe("not_found");
    fetchSpy.mockResolvedValue({ status: 500, ok: false });
    expect((await fetchLadrPdf("IT")).status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// 5. The 403 message states what a 403 PROVES, not what we wish it meant
// ---------------------------------------------------------------------------
// COOL answers a missing PDF with 403 — but so does a WAF rule, a rate limit, or a
// datacenter-IP filter. "Navy COOL publishes no E7 LaDR for ND." is therefore a claim
// APEX cannot observe: if COOL ever blocks the deployment, every Sailor is told the
// Navy publishes nothing for their rating. For a tool whose whole premise is not
// asserting things the Navy did not say, that is the same failure class as the
// fabricated traits — just at the network layer.
describe("LaDR fetch route — 403 is reported as an observation, not a conclusion", () => {
  beforeEach(() => fetchSpy.mockReset());

  const post = async (rating: string) => {
    const { POST } = await import("@/app/api/board-confidence/ladr-fetch/route");
    const res = await POST({ json: async () => ({ rating }) } as any);
    return { status: res.status, body: await res.json() };
  };

  it("never tells a Sailor the Navy publishes no LaDR for their rating", async () => {
    fetchSpy.mockResolvedValue({ status: 403, ok: false });
    const { body } = await post("ND");
    expect(body.error).not.toMatch(/publishes no/i);
    expect(body.error).toMatch(/returned no E7 LaDR for ND at the published path/i);
    expect(body.error).toMatch(/HTTP 403/);
    // ...and says out loud that a 403 is ambiguous.
    expect(body.error).toMatch(/blocked request rather than a missing document/i);
  });

  it("drops the nuclear-ratings aside for ratings it does not apply to", async () => {
    fetchSpy.mockResolvedValue({ status: 403, ok: false });
    expect((await post("ND")).body.error).not.toMatch(/splits ND by platform/i);
    // ...but keeps it where it is a measured fact: emn_ss_e7.pdf really does exist.
    const emn = (await post("EMN")).body.error;
    expect(emn).toMatch(/splits EMN by platform/i);
    expect(emn).toMatch(/emn_ss_e7\.pdf/);
  });
});

// ---------------------------------------------------------------------------
// The SEED SCRIPT is a doctrine surface too.
//
// #26 corrected the code and migration 010 purged the hosted database, but
// nothing corrected the script that recreates the data — a reviewer's
// `npm run db:seed` put a fabricated-trait row back into the hosted project
// AFTER 010 had cleaned it. #32 has since fixed the fixtures; this pins them so
// the next edit cannot quietly reintroduce a trait table the Navy does not use.
//
// Read as text on purpose: importing the script would execute it against a live
// Supabase project (it loads .env.local and writes at import time).
//
// The previous version of this block was VACUOUS and let the very thing it
// describes through: it took `source.slice(source.indexOf('report_type:
// "CHIEFEVAL"'))` — the FIRST CHIEFEVAL, sliced to end of file — so the second,
// correct CHIEFEVAL draft further down satisfied every `toContain`. The showcase
// CHIEFEVAL sat there with seven EVAL traits and the suite stayed green. This
// version resolves EACH buildValidEval() call independently, including the ones
// that override nothing and silently inherit the 1616/26 default.
// ---------------------------------------------------------------------------
describe("scripts/seed-e2e.ts — every seeded record's traits match its form", () => {
  const raw = readFileSync(
    resolve(process.cwd(), "scripts/seed-e2e.ts"),
    "utf8",
  );
  // Comments are prose, not seeded data. A comment that merely QUOTES a trait key
  // or `retention: undefined` would satisfy the checks below without a single row
  // changing — the first draft of this guard did exactly that, because the fix's
  // own explanatory comment named the field it was asserting on. `(^|\s)//` skips
  // the `//` in a URL, which is preceded by a colon.
  const source = raw.replace(/(^|\s)\/\/.*$/gm, "$1");

  const EXPECTED_TRAIT_KEYS: Record<string, readonly string[]> = {
    EVAL: EVAL_TRAIT_KEYS,
    CHIEFEVAL: CHIEFEVAL_TRAIT_KEYS,
    FITREP: FITREP_TRAIT_KEYS,
  };

  /** Source text between the braces starting at `open`, nesting respected. */
  function balanced(text: string, open: number): string {
    let depth = 0;
    for (let j = open; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}" && --depth === 0) return text.slice(open + 1, j);
    }
    throw new Error("unbalanced braces in seed source");
  }

  /** The literal trait_grades keys, or null when the draft inherits the default. */
  function literalTraitKeys(draft: string): string[] | null {
    const at = draft.indexOf("trait_grades:");
    if (at === -1) return null;
    const rest = draft.slice(at + "trait_grades:".length);
    // `trait_grades: someVariable` would silently read as zero keys and make this
    // assertion pass for anything. Fail instead of going quiet.
    expect(
      rest.trimStart().startsWith("{"),
      "trait_grades is not an object literal — this guard cannot read it",
    ).toBe(true);
    return balanced(rest, rest.indexOf("{")).match(/\w+(?=\s*:)/g) ?? [];
  }

  const marker = "buildValidEval({";
  const drafts: Array<{
    name: string;
    reportType: string;
    traitKeys: string[] | null;
    body: string;
  }> = [];
  for (
    let i = source.indexOf(marker);
    i !== -1;
    i = source.indexOf(marker, i + 1)
  ) {
    const body = balanced(source, i + marker.length - 1);
    drafts.push({
      name: body.match(/member_name:\s*"([^"]+)"/)?.[1] ?? "(unnamed)",
      // buildValidEval() defaults to EVAL when a draft does not override it —
      // the same silent inheritance that produced the bug.
      reportType: body.match(/report_type:\s*"(\w+)"/)?.[1] ?? "EVAL",
      traitKeys: literalTraitKeys(body),
      body,
    });
  }

  it("parses every seeded draft, covering all three forms", () => {
    // Pins the parse itself: an empty or partial `drafts` would make every
    // assertion below trivially true.
    expect(drafts.map((d) => `${d.reportType} ${d.name}`).sort()).toEqual([
      "CHIEFEVAL RODRIGUEZ, MARCOS E (ITCS)",
      "CHIEFEVAL SMITH, BETTY L (CHIEF)",
      "EVAL DOE, JOHN A",
      "EVAL DOE, JOHN A (RECYCLE)",
      "EVAL WILLIAMS, SARAH K (IT1)",
      "FITREP CHEN, DAVID T (LT)",
      "FITREP JONES, CARL R (OFFICER)",
    ]);
  });

  it.each(
    drafts.map(
      (d) => [`${d.name} — ${d.reportType}`, d] as [string, (typeof drafts)[0]],
    ),
  )("%s carries exactly its own form's trait keys", (_label, d) => {
    const expected = EXPECTED_TRAIT_KEYS[d.reportType];
    expect(
      expected,
      `no trait key set known for ${d.reportType}`,
    ).toBeDefined();
    // A draft that overrides nothing gets the fixture default — resolve it the
    // way the script does rather than assuming an override exists.
    const actual = d.traitKeys ?? Object.keys(buildValidEval().trait_grades!);
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  it("clears the EVAL-only retention block on CHIEFEVAL and FITREP drafts", () => {
    // Block 47 is a 1616/26 field. ChiefEvalSchema and FitrepSchema have no
    // `retention` at all, and 1616/27 prints no such block — so a non-EVAL draft
    // must clear the fixture default rather than inherit "Recommended".
    for (const d of drafts.filter((x) => x.reportType !== "EVAL"))
      expect(d.body, `${d.name} inherits the EVAL retention default`).toMatch(
        /retention:\s*undefined/,
      );
  });

  it("never writes a fabricated CHIEFEVAL trait", () => {
    for (const invented of [
      "mission_accomplishment",
      "human_development",
      "eo_climate",
    ])
      expect(source).not.toContain(invented);
  });
});
