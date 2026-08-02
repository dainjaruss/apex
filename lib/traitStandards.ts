// lib/traitStandards.ts
//
// Official performance-trait standards for all three forms, ONE TABLE PER FORM.
// Resolve them with getTraitStandard(reportType, key) — there is no merged lookup,
// because a merged lookup is how officers came to read EVAL prose on a FITREP.
//
//   EVAL      NAVPERS 1616/26 (E1-E6)  → TRAIT_STANDARDS
//   CHIEFEVAL NAVPERS 1616/27 (E7-E9)  → CHIEFEVAL_TRAIT_STANDARDS
//   FITREP    NAVPERS 1610/2  (W2-O6)  → FITREP_TRAIT_STANDARDS
//
// Source of truth: the printed grids on public/navpers-1616-26_2025.pdf,
// public/chiefEvalBlank.pdf and public/fitrepBlank.pdf (all REV 05-2025), transcribed
// from the PDF text layer and verified against the rendered forms. These are the
// verbatim standards shown to the rater — do NOT paraphrase, and do NOT reuse one
// form's wording for another; correct against the form if the official wording changes.
//
// On 1616/26 and 1610/2 each trait prints anchor descriptions in the 1.0, 3.0 and 5.0
// columns of the trait grid; the 2.0 and 4.0 columns are intentionally blank "between"
// steps. 1616/27 prints no anchor columns at all — see `standards`.

export type TraitKey =
  | "knowledge"
  | "work"
  | "eo"
  | "bearing"
  | "accomplishment"
  | "teamwork"
  | "leadership";

export type AnchorGrade = "1.0" | "3.0" | "5.0";

export interface TraitStandard {
  block: number;
  title: string; // trait name as printed (e.g. "Professional Knowledge")
  definition: string; // the sub-caption printed under the trait name
  // NAVPERS 1616/26 (EVAL) and 1610/2 (FITREP) print 1.0 / 3.0 / 5.0 anchor
  // columns per trait. NAVPERS 1616/27 (CHIEFEVAL) does NOT — see `standards`.
  anchors?: Record<AnchorGrade, string[]>;
  // NAVPERS 1616/27 prints ONE bullet list per trait and no per-grade anchor
  // columns, so there is nothing on the form to populate `anchors` with. These
  // are the printed bullets, verbatim. Never synthesize per-grade anchors for a
  // form that does not print them.
  standards?: string[];
}

// Column headers across the trait grid (1.0-5.0) plus NOB.
export const TRAIT_GRADE_LABELS: Record<string, string> = {
  "1.0": "Below Standards",
  "2.0": "Progressing",
  "3.0": "Meets Standards",
  "4.0": "Above Standards",
  "5.0": "Greatly Exceeds Standards",
  NOB: "Not Observed",
};

// The scale legend printed above the grid — used to describe the in-between marks
// (2.0, 4.0) and NOB, which carry no per-trait bullet text.
export const GRADE_SCALE_NOTE: Record<string, string> = {
  "1.0": "Below standards / not progressing, or UNSAT in any one standard.",
  "2.0": "Does not yet meet all 3.0 standards.",
  "3.0": "Meets all 3.0 standards.",
  "4.0": "Exceeds most 3.0 standards.",
  "5.0":
    "Meets overall criteria and most of the specific standards for 5.0. Standards are not all inclusive.",
  NOB: "Not Observed — insufficient opportunity to observe; this trait is not graded.",
};

// The Block 43 substantiation footnote, LIGHTLY GLOSSED — not verbatim. The
// printed footnote reads "three 2.0 marks"; this says "three or more", adds
// "any" before the Block 35 clause, and appends the instruction citation. Each
// gloss matches para 13-4, and the file's do-NOT-paraphrase rule governs the
// anchor text above, not this summary line. It says nothing about 5.0.
//
// This string used to open "Marks of 1.0 and 5.0 require a written explanation in
// Block 43 (Comments)" — an obligation the printed footnote does not create, and one
// that reached a user: the narrative coach repeated it back as "the form's
// substantiation wording calls for a written explanation behind each 5.0 mark".
// Written explanations of 1.0 AND 5.0 marks belong to the Block 42 / 49 Rater and
// Senior Rater CERTIFICATIONS forwarded with the report, not to Block 43. Para 13-4
// never mentions 5.0, and APEX must not raise a Block 43 finding on an unexplained
// 5.0 (docs/navy-reference.md §3.11).
export const SUBSTANTIATION_NOTE_EVAL =
  "All 1.0 marks, three or more 2.0 marks, and any 2.0 in Block 35 (Command Climate/EO) must be specifically substantiated in Block 43 comments. Comments must be verifiable (BUPERSINST 1610.10H).";

export const SUBSTANTIATION_NOTE_CHIEFEVAL =
  "NAVPERS 1616/27: All 1.0 marks and all 2.0 marks in Blocks 33–39 must be specifically substantiated in Block 40 (Reporting Senior comments). Comments must be verifiable.";

export const SUBSTANTIATION_NOTE_FITREP =
  "NAVPERS 1610/2: All 1.0 marks, three or more 2.0 marks, and any 2.0 in Block 34 (Command/Organizational Climate) must be specifically substantiated in Block 41 comments. Comments must be verifiable.";

/** @deprecated Use getSubstantiationNote(reportType) */
export const SUBSTANTIATION_NOTE = SUBSTANTIATION_NOTE_EVAL;

// The block carrying the substantiating narrative differs per form. Read off each blank:
//   1616/26 "43. COMMENTS ON PERFORMANCE"
//   1616/27 "40. REPORTING SENIOR COMMENTS ON PERFORMANCE."
//   1610/2  "41. COMMENTS ON PERFORMANCE"
export function getCommentsBlock(reportType?: string): number {
  if (reportType === "CHIEFEVAL") return 40;
  if (reportType === "FITREP") return 41;
  return 43;
}

export function getSubstantiationNote(
  reportType?: string,
): string {
  if (reportType === "CHIEFEVAL") return SUBSTANTIATION_NOTE_CHIEFEVAL;
  if (reportType === "FITREP") return SUBSTANTIATION_NOTE_FITREP;
  return SUBSTANTIATION_NOTE_EVAL;
}

export const ANCHOR_GRADES: readonly AnchorGrade[] = ["1.0", "3.0", "5.0"];

// 1616/26 prints anchor columns for every trait, so `anchors` is required here.
export const TRAIT_STANDARDS: Record<
  TraitKey,
  TraitStandard & { anchors: Record<AnchorGrade, string[]> }
> = {
  knowledge: {
    block: 33,
    title: "Professional Knowledge",
    definition: "Technical knowledge and practical application",
    anchors: {
      "1.0": [
        "Marginal knowledge of rating, specialty or job",
        "Unable to apply knowledge to solve routine problems",
        "Fails to meet advancement/PQS requirements",
      ],
      "3.0": [
        "Strong working knowledge of rating, specialty and job",
        "Reliably applies knowledge to accomplish tasks",
        "Meets advancement/PQS requirements on time",
      ],
      "5.0": [
        "Recognized expert, sought out by all for technical knowledge",
        "Uses knowledge to solve complex technical problems",
        "Meets advancement/PQS requirements early/with distinction",
      ],
    },
  },
  work: {
    block: 34,
    title: "Quality of Work",
    definition: "Standard of work; value of end product",
    anchors: {
      "1.0": [
        "Needs excessive supervision",
        "Product frequently needs rework",
        "Wasteful of resources",
      ],
      "3.0": [
        "Needs little supervision",
        "Produces quality work",
        "Few errors and resulting rework",
        "Uses resources efficiently",
      ],
      "5.0": [
        "Needs no supervision",
        "Always produces exceptional work",
        "No rework required",
        "Maximizes resources",
      ],
    },
  },
  eo: {
    block: 35,
    title: "Command or Organizational Climate",
    definition:
      "Contributions to growth and development, human worth, community",
    anchors: {
      "1.0": [
        "Actions counter to Navy's retention goals",
        "Uninvolved with mentoring or professional development of subordinates",
        "Demonstrates behavior that stifles command or work center success",
        "Actions counter to good order and discipline and negatively affect command/organizational climate",
      ],
      "3.0": [
        "Positive leadership supports Navy's increased retention goals. Active in decreasing attrition",
        "Actions adequately encourage/support subordinates' personal/professional growth",
        "Fosters an atmosphere conducive to personal and team success",
        "Appreciates contributions of Navy personnel. Positive influence on command climate",
        "Actions contribute to good order and discipline and positively improves command/organizational climate",
      ],
      "5.0": [
        "Measurably contributes to Navy's increased retention and reduced attrition objectives",
        "Proactive leader/exemplary mentor. Involved in subordinates' personal development leading to professional growth/sustained commitment",
        "Initiates support programs for military, civilian, and families to achieve exceptional command and organizational climate",
      ],
    },
  },
  bearing: {
    block: 36,
    title: "Military Bearing/Character",
    definition:
      "Appearance, conduct, physical fitness, adherence to Navy Core Values",
    anchors: {
      "1.0": [
        "Consistent unsatisfactory appearance",
        "Poor self-control; conduct resulting in disciplinary action",
        "Unable to meet one or more physical readiness standards",
        "Fails to live up to one or more Navy Core Values: HONOR, COURAGE, COMMITMENT",
      ],
      "3.0": [
        "Excellent personal appearance",
        "Excellent conduct; conscientiously complies with regulations",
        "Complies with physical readiness program",
        "Always lives up to Navy Core Values: HONOR, COURAGE, COMMITMENT",
      ],
      "5.0": [
        "Exemplary personal appearance",
        "Model of conduct, on and off duty",
        "A leader in physical readiness",
        "Exemplifies Navy Core Values: HONOR, COURAGE, COMMITMENT",
      ],
    },
  },
  accomplishment: {
    block: 37,
    title: "Personal Job Accomplishment/Initiative",
    definition: "Responsibility, quantity of work",
    anchors: {
      "1.0": [
        "Needs prodding to attain qualification or finish job",
        "Prioritizes poorly",
        "Avoids responsibility",
      ],
      "3.0": [
        "Productive and motivated. Completes tasks and qualifications fully and on time",
        "Plans/prioritizes effectively",
        "Reliable, dependable, willingly accepts responsibility",
      ],
      "5.0": [
        "Energetic self-starter. Completes tasks or qualifications early, far better than expected",
        "Plans/prioritizes wisely and with exceptional foresight",
        "Seeks extra responsibility and takes on the hardest jobs",
      ],
    },
  },
  teamwork: {
    block: 38,
    title: "Teamwork",
    definition: "Contributions to team building and team results",
    anchors: {
      "1.0": [
        "Creates conflict, unwilling to work with others, puts self above team",
        "Fails to understand team goals or teamwork techniques",
        "Does not take direction well",
      ],
      "3.0": [
        "Reinforces others' efforts, meets commitments to team",
        "Understands goals, employs good teamwork techniques",
        "Accepts and offers team direction",
      ],
      "5.0": [
        "Team builder, inspires cooperation and progress",
        "Focuses goals and techniques for teams",
        "The best at accepting and offering team direction",
      ],
    },
  },
  leadership: {
    block: 39,
    title: "Leadership",
    definition:
      "Organizing, motivating and developing others to accomplish goals",
    anchors: {
      "1.0": [
        "Neglects growth/development or welfare of subordinates",
        "Fails to organize; creates problems for subordinates",
        "Does not set or achieve goals relevant to command's mission and vision",
        "Lacks ability to cope with or tolerate stress",
        "Inadequate communicator",
        "Tolerates hazards or unsafe practices",
      ],
      "3.0": [
        "Effectively stimulates growth/development in subordinates",
        "Organizes successfully, implementing process improvements and efficiencies",
        "Sets/achieves useful, realistic goals that support command's mission",
        "Performs well in stressful situations",
        "Clear, timely communicator",
        "Ensures safety of personnel and equipment",
      ],
      "5.0": [
        "Inspiring motivator and trainer; subordinates reach highest level of growth and development",
        "Superb organizer, great foresight, develops process improvements and efficiencies",
        "Leadership achievements dramatically further command's mission and vision",
        "Perseveres through the toughest challenges and inspires others",
        "Exceptional communicator",
        "Makes subordinates safety-conscious, maintains top safety record",
        "Constantly improves the personal and professional lives of others",
      ],
    },
  },
};

// NAVPERS 1616/27 (CHIEFEVAL, REV 05-2025) — "EVALUATION & COUNSELING RECORD (E7-E9)".
//
// SEVEN performance traits, Blocks 33-39, grouped on the form into three printed
// categories: COMPETENCY (33-34), CHARACTER (35-37), CULTURE (38-39). Blocks 33-36
// print on page 1, Blocks 37-39 on page 2.
//
// Transcribed block-by-block from the text layer of public/chiefEvalBlank.pdf
// (`pdftotext -layout`), which is the blank form itself — not from the instruction
// and not from memory. Cross-checked against docs/navy-reference.md §3.1, which
// agrees on all seven labels and block numbers.
//
// The 3.0 advancement gate attaches to Block 37 = ACCOUNTABILITY (1610.10H Encl (2)
// ch. 1, "FITREP-CHIEFEVAL BLOCK 48", p. 1-16; docs/navy-reference.md §3.2). There is
// NO trait named "Equal Opportunity" or "Command Climate" on this form — the string
// "EQUAL OPPORTUNITY" does not appear anywhere on 1616/27. That is the instruction's
// wording for the FITREP/EVAL trait, not a CHIEFEVAL trait name.
//
// This form prints no 1.0/3.0/5.0 anchor columns, so these entries carry `standards`
// (the printed bullets) and deliberately omit `anchors`.
const CHIEFEVAL_TRAIT_STANDARDS: Record<string, TraitStandard> = {
  technical_mastery: {
    block: 33,
    title: "Technical Mastery",
    definition: "Competency",
    standards: [
      "Technical expert in rating and community",
      "Uses technical knowledge and experience to produce well trained teams able to execute the command mission with excellence",
      "Applies knowledge, skills, and abilities to meet any mission.",
    ],
  },
  institutional_expertise: {
    block: 34,
    title: "Institutional Expertise",
    definition: "Competency",
    standards: [
      "Understands how unit mission supports the naval mission and the National Military Strategy",
      "Recognizes when to engage to ensure mission success",
      "Knows and teaches customs and traditions, understands naval history.",
    ],
  },
  professionalism: {
    block: 35,
    title: "Professionalism",
    definition: "Character",
    standards: [
      "Promotes the attributes that define the Profession of Arms",
      "Success measured by Sailors' achievements",
      "Conduct in alignment with Core Values",
      "Actively teaches, upholds, and enforces standards",
      "Role model for GOAD",
    ],
  },
  integrity: {
    block: 36,
    title: "Integrity",
    definition: "Character",
    standards: [
      "Abides by an uncompromising code of integrity",
      "Takes full responsibility for actions",
      "Sets a positive tone and builds trust",
    ],
  },
  accountability: {
    block: 37,
    title: "Accountability",
    definition: "Character — 3.0 advancement gate trait on the CHIEFEVAL",
    standards: [
      "Mission-focused, accountable for outcomes",
      "Learning mindset, providing command solutions",
      "Holds self and peers accountable",
      "Actively self-assesses and has a strong commitment to self correction.",
    ],
  },
  deckplate_leadership: {
    block: 38,
    title: "Deckplate Leadership",
    definition: "Culture",
    standards: [
      "Visible, sets the tone",
      "Understands personnel programs and policies.",
      "Builds credible combat teams",
      "Honors and rewards team members",
      "Drives Sailors to be better",
    ],
  },
  team_effectiveness: {
    block: 39,
    title: "Team Effectiveness",
    definition: "Culture",
    standards: [
      "Proactive leader invested in all Sailors",
      "Anticipates problems, overcomes challenges, delivers best outcomes",
      "Innovates at the lowest level possible.",
      "Behavior and performance are key factors in the attainment of team successes, the personal development of all team members.",
    ],
  },
};

/** Block order for the CHIEFEVAL trait grid — Blocks 33-39, page 1 then page 2. */
export const CHIEFEVAL_TRAIT_ORDER = [
  "technical_mastery",
  "institutional_expertise",
  "professionalism",
  "integrity",
  "accountability",
  "deckplate_leadership",
  "team_effectiveness",
] as const;

export { CHIEFEVAL_TRAIT_STANDARDS };

// NAVPERS 1610/2 (FITREP, REV 05-2025) — "FITNESS REPORT & COUNSELING RECORD (W2-O6)".
//
// SEVEN performance traits, Blocks 33-39. Blocks 33-37 print on page 1, Blocks 38-39
// on page 2. This form DOES print 1.0 / 3.0 / 5.0 anchor columns (the grid header row
// reads "1.0* Below Standards | 2.0 Pro-gressing | 3.0 Meets Standards | 4.0 Above
// Standards | 5.0 Greatly Exceeds Standards"), so every entry carries `anchors` —
// unlike 1616/27, which prints none.
//
// Transcribed block-by-block from the text layer of public/fitrepBlank.pdf, in both
// `pdftotext -layout` and reading-order modes, with bullet boundaries confirmed against
// `pdftotext -bbox-layout` glyph positions (a bullet's "-" sits at xMin≈107, its text at
// ≈110, and wrapped continuations at ≈117). Transcribed from the blank form itself —
// not from the instruction, not from the EVAL table, and not from memory.
//
// These are NOT the 1616/26 (EVAL) descriptors. Officer and enlisted prose diverge in
// substance, not only wording: Block 33 grades qualifications and professional
// development where the EVAL grades "rating, specialty or job" and "advancement/PQS
// requirements"; Block 35 grades "demeanor, or conduct" where the EVAL grades "self-
// control; conduct resulting in disciplinary action"; Block 37 (MISSION ACCOMPLISHMENT
// AND INITIATIVE) shares no bullet at all with the EVAL's Block 37 (PERSONAL JOB
// ACCOMPLISHMENT/INITIATIVE). There is no QUALITY OF WORK trait on 1610/2, and no
// TACTICAL PERFORMANCE trait on 1616/26.
//
// Typographic quirks below are the FORM's, reproduced rather than corrected:
//  - Block 33's sub-caption prints "Professional knowledge proficiency, and
//    qualifications" (no comma after "knowledge").
//  - Block 35's sub-caption prints "adherance", the form's own misspelling of
//    "adherence". 1616/26 misspells it identically.
//  - Block 39's second 1.0 bullet runs "...employment Below others in..." with no
//    dash and no sentence break at the join; the 3.0 and 5.0 columns punctuate the
//    same thought with a period. Whether the form intends one bullet with a dropped
//    period or two bullets with a dropped dash could not be established from the
//    blank, so it is transcribed exactly as printed.
const FITREP_TRAIT_STANDARDS: Record<
  string,
  TraitStandard & { anchors: Record<AnchorGrade, string[]> }
> = {
  knowledge: {
    block: 33,
    title: "Professional Expertise",
    definition: "Professional knowledge proficiency, and qualifications",
    anchors: {
      "1.0": [
        "Lacks basic professional knowledge to perform effectively",
        "Cannot apply basic skills",
        "Fails to develop professionally or achieve timely qualifications",
      ],
      "3.0": [
        "Has thorough professional knowledge",
        "Competently performs both routine and new tasks",
        "Steadily improves skills, achieves timely qualifications",
      ],
      "5.0": [
        "Recognized expert, sought after to solve difficult problems",
        "Exceptionally skilled, develops and executes innovative ideas",
        "Achieves early/highly advanced qualifications",
      ],
    },
  },
  eo: {
    block: 34,
    title: "Command or Organizational Climate",
    definition:
      "Contributions to growth and development, human worth, community",
    anchors: {
      "1.0": [
        "Actions counter to Navy's retention goals",
        "Uninvolved with mentoring or professional development of subordinates",
        "Demonstrates behavior that stifles command or work center success",
        "Actions counter to good order and discipline and negatively affect command/organizational climate",
      ],
      // 1610/2 prints "Appreciates contributions of Navy personnel" and "Positive
      // influence on command climate" as two separate dashed bullets. 1616/26 runs
      // them together in one bullet (and duplicates the word "Personnel." doing it).
      "3.0": [
        "Positive leadership supports Navy's increased retention goals. Active in decreasing attrition",
        "Actions adequately encourage/support subordinates' personal/professional growth",
        "Fosters an atmosphere conducive to personal and team success",
        "Appreciates contributions of Navy personnel",
        "Positive influence on command climate",
        "Actions contribute to good order and discipline and positively improves command/organizational climate",
      ],
      "5.0": [
        "Measurably contributes to Navy's increased retention and reduced attrition objectives",
        "Proactive leader/exemplary mentor. Involved in subordinates' personal development leading to professional growth/sustained commitment",
        "Initiates support programs for military, civilian, and families to achieve exceptional command and organizational climate",
      ],
    },
  },
  bearing: {
    block: 35,
    title: "Military Bearing/Character",
    definition:
      "Appearance, conduct, physical fitness, adherance to Navy Core Values",
    anchors: {
      "1.0": [
        "Consistent unsatisfactory appearance",
        "Unsatisfactory demeanor, or conduct",
        "Unable to meet one or more physical readiness standards",
        "Fails to live up to one or more Navy Core Values: HONOR, COURAGE, COMMITMENT",
      ],
      "3.0": [
        "Excellent personal appearance",
        "Excellent demeanor or conduct",
        "Complies with physical readiness program",
        "Always lives up to Navy Core Values: HONOR, COURAGE, COMMITMENT",
      ],
      "5.0": [
        "Exemplary personal appearance",
        "Exemplary Navy representative",
        "A leader in physical readiness",
        "Exemplifies Navy Core Values: HONOR, COURAGE, COMMITMENT",
      ],
    },
  },
  teamwork: {
    block: 36,
    title: "Teamwork",
    definition: "Contributions toward team building and team results",
    anchors: {
      "1.0": [
        "Creates conflict, unwilling to work with others, puts self above team",
        "Fails to understand team goals or teamwork techniques",
        "Does not take direction well",
      ],
      "3.0": [
        "Reinforces others' efforts, meets personal commitments to team",
        "Understands team goals, employs good teamwork techniques",
        "Accepts and offers team direction",
      ],
      "5.0": [
        "Team builder, inspires cooperation and progress",
        "Talented mentor; focuses goals and techniques for team",
        "The best at accepting and offering team direction",
      ],
    },
  },
  accomplishment: {
    block: 37,
    title: "Mission Accomplishment and Initiative",
    definition: "Taking initiative, planning/prioritizing, achieving mission",
    anchors: {
      "1.0": [
        "Lacks initiative",
        "Unable to plan or prioritize",
        "Does not maintain readiness",
        "Fails to get the job done",
      ],
      "3.0": [
        "Takes initiative to meet goals",
        "Plans/prioritizes effectively",
        "Maintains high state of readiness",
        "Always gets the job done",
      ],
      "5.0": [
        "Develops innovative ways to accomplish mission",
        "Plans/prioritizes with exceptional skill and foresight",
        "Maintains superior readiness, even with limited resources",
        "Gets jobs done earlier and far better than expected",
      ],
    },
  },
  leadership: {
    block: 38,
    title: "Leadership",
    definition:
      "Organizing, motivating and developing others to accomplish goals",
    anchors: {
      "1.0": [
        "Neglects growth/development or welfare of subordinates",
        "Fails to organize; creates problems for subordinates",
        "Does not set or achieve goals relevant to command's mission and vision",
        "Lacks ability to cope with or tolerate stress",
        "Inadequate communicator",
        "Tolerates hazards or unsafe practices",
      ],
      // Closest of the seven to its EVAL counterpart (1616/26 Block 39) — the
      // divergence is punctuation only: 1610/2 prints "useful realistic goals" with
      // no comma, "trainer, subordinates" with a comma, and "safety-conscious;
      // maintains" with a semicolon, each the opposite of the EVAL's.
      "3.0": [
        "Effectively stimulates growth/development in subordinates",
        "Organizes successfully, implementing process improvements and efficiencies",
        "Sets/achieves useful realistic goals that support command's mission",
        "Performs well in stressful situations",
        "Clear, timely communicator",
        "Ensures safety of personnel and equipment",
      ],
      "5.0": [
        "Inspiring motivator and trainer, subordinates reach highest level of growth and development",
        "Superb organizer, great foresight, develops process improvements and efficiencies",
        "Leadership achievements dramatically further command's mission and vision",
        "Perseveres through the toughest challenges and inspires others",
        "Exceptional communicator",
        "Makes subordinates safety-conscious; maintains top safety record",
        "Constantly improves the personal and professional lives of others",
      ],
    },
  },
  tactical_performance: {
    block: 39,
    // Printed as "TACTICAL PERFORMANCE: (Warfare qualified officers only)" above the
    // sub-caption. Officer-only trait — 1616/26 and 1616/27 print no equivalent.
    title: "Tactical Performance",
    definition:
      "(Warfare qualified officers only) Basic and tactical employment of weapons systems",
    anchors: {
      "1.0": [
        "Has difficulty attaining qualification expected of the rank and experience",
        "Has difficulty in ship(s), aircraft or weapons systems employment Below others in knowledge and employment",
        "Warfare skills in specialty are below standards compared to others of same rank and experience",
      ],
      "3.0": [
        "Attains qualifications as required and expected",
        "Capably employs ship(s), aircraft, or weapons systems. Equal to others in warfare knowledge and employment",
        "Warfare skills in specialty equal to others of same rank and experience",
      ],
      "5.0": [
        "Fully qualified at appropriate level for rank and experience",
        "Innovatively employs ship(s), aircraft, or weapons systems. Well above others in warfare knowledge and employment",
        "Warfare skills in specialty exceed others of same rank and experience",
      ],
    },
  },
};

export { FITREP_TRAIT_STANDARDS };

/**
 * The trait table for one form, keyed by trait key.
 *
 * Same shape as getCommentsBlock()/getSubstantiationNote(): the report type picks
 * the form, and an unknown or absent type falls back to the EVAL (1616/26).
 *
 * There is deliberately no merged all-forms lookup. The flat merge this replaced
 * (`TRAIT_STANDARDS_LOOKUP`) let six of the seven officer rows resolve to the EVAL
 * table, so an officer filling in a FITREP read 1616/26 descriptor prose under
 * 1610/2 trait headings. Resolve descriptors here, per form, or not at all.
 */
export function getTraitStandards(
  reportType?: string,
): Record<string, TraitStandard> {
  if (reportType === "CHIEFEVAL") return CHIEFEVAL_TRAIT_STANDARDS;
  if (reportType === "FITREP") return FITREP_TRAIT_STANDARDS;
  return TRAIT_STANDARDS;
}

/**
 * One trait's printed standard on one form, or undefined when that form prints no
 * such trait (`work` on a FITREP, `tactical_performance` on an EVAL).
 *
 * Undefined is a real answer, not a miss to paper over: callers must skip the trait
 * explicitly. Never substitute another form's entry — that is the bug this replaced.
 */
export function getTraitStandard(
  reportType: string | undefined,
  traitKey: string,
): TraitStandard | undefined {
  return getTraitStandards(reportType)[traitKey];
}
