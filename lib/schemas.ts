// lib/schemas.ts
//
// Single source of truth for all Zod form validation schemas in APEX.
//
// WHY A SEPARATE FILE?
// Schemas are rules about data — they have nothing to do with how a page looks.
// Keeping them here means:
//   1. Both login and register import from one place — no duplication
//   2. If a rule changes (e.g. password minimum), you change it once here
//   3. The same schema can be reused in API routes or server actions later
//   4. Page files stay focused on UI, not validation logic
//
// WHAT GETS EXPORTED:
//   loginSchema         — Zod schema for the login form
//   LoginFormData       — TypeScript type inferred from loginSchema
//   LoginFieldErrors    — type for per-field error state on the login page
//
//   NAVY_RANKS          — const array used by registerSchema and the rank <select>
//   ROLES               — const array used by registerSchema and the role <select>
//   registerSchema      — Zod schema for the registration form
//   RegisterFormData    — TypeScript type inferred from registerSchema
//   RegisterFieldErrors — type for per-field error state on the register page

import { z } from "zod";

// ─── Login ────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address (e.g. sailor@navy.mil)"),

  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type LoginFieldErrors = Partial<Record<keyof LoginFormData, string>>;

// ─── Register ─────────────────────────────────────────────────────────────────

// as const tells TypeScript to treat these as fixed literal tuples, not just string[].
// z.enum() requires that — it needs the exact values, not a generic string array.
export const NAVY_RANKS = [
  "SR",
  "SA",
  "SN",
  "PO3",
  "PO2",
  "PO1",
  "CPO",
  "SCPO",
  "MCPO",
  "WO2",
  "WO3",
  "WO4",
  "WO5",
  "ENS",
  "LTJG",
  "LT",
  "LCDR",
  "CDR",
  "CAPT",
] as const;

export const ROLES = [
  "Sailor",
  "Rater",
  "Senior Rater",
  "Reporting Senior",
  "Admin",
] as const;

export const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),

    lastName: z.string().min(1, "Last name is required"),

    middleInitial: z
      .string()
      .max(1, "Middle initial is one letter only")
      .optional(),

    dodId: z.string().regex(/^[0-9]{10}$/, "DoD ID must be exactly 10 digits"),

    rank: z.enum(NAVY_RANKS, {
      message: "Select a valid Navy rank/rate",
    }),

    uic: z.string().max(5, "UIC must be 5 characters or fewer").optional(),

    command: z.string().min(1, "Command name is required"),

    role: z.enum(ROLES, {
      message: "Select a valid evaluation role",
    }),

    email: z
      .string()
      .email("Enter a valid email address (e.g. sailor@navy.mil)"),

    // 8 chars on registration sets the minimum — will align with Supabase
    // password policy once the backend auth config is finalized
    password: z.string().min(8, "Password must be at least 8 characters"),
  })
  .superRefine((data, ctx) => {
    const isE1toE5 = ["SR", "SA", "SN", "PO3", "PO2"].includes(data.rank);
    const isE6 = data.rank === "PO1";

    // E-1 to E-5 cannot be evaluators at all
    if (
      isE1toE5 &&
      ["Rater", "Senior Rater", "Reporting Senior"].includes(data.role)
    ) {
      ctx.addIssue({
        path: ["role"],
        code: z.ZodIssueCode.custom,
        message: `Personnel E-1 through E-5 cannot serve as a ${data.role}.`,
      });
    }

    // E-6 can be a Rater, but not a Senior Rater or Reporting Senior
    if (isE6 && ["Senior Rater", "Reporting Senior"].includes(data.role)) {
      ctx.addIssue({
        path: ["role"],
        code: z.ZodIssueCode.custom,
        message: `An E-6 (PO1) cannot serve as a ${data.role}.`,
      });
    }
  });

export type RegisterFormData = z.infer<typeof registerSchema>;
export type RegisterFieldErrors = Partial<
  Record<keyof RegisterFormData, string>
>;
