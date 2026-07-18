// types/navpers.ts
//
// Zod schemas and validation rules for NAVPERS 1616/26 (EVAL), 1616/27 (CHIEFEVAL),
// and 1610/2 (FITREP). Each form has its own schema; the validation engine dispatches
// to the correct schema based on report_type.
//

import { z } from "zod";
import { PRIMARY_DUTY_ABBREV_MAX } from "../lib/commentFit";

export const TRAIT_KEYS = [
  "knowledge",
  "work",
  "eo",
  "bearing",
  "accomplishment",
  "teamwork",
  "leadership",
] as const;

// CPO trait keys — NAVPERS 1616/27 Block 33–39 labels per BUPERSINST 1610.10H Ch. 10.
export const CHIEFEVAL_TRAIT_KEYS = [
  "deckplate_leadership",
  "professionalism",
  "mission_accomplishment",
  "human_development",
  "eo_climate",
  "teamwork",
  "leadership",
] as const;

// Officer trait keys — NAVPERS 1610/2 Block 33–39 + tactical_performance (officer-only).
export const FITREP_TRAIT_KEYS = [
  "knowledge",
  "work",
  "eo",
  "bearing",
  "accomplishment",
  "teamwork",
  "leadership",
  "tactical_performance",
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

const TRAIT_GRADE = z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]);

/** Numeric trait grades only (excludes blank and NOB) — used for promotion gates. */
function traitNumericValues(
  traitGrades: Record<string, string | undefined>,
): number[] {
  return Object.values(traitGrades)
    .filter((g): g is string => !!g && g !== "NOB")
    .map((g) => parseFloat(g))
    .filter((g) => !isNaN(g));
}

function refinePeriodOrder(
  periodFrom: string,
  periodTo: string,
  ctx: z.RefinementCtx,
): void {
  const from = new Date(periodFrom);
  const to = new Date(periodTo);
  if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from > to) {
    ctx.addIssue({
      path: ["period_to"],
      code: z.ZodIssueCode.custom,
      message: "Period To cannot be before Period From (Block 14/15)",
    });
  }
}

function refineDateReported(
  dateReported: string,
  ctx: z.RefinementCtx,
): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReported)) return;
  const [y, m, d] = dateReported.split("-").map(Number);
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

function refineReportingSeniorDesignator(
  designator: string | undefined,
  ctx: z.RefinementCtx,
): void {
  const desig = (designator || "").toUpperCase().trim();
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
}

function refineDateCounseled(
  dateCounseled: string,
  ctx: z.RefinementCtx,
): void {
  const dcUpper = dateCounseled.toUpperCase();
  // ISO input must be a real calendar date (same rule as refineDateReported) —
  // e.g. 2025-13-01 would otherwise flow to the PDF/NAVFIT exports malformed.
  let dcIsDate = NAVY_DATE_REGEX.test(dateCounseled);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateCounseled)) {
    const [y, m, d] = dateCounseled.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    dcIsDate =
      parsed.getFullYear() === y &&
      parsed.getMonth() === m - 1 &&
      parsed.getDate() === d;
  }
  if (dcUpper !== "NOT REQ" && dcUpper !== "NOT PERF" && !dcIsDate) {
    ctx.addIssue({
      path: ["date_counseled"],
      code: z.ZodIssueCode.custom,
      message:
        "Date Counseled must be a valid date, NOT REQ, or NOT PERF (Block 30)",
    });
  }
}

type PromotionGateOptions = {
  eoKey: string;
  bearingKey?: string;
  eoBlockLabel: string;
  bearingBlockLabel?: string;
};

function refinePromotionRecommendation(
  data: {
    promotion_recommendation: (typeof PROMOTION_RECOMMENDATIONS)[number];
    trait_grades: Record<string, string | undefined>;
  },
  ctx: z.RefinementCtx,
  gates: PromotionGateOptions,
): void {
  const rec = data.promotion_recommendation;
  if (rec === "NOB") return;

  const eoRaw = data.trait_grades[gates.eoKey];
  const eoNum =
    eoRaw && eoRaw !== "NOB" ? parseFloat(eoRaw) : Number.NaN;
  const bearingNum =
    gates.bearingKey && data.trait_grades[gates.bearingKey] &&
    data.trait_grades[gates.bearingKey] !== "NOB"
      ? parseFloat(data.trait_grades[gates.bearingKey]!)
      : Number.NaN;

  const numericGrades = traitNumericValues(data.trait_grades);
  const has1 = numericGrades.some((g) => g === 1.0);
  const has2 = numericGrades.some((g) => g === 2.0);

  if (has1 && ["Promotable", "Must Promote", "Early Promote"].includes(rec)) {
    ctx.addIssue({
      path: ["promotion_recommendation"],
      code: z.ZodIssueCode.custom,
      message:
        "A trait grade of 1.0 limits the promotion recommendation to Progressing or Significant Problems.",
    });
  }

  if (has2 && ["Must Promote", "Early Promote"].includes(rec)) {
    ctx.addIssue({
      path: ["promotion_recommendation"],
      code: z.ZodIssueCode.custom,
      message:
        "A trait grade of 2.0 limits the promotion recommendation to Promotable or lower.",
    });
  }

  if (gates.bearingKey && !Number.isNaN(bearingNum)) {
    if (
      (eoNum <= 2.0 || bearingNum <= 2.0) &&
      ["Promotable", "Must Promote", "Early Promote"].includes(rec)
    ) {
      ctx.addIssue({
        path: ["promotion_recommendation"],
        code: z.ZodIssueCode.custom,
        message: `A trait grade of 2.0 or lower in ${gates.eoBlockLabel} or ${gates.bearingBlockLabel} limits recommendation to Progressing or Significant Problems.`,
      });
    }
  } else if (!Number.isNaN(eoNum) && eoNum <= 2.0) {
    if (["Promotable", "Must Promote", "Early Promote"].includes(rec)) {
      ctx.addIssue({
        path: ["promotion_recommendation"],
        code: z.ZodIssueCode.custom,
        message: `A trait grade of 2.0 or lower in ${gates.eoBlockLabel} limits recommendation to Progressing or Significant Problems.`,
      });
    }
  }

  if (
    !Number.isNaN(eoNum) &&
    eoNum < 3.0 &&
    ["Promotable", "Must Promote", "Early Promote"].includes(rec)
  ) {
    ctx.addIssue({
      path: ["promotion_recommendation"],
      code: z.ZodIssueCode.custom,
      message: `${gates.eoBlockLabel} grade must be 3.0 or higher for Promotable, Must Promote, or Early Promote.`,
    });
  }
}

function refineOfficerDesignator(
  designator: string | undefined,
  ctx: z.RefinementCtx,
): void {
  const d = (designator || "").trim();
  if (!d || !/^[0-9]{4}$/.test(d)) {
    ctx.addIssue({
      path: ["designator"],
      code: z.ZodIssueCode.custom,
      message:
        "Officer designator (Block 3) must be the four-digit designator as of the report ending date (BUPERSINST 1610.10H, Ch. 9).",
    });
  }
}

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
      knowledge: TRAIT_GRADE.optional(),
      work: TRAIT_GRADE.optional(),
      eo: TRAIT_GRADE.optional(),
      bearing: TRAIT_GRADE.optional(),
      accomplishment: TRAIT_GRADE.optional(),
      teamwork: TRAIT_GRADE.optional(),
      leadership: TRAIT_GRADE.optional(),
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
    refinePeriodOrder(data.period_from, data.period_to, ctx);
    refineDateReported(data.date_reported, ctx);
    refineReportingSeniorDesignator(data.reporting_senior_designator, ctx);
    refineDateCounseled(data.date_counseled, ctx);
    refinePromotionRecommendation(data, ctx, {
      eoKey: "eo",
      bearingKey: "bearing",
      eoBlockLabel: "Command Climate/EO (Block 35)",
      bearingBlockLabel: "Bearing/Character (Block 36)",
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// ChiefEvalSchema — NAVPERS 1616/27 (E7–E9)
// CPO-specific trait keys; EO gate on eo_climate (Block 37); no retention field.
// ─────────────────────────────────────────────────────────────────────────────

export const ChiefEvalSchema = z
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
      .refine((v) => !v || BILLET_SUBCATEGORY_OPTIONS.includes(v), {
        message:
          "Billet Subcategory must be a valid code from BUPERSINST 1610.10H table 1-1 — e.g., NA, BASIC, CRF, or SPECIAL01–SPECIAL20 (Block 21)",
      }),
    reporting_senior_name: z
      .string()
      .min(1, "Reporting Senior name is required (Block 22)")
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
      deckplate_leadership: TRAIT_GRADE.optional(),
      professionalism: TRAIT_GRADE.optional(),
      mission_accomplishment: TRAIT_GRADE.optional(),
      human_development: TRAIT_GRADE.optional(),
      eo_climate: TRAIT_GRADE.optional(),
      teamwork: TRAIT_GRADE.optional(),
      leadership: TRAIT_GRADE.optional(),
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
  })
  .superRefine((data, ctx) => {
    refinePeriodOrder(data.period_from, data.period_to, ctx);
    refineDateReported(data.date_reported, ctx);
    refineReportingSeniorDesignator(data.reporting_senior_designator, ctx);
    refineDateCounseled(data.date_counseled, ctx);
    refinePromotionRecommendation(data, ctx, {
      eoKey: "eo_climate",
      eoBlockLabel: "Equal Opportunity / Command Climate (Block 37)",
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// FitrepSchema — NAVPERS 1610/2 (W2–O6)
// 8 performance traits (adds tactical_performance); no retention block.
// ─────────────────────────────────────────────────────────────────────────────

export const FitrepSchema = z
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
      .min(1, "Grade is required (Block 2)")
      .regex(
        /^[a-zA-Z0-9]+$/,
        "Grade must contain letters and numbers only (Block 2)",
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
      .refine((v) => !v || BILLET_SUBCATEGORY_OPTIONS.includes(v), {
        message:
          "Billet Subcategory must be a valid code from BUPERSINST 1610.10H table 1-1 — e.g., NA, BASIC, CRF, or SPECIAL01–SPECIAL20 (Block 21)",
      }),
    reporting_senior_name: z
      .string()
      .min(1, "Reporting Senior name is required (Block 22)")
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
      knowledge: TRAIT_GRADE.optional(),
      work: TRAIT_GRADE.optional(),
      eo: TRAIT_GRADE.optional(),
      bearing: TRAIT_GRADE.optional(),
      accomplishment: TRAIT_GRADE.optional(),
      teamwork: TRAIT_GRADE.optional(),
      leadership: TRAIT_GRADE.optional(),
      tactical_performance: TRAIT_GRADE.optional(),
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
  })
  .superRefine((data, ctx) => {
    refinePeriodOrder(data.period_from, data.period_to, ctx);
    refineDateReported(data.date_reported, ctx);
    refineReportingSeniorDesignator(data.reporting_senior_designator, ctx);
    refineDateCounseled(data.date_counseled, ctx);
    refineOfficerDesignator(data.designator, ctx);
    refinePromotionRecommendation(data, ctx, {
      eoKey: "eo",
      bearingKey: "bearing",
      eoBlockLabel: "Command or Organizational Climate/EO (Block 34)",
      bearingBlockLabel: "Military Bearing/Character (Block 35)",
    });
  });
