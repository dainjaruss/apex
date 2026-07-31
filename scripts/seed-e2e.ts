/**
 * E2E seed script — creates @franklyn.dev test users, commands row, and eval fixtures.
 * Usage: npm run db:seed [-- --reset]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  buildValidEval,
  FORM_DEFINITION_ID,
} from "../tests/fixtures/validEval";
import { participantsThrough } from "../lib/routing";
import { canSignBlock } from "../lib/permissions";
import {
  scoreBoardConfidence,
  DEFAULT_RUBRIC_CONFIG,
} from "../lib/boardConfidence/rubric";
import { buildReadinessReport } from "../lib/boardConfidence/readiness";
import { BOARD_DISCLAIMER } from "../lib/boardConfidence/types";
import type {
  ClientReadinessReport,
  RubricInputs,
} from "../lib/boardConfidence/types";
import type { Evaluation, Profile } from "../types";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()])
        process.env[m[1].trim()] = m[2].trim();
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.E2E_TEST_PASSWORD || "NavyEval!2026";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const reset = process.argv.includes("--reset");

const E2E_USERS = [
  {
    email: "sailor@franklyn.dev",
    role: "Sailor",
    firstName: "JOHN",
    lastName: "DOE",
    middleInitial: "A",
    dodId: "1234567890",
    rank: "PO2",
  },
  {
    email: "rater@franklyn.dev",
    role: "Rater",
    firstName: "ALAN",
    lastName: "RAY",
    middleInitial: "M",
    dodId: "2345678901",
    rank: "PO1",
  },
  {
    email: "seniorrater@franklyn.dev",
    role: "Senior Rater",
    firstName: "BETTY",
    lastName: "SMITH",
    middleInitial: "L",
    dodId: "3456789012",
    rank: "CPO",
  },
  {
    email: "reportingsenior@franklyn.dev",
    role: "Reporting Senior",
    firstName: "CARL",
    lastName: "JONES",
    middleInitial: "R",
    dodId: "4567890123",
    rank: "CDR",
  },
  {
    email: "admin@franklyn.dev",
    role: "Admin",
    firstName: "APEX",
    lastName: "ADMIN",
    middleInitial: "X",
    dodId: "5678901234",
    rank: "CAPT",
  },
  {
    email: "it1.williams@franklyn.dev",
    role: "Sailor",
    firstName: "SARAH",
    lastName: "WILLIAMS",
    middleInitial: "K",
    dodId: "6789012345",
    rank: "IT1",
  },
  {
    email: "itcs.rodriguez@franklyn.dev",
    role: "Senior Rater",
    firstName: "MARCOS",
    lastName: "RODRIGUEZ",
    middleInitial: "E",
    dodId: "7890123456",
    rank: "ITCS",
  },
  {
    email: "lt.chen@franklyn.dev",
    role: "Reporting Senior",
    firstName: "DAVID",
    lastName: "CHEN",
    middleInitial: "T",
    dodId: "8901234567",
    rank: "LT",
  },
] as const;

const E2E_MEMBER_NAMES = [
  "DOE, JOHN A",
  "DOE, JOHN A (RECYCLE)",
  "SMITH, BETTY L (CHIEF)",
  "JONES, CARL R (OFFICER)",
  "WILLIAMS, SARAH K (IT1)",
  "RODRIGUEZ, MARCOS E (ITCS)",
  "CHEN, DAVID T (LT)",
];

async function findUserByEmail(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

async function upsertUser(u: (typeof E2E_USERS)[number]) {
  const existing = await findUserByEmail(u.email);
  const meta = {
    first_name: u.firstName,
    last_name: u.lastName,
    middle_initial: u.middleInitial,
    dod_id: u.dodId,
    uic: "12345",
    navy_rank: u.rank,
    command: "USS NEVERSAIL",
    preferred_role: u.role,
  };

  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: meta,
    });
    await admin
      .from("profiles")
      .update({
        first_name: u.firstName,
        last_name: u.lastName,
        middle_initial: u.middleInitial,
        dod_id: u.dodId,
        uic: "12345",
        navy_rank: u.rank,
        command: "USS NEVERSAIL",
        preferred_role: u.role,
        assigned_roles: [u.role],
      })
      .eq("id", existing.id);
    console.log(`  updated ${u.email}`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) throw new Error(`createUser ${u.email}: ${error.message}`);

  // REQUIRED since migration 009: public.handle_new_user() no longer trusts
  // raw_user_meta_data->>'preferred_role' (it was a self-service Admin account),
  // so the trigger just made this profile a 'Sailor' regardless of `meta`. Roles
  // are now service-role-only — set it explicitly or a fresh seed produces eight
  // Sailors and every routing/signing demo breaks.
  const { error: roleError } = await admin
    .from("profiles")
    .update({ preferred_role: u.role, assigned_roles: [u.role] })
    .eq("id", data.user.id);
  if (roleError)
    throw new Error(`role assign ${u.email}: ${roleError.message}`);

  console.log(`  created ${u.email} (${u.role})`);
  return data.user.id;
}

async function seedCommands() {
  const { error } = await admin.from("commands").upsert({
    uic: "12345",
    command_name: "USS NEVERSAIL",
    command_type: "SHIP",
    region: "ATLANTIC",
    active: true,
  });
  if (error) throw new Error(`commands upsert: ${error.message}`);
  console.log("  commands: USS NEVERSAIL (12345)");
}

async function deleteE2eEvals() {
  const { data } = await admin
    .from("evaluations")
    .select("id")
    .in("member_name", E2E_MEMBER_NAMES);
  if (!data?.length) return;
  const ids = data.map((r) => r.id);
  await admin.from("audit_logs").delete().in("evaluation_id", ids);
  await admin.from("review_approvals").delete().in("evaluation_id", ids);
  await admin.from("evaluations").delete().in("id", ids);
  console.log(`  removed ${ids.length} existing E2E eval(s)`);
}

/** Roster role for each seeded user id, keyed the way `users` is keyed. */
const ROLE_BY_USER_KEY: Record<string, string> = {
  sailor: "Sailor",
  rater: "Rater",
  seniorRater: "Senior Rater",
  reportingSenior: "Reporting Senior",
  admin: "Admin",
  it1Williams: "Sailor",
  itcsRodriguez: "Senior Rater",
  ltChen: "Reporting Senior",
};

/**
 * Every full-chain showcase record must have a real signer for blocks 42, 49, 50
 * and 51 among the seeded roster. Throws with the offending block if not.
 *
 * This is the check that would have caught the showcase records being signable
 * by nobody: they were self-authored with `participants: [author]`, and
 * canSignBlock rejects a reviewer signature from the report's own subject.
 */
function assertShowcaseSignable(
  drafts: Array<[string, Record<string, unknown>]>,
  users: Record<string, string>,
) {
  const roster: Profile[] = Object.entries(users)
    .filter(([key]) => ROLE_BY_USER_KEY[key])
    .map(([key, id]) => ({
      id,
      first_name: key,
      last_name: key,
      preferred_role: ROLE_BY_USER_KEY[key] as Profile["preferred_role"],
      assigned_roles: [ROLE_BY_USER_KEY[key]],
    }));

  for (const [name, draft] of drafts) {
    for (const block of [42, 49, 50, 51]) {
      const signers = roster.filter((p) =>
        canSignBlock(p, block, draft as unknown as Evaluation),
      );
      if (signers.length === 0) {
        throw new Error(
          `Seed guard: "${name}" Block ${block} is signable by NOBODY on the seeded roster. ` +
            `created_by=${draft.created_by} participants=${JSON.stringify(draft.participants)}. ` +
            `Reviewer blocks need a chain participant who is not the subject and holds the role.`,
        );
      }
    }
  }
  console.log(
    `  chain check: ${drafts.length} showcase records fully signable`,
  );
}

async function seedEvals(users: Record<string, string>) {
  const sailorId = users.sailor;
  const raterId = users.rater;
  const seniorRaterId = users.seniorRater;
  const reportingSeniorId = users.reportingSenior;

  const routingDraft = buildValidEval({
    created_by: sailorId,
    current_holder_id: sailorId,
    previous_holder_id: null,
    routing_stage: "sailor",
    participants: [sailorId],
    member_name: "DOE, JOHN A",
    form_definition_id: FORM_DEFINITION_ID,
  });

  const recycleDraft = buildValidEval({
    created_by: sailorId,
    current_holder_id: raterId,
    previous_holder_id: sailorId,
    routing_stage: "rater",
    participants: [sailorId, raterId],
    member_name: "DOE, JOHN A (RECYCLE)",
    form_definition_id: FORM_DEFINITION_ID,
  });

  // ── Showcase records (CHIEFEVAL / FITREP) ────────────────────────────────
  // These are the demo records a human opens and signs end to end, so they are
  // parked in the state the real workflow reaches immediately before signing:
  // routed all the way up and then put into 'debrief' by the Reporting Senior
  // (exactly where tests/e2e/full-eval-workflow.spec.ts signs its four blocks).
  //
  // `created_by` is the evaluated MEMBER — that is what it means in this model
  // (canPerformAction 'sign_block_51' reads it as the subject). The reviewers
  // must therefore be other people: canSignBlock refuses a reviewer signature
  // from created_by, so the old shape — self-authored with `participants:
  // [author]` — was signable by NOBODY on blocks 42/49/50/52, and routing to
  // yourself could not fix it. Each reviewer must also hold the right role:
  // 42 → Rater, 49 → Senior Rater, 50 → Reporting Senior.
  //
  // participants comes from participantsThrough() rather than a literal, so it
  // is by construction what app/api/eval-route/route.ts would have produced.
  const showcaseCustody = (
    member: string,
    seniorRaterFor: string,
    rsFor: string,
  ) => ({
    created_by: member,
    routing_stage: "debrief" as const,
    current_holder_id: rsFor, // the RS holds it through the debrief
    previous_holder_id: seniorRaterFor,
    participants: participantsThrough("debrief", {
      sailor: member,
      rater: raterId,
      senior_rater: seniorRaterFor,
      reporting_senior: rsFor,
    }),
  });

  const williamsId = users.it1Williams || users.sailor;
  const rodriguezId = users.itcsRodriguez || users.seniorRater;
  const chenId = users.ltChen || users.reportingSenior;

  const chiefEvalDraft = buildValidEval({
    // Member is the Senior Rater herself, so block 49 goes to the OTHER
    // Senior Rater on the roster (Rodriguez, ITCS).
    ...showcaseCustody(seniorRaterId, rodriguezId, reportingSeniorId),
    member_name: "SMITH, BETTY L (CHIEF)",
    form_definition_id: "c1616270-cafe-4b08-9df2-5d8f28d8b4cd",
    report_type: "CHIEFEVAL",
    grade_rate: "CPO",
    // NAVPERS 1616/27 Blocks 33–39, same set as RODRIGUEZ below. Without this the
    // showcase Chief eval inherited buildValidEval()'s 1616/26 default — seven EVAL
    // traits, "work" and "eo" among them, on the one record a demo opens first.
    // 1616/27 also has no retention block, hence `retention: undefined` (as on the
    // other non-EVAL drafts): ChiefEvalSchema/FitrepSchema have no such field.
    trait_grades: {
      technical_mastery: "4.0",
      institutional_expertise: "4.0",
      professionalism: "4.0",
      integrity: "4.0",
      accountability: "4.0",
      deckplate_leadership: "4.0",
      team_effectiveness: "4.0",
    },
    trait_average: 4.0,
    retention: undefined,
  });

  const fitrepDraft = buildValidEval({
    // Member is the Reporting Senior himself, so block 50 goes to the OTHER
    // Reporting Senior on the roster (Chen, LT).
    ...showcaseCustody(reportingSeniorId, seniorRaterId, chenId),
    member_name: "JONES, CARL R (OFFICER)",
    form_definition_id: "f1610020-cafe-4b08-9df2-5d8f28d8b4cd",
    report_type: "FITREP",
    grade_rate: "CDR",
    trait_grades: {
      knowledge: "4.0",
      eo: "4.0",
      bearing: "4.0",
      teamwork: "4.0",
      accomplishment: "4.0",
      leadership: "4.0",
      tactical_performance: "4.0",
    },
    trait_average: 4.0,
    retention: undefined,
  });

  const williamsDraft = buildValidEval({
    // Mid-chain on purpose (the "in review" queue item), so only Block 42 is
    // signable — correct for an eval that has not reached the later stages.
    created_by: williamsId,
    current_holder_id: raterId,
    previous_holder_id: williamsId,
    routing_stage: "rater",
    participants: participantsThrough("rater", {
      sailor: williamsId,
      rater: raterId,
    }),
    member_name: "WILLIAMS, SARAH K (IT1)",
    form_definition_id: FORM_DEFINITION_ID,
    report_type: "EVAL",
    grade_rate: "IT1",
  });

  const rodriguezDraft = buildValidEval({
    // Member is a Senior Rater, so block 49 goes to the other one (Smith).
    ...showcaseCustody(rodriguezId, seniorRaterId, reportingSeniorId),
    member_name: "RODRIGUEZ, MARCOS E (ITCS)",
    form_definition_id: "c1616270-cafe-4b08-9df2-5d8f28d8b4cd",
    report_type: "CHIEFEVAL",
    grade_rate: "ITCS",
    trait_grades: {
      technical_mastery: "4.0",
      institutional_expertise: "5.0",
      professionalism: "4.0",
      integrity: "5.0",
      accountability: "4.0",
      deckplate_leadership: "4.0",
      team_effectiveness: "5.0",
    },
    trait_average: 4.43,
    retention: undefined,
  });

  const chenDraft = buildValidEval({
    // Member is a Reporting Senior, so block 50 goes to the other one (Jones).
    ...showcaseCustody(chenId, seniorRaterId, reportingSeniorId),
    member_name: "CHEN, DAVID T (LT)",
    form_definition_id: "f1610020-cafe-4b08-9df2-5d8f28d8b4cd",
    report_type: "FITREP",
    grade_rate: "LT",
    trait_grades: {
      knowledge: "4.0",
      eo: "4.0",
      bearing: "4.0",
      teamwork: "4.0",
      accomplishment: "4.0",
      leadership: "4.0",
      tactical_performance: "5.0",
    },
    // Six 4.0s + one 5.0 over the seven 1610/2 traits = 29/7 = 4.14.
    trait_average: 4.14,
    retention: undefined,
  });

  // Guard the demo. canSignBlock requires the signer to be in the evaluation's
  // chain and never the subject, so it is easy to seed a record that looks fine
  // and is signable by nobody — which is exactly what the showcase CHIEFEVAL and
  // FITREP records were. Fail the seed here rather than during a demo.
  assertShowcaseSignable(
    [
      ["SMITH, BETTY L (CHIEF)", chiefEvalDraft],
      ["JONES, CARL R (OFFICER)", fitrepDraft],
      ["RODRIGUEZ, MARCOS E (ITCS)", rodriguezDraft],
      ["CHEN, DAVID T (LT)", chenDraft],
    ],
    users,
  );

  const { data: inserted, error } = await admin
    .from("evaluations")
    .insert([
      routingDraft,
      recycleDraft,
      chiefEvalDraft,
      fitrepDraft,
      williamsDraft,
      rodriguezDraft,
      chenDraft,
    ])
    .select("id, member_name");
  if (error) throw new Error(`evaluations insert: ${error.message}`);

  const routing = inserted!.find((e) => e.member_name === "DOE, JOHN A");
  const recycle = inserted!.find(
    (e) => e.member_name === "DOE, JOHN A (RECYCLE)",
  );
  const chiefEval = inserted!.find(
    (e) => e.member_name === "SMITH, BETTY L (CHIEF)",
  );
  const fitrep = inserted!.find(
    (e) => e.member_name === "JONES, CARL R (OFFICER)",
  );
  const williamsEval = inserted!.find(
    (e) => e.member_name === "WILLIAMS, SARAH K (IT1)",
  );
  const rodriguezChiefEval = inserted!.find(
    (e) => e.member_name === "RODRIGUEZ, MARCOS E (ITCS)",
  );
  const chenFitrep = inserted!.find(
    (e) => e.member_name === "CHEN, DAVID T (LT)",
  );
  if (
    !routing ||
    !recycle ||
    !chiefEval ||
    !fitrep ||
    !williamsEval ||
    !rodriguezChiefEval ||
    !chenFitrep
  ) {
    throw new Error("Failed to locate seeded eval IDs");
  }

  const idsPath = resolve(process.cwd(), "tests/fixtures/e2e-ids.json");
  writeFileSync(
    idsPath,
    JSON.stringify(
      {
        users,
        evals: {
          routing: routing.id,
          recycle: recycle.id,
          chiefEval: chiefEval.id,
          fitrep: fitrep.id,
          williamsEval: williamsEval.id,
          rodriguezChiefEval: rodriguezChiefEval.id,
          chenFitrep: chenFitrep.id,
        },
        password: process.env.E2E_TEST_PASSWORD || password,
        seededAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`  routing eval: ${routing.id}`);
  console.log(`  recycle eval: ${recycle.id}`);
  console.log(`  chiefEval eval: ${chiefEval.id}`);
  console.log(`  fitrep eval: ${fitrep.id}`);
  console.log(`  williams eval: ${williamsEval.id}`);
  console.log(`  rodriguez chiefEval: ${rodriguezChiefEval.id}`);
  console.log(`  chen fitrep: ${chenFitrep.id}`);
  console.log(`  wrote ${idsPath}`);
}

/**
 * One completed Record Readiness review for the a11y/E2E account.
 *
 * WHY THIS EXISTS. The a11y scan of /board-confidence navigates to the Results
 * tab and scans — but with no board_analyses row the view takes its `!selected`
 * branch and renders "No review yet.", so the coverage bar, the status pills,
 * the plan buckets and the narrative card were never in the scanned DOM. The
 * gate passed while asserting nothing about the screen it was added for. A
 * seeded run makes it real, and deterministically: same record every time.
 *
 * The inputs are hand-built rather than assembled from the seeded evals so the
 * scanned screen is STABLE and covers every visual state at once — a strong
 * area, a needs-attention area, several not-entered areas, actions in a plan
 * bucket, and unconfirmed OMPF entries.
 */
async function seedReadinessRun(users: Record<string, string>) {
  const userId = users.reportingSenior;
  if (!userId) return;
  const boardDate = "2027-03-14";

  const inputs: RubricInputs = {
    boardDate,
    evals: [2024, 2025, 2026].map((y) => ({
      period_from: `${y - 1}-03-16`,
      period_to: `${y}-03-15`,
      report_type: "EVAL" as const,
      promotion_recommendation: "Must Promote" as const,
      trait_average: 4.2,
      summary_group_average: 3.9,
      rsca: 3.85,
      sea_duty: y !== 2026,
      ep_count: 1,
      group_size: 6,
    })),
    psr: {
      entered: true,
      awards: [
        {
          title: "Navy and Marine Corps Achievement Medal",
          level: "personal_achievement",
          date_awarded: "2025-06-01",
          verified_in_ompf: false,
        },
      ],
      necs: null,
      education: null,
      tours: [
        {
          title: "Leading Petty Officer, Combat Systems",
          start: "2022-04-01",
          end: null,
          sea_duty: true,
          leadership: true,
        },
      ],
      pfa: [{ cycle: "2026-1", date: "2026-04-15", result: "pass" }],
      adverse: [],
    },
    // No curated roadmap — the common case (80 of 82 ratings), and it puts the
    // "fetch from Navy COOL" path and a not-entered area on the scanned screen.
    ladr: [],
    // Empty: the shipped precept is unsourced, and assembleRubricInputs now
    // treats an unsourced precept as absent. Keep the fixture consistent.
    preceptFlags: [],
  };

  const result = scoreBoardConfidence(inputs, DEFAULT_RUBRIC_CONFIG);
  const full = buildReadinessReport(result, inputs, DEFAULT_RUBRIC_CONFIG, {
    asOf: "2026-09-01",
  });
  const readiness: ClientReadinessReport = {
    ...full,
    areas: full.areas.map(({ detail, ...area }) => area),
  };

  await admin
    .from("member_board_records")
    .upsert(
      {
        user_id: userId,
        rating_abbrev: "IT",
        target_paygrade: 7,
        psr_entered: true,
        awards: inputs.psr.awards ?? [],
        tours: inputs.psr.tours ?? [],
        pfa_history: inputs.psr.pfa ?? [],
        necs: [],
        quals: [],
        education: [],
        adverse: [],
        eval_context: {},
        ladr_checklist: {},
        consented_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  await admin.from("board_analyses").delete().eq("user_id", userId);
  const { error } = await admin.from("board_analyses").insert([
    {
      user_id: userId,
      board_date: boardDate,
      input: {
        ...inputs,
        disclaimer: BOARD_DISCLAIMER,
        readiness,
        warnings: result.warnings,
        meta: {
          subject_user_id: userId,
          rating_abbrev: "IT",
          target_paygrade: 7,
          ladr_document_id: null,
          ladr_version: null,
          precept_cycle: null,
          precept_source_url: null,
          eval_count_total: inputs.evals.length,
          eval_count_excluded: 0,
          rubric_config: DEFAULT_RUBRIC_CONFIG,
          continuity_gap: result.continuityGap,
          continuity_advisory: result.continuityAdvisory,
        },
      },
      factor_scores: result.factors,
      // Same rule as service.ts: written ONLY when the readiness layer emitted a
      // score. A seeded run must not carry a number its own
      // input.readiness.score says was withheld — that is the state migration 013
      // exists to make unrepresentable, and a seed that produces it would put it
      // straight back into every dev database.
      overall_score: full.score ? result.final : null,
      band: full.score ? result.band : null,
      adverse_adjustment: result.adverseAdjustment,
      // Labelled "model" ON PURPOSE — the seed cannot call one, and the "In plain
      // terms" card renders only for narrative_source === "model", so without
      // this the card is never scanned. `model: "seed-fixture"` says what it is.
      //
      // DERIVED FROM THE REPORT, never hand-written prose. An earlier version of
      // this fixture invented "You have held a leading petty officer billet
      // continuously since 2022, most of it on sea duty" — true of the seeded
      // INPUTS, and printed one viewport above the rubric's own "Leadership and
      // impact — Needs attention — few leadership billets and little sea time".
      // A reviewer reasonably read that as the model contradicting the rubric.
      // It was the fixture. Building the text from the areas makes the seed
      // incapable of staging a contradiction it did not find.
      narrative: {
        strengths: readiness.areas
          .filter((a) => a.status === "strong")
          .map((a) => `${a.label}: ${a.summary}`),
        gaps: readiness.areas
          .filter((a) => a.status === "needs_attention")
          .map((a) => `${a.label}: ${a.summary}`),
        recommendations: [],
        factor_commentary: {
          performance: readiness.areas.find((a) => a.key === "performance")!.summary,
          leadership: readiness.areas.find((a) => a.key === "leadership")!.summary,
          development: readiness.areas.find((a) => a.key === "development")!.summary,
          continuity: readiness.areas.find((a) => a.key === "continuity")!.summary,
          completeness: readiness.areas.find((a) => a.key === "completeness")!.summary,
          precept: readiness.areas.find((a) => a.key === "precept")!.summary,
        },
      },
      narrative_source: "model",
      narrative_fallback_reason: null,
      model: "seed-fixture",
      created_by: userId,
    },
  ]);
  if (error) throw new Error(`board_analyses insert: ${error.message}`);
  console.log(
    `  readiness run for reportingsenior: coverage ${readiness.coverage.areasKnown}/${readiness.coverage.areasTotal}, score ${readiness.score ? "emitted" : "suppressed"}`,
  );
}

async function main() {
  console.log("Seeding E2E data on Supabase cloud...");
  if (reset) await deleteE2eEvals();

  await seedCommands();

  console.log("Users:");
  const normalized: Record<string, string> = {};
  for (const u of E2E_USERS) {
    const id = await upsertUser(u);
    if (u.email === "sailor@franklyn.dev") normalized.sailor = id;
    else if (u.email === "rater@franklyn.dev") normalized.rater = id;
    else if (u.email === "seniorrater@franklyn.dev")
      normalized.seniorRater = id;
    else if (u.email === "reportingsenior@franklyn.dev")
      normalized.reportingSenior = id;
    else if (u.email === "admin@franklyn.dev") normalized.admin = id;
    else if (u.email === "it1.williams@franklyn.dev")
      normalized.it1Williams = id;
    else if (u.email === "itcs.rodriguez@franklyn.dev")
      normalized.itcsRodriguez = id;
    else if (u.email === "lt.chen@franklyn.dev") normalized.ltChen = id;
  }

  console.log("Evaluations:");
  await seedEvals(normalized);

  console.log("Record Readiness:");
  await seedReadinessRun(normalized);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
