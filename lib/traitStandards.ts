// lib/traitStandards.ts
//
// Official NAVPERS 1616/26 (REV 05-2025) performance-trait standards. Each trait
// (blocks 33-39) prints anchor descriptions in the 1.0, 3.0, and 5.0 columns of the
// trait grid; the 2.0 and 4.0 columns are intentionally blank "between" steps.
//
// Source of truth: the printed grid on public/navpers-1616-26_2025.pdf (REV 05-2025),
// transcribed from the PDF text layer and verified against the rendered form. These are
// the verbatim standards shown to the rater — do NOT paraphrase; correct against the
// form if the official wording changes.

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
  anchors: Record<AnchorGrade, string[]>;
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

// Block 43 footnote + Rater/Senior-Rater certifications: 1.0 and 5.0 marks require a
// written explanation, and 1.0 marks (plus any 2.0 in Block 35) must be substantiated.
export const SUBSTANTIATION_NOTE_EVAL =
  "Marks of 1.0 and 5.0 require a written explanation in Block 43 (Comments). All 1.0 marks, three or more 2.0 marks, and any 2.0 in Block 35 (Command Climate/EO) must be specifically substantiated and verifiable (BUPERSINST 1610.10H).";

export const SUBSTANTIATION_NOTE_CHIEFEVAL =
  "NAVPERS 1616/27: All 1.0 marks and all 2.0 marks in Blocks 33–39 must be specifically substantiated in Block 40 (Reporting Senior comments). Comments must be verifiable.";

export const SUBSTANTIATION_NOTE_FITREP =
  "NAVPERS 1610/2: All 1.0 marks, three or more 2.0 marks, and any 2.0 in Block 34 (Command/Organizational Climate) must be specifically substantiated in Block 41 comments. Comments must be verifiable.";

/** @deprecated Use getSubstantiationNote(reportType) */
export const SUBSTANTIATION_NOTE = SUBSTANTIATION_NOTE_EVAL;

export function getSubstantiationNote(
  reportType?: string,
): string {
  if (reportType === "CHIEFEVAL") return SUBSTANTIATION_NOTE_CHIEFEVAL;
  if (reportType === "FITREP") return SUBSTANTIATION_NOTE_FITREP;
  return SUBSTANTIATION_NOTE_EVAL;
}

export const ANCHOR_GRADES: readonly AnchorGrade[] = ["1.0", "3.0", "5.0"];

export const TRAIT_STANDARDS: Record<TraitKey, TraitStandard> = {
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

const CHIEFEVAL_TRAIT_STANDARDS: Record<string, TraitStandard> = {
  deckplate_leadership: {
    block: 33,
    title: "Deckplate Leadership",
    definition: "Visible leadership, mentorship, and deckplate impact on Sailors",
    anchors: {
      "1.0": ["Limited deckplate presence; minimal impact on Sailor development"],
      "3.0": ["Visible leader; builds credible teams; honors and develops Sailors"],
      "5.0": ["Exceptional deckplate leader; drives culture and measurable team success"],
    },
  },
  professionalism: {
    block: 34,
    title: "Professionalism (incl. PFA)",
    definition: "Conduct, bearing, standards, and physical readiness",
    anchors: {
      "1.0": ["Conduct or readiness below standards"],
      "3.0": ["Meets Navy standards for conduct, appearance, and PFA"],
      "5.0": ["Role model for professionalism and physical readiness"],
    },
  },
  mission_accomplishment: {
    block: 35,
    title: "Mission Accomplishment",
    definition: "Initiative, accountability, and mission-focused outcomes",
    anchors: {
      "1.0": ["Fails to meet mission expectations"],
      "3.0": ["Reliable mission accomplishment and initiative"],
      "5.0": ["Consistently exceeds mission goals with innovation"],
    },
  },
  human_development: {
    block: 36,
    title: "Human Development",
    definition: "Developing subordinates' professional and personal growth",
    anchors: {
      "1.0": ["Neglects development of others"],
      "3.0": ["Actively supports Sailor growth and career development"],
      "5.0": ["Inspires exceptional growth across the command"],
    },
  },
  eo_climate: {
    block: 37,
    title: "Equal Opportunity / Command Climate",
    definition: "EO, climate, and inclusion — promotion gate trait on CHIEFEVAL",
    anchors: {
      "1.0": ["Actions harm command climate or EO goals"],
      "3.0": ["Fosters positive climate; meets EO expectations"],
      "5.0": ["Exemplary climate and EO leadership"],
    },
  },
};

const FITREP_EXTRA_STANDARDS: Record<string, TraitStandard> = {
  tactical_performance: {
    block: 39,
    title: "Tactical Performance",
    definition: "Tactical/operational proficiency and warfare employment (officers)",
    anchors: {
      "1.0": ["Below expected tactical proficiency for grade"],
      "3.0": ["Capably employs platforms/systems; meets warfare expectations"],
      "5.0": ["Innovative tactical employment; exceeds peers in warfare skills"],
    },
  },
};

/** Unified lookup for EVAL, CHIEFEVAL, and FITREP trait rows. */
export const TRAIT_STANDARDS_LOOKUP: Record<string, TraitStandard> = {
  ...TRAIT_STANDARDS,
  ...CHIEFEVAL_TRAIT_STANDARDS,
  ...FITREP_EXTRA_STANDARDS,
};
