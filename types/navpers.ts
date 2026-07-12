// types/navpers.ts
//
// Zod schemas and validation rules for NAVPERS 1616/26.
//

import { z } from "zod";
import { PRIMARY_DUTY_ABBREV_MAX } from "../lib/commentFit";

const TRAIT_KEYS = [
  "knowledge",
  "work",
  "eo",
  "bearing",
  "accomplishment",
  "teamwork",
  "leadership",
] as const;

export const PROMOTION_RECOMMENDATIONS = [
  "Significant Problems",
  "Progressing",
  "Promotable",
  "Must Promote",
  "Early Promote",
  "NOB",
] as const;

export const RETENTION_OPTIONS = ["Recommended", "Not Recommended"] as const;

export const DUTY_STATUS_OPTIONS = ["ACT", "TAR", "INACT", "AT/ADOS"] as const;

export const PROMOTION_STATUS_OPTIONS = [
  "Regular",
  "Frocked",
  "Selected",
  "Spot",
] as const;

// Block 21 Billet Subcategory — valid codes from BUPERSINST 1610.10H table 1-1.
// "Do not use any code that does not appear in table 1-1." NA appears in most reports.
const NAMED_BILLET_SUBCATEGORIES = [
  "NA",
  "BASIC",
  "APPROVED",
  "INDIV AUG",
  "CO AFLOAT",
  "CO ASHORE",
  "OIC",
  "SEA COMP",
  "CRF",
  "CANVASSER",
  "RESIDENT",
  "INTERN",
  "INSTRUCTOR",
  "STUDENT",
  "RESAC1",
  "RESAC6",
  "SCREENED",
] as const;

// SPECIAL01 through SPECIAL20  BUPERSINST 1610.10H (page 1-9)
export const BILLET_SUBCATEGORY_OPTIONS: string[] = [
  ...NAMED_BILLET_SUBCATEGORIES,
  ...Array.from(
    { length: 20 },
    (_, i) => `SPECIAL${String(i + 1).padStart(2, "0")}`,
  ),
];

// Standard billet subcategories annotated with an "*" in table 1-1 (page 1-8):
// Block 21 should match an entry in Block 29 when one of these is used.
export const STARRED_BILLET_SUBCATEGORIES = [
  "CRF",
  "CANVASSER",
  "RESIDENT",
  "INTERN",
  "STUDENT",
] as const;

// Block 31 Counselor — capped so the name fits the printed cell (the PDF auto-shrinks
// the font when a name approaches this length).
export const COUNSELOR_MAX = 22;

// Block 41 Career Recommendations — the form provides exactly two slots; the second is
// optional but at least one is mandatory ("do not leave blank" — enter NA/NONE if none).
// Each entry is capped at 20 characters and spaces per BUPERSINST 1610.10H.
export const CAREER_REC_SLOTS = 2;
export const CAREER_REC_MAX = 20;

// Helper to validate Navy dates in YYMMMDD format (e.g. 25JAN15)

const NAVY_DATE_REGEX =
  /^[0-9]{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[0-9]{2}$/i;

export const EvalSchema = z
  .object({
    member_name: z
      .string()
      .min(1, "Name is required (Block 1)")
      .regex(
        /^[A-Za-z\s-]+,\s*[A-Za-z\s-]+$/,
        "Name must be in LAST, FIRST MI format and contain only letters, spaces, hyphens, and a single comma (Block 1)",
      ),

    grade_rate: z
      .string()
      .min(1, "Grade/Rate is required (Block 2)")
      .regex(
        /^[a-zA-Z0-9]+$/,
        "Grade/Rate must contain letters and numbers only (Block 2)",
      ),

    designator: z.string().optional(),

    dod_id: z
      .string()
      .regex(/^[0-9]{10}$/, "DoD ID must be exactly 10 digits (Block 4)"),

    duty_status: z.string().min(1, "Duty status is required (Block 5)"),

    uic: z.string().length(5, "UIC must be exactly 5 characters (Block 6)"),

    ship_station: z.string().min(1, "Ship/Station is required (Block 7)"),

    promotion_status: z
      .string()
      .min(1, "Promotion status is required (Block 8)"),

    // Block 9 Date Reported — stored ISO yyyy-mm-dd (same as Period From/To); the PDF
    // renderer prints it in the Navy YYMMMDD format. Calendar-validity and the
    // "not in the future" rule are enforced in the superRefine below.
    date_reported: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Date Reported must be a valid date in YYYY-MM-DD format (Block 9)",
      ),

    period_from: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Period From must be a valid date YYYY-MM-DD (Block 14)",
      ),

    period_to: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Period To must be a valid date YYYY-MM-DD (Block 15)",
      ),

    physical_readiness: z
      .string()
      .min(1, "Physical readiness cycle results are required (Block 20)")
      .regex(
        /^[PBFMWN]+$/,
        "Physical readiness (Block 20) must use only codes P, B, F, M, W, N — no spaces, slashes, or other characters.",
      ),

    billet_subcategory: z
      .string()
      .min(
        1,
        "Billet Subcategory is required — select NA if not used (Block 21)",
      )
      // Must be one of the table 1-1 codes; the dropdown constrains the UI, but the schema
      // is the contract. The `!v` guard lets the min(1) message own the empty case.
      .refine((v) => !v || BILLET_SUBCATEGORY_OPTIONS.includes(v), {
        message:
          "Billet Subcategory must be a valid code from BUPERSINST 1610.10H table 1-1 — e.g., NA, BASIC, CRF, or SPECIAL01–SPECIAL20 (Block 21)",
      }),

    reporting_senior_name: z
      .string()
      .min(1, "Reporting Senior name is required (Block 22)")
      // Block 22: LASTNAME, FI [MI] [SUFFIX] — last name then INITIALS only (not a full
      // first name), optional middle initial, optional suffix (e.g., STJOHN, O F).
      // The (?![A-Za-z]) keeps a roman-numeral suffix (II–V) from matching as a middle initial.
      .regex(
        /^[A-Za-z]+,\s*[A-Za-z](\s+[A-Za-z](?![A-Za-z]))?(\s+(JR|SR|II|III|IV|V))?$/i,
        "Reporting Senior name must be LASTNAME, FIRST-INITIAL [MIDDLE-INITIAL] — initials only, not a full first name (e.g., STJOHN, O F) (Block 22)",
      ),

    reporting_senior_grade: z
      .string()
      .min(1, "Reporting Senior grade is required (Block 23)")
      .max(5, "Reporting Senior grade must be 5 characters or fewer (Block 23)")
      .regex(
        /^[A-Za-z0-9]+$/,
        "Reporting Senior grade must contain letters/numbers only, no hyphens (Block 23)",
      ),

    reporting_senior_designator: z.string().optional(),

    reporting_senior_title: z
      .string()
      .min(1, "Reporting Senior title is required (Block 25)")
      .max(
        14,
        "Reporting Senior title must be 14 characters or fewer (Block 25)",
      ),

    reporting_senior_uic: z
      .string()
      .length(
        5,
        "Reporting Senior UIC must be exactly 5 characters (Block 26)",
      ),

    reporting_senior_dod_id: z
      .string()
      .regex(
        /^[0-9]{10}$/,
        "Reporting Senior DoD ID must be exactly 10 digits (Block 27)",
      ),

    command_achievements: z
      .string()
      .min(1, "Command Employment and achievements are required (Block 28)"),

    // Block 29A — most-significant primary-duty abbreviation box. Shares Block 29's first
    // printed line, so it's capped at 14 characters (including spaces). Optional.
    primary_duty_abbrev: z
      .string()
      .max(
        PRIMARY_DUTY_ABBREV_MAX,
        `Primary duty abbreviation must be ${PRIMARY_DUTY_ABBREV_MAX} characters or fewer, including spaces (Block 29A)`,
      )
      .regex(
        /^[A-Za-z0-9 /-]*$/,
        "Primary duty abbreviation may contain only letters, numbers, spaces, slashes, and hyphens (Block 29A)",
      )
      .optional(),

    primary_duties: z
      .string()
      .min(
        1,
        "Primary/Collateral/Watchstanding duties are required (Block 29)",
      ),

    date_counseled: z.string().min(1, "Date Counseled is required (Block 30)"),

    counselor: z
      .string()
      .min(1, "Counselor is required (Block 31)")
      .max(
        COUNSELOR_MAX,
        `Counselor must be ${COUNSELOR_MAX} characters or fewer to fit the form (Block 31)`,
      ),

    trait_grades: z.object({
      knowledge: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]),
      work: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]),
      eo: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]),
      bearing: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]),
      accomplishment: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]),
      teamwork: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]),
      leadership: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]),
    }),

    comments: z
      .string()
      .min(1, "Comments on performance are required (Block 43)"),

    career_recommendations: z
      .array(
        z
          .string()
          .max(
            CAREER_REC_MAX,
            `Each career recommendation must be ${CAREER_REC_MAX} characters or fewer, including spaces (Block 41)`,
          ),
      )
      .max(
        CAREER_REC_SLOTS,
        `Block 41 allows at most ${CAREER_REC_SLOTS} career recommendations`,
      )
      .refine((arr) => arr.some((r) => r.trim().length > 0), {
        message:
          "At least one career recommendation is required — do not leave blank; enter NA or NONE if none applies (Block 41)",
      }),

    promotion_recommendation: z.enum(PROMOTION_RECOMMENDATIONS, {
      message: "Invalid promotion recommendation (Block 45)",
    }),

    retention: z.enum(RETENTION_OPTIONS, {
      message: "Invalid retention recommendation (Block 47)",
    }),
  })
  .superRefine((data, ctx) => {
    // Validate period bounds
    const from = new Date(data.period_from);
    const to = new Date(data.period_to);
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from > to) {
      ctx.addIssue({
        path: ["period_to"],
        code: z.ZodIssueCode.custom,
        message: "Period To cannot be before Period From (Block 14/15)",
      });
    }

    // Block 9: Date Reported must be a real calendar date, today or earlier — you cannot
    // report to a station in the future. (Format is enforced by the field-level regex;
    // this only runs once the value is well-formed yyyy-mm-dd.)
    if (/^\d{4}-\d{2}-\d{2}$/.test(data.date_reported)) {
      const [y, m, d] = data.date_reported.split("-").map(Number);
      const reported = new Date(y, m - 1, d);
      const isRealDate =
        reported.getFullYear() === y &&
        reported.getMonth() === m - 1 &&
        reported.getDate() === d;
      const now = new Date();
      const endOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
      if (!isRealDate) {
        ctx.addIssue({
          path: ["date_reported"],
          code: z.ZodIssueCode.custom,
          message: "Date Reported must be a valid calendar date (Block 9)",
        });
      } else if (reported.getTime() > endOfToday.getTime()) {
        ctx.addIssue({
          path: ["date_reported"],
          code: z.ZodIssueCode.custom,
          message: "Date Reported cannot be in the future (Block 9)",
        });
      }
    }

    // Block 24: RS designator — 4-digit officer designator, "LTR", or a Service
    // abbreviation; blank is allowed (Navy enlisted/civilian RS).
    const desig = (data.reporting_senior_designator || "").toUpperCase().trim();
    if (
      desig &&
      !/^([0-9]{4}|LTR|USAF|USA|USMC|USCG|USSF|USPH|NOAA)$/.test(desig)
    ) {
      ctx.addIssue({
        path: ["reporting_senior_designator"],
        code: z.ZodIssueCode.custom,
        message:
          'Reporting Senior designator (Block 24) must be a 4-digit officer designator, "LTR", or a Service abbreviation (USAF, USA, USMC, USCG, USSF, USPH, NOAA) — or left blank.',
      });
    }

    // Validate Date Counseled — the calendar picker stores ISO yyyy-mm-dd; legacy YYMMMDD
    // and the NOT REQ / NOT PERF exception codes are also accepted (Block 30).
    const dcUpper = data.date_counseled.toUpperCase();
    const dcIsDate =
      /^\d{4}-\d{2}-\d{2}$/.test(data.date_counseled) ||
      NAVY_DATE_REGEX.test(data.date_counseled);
    if (dcUpper !== "NOT REQ" && dcUpper !== "NOT PERF" && !dcIsDate) {
      ctx.addIssue({
        path: ["date_counseled"],
        code: z.ZodIssueCode.custom,
        message:
          "Date Counseled must be a valid date, NOT REQ, or NOT PERF (Block 30)",
      });
    }

    // Trait rating promotion restriction policies
    const rec = data.promotion_recommendation;
    if (rec === "NOB") return; // NOB bypasses standard trait checking

    const eoNum = parseFloat(data.trait_grades.eo);
    const bearingNum = parseFloat(data.trait_grades.bearing);

    const numericGrades = Object.values(data.trait_grades)
      .map((g) => parseFloat(g))
      .filter((g) => !isNaN(g));

    const has1 = numericGrades.some((g) => g === 1.0);
    const has2 = numericGrades.some((g) => g === 2.0);

    // 1. Grade of 1.0 in any trait -> recommendation must be Progressing or Significant Problems (below Promotable)
    if (has1 && ["Promotable", "Must Promote", "Early Promote"].includes(rec)) {
      ctx.addIssue({
        path: ["promotion_recommendation"],
        code: z.ZodIssueCode.custom,
        message:
          "A trait grade of 1.0 limits the promotion recommendation to Progressing or Significant Problems.",
      });
    }

    // 2. Grade of 2.0 in any trait -> recommendation must be Promotable or lower (bars Must/Early Promote)
    if (has2 && ["Must Promote", "Early Promote"].includes(rec)) {
      ctx.addIssue({
        path: ["promotion_recommendation"],
        code: z.ZodIssueCode.custom,
        message:
          "A trait grade of 2.0 limits the promotion recommendation to Promotable or lower.",
      });
    }

    // 3. Grade of 2.0 or lower in EO (Block 35) or Bearing/Character (Block 36) -> bars Promotable or higher (requires Progressing or below)
    if (
      (eoNum <= 2.0 || bearingNum <= 2.0) &&
      ["Promotable", "Must Promote", "Early Promote"].includes(rec)
    ) {
      ctx.addIssue({
        path: ["promotion_recommendation"],
        code: z.ZodIssueCode.custom,
        message:
          "A trait grade of 2.0 or lower in Command Climate/EO or Bearing/Character limits recommendation to Progressing or Significant Problems.",
      });
    }

    // 4. EO (Block 35) at < 3.0 -> member is ineligible for Promotable or higher (bars Promotable or higher)
    if (
      eoNum < 3.0 &&
      ["Promotable", "Must Promote", "Early Promote"].includes(rec)
    ) {
      ctx.addIssue({
        path: ["promotion_recommendation"],
        code: z.ZodIssueCode.custom,
        message:
          "Command Climate/EO grade must be 3.0 or higher for Promotable, Must Promote, or Early Promote.",
      });
    }
  });
