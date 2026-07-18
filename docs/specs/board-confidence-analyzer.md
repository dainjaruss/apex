# APEX Board Confidence Analyzer — Implementation Specification

Status: **APPROVED FOR BUILD** · Version 1.5 · 2026-07-18

> **v1.5 (board emphasis, continuity hard gate, tunable rubric, upload-driven records):** four normative changes.
> **(1) LaDR board emphasis** — new `advancement_consideration` LaDR category (migration 004 check constraint extended) capturing the LaDR's "Considerations for advancement from E6 to E7 / E7 to E8 / E8 to E9" sections, where the board's stated selection emphasis lives. `parseLadr` extracts each numbered item from those sections (label `E{n} board: <first sentence>`, full text in `detail.notes`, `detail.board_emphasis = true`, `applies_to_paygrades` = the target grade). `LADR_CATEGORY_WEIGHTS.advancement_consideration = 30` — the heaviest category. Item assembly flags `board_emphasis` when `detail.board_emphasis` is set, the category is `advancement_consideration`, or the milestone exists only at E7+ while the member targets E7+; emphasized items count `×board_emphasis_multiplier` (default 2) inside their category in `scoreLadr`.
> **(2) Continuity hard gate** — any continuity gap (> `continuity_gap_days`, default 90, inside the 60-month window) makes the record **NOT SELECTION READY**: `final`/`band` forced to 0, `bandLabel` "Not selection ready — continuity gap". The pre-gate score is preserved as `RubricResult.underlyingFinal` (plus `notSelectionReady`, `gateReason`) so the UI shows what closing the gap restores; the Ex3 conformance fixture pins both the gated 0 and the pre-gate 10.2. The gate is on by default and tunable off.
> **(3) Tunable rubric** — `board_rubric_config` table (migration 007): factor `weights` (normalized to sum 100 at run time; defaults reproduce §7 exactly), `continuity_hard_gate`, `continuity_gap_days`, `board_emphasis_multiplier`. Select-only to authenticated; **writes are service-role/dashboard only** (profiles roles are self-asserted, so no in-app admin UI). `runBoardAnalysis` loads the single `active` row (defaults on absence/malformed values) and snapshots the exact config into `input.meta.rubric_config` — every stored run is reproducible under the config that scored it.
> **(4) Upload-driven record entry** — uploads now feed the determination instead of being storage-only: `POST /api/board-confidence/record-extract` (multipart, same in-memory/no-persist invariants as brag-sheet extract) runs `suggestRecordFromText` heuristics (`lib/boardConfidence/recordExtract.ts`: award names → rubric levels, NEC code–title rows, degree tiers, PFA cycles) over a stored doc; the form's per-document "Extract to record" button merges deduped suggestions into the editable rows as `verified_in_ompf = false` — nothing is scored until the member reviews and saves.

> **v1.3.1 (no Vercel service required):** the narrative additionally supports a DIRECT OpenAI-compatible mode — `BOARD_NARRATIVE_BASE_URL` (+ optional `BOARD_NARRATIVE_API_KEY`, `BOARD_NARRATIVE_MODEL` = native id) via `@ai-sdk/openai-compatible`, taking precedence over the gateway. Covers xAI/Grok directly, OpenRouter, Groq, and local Ollama — zero Vercel involvement, fit for the self-hosted deployments the NAVFIT export's JRE requirement implies. Gateway mode remains available from any host.
>
> **v1.3 (provider-agnostic AI + ephemeral uploads):** narrative generation moved from the Anthropic SDK to the **Vercel AI SDK via the AI Gateway** — `generateText` + `Output.object(NarrativeSchema)`, model chosen by `BOARD_NARRATIVE_MODEL` (any gateway `provider/model` string, e.g. `anthropic/claude-opus-4.8` (default) or `xai/grok-4.5`), credentials `AI_GATEWAY_API_KEY` or Vercel OIDC; keyless/fallback semantics and the §4.3.4 no-PII payload unchanged. Record-document uploads (ESR / PSR / OMPF field codes 30–38) added to the Record Entry tab: PII-redaction advisory with a confirmation checkbox gating the upload, typed filenames (`TYPE__name`), reference-only (never parsed/scored), and **session-ephemeral** — `lib/auth.ts` destroys the caller's `board-docs` objects at logout (before `auth.signOut()`, RLS requires the session) and sweeps leftovers at the next login; purge failures never block auth.

> **v1.2 (full-requirements reconciliation):** explicit informed consent — `member_board_records.consented_at`, first-use modal (`components/board/BoardConsentModal.tsx`), server-enforced 403 on `POST /analyze` until recorded; two additional disclaimer layers (persistent page footer + score-dial tooltip carrying the modeled-bands caveat); citation-style grounding added to `NARRATIVE_SYSTEM_PROMPT` (every narrative item cites the payload path it derives from; development commentary must name each LaDR category below 1.0); HM added as a third seed rating, transcribed from the real July 2026 Navy COOL PDF; docs/BOARD-CONFIDENCE.md + README entry added.
Companion spec style: `docs/specs/navfit98-field-mapping.md`
v1.1: normative edits marked "v1.1 review fix" applied from the adjudicated
adversarial-review brief (owner-only auth, NOB mapping for unknown recs,
empty-list = not-entered, persisted adverse adjustment, date guards,
future-eval exclusion, narrative fallback reason, audited-delete check,
storage DDL split to migration 005).

This document is the authoritative build document for the Board Confidence Analyzer.
An implementer must be able to build every part from it without re-research. Where a
convention already exists in the repo (service layer, API route shape, RLS style,
`apex-*` tokens), this spec names the file that defines it and mandates reuse.

---

## 1. What this feature is

A self-assessment tool that scores a Sailor's APEX record the way a selection-board
recorder reads a record: performance vs. summary group and RSCA, leadership proxies,
LaDR professional-development completion, five-year eval continuity, record
completeness, and precept alignment — combined into a 0–100 score mapped to the
board-style confidence vote bands (100/75/50/25/0). Scoring is 100% deterministic
(Section 7 is the normative rubric). An optional AI narrative
(strengths/gaps/recommendations) is generated by Claude when `ANTHROPIC_API_KEY` is
configured, with a deterministic rubric-derived fallback so the feature works keyless.

### 1.1 Normative disclaimer (verbatim — use exactly this text)

The following text is a named exported constant `BOARD_DISCLAIMER` in
`lib/boardConfidence/types.ts`. It MUST be rendered (a) at the top of the
`/board-confidence` page, (b) at the top of every results view, and (c) stored
verbatim in the `input.disclaimer` field of every `board_analyses` row.

> **UNOFFICIAL TOOL — NOT A SELECTION BOARD.** The APEX Board Confidence Analyzer is
> a self-assessment aid. It is not affiliated with, endorsed by, or predictive of any
> U.S. Navy selection board, Navy Personnel Command, or BUPERS process. Scores are
> computed by a fixed, published rubric modeled on the officer-brief confidence vote
> bands (100/75/50/25/0); enlisted (CPO) selection boards score records by rating
> panel and vote slates, so this model is an approximation, not actual board
> procedure. Only your official record (OMPF, PSR, and a Letter to the Board) exists
> to a real board. Verify your record on BOL and NSIPS, and consult your command
> career counselor, before any board.

### 1.2 Domain grounding (what is verified vs. modeled)

| Element | Status |
|---|---|
| Confidence voting 100/75/50/25/0, scattergram, crunch second review | **Verified** for officer statutory + LDO/CWO ISP boards (PERS-80 promotion brief) |
| CPO boards: CAPT president, rating panels, "slates voted vice individual records" | **Verified** (PERS-803 brief) — per-record 0–100 vote is therefore a **modeled approximation** (hence the disclaimer) |
| Board sees only OMPF FC 30–38 + PSR + LTB; live ESR/FLTMPS/ETJ/PRIMS invisible | **Verified** (NPC Selection Board Review page) — motivates `UNVERIFIED_MULT` |
| PSR Part III per-eval rows: rec, ITA, summary-group breakdown, RSCA | **Verified** (NPC Personnel Records Review + LDO/CWO brief) |
| "Trait average at or above summary group AND RSCA; consistent/improving; break out among peers" as the #1 factor | **Verified** (LDO/CWO brief "What the Board Considers") |
| 5-year eval continuity check by recorders; gaps read as unexplainable | **Verified** — motivates Factor 4's 60-month window |
| LaDR structure (career path table, per-paygrade PME/skill/NEC/qual/credential blocks, board checklists) | **Verified** against the IT E1–E9 LaDR, cover-dated July 2026, from cool.osd.mil (`{rating}_{paygrade}.pdf`, paygrade ∈ {e1,e4,e5,e6,e7,e8,e9,e1_e9}; reviewed annually, cover month+year is the version key) |
| Precept vs. convening order split; emphasis areas (warfighting, leadership, sea duty…) | **Verified** (PERS-80 + PERS-803 briefs) — modeled as admin-configured boolean flags |

---

## 2. Identity model (the `created_by`-as-subject decision)

`public.evaluations` has **no FK to the subject Sailor**. `member_name` is free text;
`evaluations.dod_id` is nullable free text with no format check, no uniqueness, and no
FK to `profiles.dod_id` (which *is* unique and length-10-checked). `created_by`
identifies the **drafter**, which coincides with the subject only because the current
UX has Sailors draft their own reports (`app/evaluations/new/page.tsx:91` prefills
subject fields from the drafter's own profile) — and `permissions.ts` grants
`create_evaluation` to every role, so a Rater-drafted eval would break the
equivalence.

**Normative rule for v1** (implemented in `assembleRubricInputs`,
`lib/boardConfidence/service.ts`):

1. A run selects the subject's evals with `.eq("created_by", subjectUserId)` plus the
   finalized gate (Section 5.2). `created_by ≈ subject` is an explicit, documented
   assumption of this feature.
2. **Cross-check:** if `profiles.dod_id` is set for the subject AND an eval row's
   `dod_id` is non-empty AND the two differ (compared after `trim()`), that eval is
   **excluded** from scoring and a warning string
   `"Excluded 1 report whose DoD ID does not match your profile (period <from>–<to>)."`
   is appended to `RubricResult.warnings` and shown in the results view. Matching or
   absent `dod_id` values include the row.
3. Migration 004 adds `idx_evaluations_created_by` so the per-member history query is
   indexed. It does **not** attempt to backfill or constrain `evaluations.dod_id`
   (out of scope; would require touching the eval-creation flow).
4. **v1.1 review fix — access is OWNER-ONLY.** `profiles.preferred_role` /
   `assigned_roles` are user-editable (self-asserted; `RoleGuard` is client-side
   UX, not authority), so an "Admin" check against them authorizes nothing. The
   former Admin-on-behalf path is removed from both API routes and deferred until
   real server-side role authority exists.

---

## 3. Supabase migration `004_board_confidence.sql`

Location: `/srv/apex/supabase/migrations/004_board_confidence.sql`. Follows the 002
style: lowercase SQL, header comment with numbered change list, idempotent
`create table if not exists` / `drop policy if exists`, `enable row level security`
immediately after each `create table`, short snake-case policy names, indexes named
`idx_<table>_<col>`.

Full DDL (this is the migration, verbatim):

```sql
-- Migration 004: Board Confidence Analyzer
--
-- Adds versioned LaDR reference data, board precept emphasis flags, per-member
-- structured PSR/ESR record entry, and persisted analysis runs.
--
-- 004:1  ladr_documents      — one row per rating + paygrade-range + annual issue (never mutated)
-- 004:2  ladr_milestones     — checklist items per LaDR document
-- 004:3  board_precepts      — board-cycle emphasis flags (at most one active)
-- 004:4  member_board_records— per-user structured PSR/ESR entry (RLS owner-only)
-- 004:5  board_analyses      — immutable analysis run snapshots (RLS owner-only read)
-- 004:6  idx_evaluations_created_by — per-member history query support (see spec §2)
--
-- v1.1 review fix: the 'board-docs' storage bucket + storage.objects policy
-- moved to 005_board_docs_storage.sql so a storage-ownership failure on hosted
-- Supabase cannot roll back these tables.

-- 1. LaDR documents (versioned reference data) --------------------------------
create table if not exists public.ladr_documents (
    id uuid default gen_random_uuid() primary key,
    rating_abbrev text not null,                 -- 'IT', 'BM', ...
    rating_name text not null,                   -- 'Information Systems Technician'
    paygrade_range text not null default 'E1-E9'
        check (paygrade_range in ('E1','E4','E5','E6','E7','E8','E9','E1-E9')),
    version text not null,                       -- LaDR cover month+year, e.g. 'July 2026'
    effective_date date not null,                -- first of the cover month
    source_url text not null,                    -- e.g. https://www.cool.osd.mil/usn/LaDR/it_e1_e9.pdf
    source_hash text,                            -- sha256 of the source PDF when known
    created_at timestamptz default now() not null,
    unique (rating_abbrev, paygrade_range, effective_date)
);

alter table public.ladr_documents enable row level security;

drop policy if exists ladr_docs_select_all on public.ladr_documents;
create policy ladr_docs_select_all on public.ladr_documents
    for select to authenticated using (true);
-- writes: service-role seed script only (no insert/update policies).

-- 2. LaDR milestones ----------------------------------------------------------
create table if not exists public.ladr_milestones (
    id uuid default gen_random_uuid() primary key,
    ladr_document_id uuid references public.ladr_documents(id) on delete cascade not null,
    category text not null check (category in (
        'career_milestone','skill_training_required','skill_training_recommended',
        'nec_opportunity','pme_required','pme_recommended','qual_watchstanding',
        'qual_warfare','qual_rate_specific','credential','education_degree',
        'billet_recommended')),
    item text not null,                          -- display name, e.g. 'CompTIA Security+'
    item_code text,                              -- CIN / NAVEDTRA PQS / NEC code / cert id, null if none
    applies_to_paygrades smallint[] not null,    -- paygrades where the LaDR lists it, e.g. '{4}' or '{1,2,3}'
    detail jsonb default '{}'::jsonb not null,   -- {location, course_length, certifying_agency, notes, source}
    sort_order integer not null default 0,
    created_at timestamptz default now() not null
);

create index if not exists idx_ladr_milestones_document
    on public.ladr_milestones (ladr_document_id);

alter table public.ladr_milestones enable row level security;

drop policy if exists ladr_milestones_select_all on public.ladr_milestones;
create policy ladr_milestones_select_all on public.ladr_milestones
    for select to authenticated using (true);

-- 3. Board precepts -----------------------------------------------------------
create table if not exists public.board_precepts (
    id uuid default gen_random_uuid() primary key,
    cycle text not null unique,                  -- 'FY27 Active-Duty E7'
    title text not null,
    emphasis_flags jsonb not null default '{}'::jsonb,
        -- boolean keys, exactly: warfighting, leadership_positions, education,
        -- sea_duty, technical_expertise (spec §7 Factor 6)
    source_url text,
    active boolean not null default false,
    created_at timestamptz default now() not null
);

-- at most one active precept system-wide
create unique index if not exists idx_board_precepts_one_active
    on public.board_precepts (active) where active;

alter table public.board_precepts enable row level security;

drop policy if exists precepts_select_all on public.board_precepts;
create policy precepts_select_all on public.board_precepts
    for select to authenticated using (true);
-- writes: service-role seed script only in v1 (admin UI out of scope).

-- 4. Member board records (structured PSR/ESR entry) --------------------------
create table if not exists public.member_board_records (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) not null unique,
    rating_abbrev text,                          -- selects which LaDR loads, e.g. 'IT'
    target_paygrade smallint check (target_paygrade between 2 and 9),
    psr_entered boolean not null default false,  -- user attests the PSR section is filled in
    awards jsonb not null default '[]'::jsonb,       -- AwardEntry[]      (spec §4.1)
    necs jsonb not null default '[]'::jsonb,         -- NecEntry[]
    quals jsonb not null default '[]'::jsonb,        -- free-form QualEntry[] (non-LaDR extras)
    education jsonb not null default '[]'::jsonb,    -- EducationEntry[]
    pfa_history jsonb not null default '[]'::jsonb,  -- PfaCycle[]
    tours jsonb not null default '[]'::jsonb,        -- TourEntry[]
    adverse jsonb not null default '[]'::jsonb,      -- AdverseEntry[]
    eval_context jsonb not null default '{}'::jsonb, -- {"<period_to>": {"rsca": 4.12, "sea_duty": true}}
    ladr_checklist jsonb not null default '{}'::jsonb,
    -- v1.2: informed consent (first-use modal); analyze route refuses while null
    consented_at timestamptz,
        -- {"<ladr_milestone_id>": {"status": "met"|"not_met"|"na"|"unanswered",
        --                          "verified_in_ompf": bool}}
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create or replace function public.touch_member_board_record()
returns trigger as $$
begin
    new.updated_at := now();
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_touch_member_board_record on public.member_board_records;
create trigger trg_touch_member_board_record
    before update on public.member_board_records
    for each row execute function public.touch_member_board_record();

alter table public.member_board_records enable row level security;

drop policy if exists mbr_select_own on public.member_board_records;
create policy mbr_select_own on public.member_board_records
    for select to authenticated using (user_id = auth.uid());

drop policy if exists mbr_insert_own on public.member_board_records;
create policy mbr_insert_own on public.member_board_records
    for insert to authenticated with check (user_id = auth.uid());

drop policy if exists mbr_update_own on public.member_board_records;
create policy mbr_update_own on public.member_board_records
    for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists mbr_delete_own on public.member_board_records;
create policy mbr_delete_own on public.member_board_records
    for delete to authenticated using (user_id = auth.uid());

-- 5. Board analyses (run snapshots) -------------------------------------------
create table if not exists public.board_analyses (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) not null,  -- the analyzed Sailor
    board_date date not null,                              -- T (rubric input e)
    input jsonb not null,          -- full RubricInputs snapshot + disclaimer + warnings + meta
    factor_scores jsonb not null,  -- FactorResult[] (score, confidence, contribution, detail)
    overall_score numeric(4,1) not null
        check (overall_score >= 0 and overall_score <= 100),
    band smallint not null check (band in (0, 25, 50, 75, 100)),
    -- v1.1 review fix: A is stored — the UI must never re-derive it (wrong when
    -- the final clamps to 0).
    adverse_adjustment numeric(4,1) not null default 0,
    narrative jsonb not null,      -- {strengths[], gaps[], recommendations[], factor_commentary{}}
    narrative_source text not null check (narrative_source in ('model','fallback')),
    -- v1.1 review fix: why the fallback narrative was used; null on the model path
    narrative_fallback_reason text
        check (narrative_fallback_reason in ('no_key','model_error')),
    model text,                    -- 'claude-opus-4-8' when narrative_source='model', else null
    created_by uuid references auth.users not null,        -- who ran it (the owner, v1.1 owner-only)
    created_at timestamptz default now() not null
);

create index if not exists idx_board_analyses_user
    on public.board_analyses (user_id);

alter table public.board_analyses enable row level security;

drop policy if exists ba_select_own on public.board_analyses;
create policy ba_select_own on public.board_analyses
    for select to authenticated using (user_id = auth.uid());
-- inserts happen only through the service-role API route (no insert policy).

-- 6. Per-member eval history index --------------------------------------------
create index if not exists idx_evaluations_created_by
    on public.evaluations (created_by);
```

**Migration 005 — `supabase/migrations/005_board_docs_storage.sql` (v1.1 review
fix):** the `board-docs` storage bucket and the `board_docs_owner_rw` policy on
`storage.objects` live in their own migration. Private bucket; each user may
only touch objects under a folder named with their own auth uid
(`board-docs/<auth.uid()>/<filename>`). It applies where the migration role may
manage storage policies (local CLI stack); on hosted projects where it cannot,
create the bucket + policy via the dashboard using 005 as the normative
reference — the 004 tables are unaffected either way.

Notes:

- `ladr_milestones.applies_to_paygrades` holds the paygrade(s) whose LaDR block the
  item appears in (credentials use the printed "Target Paygrade"). **Applicability
  rule** (normative, implemented in `service.ts`): an item is *applicable* to target
  paygrade `T` iff `min(applies_to_paygrades) <= T`. This realizes the rubric's
  `recommended_by_paygrade <= target_paygrade` with block-ranges like `{1,2,3}`.
- `audit_logs.evaluation_id` is already nullable (001:122), so the
  `BOARD_ANALYSIS_RUN` audit row inserts with `evaluation_id: null` — no audit-table
  change needed.
- Old `ladr_documents` rows are **never mutated or deleted**; a new annual issue is a
  new row (Section 10.3).
- `member_board_records.quals` (`QualEntry[]`) is **reference-only**: edited in the
  §6 Record Entry tab, displayed back to the member, and deliberately **never read by
  the rubric** and not part of `PsrSection` — scored qualifications come exclusively
  from the LaDR checklist (Factor 3).
- **Deploy caution (storage, v1.1 review fix):** `create policy ... on
  storage.objects` requires ownership of `storage.objects`. It applies cleanly on
  the local Supabase CLI stack (superuser), but on current **hosted** Supabase
  projects the `postgres` role does not own `storage.objects` and the statement
  fails with `must be owner of table objects`. The storage DDL therefore lives in
  its own migration `005_board_docs_storage.sql` so that failure cannot roll back
  the 004 tables; where 005 cannot be applied, create the `board-docs` bucket and
  the identical owner-folder policy through the dashboard (Storage → Policies)
  using 005 as the normative reference.

---

## 4. Module layout: `lib/boardConfidence/`

Four server-safe files plus one browser service. None of the `lib/boardConfidence/*`
files may import `next/*` or `lib/supabaseClient` at module top level except
`service.ts` (which only *accepts* a client — it never creates one), so the rubric
and narrative are unit-testable in isolation.

```
lib/boardConfidence/
  types.ts       -- pinned contracts + BOARD_DISCLAIMER + all constants' types
  rubric.ts      -- pure deterministic scoring engine (normative §7)
  narrative.ts   -- Claude narrative w/ zod structured output + keyless fallback
  service.ts     -- server-side assemble inputs → score → narrative → persist
lib/boardConfidenceService.ts  -- browser service (repo lib/*Service.ts pattern)
```

### 4.1 `lib/boardConfidence/types.ts`

Every interface below is exported. Field names are snake_case where they mirror DB
JSONB payloads (repo convention, `types/index.ts`).

```ts
export const BOARD_DISCLAIMER = "UNOFFICIAL TOOL — NOT A SELECTION BOARD. ..."; // §1.1 text, verbatim

export type BandVote = 0 | 25 | 50 | 75 | 100;

export type PromotionRec =
  | "Early Promote" | "Must Promote" | "Promotable"
  | "Progressing" | "Significant Problems" | "NOB";

export interface RubricEvalInput {
  period_from: string;              // YYYY-MM-DD
  period_to: string;                // YYYY-MM-DD
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  promotion_recommendation: PromotionRec;
  trait_average: number | null;     // ALWAYS recomputed via computeTraitAverage(trait_grades);
                                    // the stored evaluations.trait_average column is never trusted
  summary_group_average: number | null; // pooled SGA from peers (server-side), null if no group
  rsca: number | null;              // from member_board_records.eval_context[period_to].rsca
  sea_duty: boolean;                // eval_context override ?? tour-overlap derivation ?? false
  ep_count: number | null;          // 'Early Promote' count in the summary group (incl. this row)
  group_size: number | null;        // observed (non-NOB) N in the summary group
}

export type AwardLevel =
  | "personal_achievement"   // NAM-tier            -> 10 pts
  | "personal_commendation"  // NCM-tier            -> 20 pts
  | "msm_or_above"           // MSM and above       -> 30 pts
  | "unit";                  // unit/campaign award ->  4 pts

export interface AwardEntry  { title: string; level: AwardLevel; date_awarded: string; verified_in_ompf: boolean; }
export interface NecEntry    { code: string; title?: string; date_awarded?: string; verified_in_ompf: boolean; }
export interface QualEntry   { title: string; code?: string; date_completed?: string; verified_in_ompf: boolean; }
export interface EducationEntry { kind: "degree" | "jst_credit" | "course"; title: string; date?: string; verified_in_ompf: boolean; }
export interface PfaCycle    { cycle: string; date: string; result: "pass" | "fail" | "excused"; }
export interface TourEntry   { title: string; start: string; end: string | null; sea_duty: boolean; leadership: boolean; }
export interface AdverseEntry { kind: "page13" | "njp" | "court_memo" | "punitive_letter" | "civil_conviction" | "other"; date: string; note?: string; }

export interface PsrSection {
  entered: boolean;                  // member_board_records.psr_entered
  awards: AwardEntry[] | null;       // null = section not entered
  necs: NecEntry[] | null;
  education: EducationEntry[] | null;
  tours: TourEntry[] | null;
  pfa: PfaCycle[] | null;
  adverse: AdverseEntry[];           // always an array; default []
}
// v1.1 review fix (normative): the DB defaults every section to [] the moment a
// member_board_records row exists (it cannot represent null), so an EMPTY LIST
// means "not entered" — service.ts maps [] to null for awards/necs/education/
// tours/pfa. A section must never earn completeness points for zero content.
// adverse stays a list ([] is fine — zero adverse entries is real data).

export type LadrCategory =
  | "career_milestone" | "skill_training_required" | "skill_training_recommended"
  | "nec_opportunity" | "pme_required" | "pme_recommended" | "qual_watchstanding"
  | "qual_warfare" | "qual_rate_specific" | "credential" | "education_degree"
  | "billet_recommended";

export type LadrStatus = "met" | "not_met" | "na" | "unanswered";

export interface LadrItemInput {       // one APPLICABLE checklist row (already filtered, §3 rule)
  milestone_id: string;
  category: LadrCategory;
  status: LadrStatus;
  verified_in_ompf: boolean;           // meaningful only when status === "met"
}

export type PreceptFlag =
  | "warfighting" | "leadership_positions" | "education"
  | "sea_duty" | "technical_expertise";

export interface RubricInputs {
  boardDate: string;                   // T, YYYY-MM-DD — the ONLY time source (no clock reads)
  evals: RubricEvalInput[];
  psr: PsrSection;
  ladr: LadrItemInput[];
  preceptFlags: PreceptFlag[];
}

export type FactorKey =
  | "performance" | "leadership" | "development"
  | "continuity" | "completeness" | "precept";

export interface FactorResult {
  key: FactorKey;
  weight: number;                       // effective weight (after 100/90 redistribution if any)
  score: number;                        // S_f in [0,100], full float
  confidence: number;                   // conf_f in [0,1]
  contribution: number;                 // (weight/100) * score * confidence
  detail: Record<string, number | string | boolean | null>;
      // every intermediate the UI shows on expand — e.g. performance:
      // {P1, P2, P3, P4, declinePenalty, nObserved, availableSubweight, ...};
      // continuity: {windowStart, windowEnd, coverage, gapCount}; etc.
}

export interface RubricResult {
  final: number;                        // rounded to 1 decimal, half away from zero
  band: BandVote;                       // computed from the ROUNDED final (§7 bands)
  bandLabel: string;
  factors: FactorResult[];              // always 6 entries; excluded precept has weight 0,
                                        // detail.excluded = true
  adverseAdjustment: number;            // A
  warnings: string[];                   // e.g. dod_id-mismatch exclusions (§2)
}

export interface BoardAnalysisRow {     // mirror of public.board_analyses
  id?: string;
  user_id: string;
  board_date: string;
  input: RubricInputs & { disclaimer: string; warnings: string[]; meta: Record<string, unknown> };
  factor_scores: FactorResult[];
  overall_score: number;
  band: BandVote;
  adverse_adjustment: number;           // A, persisted (v1.1 review fix — never derived client-side)
  narrative: Narrative;                 // from narrative.ts
  narrative_source: "model" | "fallback";
  narrative_fallback_reason: "no_key" | "model_error" | null; // v1.1 review fix
  model: string | null;
  created_by: string;
  created_at?: string;
}

export interface MemberBoardRecord {    // mirror of public.member_board_records
  id?: string;
  user_id: string;
  rating_abbrev: string | null;
  target_paygrade: number | null;
  psr_entered: boolean;
  awards: AwardEntry[];
  necs: NecEntry[];
  quals: QualEntry[];
  education: EducationEntry[];
  pfa_history: PfaCycle[];
  tours: TourEntry[];
  adverse: AdverseEntry[];
  eval_context: Record<string, { rsca?: number; sea_duty?: boolean }>;
  ladr_checklist: Record<string, { status: LadrStatus; verified_in_ompf: boolean }>;
  created_at?: string;
  updated_at?: string;
}

export interface LadrDocument {
  id?: string; rating_abbrev: string; rating_name: string;
  paygrade_range: "E1"|"E4"|"E5"|"E6"|"E7"|"E8"|"E9"|"E1-E9";
  version: string; effective_date: string; source_url: string;
  source_hash?: string | null; created_at?: string;
}

export interface LadrMilestone {
  id?: string; ladr_document_id: string; category: LadrCategory;
  item: string; item_code: string | null; applies_to_paygrades: number[];
  detail: Record<string, unknown>; sort_order: number; created_at?: string;
}

export interface BoardPrecept {
  id?: string; cycle: string; title: string;
  emphasis_flags: Partial<Record<PreceptFlag, boolean>>;
  source_url?: string | null; active: boolean; created_at?: string;
}
```

### 4.2 `lib/boardConfidence/rubric.ts` — pure scoring engine

Ports the reference implementation (session scratchpad `rubric.mjs`, 335 lines, with
self-checks) into typed TS. **The normative algorithm is Section 7 of this spec**,
not the scratchpad file (which is session-ephemeral); the three worked examples in
Section 7 are the durable conformance fixture and are pinned by tests.

Exported constants (exact values; all `as const` where applicable):

```ts
export const HALF_LIFE_MONTHS = 24;
export const SEA_MULT = 1.25;
export const LOOKBACK_MONTHS = 72;
export const UNVERIFIED_MULT = 0.5;
export const REC_POINTS: Record<Exclude<PromotionRec, "NOB">, number> = {
  "Early Promote": 100, "Must Promote": 80, "Promotable": 50,
  "Progressing": 25, "Significant Problems": 0,
};
export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  performance: 40, leadership: 15, development: 15,
  continuity: 10, completeness: 10, precept: 10,
};
export const PERF_SUBWEIGHTS = { P1: 0.35, P2: 0.35, P3: 0.15, P4: 0.15 };
export const FALLBACK_P2_MULT = 0.6;
export const P2_SLOPE = 125;              // score2 = clamp(50 + 125·d, 0, 100)
export const P2_FALLBACK_SLOPE = 62.5;    // clamp(62.5·(ITA − 3.4), 0, 100)
export const P2_FALLBACK_FLOOR = 3.4;
export const TREND_MIN_EVALS = 4;
export const DECLINE_PENALTY = 10;
export const DECLINE_PENALTY_CAP = 20;
export const MIN_OBSERVED_FOR_FULL_CONF = 3;   // conf_P ×= min(1, N/3)
export const LEADERSHIP_SUBWEIGHTS = { L1: 0.40, L2: 0.30, L3: 0.30 };
export const L1_POINTS_PER_TOUR = 50;          // min(100, 50·n)
export const AWARD_POINTS: Record<AwardLevel, number> = {
  personal_achievement: 10, personal_commendation: 20, msm_or_above: 30, unit: 4,
};
export const AWARD_LOOKBACK_MONTHS = 120;
export const SEA_MONTHS_FULL = 36;             // L3 = min(100, (100/36)·seaMonths72)
export const LADR_CATEGORY_WEIGHTS: Record<LadrCategory, number> = {
  qual_warfare: 20, pme_required: 20, qual_rate_specific: 15, qual_watchstanding: 10,
  skill_training_required: 10, credential: 10, education_degree: 5, nec_opportunity: 5,
  pme_recommended: 3, skill_training_recommended: 2,
  career_milestone: 0, billet_recommended: 0,   // informational only — never scored
};
export const CONTINUITY_WINDOW_DAYS = 1826;    // 60 months
export const CONTINUITY_GRACE_DAYS = 365;
export const CONTINUITY_GAP_DAYS = 90;
export const CONTINUITY_GAP_PENALTY = 15;
export const COMPLETENESS_POINTS = {           // sum = 100 (§7 Factor 5)
  continuity95: 20, psrEntered: 15, awards: 15, necs: 10,
  education: 10, pfa3: 10, ladr90: 10, esrFlags: 10,
};
export const ADVERSE_PER_ITEM = 15;
export const ADVERSE_CAP = 30;
export const PFA_FAIL_PENALTY = 10;
export const PFA_FAIL_LOOKBACK_MONTHS = 36;
export const BANDS: Array<{ min: number; vote: BandVote; label: string }> = [
  { min: 85, vote: 100, label: "Clearly at the top" },
  { min: 70, vote: 75,  label: "Competitive" },
  { min: 50, vote: 50,  label: "Crunch — middle band" },
  { min: 30, vote: 25,  label: "Not competitive this cycle" },
  { min: 0,  vote: 0,   label: "Drop-from-consideration risk" },
];
```

Exported functions:

```ts
/** floor(daysBetween(date, T) / 30.44); daysBetween via UTC-midnight Date.UTC(y,m,d). */
export function monthsBefore(dateIso: string, tIso: string): number;

/** 0.5^(monthsBefore(periodTo, T) / 24), ×1.25 when seaDuty. */
export function recencyWeight(periodTo: string, tIso: string, seaDuty: boolean): number;

/** Band from the ROUNDED final. All comparisons are >= on the lower bound. */
export function bandFor(finalRounded: number): { vote: BandVote; label: string };

/** Round half away from zero to 1 decimal (the ONLY rounding in the engine). */
export function round1HalfAway(n: number): number;

/** The engine. Pure: no Date.now(), no randomness, no I/O. */
export function scoreBoardConfidence(inputs: RubricInputs): RubricResult;
```

Implementation requirements (beyond §7): full float precision throughout;
`round1HalfAway` applied only to the terminal composite;
`RubricResult.factors[i].detail` must contain every intermediate value the worked
examples in §7 cite (P1..P4, decline penalty, per-category LaDR ratios, coverage,
gap count, per-item completeness points, per-flag precept indicators), because the
UI renders them verbatim on expand. When zero precept flags are configured, the
precept factor is emitted with `weight: 0, score: 0, confidence: 1, contribution: 0,
detail: { excluded: true }` and the other five factors' `weight` fields carry the
`×100/90` redistributed values.

### 4.3 `lib/boardConfidence/narrative.ts` — Claude narrative + keyless fallback

Dependency: `@anthropic-ai/sdk` `^0.112.3` (already in `package.json`) and `zod`
(already installed — used by `lib/schemas.ts`).

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const NarrativeSchema = z.object({
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendations: z.array(z.string()),
  factor_commentary: z.object({
    performance: z.string(),
    leadership: z.string(),
    development: z.string(),
    continuity: z.string(),
    completeness: z.string(),
    precept: z.string(),
  }),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

export const NARRATIVE_MODEL = "claude-opus-4-8";

export interface NarrativeOutcome {
  narrative: Narrative;
  source: "model" | "fallback";
  model: string | null;          // NARRATIVE_MODEL when source === "model", else null
  // v1.1 review fix: WHY the fallback was used, persisted as
  // board_analyses.narrative_fallback_reason and surfaced by the UI badge —
  // "no_key" (ANTHROPIC_API_KEY unset) vs "model_error" (call failed, threw, or
  // parsed_output was null). null when source === "model".
  fallbackReason: "no_key" | "model_error" | null;
}

/** Deterministic, rubric-derived text. No I/O. Used keyless and on any model failure. */
export function fallbackNarrative(result: RubricResult): Narrative;

/** Model path when ANTHROPIC_API_KEY is set; otherwise returns fallbackNarrative(). */
export async function generateNarrative(result: RubricResult): Promise<NarrativeOutcome>;
```

`generateNarrative` contract:

1. **Keyless gate:** `if (!process.env.ANTHROPIC_API_KEY) return { narrative:
   fallbackNarrative(result), source: "fallback", model: null,
   fallbackReason: "no_key" };` — no client is constructed, no network is
   touched (fallbackReason per the v1.1 review fix).
2. Model call (exact shape — `claude-opus-4-8` rejects `temperature`/`top_p`/`top_k`
   with a 400, so **no sampling parameters are ever sent**):

   ```ts
   const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
   const response = await client.messages.parse({
     model: NARRATIVE_MODEL,
     max_tokens: 4096,
     thinking: { type: "adaptive" },
     system: NARRATIVE_SYSTEM_PROMPT,          // exported const, below
     messages: [{ role: "user", content: JSON.stringify(payload) }],
     output_config: { format: zodOutputFormat(NarrativeSchema) },
   });
   if (!response.parsed_output) return fallback outcome;
   return { narrative: response.parsed_output, source: "model", model: NARRATIVE_MODEL };
   ```
3. **Every** thrown error (auth, rate limit, network, refusal, parse) is caught,
   logged with `console.error("board narrative generation failed:", err)`, and
   resolves to the fallback outcome with `fallbackReason: "model_error"` (v1.1
   review fix — same for `parsed_output: null`). The analyze route never fails
   because of the narrative.
4. **Privacy (normative):** `payload` contains ONLY: the six `FactorResult` objects
   (key, weight, score, confidence, contribution, detail), `final`, `band`,
   `bandLabel`, `adverseAdjustment` (a number — never the adverse entries
   themselves), the precept flag list, target paygrade, rating abbreviation, and
   per-category LaDR ratios. It must NEVER include `dod_id`, `member_name`, profile
   names/emails, eval comments/narrative blocks, award titles, tour titles, adverse
   entry details, or storage-attachment contents. Enforce by constructing the
   payload from `RubricResult` + `{ preceptFlags, targetPaygrade, ratingAbbrev }`
   only — the raw `RubricInputs` object is not passed to this module.
5. `NARRATIVE_SYSTEM_PROMPT` (exported const): instructs the model that it is
   generating self-development feedback for an unofficial Navy record self-assessment;
   it must ground every statement in the provided factor numbers, produce 2–5 items
   per list, phrase recommendations as concrete record actions ("close out the eval
   gap", "verify the award in OMPF via NDAWS"), and never claim to predict board
   results.
6. `fallbackNarrative` derives text purely from `RubricResult`: strengths = factors
   with `contribution / (weight/100) >= 70` phrased from fixed templates; gaps =
   factors with contribution below half their weight plus any `warnings`;
   recommendations = fixed per-factor remediation strings keyed on which `detail`
   fields are low (e.g. `coverage < 0.95` → "Close the evaluation continuity gap —
   boards verify five years of unbroken reports."). Same template strings every run
   for the same input (tested).

### 4.4 `lib/boardConfidence/service.ts` — server-side assembly + persistence

Server-only orchestration used by the API route. Accepts a Supabase client; never
creates one (keeps the module import-safe under vitest with dummy env).

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AssembledInputs {
  inputs: RubricInputs;
  meta: {
    subject_user_id: string;
    rating_abbrev: string | null;
    target_paygrade: number | null;
    ladr_document_id: string | null;
    ladr_version: string | null;
    precept_cycle: string | null;
    eval_count_total: number;       // finalized rows found
    eval_count_excluded: number;    // dod_id-mismatch exclusions (§2)
  };
  warnings: string[];
}

export async function assembleRubricInputs(
  admin: SupabaseClient,
  subjectUserId: string,
  boardDate: string,
): Promise<AssembledInputs>;

export async function runBoardAnalysis(
  admin: SupabaseClient,
  subjectUserId: string,
  callerId: string,
  boardDate: string,
): Promise<BoardAnalysisRow>;   // the inserted row, with id
```

`assembleRubricInputs` steps (normative):

1. `profiles` row for `subjectUserId` (throw `"Profile not found."` if absent).
2. `member_board_records` row via `.eq("user_id", subjectUserId).maybeSingle()`;
   absent row ⇒ empty `PsrSection` (`entered: false`, all sections `null`,
   `adverse: []`), empty checklist, `rating_abbrev`/`target_paygrade` null.
   `target_paygrade` default when null: `paygradeOf(profile.navy_rank)` numeric part
   + 1, clamped to 9 (`lib/paygrade.ts` `paygradeOf`).
3. Evals: `admin.from("evaluations").select("*").eq("created_by", subjectUserId)
   .or("status.eq.completed,signature_locked.eq.true,routing_stage.eq.locked")` —
   the same finalized condition the NAVFIT export enforces
   (`app/api/export/navfit98/route.ts:50-59`, where it is written as a JS
   conditional on a single fetched row; the `.or()` string is the query-side
   equivalent needed here to filter the set). Apply the §2 dod_id cross-check.
4. Per eval: `trait_average` = `computeTraitAverage(ev.trait_grades).average`
   (`lib/traitAverage.ts` — the stored column is stale-prone by design, see
   `lib/pdfOverlay.ts:542`); `rsca` and `sea_duty` from
   `eval_context[ev.period_to]`, with `sea_duty` falling back to "period midpoint
   falls inside a `TourEntry` with `sea_duty: true`", else `false`.
5. Summary-group context per eval with `summary_group_id` (batched by group id, one
   query per distinct group): peers via `.eq("summary_group_id", id)` filtered to the
   same finalized gate; `ep_count` = `tallyRecommendations(peerRecs).distribution["Early Promote"]`
   and `group_size` = `.observedCount` (`lib/forcedDistribution.ts`);
   `summary_group_average` = `computeSummaryGroupAverage(peerTraitGrades).average`.
   This must run with the admin client — RLS `eval_select_custody` hides peers
   (same reason as `app/api/summary-average/route.ts`).
6. LaDR: latest `ladr_documents` row for `(rating_abbrev, paygrade_range = 'E1-E9')`
   by `effective_date desc limit 1`; its milestones; filter by the §3 applicability
   rule against `target_paygrade`; join each against
   `member_board_records.ladr_checklist[milestone.id]`, defaulting
   `{status: "unanswered", verified_in_ompf: false}`. Categories `career_milestone`
   and `billet_recommended` are excluded from `inputs.ladr` (weight 0 — never scored).
   No rating selected or no document ⇒ `inputs.ladr = []` (conf_D = 0 by the rubric,
   never fabricated).
7. Precept: `board_precepts` where `active = true` (`maybeSingle()` — the partial
   unique index guarantees ≤1); `preceptFlags` = keys of `emphasis_flags` whose
   value is `true`, filtered to the five known `PreceptFlag` values. No active
   precept ⇒ `[]` (rubric excludes the factor, weights ×100/90).

`runBoardAnalysis` steps (normative):

1. `assembleRubricInputs` → `scoreBoardConfidence(inputs)` → `generateNarrative(result)`.
2. Insert into `board_analyses`:
   `{ user_id, board_date, input: { ...inputs, disclaimer: BOARD_DISCLAIMER,
   warnings: result.warnings.concat(assembled.warnings), meta }, factor_scores:
   result.factors, overall_score: result.final, band: result.band,
   adverse_adjustment: result.adverseAdjustment, narrative, narrative_source,
   narrative_fallback_reason: fallbackReason, model, created_by: callerId }` —
   `.select().single()` to get id (adverse_adjustment + narrative_fallback_reason
   per the v1.1 review fixes).
3. **Fail-closed audit** (the stricter navfit98 pattern, route.ts:94-113 — analysis
   output is derived career data about a member, treated as record egress):
   insert into `audit_logs`
   `{ evaluation_id: null, user_id: callerId, action: "BOARD_ANALYSIS_RUN",
   details: { analysis_id, subject_user_id: subjectUserId, board_date,
   overall_score: result.final, band: result.band, narrative_source } }`.
   If the audit insert errors: delete the just-inserted `board_analyses` row and
   throw `new Error("Analysis could not be recorded in the audit log; no result was released.")`.
   **v1.1 review fix:** the compensating delete's `{ error }` is checked — if the
   delete ALSO fails, a `CRITICAL` line naming the orphaned analysis id is logged
   via `console.error`, and the same error is still thrown.
4. Return the inserted row.

New audit action string added to the project's action inventory: `BOARD_ANALYSIS_RUN`.

### 4.5 `lib/boardConfidenceService.ts` — browser service

Repo `lib/*Service.ts` pattern exactly (`evaluationService.ts`): module-level
`const supabase = createBrowserClient();`, exported `const fn = async (...)`,
`console.error("<label> failed ...", error.message); throw new Error(error.message)`
on error, JSON `POST` helper matching `postRoute` (`evaluationService.ts:12-21`).

```ts
export const getMemberBoardRecord = async (userId: string): Promise<MemberBoardRecord | null>;
    // .from("member_board_records").select("*").eq("user_id", userId).maybeSingle()

export const saveMemberBoardRecord = async (
  userId: string, patch: Partial<MemberBoardRecord>,
): Promise<MemberBoardRecord>;
    // .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" }).select().single()
    // RLS mbr_* policies make this owner-only; no server route needed.

export const getActivePrecept = async (): Promise<BoardPrecept | null>;
export const getLatestLadr = async (
  ratingAbbrev: string,
): Promise<{ document: LadrDocument; milestones: LadrMilestone[] } | null>;
    // documents: eq(rating_abbrev).eq(paygrade_range,'E1-E9').order(effective_date, desc).limit(1)
    // milestones: eq(ladr_document_id).order(sort_order)

export const listMyAnalyses = async (userId: string): Promise<BoardAnalysisRow[]>;
    // .from("board_analyses").select("*").eq("user_id", userId)
    // .order("created_at", { ascending: false }).limit(50)   (RLS-scoped anyway)

export const runBoardAnalysis = async (
  body: { userId?: string; boardDate?: string },
): Promise<BoardAnalysisRow>;
    // POST /api/board-confidence/analyze via the postRoute helper shape

export const uploadBoardDoc = async (userId: string, file: File): Promise<string>;
    // supabase.storage.from("board-docs").upload(`${userId}/${file.name}`, file, { upsert: true })
export const listBoardDocs = async (userId: string): Promise<{ name: string }[]>;
export const deleteBoardDoc = async (userId: string, name: string): Promise<void>;
```

No `logAction` calls from the browser for record edits — the audit convention covers
evaluation lifecycle + record egress; the analysis run itself is audited server-side
(fail-closed, §4.4). Attachments are stored, listed, deleted — **never parsed**
(§12).

---

## 5. API routes

### 5.1 `POST /api/board-confidence/analyze` — `app/api/board-confidence/analyze/route.ts`

Canonical authenticated-route shape (`eval-finalize`, `summary-average`,
`export/navfit98`): `fail` helper, try/catch with generic 500 (never echoes
internals), `getRouteUserId()` → 401, body parse → 400, `createAdminClient()` only
after auth, application-level authorization against fetched rows.

Request body: `{ userId?: string; boardDate?: string }`.
Response `200`: the full `BoardAnalysisRow` (JSON).

```ts
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Each run fans out several admin queries and may call the Anthropic API; cap
// concurrent runs exactly like the NAVFIT export route (navfit98/route.ts:27-34).
// ponytail: in-process counter — move to shared rate limiting if this route ever
// runs across multiple workers.
const MAX_CONCURRENT_ANALYSES = 2;
let activeAnalyses = 0;

export async function POST(req: NextRequest) {
  if (activeAnalyses >= MAX_CONCURRENT_ANALYSES)
    return fail("Too many analyses in progress. Try again shortly.", 429);
  activeAnalyses++;
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);

    const { userId, boardDate } = await req.json();
    const subjectUserId = userId || callerId;
    const T = boardDate || /* today, UTC, YYYY-MM-DD */;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(T) || Number.isNaN(Date.parse(T)))
      return fail("Invalid boardDate (expected YYYY-MM-DD).", 400);

    // Owner-only (v1.1 review fix): profiles.preferred_role/assigned_roles are
    // user-editable (self-asserted), so an "Admin" check against them authorizes
    // nothing. Admin-on-behalf is deferred until real server-side role authority
    // exists.
    if (subjectUserId !== callerId)
      return fail("Only the record owner may run/view analyses.", 403);

    const admin = createAdminClient();

    const { data: subject } = await admin
      .from("profiles").select("id").eq("id", subjectUserId).single();
    if (!subject) return fail("Subject profile not found.", 404);

    const row = await runBoardAnalysis(admin, subjectUserId, callerId, T);
    return NextResponse.json(row, { status: 200 });
  } catch (error: any) {
    console.error("Board confidence analysis error:", error);
    return fail("Board confidence analysis failed. See server logs for details.", 500);
  } finally {
    activeAnalyses--;
  }
}
```

Error inventory: 401 unauthenticated · 400 bad `boardDate` · 403 not the owner
· 403 consent not recorded (v1.2: `member_board_records.consented_at` is null
or the row is absent — message "Consent required. Review and accept the Board
Confidence Analyzer terms before running an analysis.")
(v1.1 review fix — owner-only, `"Only the record owner may run/view analyses."`) ·
404 subject profile missing · 429 concurrency cap · 500 audit-insert failure
(fail-closed, message surfaced generically) or unexpected error. There is no 422:
thin/empty records are a *scored condition* (rubric missing-data policy), not a
validation failure — a run with zero evals still succeeds and returns a low score
(the §7 missing-data zero-data guard, item 8, emits `S_f = 0, conf_f = 0` for any
factor with an empty normalizing denominator — never NaN).

### 5.2 `GET /api/board-confidence/runs` — `app/api/board-confidence/runs/route.ts`

Serves the caller's prior-run list. **v1.1 review fix: owner-only** — the former
Admin-views-another-user case trusted self-asserted profiles roles and is
removed (deferred with the §2 note).

Query params: `?userId=<uuid>` (optional; must equal the caller when present).
Auth: identical owner-only check as §5.1 (401/403, same 403 message).
Query: `admin.from("board_analyses")
.select("id, user_id, board_date, overall_score, band, adverse_adjustment, narrative_source, narrative_fallback_reason, model, created_at")
.eq("user_id", subjectUserId).order("created_at", { ascending: false }).limit(50)`.
Response `200`: `{ runs: [...] }`. Read-only — no audit row.
(For the owner's own history the UI may equivalently use
`listMyAnalyses` via RLS; this route remains the canonical path.)

---

## 6. UI — `/board-confidence` (`app/board-confidence/page.tsx`)

`"use client"` page in the repo pattern (`app/dashboard/page.tsx`): profile via
`getSession()` from `lib/auth` in a `useEffect`, redirect to `/login` when absent,
wrapped in `<AppShell profile={profile} breadcrumbs={[{ label: "Board Confidence" }]}>`
and `<RoleGuard user={profile} allowedRoles={["Sailor","Rater","Senior Rater","Reporting Senior","Admin"]}
fallback={<AccessDeniedPanel/>}>` (every signed-in role may use it — it is the
Sailor's own tool; Admin always passes `allowedRoles`, `components/RoleGuard.tsx`).

Components (under `components/boardConfidence/`; small ones may be colocated in the
page file — component names below are the contract, file granularity is not):

- **`BoardDisclaimer`** — renders `BOARD_DISCLAIMER` verbatim in an
  `apex-card` with `border-l-4` accent (`var(--accent-gold)`), `role="note"`,
  `aria-label="Unofficial tool disclaimer"`. Rendered at the top of the page AND
  again at the top of `ResultsView` (§1.1 requirement).
- **Tab bar** using the existing `apex-queue-tab` token, four tabs:
  1. **Record Entry** (`RecordEntryForm`) — `rating_abbrev` select (options from
     distinct `ladr_documents.rating_abbrev`), `target_paygrade` select (E-4…E-9),
     then repeating-row editors for awards (title, level select of the four
     `AwardLevel`s, date, "Verified in OMPF" checkbox), NECs, education, PFA cycles,
     tours (start/end, "Sea/Arduous/IA" + "Leadership (LPO/LCPO/WCS/Section Leader)"
     checkboxes), adverse entries, quals (free-form non-LaDR qualifications: title,
     code, date, "Verified in OMPF" — stored in `member_board_records.quals`,
     reference-only, never scored, §3 note), and per-eval context (one row per finalized eval:
     RSCA numeric input, sea-duty checkbox — keyed by `period_to`). A "PSR section
     complete" attestation checkbox writes `psr_entered`. Optional attachments
     block: upload/list/delete against `board-docs` via §4.5 helpers, with the
     caption "Attachments are stored for your reference only; they are never read
     or scored." Save button → `saveMemberBoardRecord`. **v1.1 review fix
     (normative):** the save handler validates that every award/PFA/tour/adverse
     row has a parseable `YYYY-MM-DD` date (and tour end ≥ start when present);
     on violation the save is blocked and the page's existing save-message
     surface names the rows needing dates. All inputs use
     `apex-input` / `apex-select`, labels via `apex-filter-label`, and every select
     carries an explicit `aria-label` (repo a11y convention, dashboard:396,413).
  2. **LaDR Checklist** (`LadrChecklist`) — auto-loads `getLatestLadr(rating_abbrev)`,
     filters by the §3 applicability rule against `target_paygrade`, groups by
     category (ordered by `LADR_CATEGORY_WEIGHTS` descending, zero-weight categories
     shown last under "Informational — not scored"), each row: item + `item_code` +
     status radio group (Met / Not met / N-A, unanswered when none selected) +
     "Verified in OMPF" checkbox (enabled only for Met). Shows the LaDR `version`
     and `source_url` in an `apex-page-subtitle`. Saves into `ladr_checklist`.
  3. **Precept** (`PreceptPanel`) — read-only card showing the active precept's
     `cycle`, `title`, `source_url`, and the five flags as `apex-badge-*` chips
     (set vs unset). Empty state: "No board precept is configured. The Precept
     Alignment factor will be excluded and its weight redistributed."
  4. **Results** (`ResultsView`) — "Run Analysis" (`apex-btn-primary`) with a board
     date `<input type="date">` (default today) → `runBoardAnalysis`; disabled
     while in flight; 429 surfaced as a retry toast. Renders the latest result:
     - **`ScoreDial`** — inline SVG arc (0–100) showing `overall_score` to 1
       decimal + the band vote and label (e.g. "50 — Crunch — middle band"), with
       the modeled-bands caveat line from the disclaimer directly beneath.
     - **`FactorBar`** ×6 — per-factor horizontal bar: label, `contribution` of
       `weight` (e.g. "33.5 / 40"), confidence shown as bar opacity + a "conf 0.47"
       chip when `< 1`. Each bar is a `<details>` whose expanded body prints **the
       exact arithmetic** from `FactorResult.detail` (e.g.
       `P1 = Σ rᵢ·pts / Σ rᵢ = 97.00`, `coverage = 0.4003, gaps > 90d: 2,
       S_C = 100·0.4003 − 30 = 10.03`). Numbers come from `detail` — never
       recomputed client-side.
     - Adverse adjustment line when the STORED `board_analyses.adverse_adjustment`
       is > 0 (v1.1 review fix — never derived client-side from
       Σcontributions − overall, which is wrong when the final clamps to 0),
       warnings list (`warnings`), then Strengths / Gaps / Recommendations lists
       and per-factor commentary from `narrative`, with a chip per
       `narrative_source` + `narrative_fallback_reason` (v1.1 review fix):
       "AI narrative (claude-opus-4-8)", "Deterministic narrative (no API key
       configured)" (`no_key`), or "Deterministic narrative (AI narrative
       unavailable — model call failed)" (`model_error`).
     - **Prior runs** table (`apex-data-table` inside `apex-card overflow-x-auto`
       with `min-w-[720px]`): date, board date, score, band, source; row click
       loads that run's stored result (no recompute — snapshots are immutable).

Page title uses `apex-page-title` ("Board Confidence Analyzer") with an
`apex-page-subtitle` naming the loaded LaDR version and precept cycle.

---

## 7. NORMATIVE SCORING RUBRIC (verbatim)

This section is the single source of truth for the scoring engine. `rubric.ts` MUST
implement it exactly; the three worked examples are the conformance fixture pinned by
tests (§11). The referenced reference implementation lived in the discovery session's
scratchpad and is ephemeral — the worked examples below are the durable artifact.

```
APEX BOARD CONFIDENCE ANALYZER — DETERMINISTIC SCORING RUBRIC v1
Reference implementation (runnable, with self-checks): /tmp/claude-1000/-srv-apex/8ff9fb2d-ea37-4a73-b20d-57b59e13c4f0/scratchpad/rubric.mjs

INPUTS: (a) APEX Evaluation rows (types/index.ts Evaluation: promotion_recommendation, trait_average, summary_group_average, summary_group_distribution, period_from/to, report_type) plus per-eval RSCA and sea-duty flag from the structured PSR entry; (b) structured PSR/ESR entry (awards+levels+verified_in_ompf, NECs, education, PFA cycles, tours with sea/leadership flags, adverse count); (c) LaDR milestone checklist (per item: met / not_met / na / unanswered, plus verified_in_ompf on met items); (d) admin-configured precept emphasis flags; (e) board convening date T.

GLOBAL CONSTANTS (all explicit):
- monthsBefore(date,T) = floor(daysBetween(date,T)/30.44); daysBetween via UTC-midnight dates.
- Recency weight r_i = 0.5^(m_i/24) where m_i = monthsBefore(period_to, T). HALF_LIFE = 24 months.
- SEA_MULT = 1.25: r_i is multiplied by 1.25 for evals earned on sea/arduous/IA duty.
- LOOKBACK = 72 months (evals/tours considered for Performance and Leadership).
- UNVERIFIED_MULT = 0.5: any "met"/award entry with verified_in_ompf=false counts at half value (boards see only OMPF FC 30-38 + PSR + LTB; "in ESR but not closed out to OMPF" is a first-class warning).
- REC_POINTS: EP=100, MP=80, P=50, Progressing=25, SP=0. NOB rows are excluded from Performance but count for Continuity coverage.
- Rounding: full float precision throughout; only the final composite is rounded to 1 decimal (round half away from zero).

FACTOR WEIGHTS (sum = 100): Performance 40, Leadership/Impact 15, Professional Development vs LaDR 15, Continuity 10, Record Completeness 10, Precept Alignment 10.

COMPOSITE: Final = clamp( Σ_f (w_f/100)·S_f·conf_f − A, 0, 100 ), where S_f∈[0,100] is the factor score, conf_f∈[0,1] its data confidence, and A the adverse adjustment. A = min(30, 15·nAdverseItems) + (10 if any PFA failure with monthsBefore(fail_date, T) ≤ 36 — the bound is INCLUSIVE, exactly-36-months is inside the window; 37 is outside — else 0). If zero precept flags are configured (admin omission, not sailor data), the Precept factor is excluded and the other five weights are multiplied by 100/90; this is the ONLY case where weight redistributes — sailor-side missing data always shrinks contribution instead (see missing-data policy).

FACTOR 1 — PERFORMANCE (w=40). Observed evals = rows in last 72 months with rec != NOB, sorted chronologically. Four subcomponents with sub-weights (sum 1.0):
- P1 Promotion recommendation (0.35): P1 = Σ r_i·REC_POINTS(rec_i) / Σ r_i.
- P2 Trait average vs comparator (0.35): per eval, comparator = max(summary_group_average, RSCA) over whichever are present ("at or above summary group AND RSCA" — the tougher bar governs); d_i = trait_average_i − comparator; score2_i = clamp(50 + 125·d_i, 0, 100) (so +0.40 above group → 100, −0.40 → 0, equal → 50). If NO comparator exists for that eval, fallback absolute scale score2_i = clamp(62.5·(ITA_i − 3.4), 0, 100) (3.4→0, 4.2→50, 5.0→100) AND that eval's weight in P2 is r_i·0.6 (FALLBACK_P2_MULT — uncomparable marks are worth less). P2 = Σ w_i·score2_i / Σ w_i.
- P3 Trend (0.15): requires ≥4 observed evals, else unavailable. recentMean = mean REC_POINTS of the 3 most recent; priorMean = mean of the up-to-3 preceding; P3 = clamp(50 + 0.5·(recentMean − priorMean), 0, 100). Consistent = 50; improving > 50; declining < 50.
- P4 EP breakout scarcity (0.15): requires summary_group_distribution on ≥1 eval, else unavailable. Per eval: if rec=EP and distribution present, s_i = 1 − (ep_count−1)/max(1, N−1) where N = total observed in the summary group (sole EP in group → 1.0); otherwise s_i = 0. P4 = 100·Σ r_i·s_i / Σ r_i.
- Decline penalty: for each chronologically consecutive observed pair where REC_POINTS decreases (e.g. EP→MP, MP→P), subtract 10; cap 20. (Unexplained declining recommendation is a verified board negative; APEX cannot parse write-up mitigation, so the penalty is flat and disclosed.)
- S_P = clamp( Σ(subw_j·score_j)/a_P − declinePenalty, 0, 100 ) over available subcomponents, where a_P = Σ sub-weights of available subcomponents. conf_P = a_P · min(1, N_observed/3).

FACTOR 2 — LEADERSHIP/IMPACT (w=15). Structured proxies only (no NLP on narratives — deterministic):
- L1 Leadership tours (0.40): n = tours in last 72 months flagged leadership (LPO/LCPO/WCS/section leader). L1 = min(100, 50·n).
- L2 Decorations (0.30): awards dated within last 120 months: personal achievement medal (NAM) = 10, personal commendation (NCM) = 20, MSM-and-above = 30, unit award = 4; each ×0.5 if verified_in_ompf=false. L2 = min(100, Σ).
- L3 Sea/arduous share (0.30): L3 = min(100, (100/36)·seaMonths72) where seaMonths72 = sea/IA months within last 72 (36 sea months → 100, mirroring typical 36/36 sea/shore flow).
- Missing sections: tours-not-entered removes L1+L3 (sub-weight 0.70); awards-not-entered removes L2 (0.30). S_L = renormalized mean over available; conf_L = Σ available sub-weights.

FACTOR 3 — PROFESSIONAL DEVELOPMENT vs LaDR (w=15). Items = LaDR checklist rows with recommended_by_paygrade ≤ target paygrade, status != na. Category weights (sum 100): qual_warfare 20, pme_required 20, qual_rate_specific 15, qual_watchstanding 10, skill_training_required 10, credential 10, education_degree 5, nec_opportunity 5, pme_recommended 3, skill_training_recommended 2. Per category, over ANSWERED items only: ratio_c = (Σ met·[1 or 0.5 if unverified]) / answered_c. Categories with zero answered applicable items are dropped and weights renormalized (na = legitimately not applicable ≠ unknown). S_D = 100·Σ w_c·ratio_c / Σ w_c. conf_D = answered_total / applicable_total (blank items are UNKNOWN: they never count as not-met, they lower confidence).

FACTOR 4 — CONTINUITY (w=10). The 5-year no-gap check recorders perform. windowEnd = max(latest period_to, T − 365 days), capped at T (365-day trailing grace = one periodic cycle; an eval older than that opens a real trailing gap). windowStart = windowEnd − 1826 days (60 months). Day counting (normative): dates are UTC-midnight day numbers (same daysBetween as monthsBefore). An eval period covers period_from..period_to INCLUSIVE of both endpoints, i.e. daysBetween(from, to) + 1 days. The window is the half-open day interval (windowStart, windowEnd] — windowStart itself is excluded — so it contains exactly 1826 days. coverage = (days in the union of all eval periods, NOB included, intersected with the window) / 1826, capped at 1. G = count of uncovered runs > 90 days inside the window (leading/trailing included). S_C = clamp(100·coverage − 15·G, 0, 100). conf_C = 1 always — absence of evals IS the signal continuity measures; it is never confidence-discounted.

FACTOR 5 — RECORD COMPLETENESS (w=10). Eight point-items (sum 100), presence not quality: continuity coverage ≥ 0.95 → 20; structured PSR section completed → 15; awards entered, ×(verified/total) rounded → 15; NEC history entered → 10; education entered → 10; ≥3 PFA cycles entered → 10; LaDR checklist ≥90% answered → 10; ESR-not-OMPF flags: 10·(1 − min(1, unverifiedCount/5)) rounded → 10. conf_R = 1 (it measures missingness itself).

FACTOR 6 — PRECEPT ALIGNMENT (w=10). Each admin flag maps to a fixed computable indicator ∈[0,1]: warfighting → qual_warfare ratio; leadership_positions → L1/100; education → mean(education_degree ratio, credential ratio); sea_duty → min(1, seaMonths72/36); technical_expertise → mean(nec_opportunity ratio, qual_rate_specific ratio). Unavailable underlying data → indicator = 0 (never fabricate). S_X = 100·mean(indicators of active flags). conf_X = 1. Zero flags → factor excluded, weights ×100/90.

MISSING-DATA POLICY (uniform, never fabricate): (1) A factor's uncomputable subcomponents are removed and the factor score is renormalized over what IS computable, but conf_f drops to the sum of available sub-weights — so the factor's CONTRIBUTION shrinks toward 0 rather than defaulting to 50. (2) Volume discounts: conf_P ×= min(1, N_obs/3); conf_D = answered/applicable. (3) Record Completeness independently scores the same absences, so thin records are penalized twice by design — exactly how a board treats a record it cannot brief. (4) Continuity and Completeness never get confidence discounts (they measure absence). (5) LaDR 'na' renormalizes (not applicable ≠ unknown); LaDR 'unanswered' lowers conf_D only. (6) Items present but not verified in OMPF count at 0.5 everywhere (UNVERIFIED_MULT). (7) Admin-side absence (no precept flags) redistributes weight; sailor-side absence never does. (8) Zero-data guard (normative): whenever a factor's normalizing denominator is 0 — zero observed evals (Σr_i and a_P are 0), no Leadership sections entered (Σ available sub-weights = 0), zero answered LaDR categories (Σw_c = 0) — that factor is emitted with S_f = 0, conf_f = 0, contribution 0 and detail.no_data = true; never NaN, never 0/0. A run with zero evals therefore still yields a finite low score (§5.1).

DETERMINISM/TESTABILITY: no randomness, no clock reads (T is an input), integer month flooring, explicit clamps, single terminal rounding. Boundary tests: band edges 85/70/50/30; gap edge 90 days; grace edge 365 days; coverage edge 0.95; N_obs edge 3; trend edge 4 evals; adverse caps 30/20.
```

**v1.1 review fixes (normative addendum to the rubric above):**

1. **Unknown recommendations are NOB.** Any observed-eval
   `promotion_recommendation` that is not a `REC_POINTS` key (null, empty, or an
   unrecognized value) is treated as `NOB`: excluded from Performance, still
   counted for Continuity coverage. `service.ts` maps such rows to `"NOB"` at
   assembly with the warning `"1 report has no promotion recommendation and was
   excluded from Performance scoring (period <from>–<to>)."`; `rubric.ts`
   additionally guards (defense in depth) so `REC_POINTS` is never indexed with
   an unknown key. Never NaN (item 8 extends to this case).
2. **Future-dated evals are excluded.** Observed evals require
   `0 <= monthsBefore(period_to, T) <= 72`; any eval with `period_to` after `T`
   is excluded from ALL factors including Continuity (a future `period_to` would
   otherwise earn recency weight > 1), with the warning
   `"Excluded N reports dated after the board date."`
3. **Dateless entries.** Awards and tours with missing/unparseable dates are
   EXCLUDED from scoring with the warning `"N entries with missing dates were
   excluded from scoring — add dates in Record Entry."`. A PFA `result="fail"`
   with a missing date APPLIES the −10 adverse penalty anyway (conservative —
   never inflate) with the warning `"A PFA failure without a date was counted as
   recent — add the date to confirm the 36-month window."`
4. **Empty list = not entered.** Per §4.1: `service.ts` maps empty-array PSR
   sections (awards/necs/education/tours/pfa) to `null` before scoring — the DB
   cannot represent null once a row exists, and an empty section must not score
   as "entered" for Completeness.

### 7.1 Bands (normative)

Final 0-100 score maps to the board-style confidence vote (bands verified for
officer statutory and LDO/CWO in-service procurement boards; PERS-803 CPO boards
score by rating panel and vote slates, so this is explicitly labeled "modeled on the
officer-brief confidence bands," not actual CPO-board math — the UI must carry this
disclaimer):

- Final ≥ 85.0 → vote 100 — "Clearly at the top": profile of records swept up in the tentative-select motion on the first pass.
- 70.0 ≤ Final < 85.0 → vote 75 — "Competitive": strong record; selects when quota allows.
- 50.0 ≤ Final < 70.0 → vote 50 — "Crunch — middle band": the records redistributed for mandatory second review; outcome depends on quota and the rest of the slate.
- 30.0 ≤ Final < 50.0 → vote 25 — "Not competitive this cycle": record needs specific, identifiable work (the gap report tells the sailor exactly which factor contributions are low and why).
- Final < 30.0 → vote 0 — "Drop-from-consideration risk": profile of records dropped from further consideration early, or too incomplete to brief (an unbriefable record effectively does not exist to the board).

All comparisons are ≥ on the lower bound; every boundary is a testable constant.
**Clarification (normative):** the band is computed from the *rounded* final (the
displayed 1-decimal value), so e.g. a raw 84.96 rounds to 85.0 and votes 100.

### 7.2 Worked examples (conformance fixtures — pinned by tests)

All three computed by the reference implementation with board date T = 2026-09-01; recency r_i = 0.5^(floor(days/30.44)/24), sea evals ×1.25.

Eval periods (required by Factor 4; day counting per the §7 Factor 4 convention —
period endpoints inclusive, window half-open (windowStart, windowEnd]): Ex1 and Ex2
are contiguous annual reports, period_from = the day after the previous period_to
(Ex1 periods 2020-03-16–2021-03-15 through 2025-03-16–2026-03-15; Ex2 periods
2020-12-01–2021-11-30 through 2024-12-01–2025-11-30). Ex3 periods are
2023-06-01–2024-05-31 and 2024-06-01–2025-05-31. Printed intermediates below are
full-float values displayed to 2 decimals (recency weights to 4); raw and FINAL are
computed at full precision, never from the displayed values. §11.1 pins the
intermediates at 1-decimal tolerance and final/band exactly.

EXAMPLE 1 — STRONG (IT1 up for ITC; 6 observed annual evals, no gaps, LaDR nearly complete, everything OMPF-verified except one degree entry):
Evals (period_to, rec, ITA, comparator=max(SGA,RSCA), sea, EP-dist): 2021-03-15 MP 4.00 vs 3.95; 2022-03-15 MP 4.10 vs 4.00 sea; 2023-03-15 EP 4.30 vs 4.05 sea, EP 2 of 12; 2024-03-15 EP 4.40 vs 4.10 sea, EP 2 of 13; 2025-03-15 EP 4.50 vs 4.20, EP 1 of 9; 2026-03-15 EP 4.57 vs 4.22, EP 2 of 10. Recency weights r = 0.1530, 0.2705, 0.3825, 0.5410, 0.6120, 0.8655 (m = 65, 53, 41, 29, 17, 5 months; middle three ×1.25 sea).
- P1 = Σr·pts/Σr = (0.1530·80 + 0.2705·80 + 0.3825·100 + 0.5410·100 + 0.6120·100 + 0.8655·100)/2.8245 = 97.00.
- P2: deltas +0.05,+0.10,+0.25,+0.30,+0.30,+0.35 → scores 56.25, 62.5, 81.25, 87.5, 87.5, 93.75 → recency-weighted = 84.48.
- P3: recent3 = (100+100+100)/3 = 100; prior3 = (80+80+100)/3 = 86.67; P3 = 50 + 0.5·13.33 = 56.67.
- P4: s = 0, 0, 1−1/11=0.909, 1−1/12=0.917, 1.0, 1−1/9=0.889 → weighted = 78.77. No declines → penalty 0.
- S_P = 0.35·97.00 + 0.35·84.48 + 0.15·56.67 + 0.15·78.77 = 83.84; conf_P = 1.0·min(1,6/3) = 1. Contribution 0.40·83.84 = 33.53.
- Leadership: 2 leadership tours → L1 = 100; awards 10+10+20+4+4 = 48 → L2 = 48; 36 sea months → L3 = 100. S_L = 0.4·100+0.3·48+0.3·100 = 84.40, conf 1 → 12.66.
- LaDR (27/27 answered, conf_D = 1): ratios warfare 1.0, watch 1.0, rate 5/6 = 0.833, pme_req 1.0, skill_req 1.0, cred 2/3 = 0.667, edu 0.5 (met but unverified ×0.5), nec 0.5, pme_rec 0.5, skill_rec 0.667 → S_D = 20+10+12.5+20+10+6.67+2.5+2.5+1.5+1.33 = 87.00 → 13.05.
- Continuity: windowEnd = 2026-03-15 (within 365-day grace), coverage = 1.0, gaps 0 → S_C = 100 → 10.00.
- Completeness: 20+15+15+10+10+10+10 + esrFlags 10·(1−1/5)=8 → S_R = 98 → 9.80.
- Precept (warfighting, leadership_positions): indicators 1.0, 1.0 → S_X = 100 → 10.00.
Raw = 33.53+12.66+13.05+10.00+9.80+10.00 = 89.04; adverse 0; FINAL = 89.0 → vote 100 "Clearly at the top".

EXAMPLE 2 — AVERAGE (5 observed evals P/P/MP/P/MP with one decline, no EPs, warfare qual incomplete, 23/29 LaDR items answered):
Evals (period_to, rec, ITA vs SGA, sea): 2021-11-30 P 3.80 vs 3.90 sea; 2022-11-30 P 3.90 vs 3.92 sea; 2023-11-30 MP 4.00 vs 3.98; 2024-11-30 P 3.95 vs 4.00 (decline MP→P); 2025-11-30 MP 4.10 vs 4.02. r = 0.2410, 0.3408 (sea ×1.25), 0.3856, 0.5453, 0.7711 (m = 57, 45, 33, 21, 9).
- P1 = weighted mean of (50,50,80,50,80) = 65.19. P2: deltas −0.10,−0.02,+0.02,−0.05,+0.08 → scores 37.5,47.5,52.5,43.75,60.0 → weighted 50.61. P3: recent3 (80+50+80)/3 = 70 vs prior2 (50+50)/2 = 50 → 50+0.5·20 = 60. P4: distributions present, zero EPs → 0.00. Decline penalty 10 (one drop).
- S_P = 0.35·65.19 + 0.35·50.61 + 0.15·60 + 0.15·0 − 10 = 39.53; conf_P = 1 → contribution 15.81.
- Leadership: 1 leadership tour → L1 = 50; awards 10+4+4 = 18; sea 24 mo → L3 = 66.67. S_L = 20+5.4+20 = 45.40 → 6.81.
- LaDR: warfare 0/1 = 0 (answered, not met — kills the 20-weight category), watch 1.0, rate 0.5, pme_req 0.667, skill_req 1.0, cred 0.333, nec 0.5, skill_rec 0.5; edu + pme_rec unanswered → categories dropped, wSum = 92. S_D = 47.67/0.92 = 51.81; conf_D = 23/29 = 0.793 → contribution 0.15·51.81·0.793 = 6.16.
- Continuity: contiguous annual reports, windowEnd = 2025-11-30, coverage 1.0 → 100 → 10.00.
- Completeness: 20+15+15+10+10+10 + ladr 0 (79% < 90% answered) + 10 = 90 → 9.00.
- Precept: warfighting 0, leadership_positions 0.5 → S_X = 25 → 2.50.
Raw = 50.29; adverse 0; FINAL = 50.3 → vote 50 "Crunch — middle band" (one decline + no EP breakouts + warfare gap is exactly a second-review record).

EXAMPLE 3 — WEAK/INCOMPLETE (only 2 evals entered — one with no comparator, no PSR/NEC/education/tour data, 6/27 LaDR items answered, 1 unverified award, PFA failure 2025):
Evals (full periods 2023-06-01–2024-05-31 and 2024-06-01–2025-05-31): 2024-05-31 P 3.70 no SGA/RSCA (fallback path); 2025-05-31 MP 4.05 vs 4.00. r = 0.4585 (m=27), 0.6484 (m=15).
- P1 = (0.4585·50 + 0.6484·80)/1.1069 = 67.57. P2: eval 1 fallback score 62.5·(3.70−3.4) = 18.75 at weight 0.4585·0.6 = 0.2751; eval 2 score 50+125·0.05 = 56.25 at 0.6484 → P2 = 45.08. P3 unavailable (<4 evals); P4 unavailable (no distributions) → a_P = 0.35+0.35 = 0.70.
- S_P = (0.35·67.57 + 0.35·45.08)/0.70 = 56.33; conf_P = 0.70·min(1, 2/3) = 0.467 → contribution 0.40·56.33·0.467 = 10.51 of a possible 40. The score is decent; the CONFIDENCE collapse does the damage — never fabricated, just shrunk.
- Leadership: tours not entered → L1/L3 unavailable; L2 = 10·0.5 (unverified NAM) = 5. S_L = 5, conf_L = 0.30 → 0.23.
- LaDR (6 of 27 applicable items answered; every met item OMPF-verified): qual_warfare 1 answered, met → 1.0; pme_required 1 answered, met → 1.0; qual_rate_specific 2 answered, 1 met 1 not_met → 0.5; qual_watchstanding 2 answered, 1 met 1 not_met → 0.5; all other categories zero answered → dropped, wSum = 20+20+15+10 = 65. S_D = 100·(20+20+7.5+5)/65 = 80.77, but conf_D = 6/27 = 0.222 → contribution 2.69. High score, near-zero weight: unanswered ≠ not met, but unanswered cannot help you either.
- Continuity: latest eval 2025-05-31 older than the 365-day grace → windowEnd = 2025-09-01, windowStart = 2020-09-01; covered days = 731 (2023-06-01–2025-05-31 inclusive, leap day included) → coverage = 731/1826 = 0.4003; 2 uncovered runs > 90 days (leading 1002 d, trailing 93 d) → S_C = 100·0.4003 − 30 = 10.03 → 1.00.
- Completeness: continuity 0, PSR 0, awards 15·(0/1) = 0, NEC 0, edu 0, PFA 0 (1 cycle), LaDR 0, esrFlags 10·(1−1/5) = 8 → S_R = 8 → 0.80.
- Precept: warfighting 1.0 (the one thing verified), leadership_positions 0 → S_X = 50 → 5.00.
Raw = 10.51+0.23+2.69+1.00+0.80+5.00 = 20.23; adverse A = 10 (PFA failure ≤36 mo, inclusive bound); FINAL = 10.2 → vote 0 "Drop-from-consideration risk" — with a gap report showing exactly which entries would recover points (enter tours, verify the award, close out the eval gap, answer the checklist).

---

## 8. Data-flow summary

```
member_board_records (browser writes, RLS owner-only)
ladr_documents/-milestones, board_precepts (seed script, service role)
        │
        ▼                    POST /api/board-confidence/analyze
evaluations (created_by = subject, finalized gate, dod_id cross-check)   [admin client]
summary-group peers (per group: tallyRecommendations, computeSummaryGroupAverage)
        │
        ▼
assembleRubricInputs → scoreBoardConfidence (pure) → generateNarrative (Claude or fallback)
        │
        ▼
board_analyses insert → audit_logs BOARD_ANALYSIS_RUN (fail-closed) → 200 BoardAnalysisRow
```

---

## 9. Environment

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | existing | browser + route session |
| `SUPABASE_SERVICE_ROLE_KEY` | existing | admin client in the analyze/runs routes + seed script |
| `ANTHROPIC_API_KEY` | **optional** | enables the model narrative; absent ⇒ deterministic fallback, feature fully functional |

---

## 10. Seeding — `scripts/seed-ladr.ts`

### 10.1 Script

`tsx` script in the repo's seed pattern (`scripts/seed-e2e.ts`); add to
`package.json`: `"db:seed-ladr": "tsx scripts/seed-ladr.ts"`. Uses
`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (exits with a clear error
when absent). CLI: `npx tsx scripts/seed-ladr.ts [--rating IT] [--reset]`
(`--rating` limits to one rating; `--reset` deletes that rating's documents —
cascade removes milestones — before re-import; without `--reset` re-runs are
idempotent upserts).

Per rating dataset (typed `LadrSeed` objects in `scripts/ladr-data/<rating>_e1_e9.ts`):

1. Upsert `ladr_documents` `on conflict (rating_abbrev, paygrade_range, effective_date) do update`
   setting `version, source_url, source_hash` (repo idempotence style, 001:743).
2. `delete from ladr_milestones where ladr_document_id = <id>` then bulk-insert the
   dataset's milestones with sequential `sort_order` (delete-and-reinsert keeps
   milestone content authoritative to the dataset; document identity — and any
   analysis snapshot — is unaffected because snapshots embed values, not FKs).
3. Upsert `board_precepts` `on conflict (cycle) do update` for the seed precept; set
   `active = true` after clearing any other active row
   (`update board_precepts set active = false where active and cycle <> $1`).

### 10.2 Seed data (minimum shipped set)

**Rating 1 — IT (verified against the July 2026 IT E1–E9 LaDR, cool.osd.mil):**
`ladr_documents`: `('IT', 'Information Systems Technician', 'E1-E9', 'July 2026',
'2026-07-01', 'https://www.cool.osd.mil/usn/LaDR/it_e1_e9.pdf')`.
Milestones (≥ these rows; `applies_to_paygrades` per the LaDR block they appear in):

| category | item | item_code | applies_to |
|---|---|---|---|
| credential | CompTIA A+ | — | {3} |
| credential | CompTIA Security+ | — | {4} |
| credential | CompTIA Network+ | — | {4} |
| credential | CompTIA Linux+ | — | {4} |
| credential | Cisco CCNA | — | {5} |
| credential | CompTIA Server+ | — | {5} |
| credential | CompTIA CySA+ | — | {6} |
| credential | Cisco CCNP | — | {6} |
| credential | CompTIA SecurityX | — | {7} |
| nec_opportunity | Systems Administration | 746A | {4,5,6} (course A-150-1980 in `detail`) |
| qual_rate_specific | CANES PQS | 43355-11A | {4,5,6} |
| qual_rate_specific | KOAM PQS | 43462-2B | {5,6} |
| pme_required | CPO Selectee Leadership Course | — | {7} |
| pme_required | CPO Leader Development Course | NELD-06 | {7} |
| qual_watchstanding | Basic Damage Control | — | {1,2,3} |
| qual_watchstanding | Advanced Damage Control | — | {4} |
| qual_watchstanding | 3M Maintenance Person (301) | — | {1,2,3,4} |
| qual_watchstanding | 3M Work Center Supervisor (303) | — | {7} |
| qual_watchstanding | MOOW / POOW | — | {3,4} |
| qual_watchstanding | Section Leader | — | {7} |
| qual_warfare | Information Warfare (EIWS) | IW | {4} |
| qual_warfare | Surface Warfare (ESWS) — if afloat | SW | {4} |
| education_degree | Occupational-related Associate degree | — | {5} |
| pme_recommended | Enlisted Leader Development — Intermediate | — | {5} |
| pme_recommended | Enlisted Leader Development — Advanced | — | {6} |
| skill_training_recommended | NAVEDTRA self-paced modules (rating-relevant) | — | {3,4,5} |

**Rating 2 — BM (representative):** same rating-independent rows (watchstanding
quals, warfare quals, PME, ELD, degree) with `detail.source = "representative"` on
the rate-specific placeholders, documenting honestly that only IT's rate-specific
content was verified from the source PDF. `('BM', 'Boatswain's Mate', 'E1-E9',
'July 2026', '2026-07-01', 'https://www.cool.osd.mil/usn/LaDR/bm_e1_e9.pdf')`.

**Precept:** `('FY27 Active-Duty E7', 'FY27 CPO Selection Board emphasis (modeled)',
'{"warfighting": true, "leadership_positions": true, "sea_duty": true}', null, true)`.

### 10.3½ On-demand LaDR fetch (v1.4, additive)

`POST /api/board-confidence/ladr-fetch { rating }` — any authenticated user;
rating validated against the static `NAVY_RATINGS` catalog
(`lib/boardConfidence/ratings.ts`, which also feeds the Record Entry dropdown
so it functions with zero stored documents). Pipeline
(`lib/boardConfidence/ladrFetch.ts`): undici fetch of
`{rating}_e1_e9.pdf` with a dedicated Agent pinning the site's public
ZeroSSL/USERTrust chain (`ladrCerts.ts` — cool.osd.mil omits its TLS
intermediate) + browser UA → in-memory `unpdf` extraction (the PDF bytes are
never persisted) → conservative anchor-based `parseLadr` (cover "Month YYYY"
version; NELD ladder → `pme_required`; warfare/PQS/education signals; the COOL
credential table rows with printed Target Paygrades; EVERY milestone
`detail.source = 'auto_extracted'`, surfaced as a verify note in the
checklist) → `storeLadr` inserting a NEW `(rating, version)` document +
milestones, or `already_current` if that issue exists from either the curated
seed or a prior fetch (never overwrites, §10.3). Statuses: 401 / 400 unknown
rating / 404 no COOL file / 429 concurrency (cap 1) / 502 fetch-or-parse /
500. Live-verified against YN, LS, and OS (all July 2026).

### 10.3 Versioning / annual-refresh procedure (documented behavior)

- LaDRs are reviewed annually; the cover month+year is the version key. A new issue
  is imported as a **new `ladr_documents` row** (new `effective_date`) — old rows
  are never mutated or deleted, so historical `board_analyses` snapshots remain
  interpretable (they embed values, not milestone FKs).
- `assembleRubricInputs` always resolves the **latest** document by
  `effective_date desc`, so new imports take effect immediately.
- User checklists key on milestone UUIDs, which change on re-import. The seed script
  therefore runs a **carry-forward** step after inserting a new document version:
  for each `member_board_records` row of that rating, remap `ladr_checklist` entries
  from the previous document's milestones to the new ones matching on
  `(category, coalesce(item_code, item))`; unmatched entries are dropped (they
  simply become `unanswered`, which lowers `conf_D` — never fabricates a status).

---

## 11. Testing

Vitest + jsdom, `@` alias, files at `tests/unit/<name>.test.ts` (vitest.config.ts).
Dummy Supabase env is already injected so module-level clients don't throw at
import; **no live network calls anywhere in CI** — the Anthropic SDK is mocked or
gated off by deleting `ANTHROPIC_API_KEY` in the test. All new suites go in the
default run (not the `RESERVED_AFTER_WEEK5` exclude list). BUPERSINST/board-brief
citations in test names where applicable (repo convention,
`tests/unit/traitAverage.test.ts`).

### 11.1 `tests/unit/boardConfidenceRubric.test.ts`

- **Worked examples pinned** (T = 2026-09-01): build the three §7.2 inputs
  (including the §7.2 period ranges and the Ex3 LaDR item list) and assert
  `final`/`band` exactly (`89.0`/100, `50.3`/50, `10.2`/0) and each cited
  intermediate with `toBeCloseTo(x, 1)` — the §7.2 numbers are 2-decimal displays
  of full-float values, and several exact values sit within 0.005 of the display,
  so 2-decimal tolerance (±0.005) would be fragile; 1-decimal (±0.05) is the
  normative pin: Ex1 P1 97.00, P2 84.48, P3 56.67, P4 78.77,
  S_P 83.84, S_L 84.40, S_D 87.00, S_R 98, contributions 33.53/12.66/13.05/10.00/9.80/10.00;
  Ex2 P1 65.19, P2 50.61, S_P 39.53, S_D 51.81, conf_D 0.793, raw 50.29;
  Ex3 P2 45.08, conf_P 0.467, contribution 10.51, S_C 10.03, S_R 8, raw 20.23, A 10.
- **Band boundaries**: rounded finals 85.0→100, 84.9→75, 70.0→75, 69.9→50, 50.0→50,
  49.9→25, 30.0→25, 29.9→0; and the rounding rule 84.96→85.0→100, 84.94→84.9→75.
- **Continuity edges**: a 90-day uncovered run incurs no gap penalty, 91 days incurs
  one; latest `period_to` exactly 365 days before T keeps `windowEnd = period_to`
  (no trailing gap), 366 days opens one; coverage 0.95 earns the 20-point
  completeness item, 0.949 does not.
- **Missing-data policy**: 2 observed evals ⇒ conf_P includes ×2/3; <4 evals ⇒ P3
  absent from `a_P`; no distributions ⇒ P4 absent; tours-null removes L1+L3 with
  conf_L 0.30; zero precept flags ⇒ five weights ×100/90 and factor marked
  excluded; `na` items renormalize while `unanswered` only lowers conf_D;
  `verified_in_ompf: false` halves a met item and an award; **zero-data guard**:
  zero evals / all-null PSR / empty LaDR ⇒ every affected factor emits
  `S_f 0, conf_f 0, detail.no_data true`, the run completes, and `final` is a
  finite number (assert `Number.isFinite` — no NaN anywhere in the result).
- **Penalties/caps**: 1 decline −10, 3 declines capped −20; 1 adverse item A=15,
  3 adverse capped 30; PFA fail at exactly 36 months before T adds 10, at 37 months
  adds 0.
- **Determinism**: same inputs twice ⇒ deep-equal results; engine never reads the
  clock (spy on `Date.now` and assert uncalled).

### 11.2 `tests/unit/boardConfidenceNarrative.test.ts`

- **Keyless fallback**: with `ANTHROPIC_API_KEY` deleted, `generateNarrative`
  resolves `{source: "fallback", model: null}` with schema-valid narrative and no
  SDK construction (mock `@anthropic-ai/sdk` and assert the constructor is not
  called). Same `RubricResult` twice ⇒ identical fallback text.
- **Mocked model shape**: `vi.mock("@anthropic-ai/sdk")` returning
  `{ messages: { parse: vi.fn().mockResolvedValue({ parsed_output: <valid> }) } }`;
  with a dummy key set, assert `parse` is called with `model: "claude-opus-4-8"`,
  `thinking: { type: "adaptive" }`, an `output_config.format` present, and **no**
  `temperature`/`top_p`/`top_k` keys; result `{source: "model", model: "claude-opus-4-8"}`.
- **Failure → fallback**: `parse` rejects ⇒ fallback outcome, no throw.
- **Privacy**: capture the `parse` call's user message content; assert it contains
  none of the sentinel strings planted in a fixture (`member_name`, a 10-digit
  dod_id, an award title, an adverse note).
- **Null parse**: `parsed_output: null` ⇒ fallback outcome.

### 11.3 `tests/unit/boardConfidenceRoute.test.ts`

Mock `@/lib/supabaseClient` (`getRouteUserId`, `createAdminClient`) and
`@/lib/boardConfidence/service` per-suite; import the route handlers directly.

- 401 when `getRouteUserId` resolves null.
- 400 on `boardDate: "09/01/2026"` and `"2026-13-40"`.
- 403 whenever caller ≠ subject — including when the caller's profile claims
  Admin (`preferred_role` or `assigned_roles`), and without any profile-role
  lookup (v1.1 review fix — owner-only).
- 429 when `MAX_CONCURRENT_ANALYSES` slots are held (fire 3 concurrent requests
  against a `runBoardAnalysis` mock that blocks on a deferred promise; assert the
  third gets 429 and the counter releases after resolution).
- 500 with the generic message (no internals echoed) when `runBoardAnalysis` throws
  the fail-closed audit error.
- `GET /runs`: 401/403 as above; 200 returns rows ordered `created_at desc`.

### 11.4 `tests/unit/boardConfidenceService.test.ts` (assembly logic)

With a stubbed admin client: the finalized gate `.or(...)` string is exact
(`"status.eq.completed,signature_locked.eq.true,routing_stage.eq.locked"`); a
dod_id-mismatch eval is excluded and produces the §2 warning; `trait_average` comes
from `computeTraitAverage` even when the stored column disagrees (fixture with a
stale column value); LaDR applicability `min(applies_to_paygrades) <= target`;
`career_milestone`/`billet_recommended` rows never reach `inputs.ladr`; absent
`member_board_records` row yields the documented empty `PsrSection`.

---

## 12. Out of scope for v1 (explicit)

- **Automated LaDR PDF scraping/parsing** — LaDR content enters via the typed seed
  datasets in `scripts/ladr-data/`; the annual refresh (§10.3) is a manual
  re-transcription into a new dataset + `db:seed-ladr` run.
- **ESR/PSR PDF parsing or OCR** — `board-docs` attachments are reference storage
  only; nothing reads their contents; all scored data is structured user entry.
- **Officer boards** (FITREP-centric scoring, O-grades as targets) — FITREP rows a
  Sailor owns still score under the same rubric, but the LaDR/precept model, bands
  disclaimer, and seed data target enlisted advancement only.
- **Multi-member command views** (a Rater/RS analyzing their whole division, slate
  simulation, cross-member ranking) — the API is deliberately owner-only (v1.1
  review fix; Admin-on-behalf deferred per §2), single subject per run.
- Precept **management UI** (v1 precepts are seed-script-managed; the page only
  displays the active one).
- Any writeback to `evaluations` (the analyzer is read-only over eval data) and any
  backfill/constraint change to `evaluations.dod_id` (§2).

---

## 13. Deliverable file inventory

| Path | Kind |
|---|---|
| `supabase/migrations/004_board_confidence.sql` | new (DDL in §3, verbatim) |
| `supabase/migrations/005_board_docs_storage.sql` | new (v1.1 review fix — storage DDL split out of 004, §3) |
| `lib/boardConfidence/types.ts` | new |
| `lib/boardConfidence/rubric.ts` | new |
| `lib/boardConfidence/narrative.ts` | new |
| `lib/boardConfidence/service.ts` | new |
| `lib/boardConfidenceService.ts` | new |
| `app/api/board-confidence/analyze/route.ts` | new |
| `app/api/board-confidence/runs/route.ts` | new |
| `app/board-confidence/page.tsx` | new |
| `components/boardConfidence/*` (BoardDisclaimer, RecordEntryForm, LadrChecklist, PreceptPanel, ResultsView, ScoreDial, FactorBar) | new (colocation permitted, §6) |
| `scripts/seed-ladr.ts` + `scripts/ladr-data/{it_e1_e9,bm_e1_e9,precept_fy27}.ts` | new |
| `tests/unit/boardConfidence{Rubric,Narrative,Route,Service}.test.ts` | new |
| `package.json` | edit: add `"db:seed-ladr": "tsx scripts/seed-ladr.ts"` |

Reused, not re-derived: `computeTraitAverage` / `computeSummaryGroupAverage` /
`TRAIT_KEYS` (`lib/traitAverage.ts`), `paygradeOf` / `samePaygrade`
(`lib/paygrade.ts`), `tallyRecommendations` (`lib/forcedDistribution.ts`),
`createAdminClient` / `getRouteUserId` / `createBrowserClient`
(`lib/supabaseClient.ts`), `has_oversight` (SQL), `AppShell` / `RoleGuard` /
`AccessDeniedPanel`, `apex-*` tokens (`app/globals.css`).
