// lib/bupersGuidelines.ts
//
// Official BUPERSINST 1610.10H reference instructions and validation rules
// for completing NAVPERS 1616/26 (EVAL) forms.

import rawGuidelines from "./bupersGuidelines.json";

export interface Guideline {
  title: string;
  block: string;
  excerpt: string;
  rules: string[];
}

export const bupersGuidelines: Record<string, Guideline> =
  rawGuidelines as Record<string, Guideline>;
