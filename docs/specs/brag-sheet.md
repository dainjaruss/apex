# APEX Brag Sheet + AI Auto-Fill — Implementation Specification

Status: **APPROVED FOR BUILD** · Version 1.0 · 2026-07-18 · Branch `feat/brag-sheet`

Companion spec style: `docs/specs/board-confidence-analyzer.md` (the file this spec
is modeled on — module layout, migration style, route shape, fail-closed audit, and
test conventions are copied from it deliberately).

This document is the authoritative build document for the APEX Brag Sheet and its
AI evaluation auto-fill. An implementer must be able to build every part from it
without re-research. Where a convention already exists in the repo (service layer,
API route shape, RLS style, `apex-*` tokens, commentFit, the v1.3.1 provider-agnostic
AI pattern), this spec names the file that defines it and mandates reuse.

---

## 1. What this feature is

Two connected capabilities:

1. **Brag Sheet** — a structured, year-round accomplishment collector modeled on the
   traditional "Enlisted Evaluation Report Input Sheet" (the fleet-standard brag
   sheet). Ten sections + free text, stored as one JSONB payload per eval period,
   editable all year, exportable as a branded PDF ("APEX Brag Sheet v1.0 – Powered
   by APEX") and as JSON (with re-import). Prior-EVAL and PRIMS PDFs can be dropped
   onto the page; their text is extracted **in memory** and offered back as
   per-field suggestions the user explicitly accepts.
2. **AI Auto-Fill** — turns the brag sheet + prior-eval summaries + LaDR milestone
   status into a **grounded, citation-carrying draft** of the narrative blocks the
   repo already validates — Block 28 (`command_achievements`), 29A
   (`primary_duty_abbrev`), 29B (`primary_duties`), 41 (`career_recommendations`),
   43 (`comments`), 44 (`qualifications`, EVAL only) — plus a deterministic Block 20
   (`physical_readiness`) echo. Output is fit-checked with the exact
   `lib/commentFit.ts` machinery the screen, validation engine, and PDF renderer
   share, dry-run validated with `runFullValidation`, and applied to a `status:
   "draft"` evaluation **only after explicit per-block user review**. Trait grades
   (Blocks 33–39) and the Block 45 promotion recommendation are **never generated**
   into the form — the model emits a display-only promotion *advisory*.

Block numbering throughout uses the repo's enlisted-keyed convention
(`comments` = "Block 43" everywhere; on CHIEFEVAL/FITREP the same *field names* land
on Blocks 40/41 — that aliasing already lives in `lib/bupersGuidelines.json` and is
not duplicated here).

### 1.1 Normative disclaimers (verbatim — use exactly these texts)

Named exported constants in `lib/bragSheet/types.ts`.

`BRAG_AI_DISCLAIMER` — MUST be rendered (a) at the top of the `/brag-sheet` page,
(b) at the top of the generation review panel, and (c) in short form in the branded
PDF footer (§4.4):

> **UNOFFICIAL DRAFTING AID.** AI-generated text is a proposal drafted from your own
> brag sheet entries — it is not an official evaluation, has not been reviewed by
> your chain of command, and may contain errors. Review every line before use.
> Trait grades (Blocks 33–39) and the promotion recommendation (Block 45) are never
> generated: they are human judgments reserved to the reporting senior. Never enter
> classified information in a brag sheet.

`BRAG_PDF_FOOTER` (the PDF short form):

> APEX Brag Sheet v1.0 — Powered by APEX · Unofficial worksheet, not a NAVPERS form
> · Contains member-entered data only — verify before use in an official report

**Normative placement rule:** disclaimers live in the UI and in the brag-sheet PDF
**only**. No disclaimer, watermark, or "AI-generated" marker text is ever inserted
into any `evaluations` field (comments, block_values, or otherwise). An applied
draft is indistinguishable from a hand-typed draft — the audit log
(`BRAG_AUTOFILL_RUN`, §4.7) is the provenance record, not the form text.

### 1.2 Hard invariants (normative — each is tested in §9)

1. **Uploads are never persisted.** PDF uploads to `/api/brag-sheet/extract` are
   processed entirely in memory (`req.formData()` → `Uint8Array` → unpdf) and
   garbage-collected with the request. There is **no storage bucket** for this
   feature and migration 006 creates none. Nothing in this feature writes an
   uploaded byte to disk, Supabase storage, or logs.
2. **No AI trait grades.** `AutofillModelOutputSchema` has no `trait_grades` key;
   Zod's default strip semantics discard any the model emits (§4.6 parse rule).
   Blocks 33–39 are untouched by every code path in this feature.
3. **Promotion advisory is display-only.** `promotion_advisory.advisory_only` is the
   literal `true`; the UI renders it with the disclaimer and the apply flow never
   writes it to `Evaluation.promotion_recommendation` (which stays the seed default
   `"Promotable"`; the user picks Block 45 on the form, where
   `refinePromotionRecommendation` (`types/navpers.ts`) still gates it).
4. **Citation-or-delete.** Every generated item must carry ≥1 source citation that
   resolves against the actual request payload (§7 step 2). Unresolvable ⇒ the item
   is deleted before the user sees it and recorded in `citation_failures`.
5. **Block 20 is deterministic.** `physical_readiness` =
   `brag.pfa.map(c => c.result).join("")`, computed server-side, echoed by the
   model, and **overwritten** server-side after generation. The model can never
   alter a PFA code.
6. **No silent truncation.** An overflowing block gets one automatic retry with
   concrete feedback, then returns flagged (`overflow: true`, `truncation_preview`,
   `dropped_lines`) for the user to regenerate or edit. The server never trims text.
7. **Apply is explicit.** The autofill route returns a proposal object and stores it
   in `brag_sheets.last_autofill`. No server code path writes generated text into an
   `evaluations` row; the client-side apply flow (§5.3) does so only from blocks the
   user individually accepted, through the existing `saveDraft`.
8. **Owner-only, consent-gated, fail-closed audit.** The autofill route is owner-only
   (self-asserted profile roles authorize nothing — same rule as board-confidence
   §2 item 4), refuses with 403 until `brag_sheets.consented_at` is set, and no
   result is released unless the `BRAG_AUTOFILL_RUN` audit row inserts (§4.7).
9. **Keyless ⇒ no autofill, never a canned draft.** When `resolveAiModel` returns
   null (no direct endpoint, no gateway auth), the route answers 503 and the UI
   hides the Generate button (GET availability probe, §5.2). There is no
   deterministic fallback draft — a template eval would defeat the grounding model.
10. **DoD ID never reaches the model.** `buildAutofillPayload` deletes
    `brag.admin.dod_id` before serialization (§4.6). PII-sentinel tested.

### 1.3 Domain grounding — brag sheet sections → NAVPERS blocks

Verified against two public mirrors of the traditional Enlisted Evaluation Report
Input Sheet (navywriter.com/brag-sheet.htm, navyevalwriter.com). Mapping targets are
all blocks the repo already validates (`types/navpers.ts`,
`lib/validationEngine.ts` `fieldBlockMap`):

| # | Section | Feeds |
|---|---|---|
| 1 | Admin data | Blocks 1–7, 9 identity fields; `prior_report_end` seeds Block 14 (= day after); `date_of_rate` is advisory context only (no block) |
| 2 | Duties assigned (primary/collateral/watchstanding/TEMADD, unavailable periods) | Block 29B `primary_duties`, Block 29A `primary_duty_abbrev` (≤14 chars) |
| 3 | Job information (scope, equipment, customers, team contributions) | Block 43 raw material; command-level items → Block 28 `command_achievements` |
| 4 | Supervision & leadership (headcounts, budget, instructor, mentoring, retention) | Block 43 scope/opener; retention results inform Block 47 (EVAL only, human-selected) |
| 5 | Individual accomplishments (with optional trait hints) | Block 43 bullets; trait hints route bullets as *substantiation* for Blocks 33–39 marks the human assigns |
| 6 | Qualifications / awards / education (this period) | Block 44 (EVAL) or Block 43 (CHIEFEVAL/FITREP); watch quals also 29B |
| 7 | Off-duty (education, community, Navy PR, civilian employment) | Block 44 / 43 |
| 8 | PRIMS/PFA cycles | Block 20 `physical_readiness` (one letter per cycle, `^[PBFMWN]+$`), cycle notes → 29B |
| 9 | Future goals | Block 41 `career_recommendations` (2 × 20 chars), Block 43 closing line |
| 10 | Counseling record | Blocks 30/31 (`date_counseled` / `counselor` ≤22 chars) — applied deterministically, never AI-written |
| — | Additional ("other items for consideration") | Block 43 |

~80% of brag content funnels into Block 43; the template is therefore a structured
bullet collector, and **no new form blocks are needed** — every target is already
validated by `runFullValidation`.

### 1.4 Authority notes

- **Fit authority is `lib/commentFit.ts`**, period: `checkCommentFit` (Block 43 — 18
  lines max, 90 CPL at 10-pitch / 84 CPL at 12-pitch), `FIELD_FIT`
  (`command_achievements` 91×3, `primary_duties` 91×3 with `firstLineLead: 20`,
  `primary_duties_extended` 91×4, `qualifications` 91×2),
  `getPrimaryDutiesFieldFit(reportType)` (3-line EVAL vs 4-line CHIEFEVAL/FITREP),
  `PRIMARY_DUTY_ABBREV_MAX = 14`. These are the same functions `runFullValidation`
  (validationEngine.ts:195–205, 276–291) and the PDF overlays call — generate-until-
  fit is therefore true WYSIWYG.
- **Known doc conflict (follow-up, not this feature):** the prose in
  `lib/bupersGuidelines.json` `comments.rules` says "16 lines for 10-pitch, 12 lines
  for 12-pitch"; the code authority (`checkCommentFit`) enforces 18 lines at 90/84
  CPL. This spec follows the code. Correcting the JSON rule text is a separate
  one-line follow-up commit.
- Block 41 caps come from `types/navpers.ts`: `CAREER_REC_SLOTS = 2`,
  `CAREER_REC_MAX = 20`; Block 31 `COUNSELOR_MAX = 22`;
  `PROMOTION_RECOMMENDATIONS` is the Block 45 enum.

---

## 2. Data-flow summary

```
brag_sheets (browser CRUD, RLS owner-only)  ← JSON import / PDF+PRIMS extraction (in-memory, never stored)
        │
        │  POST /api/brag-sheet/autofill  (owner-only · consented_at gate · concurrency cap)
        ▼
assembleAutofillRequest [admin client]:
  brag_sheets.data + prior finalized evaluations (created_by = owner, dod_id cross-check)
  + member_board_records.ladr_checklist ⋈ ladr_milestones (applicability-filtered)
        │
        ▼
buildAutofillPayload (budgets from commentFit constants; dod_id stripped; Block 20 precomputed)
        │
        ▼
generateText via resolveAiModel (lib/aiProvider.ts — direct OpenAI-compatible OR gateway; keyless ⇒ 503)
        │
        ▼
pipeline (§7): parse → citation resolution → Block 20 overwrite → fit checks →
overflow retry → runFullValidation dry-run → advisory gating
        │
        ▼
brag_sheets.last_autofill update → audit_logs BRAG_AUTOFILL_RUN (fail-closed) → 200 AutofillResponse
        │
        ▼  (user reviews per block, accepts/edits/rejects)
client apply (§5.3): seed (getEvalSeed/getChiefEvalSeed/getFitrepSeed) + accepted blocks
  → saveDraft(userId, draft)  → evaluations row (status "draft", custody injected by saveDraft)
  → brag_sheets.evaluation_id linked → router.push(/evaluations/<id>)
```

---

## 3. Supabase migration `006_brag_sheet.sql`

Location: `/srv/apex/supabase/migrations/006_brag_sheet.sql` (001–005 exist; 006 is
next). House style per `004_board_confidence.sql`: lowercase SQL, numbered header
comment, idempotent `create table if not exists` / `drop policy if exists`,
`enable row level security` immediately after `create table`, short snake-case
policy names, indexes `idx_<table>_<col>`, `updated_at` touch trigger.

Full DDL (this is the migration, verbatim):

```sql
-- Migration 006: Brag Sheet + AI Auto-Fill
--
-- One table. The ten template sections live in a single jsonb payload (data) —
-- sections version together and nothing queries inside bullets; split columns
-- only if reporting ever needs SQL over bullets (deliberate, see spec §3 notes).
--
-- 006:1  brag_sheets — per-user, per-eval-period brag sheet (RLS owner-only CRUD)
--
-- NORMATIVE (privacy): this feature has NO storage bucket. Uploaded prior-EVAL /
-- PRIMS PDFs are processed in-memory by the extract route and never persisted.
-- Do not add storage DDL here or in any later migration for this feature.

-- 1. Brag sheets ---------------------------------------------------------------
create table if not exists public.brag_sheets (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) not null,
    evaluation_id uuid references public.evaluations(id),  -- set once applied to a draft
    report_type text not null check (report_type in ('EVAL','CHIEFEVAL','FITREP')),
    period_from date not null,                              -- feeds Block 14
    period_to date not null,                                -- feeds Block 15
    template_version text not null default '1.0',           -- BRAG_SHEET_VERSION
    data jsonb not null default '{}'::jsonb,                -- BragSheetData (spec §4.2, the v1.0 template)
    status text not null default 'draft'
        check (status in ('draft','submitted')),
    -- AI-use consent (first-use modal, spec §6); the autofill route refuses 403
    -- while null. Declining keeps the brag sheet fully usable — only AI drafting
    -- is disabled.
    consented_at timestamptz,
    -- Most recent AutofillResponse (spec §4.2) — the reviewed-before-apply
    -- proposal. Written only by the service-role autofill route; nulled by the
    -- fail-closed audit compensation (spec §4.7). Never applied automatically.
    last_autofill jsonb,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create index if not exists idx_brag_sheets_user
    on public.brag_sheets (user_id);

create or replace function public.touch_brag_sheet()
returns trigger as $$
begin
    new.updated_at := now();
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_touch_brag_sheet on public.brag_sheets;
create trigger trg_touch_brag_sheet
    before update on public.brag_sheets
    for each row execute function public.touch_brag_sheet();

alter table public.brag_sheets enable row level security;

drop policy if exists brag_select_own on public.brag_sheets;
create policy brag_select_own on public.brag_sheets
    for select to authenticated using (user_id = auth.uid());

drop policy if exists brag_insert_own on public.brag_sheets;
create policy brag_insert_own on public.brag_sheets
    for insert to authenticated with check (user_id = auth.uid());

drop policy if exists brag_update_own on public.brag_sheets;
create policy brag_update_own on public.brag_sheets
    for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists brag_delete_own on public.brag_sheets;
create policy brag_delete_own on public.brag_sheets
    for delete to authenticated using (user_id = auth.uid());
```

Notes:

- `user_id` is **not** unique — one row per eval period; a user accumulates one
  brag sheet per reporting cycle. The UI lists them newest-first.
- `template_version` realizes the design template's `version` field; the column
  (and the `BragSheet` TS mirror, §4.2) use the name `template_version` to avoid
  ambiguity with model/app versions. This is the single deliberate rename from the
  v1.0 design template; the `data` payload shapes are verbatim.
- `last_autofill` is written **only** by the service-role route (browser writes go
  through RLS `brag_update_own`, which technically permits the owner to write it
  too — harmless: it is a scratch proposal, never trusted for apply provenance;
  the audit log is the provenance record, §1.1).
- `audit_logs.evaluation_id` is already nullable (001:122), so `BRAG_AUTOFILL_RUN`
  inserts with `evaluation_id: null` — no audit-table change needed.
- No storage migration exists for this feature (invariant §1.2 item 1).

---

## 4. Module layout

```
lib/aiProvider.ts        -- SHARED provider resolution (extracted from boardConfidence/narrative.ts, §4.1)
lib/bragSheet/
  types.ts               -- template v1.0 shapes + autofill I/O contract (verbatim, §4.2)
  template.ts            -- section metadata + empty-payload factory (§4.3)
  pdf.ts                 -- branded from-scratch pdf-lib document (§4.4)
  extract.ts             -- in-memory PDF text extraction + heuristic suggestions (§4.5)
  autofill.ts            -- system prompt (verbatim) + payload + model call + pipeline (§4.6)
  service.ts             -- server-side assembly + persistence + fail-closed audit (§4.7)
lib/bragSheetService.ts  -- browser service (repo lib/*Service.ts pattern, §4.8)
```

Import-safety rule (same as board-confidence §4): no `lib/bragSheet/*` file may
import `next/*` or `lib/supabaseClient` at module top level except that
`service.ts` *accepts* a `SupabaseClient` parameter — it never creates one. `pdf.ts`
and `extract.ts` must be Node-and-browser safe (no `fs`, no `fetch` inside; bytes
are parameters).

### 4.1 `lib/aiProvider.ts` — shared provider resolution (refactor of narrative.ts)

Extract **only the model resolution** from `lib/boardConfidence/narrative.ts`
(currently inline at narrative.ts:219–247) into a shared module; `narrative.ts`
keeps its `generateText` call, `fallbackNarrative`, `NarrativeSchema`,
`DEFAULT_NARRATIVE_MODEL`, `narrativeModelId`, `NARRATIVE_SYSTEM_PROMPT`, and
`generateNarrative` exports unchanged (public API untouched).

```ts
// lib/aiProvider.ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export interface AiEnvConfig {
  baseUrlVar: string;   // e.g. "BOARD_NARRATIVE_BASE_URL"
  apiKeyVar: string;    // e.g. "BOARD_NARRATIVE_API_KEY"
  modelVar: string;     // e.g. "BOARD_NARRATIVE_MODEL"
  name: string;         // provider instance name for createOpenAICompatible
}

export interface ResolvedAiModel {
  model: string | LanguageModel;  // gateway ⇒ "provider/model" STRING; direct ⇒ model OBJECT
  modelId: string;                // the id actually used (persisted/audited)
  mode: "direct" | "gateway";
}

/** null = keyless (no direct baseURL AND no gateway auth) — caller decides fallback/503. */
export function resolveAiModel(env: AiEnvConfig, defaultModel: string): ResolvedAiModel | null;
```

Behavioral contract (each clause is pinned by the existing 12 tests in
`tests/unit/boardConfidenceNarrative.test.ts`, which mutate env per test and assert
model string-vs-object shape — they MUST stay green without edits):

1. **Env read at call time**, never at module load:
   `const modelId = process.env[env.modelVar] || defaultModel;`.
2. **Direct wins over gateway.** If `process.env[env.baseUrlVar]` is set, return
   `{ model: createOpenAICompatible({ name: env.name, baseURL, apiKey:
   process.env[env.apiKeyVar], supportsStructuredOutputs: true })(modelId),
   modelId, mode: "direct" }` — an **object** (tests assert `typeof args.model ===
   "object"` and `args.model.modelId`).
3. Else if `process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN`,
   return `{ model: modelId, modelId, mode: "gateway" }` — a **string**.
4. Else return `null` (keyless).

`narrative.ts` change (the entire diff): replace its inline
`directBaseUrl`/`hasGatewayAuth`/`createOpenAICompatible` logic with

```ts
const resolved = resolveAiModel(
  { baseUrlVar: "BOARD_NARRATIVE_BASE_URL", apiKeyVar: "BOARD_NARRATIVE_API_KEY",
    modelVar: "BOARD_NARRATIVE_MODEL", name: "board-narrative" },
  DEFAULT_NARRATIVE_MODEL,
);
if (!resolved) return fallbackOutcome("no_key");
// ... generateText({ model: resolved.model, ... }); success ⇒ model: resolved.modelId
```

and delete the now-unused `createOpenAICompatible` import. Safe because the tests
mock the `"ai"` module only — never `@ai-sdk/openai-compatible` or narrative
internals.

**Brag-sheet reuses the same env vars** (one config surface — a server that has AI
configured for board-confidence has it for brag autofill, and vice versa):

```ts
// lib/bragSheet/autofill.ts
export const BRAG_AI_ENV: AiEnvConfig = {
  baseUrlVar: "BOARD_NARRATIVE_BASE_URL",
  apiKeyVar: "BOARD_NARRATIVE_API_KEY",
  modelVar: "BOARD_NARRATIVE_MODEL",
  name: "brag-autofill",
};
// default model: DEFAULT_NARRATIVE_MODEL from lib/boardConfidence/narrative.ts
// ("anthropic/claude-opus-4.8") — imported, not duplicated.
```

### 4.2 `lib/bragSheet/types.ts` — template v1.0 + autofill contract (verbatim)

Both design blocks live in this one file (the design drafted them as
`types/bragSheet.ts` + `types/bragAutofill.ts`; this spec colocates them under
`lib/bragSheet/` per the module layout — shapes unchanged except the
`template_version` rename noted in §3 and the two DB columns added to the row
mirror). Every interface below is exported. Zod mirrors (§4.6) are named
`<Interface>Schema`.

```ts
// lib/bragSheet/types.ts — APEX Brag Sheet v1.0
// One JSONB payload (brag_sheets.data). snake_case mirrors the repo's DB-JSONB
// convention (types/index.ts, lib/boardConfidence/types.ts). Every field is
// annotated "feeds:" with the NAVPERS block it supplies. Block numbers use the
// enlisted 1616/26 numbering the whole repo keys on (comments = "Block 43" etc.);
// on CHIEFEVAL/FITREP the same *field names* land on Block 40/41 — the aliasing
// lives in lib/bupersGuidelines.json, not here.
// Reuses: PRIMARY_DUTY_ABBREV_MAX, CAREER_REC_MAX/SLOTS, COUNSELOR_MAX
// (types/navpers.ts via lib/commentFit.ts); LadrCategory/LadrStatus
// (lib/boardConfidence/types.ts).

import type { LadrCategory, LadrStatus } from "@/lib/boardConfidence/types";
import type { CommentFitResult } from "@/lib/commentFit";
import type { ValidationResult } from "@/types";
import { PROMOTION_RECOMMENDATIONS } from "@/types/navpers";

export const BRAG_SHEET_VERSION = "1.0" as const;

export const BRAG_AI_DISCLAIMER = "UNOFFICIAL DRAFTING AID. ..."; // §1.1 text, verbatim
export const BRAG_PDF_FOOTER = "APEX Brag Sheet v1.0 — Powered by APEX ..."; // §1.1 text, verbatim

/** DB row (table: brag_sheets). data is the JSONB template payload below. */
export interface BragSheet {
  id?: string;
  user_id: string;
  evaluation_id?: string | null;        // set once linked to a draft Evaluation
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  period_from: string;                  // ISO — feeds Block 14
  period_to: string;                    // ISO — feeds Block 15
  template_version: typeof BRAG_SHEET_VERSION;
  data: BragSheetData;                  // JSONB
  status: "draft" | "submitted";
  consented_at?: string | null;         // AI-use consent timestamp (autofill 403 gate)
  last_autofill?: AutofillResponse | null; // most recent proposal (service-role write)
  created_at?: string;
  updated_at?: string;
}

export interface BragSheetData {
  admin: BragAdmin;
  duties: BragDuty[];                   // repeating rows
  job: BragJob;
  leadership: BragLeadership;
  accomplishments: BragAccomplishment[];// repeating rows
  qualifications: BragQualifications;
  off_duty: BragOffDuty;
  pfa: BragPfaCycle[];                  // repeating rows, oldest → newest
  goals: BragGoals;
  counseling: BragCounseling;
  additional: string;                   // "other items for consideration" — feeds Block 43
}

/** Section 1 — ADMIN. Prefilled from Profile + prior eval where possible; all editable. */
export interface BragAdmin {
  member_name?: string;                 // feeds Block 1 (LAST, FIRST MI)
  grade_rate?: string;                  // feeds Block 2
  designator?: string;                  // feeds Block 3 (warfare quals / 4-digit officer desig)
  dod_id?: string;                      // feeds Block 4 (10-digit DoD ID — APEX PII policy)
  duty_status?: "ACT" | "TAR" | "INACT" | "AT/ADOS"; // feeds Block 5
  uic?: string;                         // feeds Block 6
  ship_station?: string;                // feeds Block 7
  date_reported?: string;               // ISO — feeds Block 9
  prior_report_end?: string;            // ISO — Block 14 must be the day after (period seed)
  date_of_rate?: string;                // ISO — no block; advancement-eligibility context for
                                        // the Block 45 promotion ADVISORY only
  periods_unavailable: { start: string; end: string; reason: string }[];
                                        // feeds Block 29B "periods not available for duty"
}

/** One accomplishment bullet — the atomic unit the auto-fill cites. */
export interface BragBullet {
  text: string;                         // what happened (action + result, member's words)
  metrics?: string;                     // quantified impact: "$1.2M", "12 Sailors", "98.2% uptime"
                                        // absent metrics ⇒ auto-fill emits a missing-info flag
}

/** Section 2 — DUTIES (repeating). */
export interface BragDuty {
  title: string;                        // feeds Block 29B "TITLE-<months>" list
  kind: "primary" | "collateral" | "watchstanding" | "temadd";
                                        // orders Block 29B: primary → collateral → watchstanding;
                                        // temadd rows feed the 29B TEMADD/where-when-why note
  months_assigned: number;              // feeds Block 29B months suffix
  is_most_significant?: boolean;        // exactly one primary row — leads Block 29B, names 29A
  abbrev?: string;                      // ≤14 chars (PRIMARY_DUTY_ABBREV_MAX) — feeds Block 29A
  bullets: BragBullet[];                // per-duty accomplishments — feed Block 43
}

/** Section 3 — JOB INFORMATION. */
export interface BragJob {
  responsibilities: string;             // principal activities/scope — feeds Block 43 opener and
                                        // the optional Block 29B job-scope statement
  equipment: string[];                  // equipment operated/qualified on — feeds Block 43; Block 44
  customers: string;                    // customers/commands served — feeds Block 43
  classified_material?: string;         // responsibility level (unclassified wording) — Block 43
  team_contributions: BragBullet[];     // contributions to team/command results — feed Block 43;
                                        // command-level items (deployments, unit awards) feed Block 28
}

/** Section 4 — SUPERVISION & LEADERSHIP. */
export interface BragLeadership {
  supervised_military: number;          // feeds Block 43 scope line ("LED 14 SAILORS...")
  supervised_civilian: number;          // feeds Block 43
  supervised_via_subordinates: number;  // feeds Block 43
  equipment_value?: string;             // "$" figure of gear responsible for — feeds Block 43
  budget_managed?: string;              // feeds Block 43
  instructor_roles: BragBullet[];       // feeds Block 43 (instructor performance)
  mentoring: BragBullet[];              // counseling/mentoring given — feeds Block 43; substantiates
                                        // CHIEFEVAL human_development / EVAL leadership traits
  retention_efforts: BragBullet[];      // feeds Block 43; results inform Block 47 retention (EVAL only)
}

/** Section 5 — INDIVIDUAL ACCOMPLISHMENTS (repeating), not tied to a single duty. */
export interface BragAccomplishment extends BragBullet {
  trait_hint?: string;                  // optional key from the active form's trait set
                                        // (TRAIT_KEYS / CHIEFEVAL_TRAIT_KEYS / FITREP_TRAIT_KEYS,
                                        // types/navpers.ts) — routes the bullet as SUBSTANTIATION
                                        // for that trait in Block 43. Never generates a grade.
                                        // NOTE: TRAIT_KEYS (types/navpers.ts:11) is currently
                                        // module-private; this feature adds `export` to it (§11).
                                        // Do NOT substitute lib/traitAverage.ts TRAIT_KEYS — that
                                        // is a cross-form superset (enlisted+CPO+officer), wrong
                                        // for the EVAL trait-hint select.
}

/** Section 6 — QUALIFICATIONS / AWARDS / EDUCATION (completed THIS period only). */
export interface BragQualifications {
  quals: { title: string; date: string }[];       // warfare/watch/rate quals — feed Block 44
                                                  // (EVAL) or Block 43 (CHIEFEVAL/FITREP);
                                                  // watch quals also feed Block 29B
  education: { title: string; date: string; credit_hours?: number }[];
                                                  // courses/degrees/certs — feed Block 44 / 43
  awards: { title: string; date: string }[];      // personal awards, LOC/LOA — feed Block 44 / 43
}

/** Section 7 — OFF-DUTY. */
export interface BragOffDuty {
  education: BragBullet[];              // off-duty education — feeds Block 44 / 43
  community: BragBullet[];              // volunteer/civic — feeds Block 44 / 43
  navy_pr: BragBullet[];                // voluntary Navy public relations — feeds Block 43
  civilian_employment?: string;         // reservists — feeds Block 43 context
}

/** Section 8 — PRIMS/PFA (repeating, oldest → newest).
 *  Deterministic collapse: data.pfa.map(c => c.result).join("") === Block 20
 *  physical_readiness (schema regex ^[PBFMWN]+$, types/navpers.ts). Never model-generated. */
export interface BragPfaCycle {
  cycle: string;                        // "25-1" — feeds the Block 29B cycle note
  result: "P" | "B" | "F" | "M" | "W" | "N"; // feeds Block 20 (one letter per cycle, in order)
  prt_category?: "Outstanding" | "Excellent" | "Good" | "Satisfactory" | "Probationary";
  prt_score?: number;                   // feed the Block 29B note ("25-1:P/PRT OUTSTANDING/95")
  bca?: "within" | "not_within" | "waived";
  medically_waived?: boolean;
  notes?: string;                       // Bad Day / alternate cardio — feeds Block 29B note;
                                        // a "B" result REQUIRES a Block 29 comment (10.10H)
}

/** Section 9 — FUTURE GOALS. */
export interface BragGoals {
  career_recommendations: string[];     // ≤CAREER_REC_SLOTS (2) entries, ≤CAREER_REC_MAX (20)
                                        // chars each — feed Block 41 verbatim
  desired_duties: string;               // desired next duties/schools — raw material for Block 41
                                        // and the Block 43 closing line
  goals_statement?: string;             // long-term goals — advisory context only, no block
}

/** Section 10 — COUNSELING RECORD. */
export interface BragCounseling {
  date_counseled?: string;              // ISO date | "NOT REQ" | "NOT PERF" — feeds Block 30
  counselor?: string;                   // ≤COUNSELOR_MAX (22) chars — feeds Block 31
}

// ── AI auto-fill I/O contract (route: POST /api/brag-sheet/autofill) ─────────
// All shapes Zod-mirrored (repo convention); model output is parsed with Zod's
// default strip semantics — unknown keys (especially trait_grades) are discarded.

// ── INPUT ────────────────────────────────────────────────────────────────────
export interface AutofillRequest {
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  period_from: string;                   // ISO — the eval period being drafted
  period_to: string;
  pitch: "10" | "12";                    // Block 43 Courier pitch: 90 or 84 CPL (checkCommentFit)
  brag: BragSheetData;                   // the full brag sheet payload (see template)
  prior_evals: PriorEvalSummary[];       // continuity + Block 44 dedupe source
  ladr: LadrMilestoneStatus[];           // member's LaDR checklist status
}

export interface PriorEvalSummary {
  period_to: string;                     // ISO — citation key: prior_evals[<period_to>]
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  promotion_recommendation: string;      // Block 45 history — advisory trend input
  trait_average: number | null;
  comments: string;                      // full prior Block 43 (context/continuity, never copied)
  qualifications?: string;               // prior Block 44 — "do not repeat" dedupe source
  primary_duties?: string;               // prior Block 29B — duty-continuity context
}

export interface LadrMilestoneStatus {   // from member_board_records.ladr_checklist joined to
  milestone_id: string;                  // ladr_milestones (lib/boardConfidence/types.ts)
  category: LadrCategory;                // citation key: ladr.<category>[<milestone_id>]
  item: string;                          // milestone text, e.g. "ESWS qualification"
  status: LadrStatus;                    // met | not_met | na | unanswered
}

// Server-computed, appended to the model payload (NOT client input). Single source
// of truth: derived from lib/commentFit.ts constants so prompt and validator
// cannot drift.
//   comments:        { chars_per_line: pitch==="10"?90:84, max_lines: 18, target_lines: 17 }
//   primary_duties:  getPrimaryDutiesFieldFit(report_type)  → 91 CPL × 3 (EVAL) / 4
//                    (CHIEFEVAL/FITREP), first_line_lead: 20
//   primary_duty_abbrev: { max_chars: PRIMARY_DUTY_ABBREV_MAX }        // 14
//   command_achievements: FIELD_FIT.command_achievements               // 91 × 3
//   qualifications:  FIELD_FIT.qualifications (EVAL only)              // 91 × 2
//   career_recommendations: { slots: CAREER_REC_SLOTS, max_chars: CAREER_REC_MAX } // 2 × 20
// Plus: physical_readiness (string) = brag.pfa.map(c => c.result).join("") — computed
// server-side, echoed by the model, re-asserted by the server after generation.

// ── OUTPUT (what the model must emit; what the route returns after validation) ─
export interface GeneratedItem {
  text: string;                          // one bullet/segment of the block
  sources: string[];                     // ≥1 citation, JSON paths into AutofillRequest:
                                         //   "brag.duties[2].bullets[0]"
                                         //   "brag.leadership.retention_efforts[1].metrics"
                                         //   "prior_evals[2025-03-15].comments"
                                         //   "ladr.qual_warfare[<milestone_id>]"
}

export interface GeneratedBlock {
  text: string;                          // full block text, ready for the form field
  items: GeneratedItem[];                // per-segment provenance; concatenation ≈ text
}

export interface MissingInfoFlag {
  block: 20 | 28 | 29 | 30 | 41 | 43 | 44 | 45;
  field: string | null;                  // request path the gap concerns, e.g. "brag.duties[0].bullets[1].metrics"
  message: string;                       // "Bullet has no quantified metric — written without numbers; add one for board impact"
}

export interface PromotionAdvisory {
  advisory_only: true;                   // literal true — UI must render the disclaimer and
                                         // NEVER write recommendation into the Evaluation
  recommendation: (typeof PROMOTION_RECOMMENDATIONS)[number];
  rationale: string;                     // evidence-based, cites its sources
  sources: string[];                     // same citation grammar
}

export interface AutofillModelOutput {   // exactly what the model emits (Zod parse, §4.6)
  blocks: {
    comments: GeneratedBlock;                              // → Evaluation.comments (Block 43)
    primary_duty_abbrev: GeneratedBlock;                   // → block_values.primary_duty_abbrev (29A)
    primary_duties: GeneratedBlock;                        // → block_values.primary_duties (29B)
    command_achievements: GeneratedBlock;                  // → block_values.command_achievements (28)
    qualifications?: GeneratedBlock;                       // → block_values.qualifications (44) — EVAL only
    career_recommendations: GeneratedBlock & { entries: string[] }; // → Evaluation.career_recommendations (41)
    physical_readiness: GeneratedBlock;                    // → block_values.physical_readiness (20) — echo only
  };
  missing_info: MissingInfoFlag[];
  promotion_advisory: PromotionAdvisory;
  // trait_grades: intentionally ABSENT from the schema. The parse strips any the
  // model emits. Trait grading is human judgment — Blocks 33–39 are never generated.
}

export interface BlockFitReport {        // per narrative block, attached by the server
  fit: CommentFitResult;                 // from checkCommentFit / measureTextFit
  overflow: boolean;                     // !fit.fit — NEVER silently truncated
  truncation_preview: string | null;     // overflow only: wrappedLines.slice(0, maxLines).join("\n")
  dropped_lines: string[];               // overflow only: wrappedLines.slice(maxLines)
}

export interface AutofillResponse extends AutofillModelOutput {
  fit_reports: {                         // keys mirror blocks
    comments: BlockFitReport;
    primary_duty_abbrev: BlockFitReport; // 29A — measureTextFit(text, 14, 1), §7 step 4;
                                         // without this slot an over-limit abbrev could be
                                         // accepted past the §5.3/§6 no-overflow apply gate
    primary_duties: BlockFitReport;
    command_achievements: BlockFitReport;
    qualifications?: BlockFitReport;
  };
  citation_failures: { block: string; text: string; bad_sources: string[] }[];
                                         // items stripped because a source path did not resolve
  dry_run: ValidationResult;             // runFullValidation() over the merged draft
  model: string | null;                  // resolved model id (aiProvider convention)
}
```

### 4.3 `lib/bragSheet/template.ts` — section metadata + empty factory

```ts
import type { BragSheetData } from "./types";

export interface BragSectionMeta {
  key: keyof BragSheetData;
  title: string;          // section heading, UI + PDF
  blurb: string;          // one-line helper shown under the heading
  feeds: string;          // "Blocks 1–9", "Block 29A/29B", "Block 43", ...
}

/** Ordered exactly as rendered (UI accordion and PDF). */
export const BRAG_SECTIONS: BragSectionMeta[] = [
  { key: "admin",           title: "Admin Data",                    blurb: "Who you are and the reporting period.",                          feeds: "Blocks 1–9, 14/15" },
  { key: "duties",          title: "Duties Assigned",               blurb: "Primary, collateral, watchstanding, TEMADD — with months.",      feeds: "Blocks 29A/29B" },
  { key: "job",             title: "Job Information",               blurb: "Scope, equipment, customers, team results.",                     feeds: "Blocks 43, 28" },
  { key: "leadership",      title: "Supervision & Leadership",      blurb: "Headcounts, budget, instruction, mentoring, retention.",         feeds: "Block 43" },
  { key: "accomplishments", title: "Individual Accomplishments",    blurb: "Action — impact — result, with numbers.",                        feeds: "Block 43" },
  { key: "qualifications",  title: "Qualifications, Awards & Education", blurb: "Completed THIS period only.",                               feeds: "Blocks 44, 43" },
  { key: "off_duty",        title: "Off-Duty",                      blurb: "Education, community, Navy PR, civilian employment.",            feeds: "Blocks 44, 43" },
  { key: "pfa",             title: "Physical Readiness (PRIMS)",    blurb: "One row per PFA cycle in the period, oldest first.",             feeds: "Blocks 20, 29B" },
  { key: "goals",           title: "Future Goals",                  blurb: "Desired duties and schools; two Block 41 slots, 20 chars each.", feeds: "Blocks 41, 43" },
  { key: "counseling",      title: "Counseling Record",             blurb: "Mid-term counseling date and counselor.",                        feeds: "Blocks 30/31" },
  { key: "additional",      title: "Other Items for Consideration", blurb: "Anything else the reporting senior should know.",                feeds: "Block 43" },
];

/** Fully-populated empty payload: every array [], every counter 0, every string "". */
export function emptyBragSheetData(): BragSheetData {
  return {
    admin: { periods_unavailable: [] },
    duties: [],
    job: { responsibilities: "", equipment: [], customers: "", team_contributions: [] },
    leadership: {
      supervised_military: 0, supervised_civilian: 0, supervised_via_subordinates: 0,
      instructor_roles: [], mentoring: [], retention_efforts: [],
    },
    accomplishments: [],
    qualifications: { quals: [], education: [], awards: [] },
    off_duty: { education: [], community: [], navy_pr: [] },
    pfa: [],
    goals: { career_recommendations: [], desired_duties: "" },
    counseling: {},
    additional: "",
  };
}

/** Deterministic Block 20 collapse — the ONLY producer of physical_readiness. */
export function collapsePfa(data: BragSheetData): string {
  return data.pfa.map((c) => c.result).join("");
}
```

`emptyBragSheetData()` must satisfy `BragSheetDataSchema` (§4.6) — pinned by test.

### 4.4 `lib/bragSheet/pdf.ts` — branded PDF (new from-scratch pattern)

The repo's three PDF generators all overlay official blanks
(`PDFDocument.load(template)`); this is the first `PDFDocument.create()` document.
It lifts `lib/pdfOverlay.ts`'s exact primitives: fontkit registration + Courier
Prime embed with `StandardFonts.Courier` fallback (pdfOverlay.ts:262–273),
`wrapTextToWidth` for all body wrapping, `StandardFonts.HelveticaBold` for
headings.

```ts
export interface BragPdfFonts { courierPrime?: Uint8Array }   // caller supplies bytes; no fs/fetch here

export async function generateBragSheetPdf(
  sheet: BragSheet,
  fonts?: BragPdfFonts,
): Promise<Uint8Array>;
```

Isomorphic: runs in the browser (download button fetches
`/fonts/CourierPrime-Regular.ttf` and passes bytes) and in tests (bytes via
`fs.readFileSync` from `public/fonts/`). No route is needed — the PDF is generated
client-side (ponytail: server route only if a share/print server flow ever appears).

Layout constants (normative):

| Constant | Value |
|---|---|
| Page | US Letter, 612 × 792 pt, bottom-left origin |
| `MARGIN` | 36 pt all sides |
| `CONTENT_W` | 540 pt |
| `FOOTER_RESERVE` | 24 pt (footer floor; content never enters it) |
| Title | HelveticaBold 16, "APEX BRAG SHEET" |
| Identity line | Courier 9: `<member_name> · <grade_rate> · <period_from> – <period_to>` |
| Section bar | filled rect `rgb(0.12, 0.16, 0.24)` height 16, HelveticaBold 10 white text, 6 pt left pad; 22 pt vertical advance |
| Section blurb | Helvetica 7.5, `rgb(0.45, 0.45, 0.45)`, one line, from `BRAG_SECTIONS.blurb` + " → " + `feeds` |
| Field label | Helvetica 7.5 `rgb(0.35,0.35,0.35)`, UPPERCASE |
| Field value / bullet body | Courier 9, line height 11 |
| Bullet prefix | `"- "` with 12 pt hanging indent; metrics appended as ` [<metrics>]`; `trait_hint` appended as ` (<trait_hint>)` |
| Body CPL | `Math.floor(availableWidth / (9 * 0.6))` — Courier advance = 0.6 em; full width ⇒ 100 CPL |
| Footer (every page) | Helvetica 7 `rgb(0.5,0.5,0.5)`: `BRAG_PDF_FOOTER` centered + `Page <n> of <m>` right-aligned at `y = 14` |

Rendering algorithm:

1. `pdf.setTitle("APEX Brag Sheet v1.0 – Powered by APEX")`;
   `pdf.setProducer("APEX")`.
2. Page 1 header: title, identity line, `report_type` + `template_version` chip
   line (Courier 8), horizontal rule (`drawLine`, 0.5 pt, `rgb(0.7,0.7,0.7)`).
3. For each `BRAG_SECTIONS` entry in order: section bar → blurb → rows. Row
   renderers per section shape: scalar fields as label/value pairs (two per line
   when both fit 260 pt columns); repeating rows (`duties`, `accomplishments`,
   `pfa`, quals/education/awards, `periods_unavailable`) as bullet lines. Empty
   sections render the bar + one Courier 8 gray line `"— none entered —"` (the
   printed sheet doubles as the blank worksheet).
4. Pagination: before drawing any line, if `y - lineHeight < MARGIN +
   FOOTER_RESERVE`, `pdf.addPage()` and reset `y = 792 - MARGIN`.
5. Footer pass after content: iterate `pdf.getPages()` and stamp the footer with
   final page count.
6. `return pdf.save()`.

PFA rows print as `"- <cycle>: <result>  PRT <prt_category ?? "—"> <prt_score ?? "">  BCA <bca ?? "—">"`
plus notes; the collapsed Block 20 string (`collapsePfa`) prints as a labeled value
`"BLOCK 20 CODE: <string>"` at the section top.

### 4.5 `lib/bragSheet/extract.ts` — in-memory PDF extraction + suggestions

Dependency: `unpdf` `^1.6.2` (already in `package.json`) — the Nuxt-team serverless
repackaging of pdf.js: zero runtime deps, ESM, no worker config, runs in Node route
handlers. Proven against this repo's own overlay output: a generated FITREP
(fitrepOverlay on `public/fitrepBlank.pdf`) round-trips both the printed template
labels **and** the overlay-drawn values. Do **not** use `pdf-parse` (module-scope
debug code crashes under Next bundling) or raw `pdfjs-dist` (legacy build + worker
+ canvas polyfills).

```ts
import { extractText, getDocumentProxy } from "unpdf";

/** Whole-document text, merged pages. In-memory only. Throws on encrypted/unparseable input. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: true });
  return text;
}

export interface BragExtractSuggestions {
  kind: "prior_eval" | "prims" | "unknown";
  admin: Partial<BragAdmin>;            // member_name, ship_station, prior_report_end, date_reported
  duties: Pick<BragDuty, "title" | "kind" | "months_assigned" | "is_most_significant">[];
  quals: BragQualifications["quals"];
  pfa: BragPfaCycle[];
  bullets: string[];                    // candidate Block 43 accomplishment lines
  chars_extracted: number;              // diagnostics; 0 ⇒ route answers 422
}

export function suggestFromText(text: string): BragExtractSuggestions;
```

`suggestFromText` heuristics (normative; precision over recall — every suggestion
requires an explicit user Accept in the UI, §6, so a missed field costs nothing and
a wrong one is one click to ignore):

1. **Kind detection** — `prims` when `/\b\d{2}-[12]\b/` matches AND any of
   `OUTSTANDING|EXCELLENT|GOOD|SATISFACTORY|PROBATIONARY` appears (case-insensitive);
   `prior_eval` when the text contains `EVALUATION REPORT` or `FITNESS REPORT` or
   `CHIEFEVAL`; else `unknown` (still returns bullets).
2. **member_name** — first match of
   `/\b([A-Z][A-Z'-]{1,29}),\s([A-Z][A-Z'-]{1,29})(\s[A-Z])?\b/` → joined as
   matched (the repo's `"LAST, FIRST M"` convention).
3. **ship_station** — first match of `/\bUSS\s+[A-Z][A-Z0-9 -]{2,30}\b/` trimmed.
4. **Dates** — all `/\b(20\d{2}-\d{2}-\d{2})\b/g` matches sorted ascending; when
   `kind === "prior_eval"`, the latest becomes `admin.prior_report_end` (the new
   Block 14 is the day after) and the earliest becomes `admin.date_reported`
   candidate only if the label `Date Reported` appears within 40 chars before it.
5. **Duties** — every match of `/\b([A-Z][A-Z0-9 /&-]{2,40}?)-(\d{1,2})\b/g`
   (title–months pairs from a prior Block 29B); first match gets
   `kind: "primary", is_most_significant: true`, the rest `kind: "collateral"`.
6. **PFA cycles** — matches of `/\b(\d{2}-[12])\b[^A-Za-z0-9]{0,3}([PBFMWN])\b/g` →
   `{ cycle, result }`; a following category word within 30 chars fills
   `prt_category` (title-cased).
7. **Quals** — for each match of
   `/\b(ESWS|EIWS|EAWS|SCW|IW|SW|AW|PQS|NEC\s?\d{3,4}[A-Z]?)\b/g`, capture the
   surrounding phrase (up to 60 chars, trimmed at word boundaries) as `title`,
   `date: ""` (user fills in).
8. **Bullets** — lines (split on `/\n|(?=\s-\s)/`) matching `/^\s*-\s+(.{20,})/`,
   trimmed, deduplicated, capped at 40 entries.

Never merges into a brag sheet itself — returns suggestions; merging is a UI
action.

### 4.6 `lib/bragSheet/autofill.ts` — prompt, payload, model call, pipeline

Exports:

```ts
export const AUTOFILL_SYSTEM_PROMPT: string;                    // verbatim below
export const BRAG_AI_ENV: AiEnvConfig;                          // §4.1
export const AUTOFILL_TIMEOUT_MS = 60_000;
export const COMMENTS_MAX_LINES = 18;                           // = checkCommentFit cap
export const COMMENTS_TARGET_LINES = 17;

export const BragSheetDataSchema: z.ZodType<BragSheetData>;     // JSON re-import + row validation
export const AutofillModelOutputSchema: z.ZodType<AutofillModelOutput>;

export interface AutofillBudgets { /* the budgets object, shapes per §4.2 comment */ }
export function computeBudgets(reportType: AutofillRequest["report_type"], pitch: "10" | "12"): AutofillBudgets;

/** Model payload: { report_type, period_from, period_to, pitch, budgets,
 *  physical_readiness, brag, prior_evals, ladr }. NORMATIVE: deletes
 *  brag.admin.dod_id from the copy before returning (§1.2 item 10). */
export function buildAutofillPayload(req: AutofillRequest): Record<string, unknown>;

/** Resolve one citation path against the request. Grammar below. */
export function resolveCitation(path: string, req: AutofillRequest): boolean;

/** Full pipeline (§7). Throws AutofillModelError (→ route 502) after a failed
 *  parse retry; never throws for overflow or citation failures. */
export function runAutofill(
  req: AutofillRequest,
  callModel: (prompt: string) => Promise<unknown>,   // injected — unit-testable without "ai" mocks
): Promise<Omit<AutofillResponse, "model">>;

/** The generateText wrapper (model-call contract below). service.ts builds the
 *  callModel it injects into runAutofill with this. Exported so the §9.5
 *  call-shape test can drive it directly with "ai" mocked — runAutofill itself
 *  never calls generateText. */
export function buildCallModel(resolved: ResolvedAiModel): (prompt: string) => Promise<unknown>;
```

**Parse rule (normative resolution of "strict"):** `AutofillModelOutputSchema` uses
Zod object **default strip semantics** — unknown keys anywhere in the tree
(`trait_grades` above all) are silently discarded, never a parse failure. "Strict"
in this spec means required keys, types, and enums are enforced
(`promotion_advisory.advisory_only: z.literal(true)`,
`recommendation: z.enum(PROMOTION_RECOMMENDATIONS)`,
`MissingInfoFlag.block: z.union of the eight literals`,
`GeneratedItem.sources: z.array(z.string()).min(1)`). A model that emits a trait
grade loses it silently; a model that omits `blocks.comments` fails the parse and
triggers the one retry.

**Citation grammar** (resolved by `resolveCitation`):

- `brag.<dotted path with [n] indices>` — walked segment-by-segment against
  `req.brag`; resolves iff the terminal value is defined and non-empty (`""`,
  `[]`, `undefined` do not resolve). `brag.admin.dod_id` never resolves (stripped
  from the payload).
- `prior_evals[<period_to>]` optionally followed by
  `.comments|.qualifications|.primary_duties|.promotion_recommendation|.trait_average`
  — resolves iff a summary with that exact `period_to` exists (and the field is
  non-empty when named).
- `ladr.<category>[<milestone_id>]` — resolves iff a `LadrMilestoneStatus` with
  that `category` and `milestone_id` exists.
- Anything else: unresolvable.

**Model call** (`buildCallModel(resolved)` returns this wrapper; the service
injects it into `runAutofill` — keeps the pipeline pure):

```ts
const resolved = resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL);
if (!resolved) /* route answers 503 — no model call, no fallback draft */;
const { output } = await generateText({
  model: resolved.model,
  maxRetries: 1,
  abortSignal: AbortSignal.timeout(AUTOFILL_TIMEOUT_MS),
  system: AUTOFILL_SYSTEM_PROMPT,
  prompt: JSON.stringify(payload),
  output: Output.object({ schema: AutofillModelOutputSchema }),
});
```

No sampling parameters are ever sent (`temperature`/`top_p`/`top_k` absent — repo
convention, tested). Pipeline retries (parse retry, overflow retry — §7 steps 1
and 5) re-call with `prompt = JSON.stringify({ ...payload, retry_feedback:
[<concrete strings>] })`. Total model calls per run ≤ 3 (initial + parse retry +
overflow retry).

#### `AUTOFILL_SYSTEM_PROMPT` (verbatim — this exact text, no edits)

```
You are the APEX EVAL Draft Assistant. You draft U.S. Navy performance evaluation
narrative blocks (NAVPERS 1616/26 EVAL, 1616/27 CHIEFEVAL, 1610/2 FITREP) from a
Sailor's brag sheet, prior evaluation summaries, and Learning and Development
Roadmap (LaDR) milestone status. You write drafts for a human reporting senior to
edit and sign — you are never the final author.

INPUT
You receive exactly one JSON object:
{ report_type, period_from, period_to, pitch, budgets, physical_readiness, brag,
  prior_evals, ladr }
- brag: the member's APEX Brag Sheet (sections: admin, duties, job, leadership,
  accomplishments, qualifications, off_duty, pfa, goals, counseling, additional).
- prior_evals: prior report summaries, each keyed by its period_to date.
- ladr: rating roadmap milestones with status met / not_met / na / unanswered.
- budgets: hard physical limits per block, measured from the printed forms. They
  are authoritative. Your output is machine-wrapped character-by-character in
  fixed-pitch Courier and rejected if it exceeds them — count characters, not words.
- physical_readiness: the Block 20 code string, precomputed from brag.pfa.

GROUNDING RULES (absolute — violations are machine-detected and discarded)
1. Every bullet, sentence, and entry you generate MUST carry at least one source
   citation in its "sources" array. A citation is a JSON path into the input:
     "brag.duties[2].bullets[0]"            (0-based array indices)
     "brag.leadership.retention_efforts[1].metrics"
     "prior_evals[2025-03-15].comments"     (keyed by that report's period_to)
     "ladr.qual_warfare[<milestone_id>]"    (category, then milestone_id)
   Citations are machine-resolved after you respond; any item whose paths do not
   resolve is deleted. Cite the narrowest path that supports the claim.
2. Never fabricate. Do not invent numbers, percentages, dollar figures, award
   names, qualification titles, dates, personnel counts, ship or program names.
   If the brag sheet gives no metric for an accomplishment, write the bullet
   without numbers and add a missing_info flag requesting the metric.
3. If a block needs information that is absent (no months on a duty, no PFA
   cycles, no career recommendation, no command-level achievements), do NOT
   guess. Emit the best text possible from what exists — or empty text — and add
   a missing_info flag naming the block and the exact payload path.
4. prior_evals are context only: use them for continuity phrasing and trend, and
   for deduplication. Never copy a prior sentence verbatim. Never list in Block
   44 anything already present in any prior_evals[].qualifications
   (BUPERSINST 1610.10H: "Do not repeat information from earlier reports").
5. LaDR items with status "met" may substantiate qualification and development
   claims. Items "not_met" may inform the promotion advisory rationale only —
   never as a negative Block 43 comment unless the brag sheet itself raises it.

STYLE (BUPERSINST 1610.10H, Chapter 13)
- Bullet format: ACTION — IMPACT — RESULT. Open with a strong verb, quantify the
  impact (numbers, %, $, hours saved, readiness gained), end with the "so what"
  for the command or Navy.
- No unsubstantiated superlatives. "SUPERB", "UNMATCHED", "#1 OF N" only when a
  cited fact backs the claim; otherwise open with the strongest cited
  accomplishment.
- EVAL and CHIEFEVAL comments: UPPERCASE (fleet Courier convention). FITREP:
  mixed case permitted.
- No classified information. No non-standard acronyms — spell out on first use.
  No prohibited comments: protected characteristics, unadjudicated allegations,
  marital status, or anything Chapter 13 bars.
- Promotion language convention: the closing line of comments must match the
  promotion advisory category exactly and never exceed it —
  Early Promote → "PROMOTE TO <next rate/grade> NOW!" / Must Promote → "PROMOTE
  AHEAD OF PEERS" / Promotable → positive, unaccelerated language / Progressing
  or below → developmental language, no promotion push.

BLOCK-BY-BLOCK (write to budgets; every value below is enforced after you respond)
- comments (Block 43): budgets.comments.chars_per_line (90 at 10-pitch, 84 at
  12-pitch) × 18 lines maximum. TARGET budgets.comments.target_lines (17) to
  leave the reporting senior editing room. Structure: one opener line
  establishing scope (personnel led, budget, equipment value — from
  brag.leadership), grouped accomplishment bullets prefixed "- ", one closing
  promotion-language line. Substantiate any trait_hint'd accomplishment
  explicitly (these back Blocks 33–39 marks the human will assign).
- primary_duty_abbrev (Block 29A): ≤ budgets.primary_duty_abbrev.max_chars (14)
  characters; abbreviation of the duty flagged is_most_significant.
- primary_duties (Block 29B): duty titles with months in order — most
  significant primary first, then other primary, collateral, watchstanding —
  formatted "TITLE-<months>; ". Append periods not available for duty
  (brag.admin.periods_unavailable, brag.duties kind "temadd") and PFA cycle
  notes from brag.pfa (e.g. "25-1:P/PRT OUTSTANDING/BCA WNL"). A Block 20 code
  of B REQUIRES a PFA comment here. Budget: 91 chars/line ×
  budgets.primary_duties.max_lines (3 on EVAL, 4 on CHIEFEVAL/FITREP); the
  FIRST line is budgets.primary_duties.first_line_lead (20) characters shorter
  because Block 29A shares it.
- command_achievements (Block 28): command employment and command-level awards
  only, from brag.job.team_contributions and brag context — operational/
  training/maintenance periods with months (unclassified). 91 chars × 3 lines.
  Nothing command-level provided → empty text + missing_info flag.
- qualifications (Block 44): ONLY when report_type is EVAL. Completed-this-
  period quals, courses with credit hours, degrees, personal awards, community
  involvement — 91 chars × 2 lines, no repeats from prior reports. For
  CHIEFEVAL and FITREP, omit this block entirely and fold the material into
  comments.
- career_recommendations (Block 41): up to 2 entries, each ≤ 20 characters
  INCLUDING spaces, drawn from brag.goals.career_recommendations and
  brag.goals.desired_duties. Nothing usable → entries ["NA"] plus a
  missing_info flag.
- physical_readiness (Block 20): echo the provided physical_readiness string
  verbatim. Never compute or alter it.

PROMOTION ADVISORY (advisory only — never a form value)
Emit promotion_advisory = { advisory_only: true, recommendation, rationale,
sources }. recommendation is one of: Significant Problems, Progressing,
Promotable, Must Promote, Early Promote, NOB. Base it only on cited evidence:
the trend across prior_evals (promotion_recommendation, trait_average),
sustained accomplishments in this brag sheet, and LaDR completion. The
rationale must cite its evidence and end with: "Advisory only — the reporting
senior selects Block 45."
You must NEVER generate trait grades (Blocks 33–39). They are human judgment;
any trait grade in your output is discarded unread.

OUTPUT FORMAT
Respond with ONLY one JSON object — no markdown fences, no prose before or
after — in exactly this shape:
{
  "blocks": {
    "comments":               { "text": "...", "items": [ { "text": "...", "sources": ["..."] } ] },
    "primary_duty_abbrev":    { "text": "...", "items": [ ... ] },
    "primary_duties":         { "text": "...", "items": [ ... ] },
    "command_achievements":   { "text": "...", "items": [ ... ] },
    "qualifications":         { "text": "...", "items": [ ... ] },
    "career_recommendations": { "text": "...", "entries": ["...", "..."], "items": [ ... ] },
    "physical_readiness":     { "text": "...", "items": [ ... ] }
  },
  "missing_info": [ { "block": 43, "field": "brag.duties[0].bullets[1].metrics", "message": "..." } ],
  "promotion_advisory": { "advisory_only": true, "recommendation": "...", "rationale": "...", "sources": ["..."] }
}
"items" must segment the block's text so every claim has its own sources.
If a block has nothing grounded to say, set its text to "" and flag it —
never pad, never invent.
```

#### User payload shape (single user message, JSON — built by `buildAutofillPayload`)

```jsonc
{
  "report_type": "EVAL",
  "period_from": "2025-03-16", "period_to": "2026-03-15",
  "pitch": "10",
  "budgets": {                       // computed at request time from lib/commentFit.ts —
    "comments": { "chars_per_line": 90, "max_lines": 18, "target_lines": 17 },
    "primary_duties": { "chars_per_line": 91, "max_lines": 3, "first_line_lead": 20 },
    "primary_duty_abbrev": { "max_chars": 14 },
    "command_achievements": { "chars_per_line": 91, "max_lines": 3 },
    "qualifications": { "chars_per_line": 91, "max_lines": 2 },   // EVAL only; omitted otherwise
    "career_recommendations": { "slots": 2, "max_chars": 20 }
  },
  "physical_readiness": "PP",        // server-collapsed from brag.pfa (collapsePfa)
  "brag": { /* BragSheetData, admin.dod_id DELETED */ },
  "prior_evals": [ /* PriorEvalSummary[] */ ],
  "ladr": [ /* LadrMilestoneStatus[] */ ]
}
```

Budgets are injected from `checkCommentFit` / `FIELD_FIT` /
`getPrimaryDutiesFieldFit` / `PRIMARY_DUTY_ABBREV_MAX` / `CAREER_REC_*` constants
at request time, so the prompt's numbers and the §7 validator can never disagree.

### 4.7 `lib/bragSheet/service.ts` — server-side assembly + persistence

Accepts a Supabase client; never creates one (vitest import safety — board-
confidence `service.ts:1-11` pattern).

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function assembleAutofillRequest(
  admin: SupabaseClient,
  userId: string,
  sheet: BragSheet,          // the already-fetched, already-authorized row
  pitch: "10" | "12",
): Promise<AutofillRequest>;

export async function runBragAutofill(
  admin: SupabaseClient,
  userId: string,            // owner AND caller (route enforces equality)
  sheet: BragSheet,
  pitch: "10" | "12",
): Promise<AutofillResponse>;
```

`assembleAutofillRequest` steps (normative):

1. **profile**: `admin.from("profiles").select("*").eq("id", userId).single()` —
   supplies `profiles.dod_id` for the cross-check in step 3 and `navy_rank` for
   the LaDR target paygrade in step 4 (board-confidence `service.ts` fetches the
   profile the same way).
2. `brag` = `sheet.data` validated through `BragSheetDataSchema` (`.parse` — a
   corrupt row fails loudly, 500, rather than feeding the model garbage).
3. **prior_evals**: `admin.from("evaluations").select("*").eq("created_by", userId)
   .or("status.eq.completed,signature_locked.eq.true,routing_stage.eq.locked")
   .lt("period_to", sheet.period_from).order("period_to", { ascending: false })
   .limit(5)` — the same finalized gate board-confidence uses. Apply the dod_id
   cross-check (board-confidence spec §2): if `profiles.dod_id` is set AND the
   eval's `dod_id` is non-empty AND they differ after `trim()`, exclude the row.
   Map each row to `PriorEvalSummary`: `trait_average` via
   `computeTraitAverage(ev.trait_grades).average` (`lib/traitAverage.ts` — the
   stored column is never trusted), `promotion_recommendation: ev.
   promotion_recommendation || "NOB"`, `comments: ev.comments || ""`,
   `qualifications: ev.block_values?.qualifications`,
   `primary_duties: ev.block_values?.primary_duties`.
4. **ladr**: `member_board_records` via `.eq("user_id", userId).maybeSingle()`.
   Absent row, or `rating_abbrev` null ⇒ `ladr: []` (never fabricated). Otherwise:
   latest `ladr_documents` for `(rating_abbrev, paygrade_range = 'E1-E9')` by
   `effective_date desc limit 1`, its milestones ordered by `sort_order`, filtered
   by the applicability rule `Math.min(...applies_to_paygrades) <= target_paygrade`
   (board-confidence §3 rule; `target_paygrade` default = `paygradeOf(profile.
   navy_rank)` numeric + 1 clamped to 9, as in board-confidence §4.4 step 2). All
   categories are included (evidence, not scoring — unlike the analyzer, which
   drops zero-weight categories). Each maps to `LadrMilestoneStatus` with
   `status: ladr_checklist[milestone.id]?.status ?? "unanswered"`.
5. Return `{ report_type: sheet.report_type, period_from: sheet.period_from,
   period_to: sheet.period_to, pitch, brag, prior_evals, ladr }`.

`runBragAutofill` steps (normative):

1. `req = await assembleAutofillRequest(...)`; `payload = buildAutofillPayload(req)`.
2. `resolved = resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL)`; `null` ⇒
   throw `AutofillUnavailableError` (route → 503; checked before any DB write).
3. `result = await runAutofill(req, buildCallModel(resolved))` (§4.6).
   `AutofillModelError` propagates (route → 502).
4. `response: AutofillResponse = { ...result, model: resolved.modelId }`.
5. Persist: `admin.from("brag_sheets").update({ last_autofill: response })
   .eq("id", sheet.id)`.
6. **Fail-closed audit** (board-confidence `service.ts:368-399` pattern —
   generated draft text derived from a member's record is treated as record
   egress): insert into `audit_logs`
   `{ evaluation_id: null, user_id: userId, action: "BRAG_AUTOFILL_RUN",
   details: { brag_sheet_id: sheet.id, model: resolved.modelId,
   input_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
   overflow_blocks: <keys of fit_reports where overflow>,
   citation_failure_count: response.citation_failures.length,
   missing_info_count: response.missing_info.length } }`.
   If the audit insert errors: compensate with
   `update({ last_autofill: null }).eq("id", sheet.id)` and throw
   `new Error("Auto-fill could not be recorded in the audit log; no draft was released.")`.
   If the compensating update ALSO fails, log a `CRITICAL` line naming the brag
   sheet id via `console.error` and still throw. Note the sha256 covers the
   **payload** (post-dod_id-strip), so the audit row itself holds no PII beyond
   ids.
7. Return `response`.

New audit action string added to the project's inventory: `BRAG_AUTOFILL_RUN`.

### 4.8 `lib/bragSheetService.ts` — browser service

Repo `lib/*Service.ts` pattern exactly (`evaluationService.ts`): module-level
`const supabase = createBrowserClient();`, exported `const fn = async (...)`,
`console.error(...); throw new Error(error.message)` on error.

```ts
export const listMyBragSheets = async (userId: string): Promise<BragSheet[]>;
    // .from("brag_sheets").select("*").eq("user_id", userId)
    // .order("period_to", { ascending: false })          (RLS-scoped anyway)

export const getBragSheet = async (id: string): Promise<BragSheet | null>;
    // .eq("id", id).maybeSingle()

export const createBragSheet = async (
  userId: string,
  init: Pick<BragSheet, "report_type" | "period_from" | "period_to">,
): Promise<BragSheet>;
    // .insert({ user_id: userId, ...init, template_version: BRAG_SHEET_VERSION,
    //           data: emptyBragSheetData() }).select().single()

export const saveBragSheet = async (
  id: string, patch: Partial<Pick<BragSheet,
    "data" | "status" | "period_from" | "period_to" | "report_type" |
    "evaluation_id" | "consented_at">>,
): Promise<BragSheet>;
    // .update(patch).eq("id", id).select().single()   — RLS owner-only

export const deleteBragSheet = async (id: string): Promise<void>;

export const recordAiConsent = async (id: string): Promise<BragSheet>;
    // saveBragSheet(id, { consented_at: new Date().toISOString() })

export const extractBragPdf = async (file: File): Promise<BragExtractSuggestions>;
    // POST /api/brag-sheet/extract, FormData { file }

export const runBragAutofillRequest = async (
  body: { bragSheetId: string; pitch: "10" | "12" },
): Promise<AutofillResponse>;
    // POST /api/brag-sheet/autofill (postRoute helper shape, evaluationService.ts:12-21)

export const getAutofillAvailability = async (): Promise<{ available: boolean; model: string | null }>;
    // GET /api/brag-sheet/autofill
```

The apply-to-draft flow (`applyBragDraft`) also lives here — full contract in §5.3.

---

## 5. API routes

Both routes follow the canonical authenticated-route shape
(`app/api/board-confidence/analyze/route.ts`): `fail` helper
(`NextResponse.json({ error }, { status })`), try/catch with generic 500 (never
echoes internals), `getRouteUserId()` → 401, body parse → 400,
`createAdminClient()` only after auth. Node runtime (default — do **not** set
`runtime = "edge"`; unpdf's `getDocumentProxy` needs Node for large PDFs).

### 5.1 `POST /api/brag-sheet/extract` — `app/api/brag-sheet/extract/route.ts`

Multipart PDF → in-memory text extraction → suggestions. **Never persists the
file** (invariant §1.2 item 1): `req.formData()` → `file.arrayBuffer()` →
`new Uint8Array(bytes)` → `extractPdfText` → `suggestFromText`; nothing touches
disk, storage, or logs (do not log extracted text).

```ts
// NOT exported: Next.js App Router type-checks route files and rejects any
// export other than HTTP methods / segment config ("not a valid Route export
// field" at next build). Same reason board-confidence keeps
// MAX_CONCURRENT_ANALYSES un-exported. Tests assert the literal 10 MB (§9.4).
const MAX_EXTRACT_BYTES = 10 * 1024 * 1024;   // 10 MB

export async function POST(req: NextRequest) {
  const callerId = await getRouteUserId();
  if (!callerId) return fail("Not authenticated.", 401);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Missing file.", 400);
  if (file.type !== "application/pdf") return fail("Only PDF files are supported.", 400);
  if (file.size > MAX_EXTRACT_BYTES) return fail("File too large (10 MB max).", 413);
  try {
    const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
    if (!text.trim()) return fail("Could not extract text — scanned or image-only PDFs are not supported.", 422);
    return NextResponse.json(suggestFromText(text), { status: 200 });
  } catch {
    return fail("Could not read that PDF.", 422);
  }
}
```

Error inventory: 401 unauthenticated · 400 missing/non-PDF file · 413 over 10 MB ·
422 unreadable or zero-text (scanned) PDF · 500 unexpected. No consent gate (no AI
call, no persistence), no audit row (read-only transform — same policy as the
board-confidence `runs` route), no concurrency cap (extraction is cheap and local).

### 5.2 `POST /api/brag-sheet/autofill` — `app/api/brag-sheet/autofill/route.ts`

Request body: `{ bragSheetId: string; pitch?: "10" | "12" }` (Zod:
`z.object({ bragSheetId: z.string().uuid(), pitch: z.enum(["10","12"]).default("10") })`).
Response `200`: the full `AutofillResponse` (JSON).

```ts
// AI-calling route: same in-process cap as board-confidence analyze (its lines 21-27).
// ponytail: in-process counter — shared rate limiting if this ever runs multi-worker.
const MAX_CONCURRENT_AUTOFILLS = 2;
let active = 0;

export async function GET() {
  const callerId = await getRouteUserId();
  if (!callerId) return fail("Not authenticated.", 401);
  const resolved = resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL);
  return NextResponse.json(
    { available: !!resolved, model: resolved?.modelId ?? null }, { status: 200 });
}

export async function POST(req: NextRequest) {
  if (active >= MAX_CONCURRENT_AUTOFILLS)
    return fail("Too many drafts in progress. Try again shortly.", 429);
  active++;
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Invalid request body.", 400);

    if (!resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL))
      return fail("AI drafting is not configured on this server.", 503);

    const admin = createAdminClient();
    const { data: sheet } = await admin
      .from("brag_sheets").select("*").eq("id", parsed.data.bragSheetId).maybeSingle();
    if (!sheet) return fail("Brag sheet not found.", 404);

    // Owner-only: profile roles are self-asserted and authorize nothing
    // (board-confidence §2 item 4).
    if (sheet.user_id !== callerId)
      return fail("Only the brag sheet owner may generate drafts.", 403);

    // Server-enforced consent gate (board-confidence analyze route pattern).
    if (!sheet.consented_at)
      return fail("Consent required. Review and accept the AI drafting terms before generating.", 403);

    const response = await runBragAutofill(admin, callerId, sheet, parsed.data.pitch);
    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    if (error instanceof AutofillModelError)
      return fail("The AI model returned unusable output. Try again.", 502);
    console.error("Brag autofill error:", error);
    return fail("Draft generation failed. See server logs for details.", 500);
  } finally {
    active--;
  }
}
```

Error inventory: 401 unauthenticated · 400 bad body · 403 not the owner
(`"Only the brag sheet owner may generate drafts."`) · 403 consent not recorded ·
404 sheet not found · 429 concurrency cap · 502 model output failed the strict
parse twice (§7 step 1) · 503 keyless (no fallback draft — invariant §1.2 item 9)
· 500 fail-closed audit failure or unexpected error (generic message). This route
**never writes to `evaluations`** — its only writes are `brag_sheets.last_autofill`
and the audit row.

### 5.3 Where draft creation happens — client-side apply (no new route)

"Apply to draft EVAL" runs in the browser through the **existing** creation path:
seed → merge → `saveDraft(userId, draft)` (`lib/evaluationService.ts:26-66`), which
injects `created_by`, `current_holder_id`, `participants: [userId]`,
`routing_stage: "sailor"`, strips `created_at`/`updated_at`, and audits
`REPORT_CREATED`. `saveDraft` runs no validation; the only hard gates on a draft
are DB not-nulls (`form_definition_id`, `member_name`, `period_from`, `period_to`)
and CHECKs (uic, enums) — all satisfied below.

`lib/bragSheetService.ts`:

```ts
export interface AcceptedBlocks {       // ONLY user-accepted (possibly user-edited) texts
  comments?: string;
  primary_duty_abbrev?: string;
  primary_duties?: string;
  command_achievements?: string;
  qualifications?: string;              // EVAL only
  career_recommendations?: string[];    // ≤2 entries, trimmed + upcased, each ≤20 chars
}

export const applyBragDraft = async (
  userId: string,
  sheet: BragSheet,
  accepted: AcceptedBlocks,
  pitch: "10" | "12",
): Promise<Evaluation> => {
  const seed =
    sheet.report_type === "CHIEFEVAL" ? getChiefEvalSeed()
    : sheet.report_type === "FITREP"  ? getFitrepSeed()   // "FITREP_W2_O6" default; see note
    : getEvalSeed();
  const a = sheet.data.admin;

  const draft: Partial<Evaluation> = {
    ...seed,
    member_name: (a.member_name ?? "").toUpperCase(),
    dod_id: a.dod_id ?? "",
    grade_rate: a.grade_rate ?? "",
    designator: a.designator ?? "",
    duty_status: a.duty_status ?? seed.duty_status,
    uic: a.uic && a.uic.length === 5 ? a.uic : "00000",   // DB CHECK: 5 chars or '00000'
    ship_station: a.ship_station ?? "",
    period_from: sheet.period_from,
    period_to: sheet.period_to,
    comments: accepted.comments ?? "",
    career_recommendations: accepted.career_recommendations ?? seed.career_recommendations,
    // promotion_recommendation: seed default "Promotable" — the advisory is NEVER
    // copied (invariant §1.2 item 3). retention: seed handles per report type.
    block_values: {
      ...seed.block_values,
      comment_pitch: pitch,
      ...(a.date_reported ? { date_reported: a.date_reported } : {}),
      ...(accepted.primary_duty_abbrev ? { primary_duty_abbrev: accepted.primary_duty_abbrev } : {}),
      ...(accepted.primary_duties ? { primary_duties: accepted.primary_duties } : {}),
      ...(accepted.command_achievements ? { command_achievements: accepted.command_achievements } : {}),
      ...(sheet.report_type === "EVAL" && accepted.qualifications
        ? { qualifications: accepted.qualifications } : {}),
      // Block 20 — deterministic, from the sheet, never from accepted AI text:
      ...(sheet.data.pfa.length ? { physical_readiness: collapsePfa(sheet.data) } : {}),
      // Blocks 30/31 — deterministic pass-through, never AI-written:
      ...(sheet.data.counseling.date_counseled
        ? { date_counseled: sheet.data.counseling.date_counseled,
            counselor: sheet.data.counseling.counselor ?? "" } : {}),
    },
  };

  const saved = await saveDraft(userId, draft);
  await saveBragSheet(sheet.id!, { evaluation_id: saved.id, status: "submitted" });
  return saved;
};
```

Normative rules:

- **MUST NOT set** (saveDraft/system-owned): `id`, `created_at`, `updated_at`,
  `created_by`, `current_holder_id`, `participants`, `routing_stage`,
  `trait_average`, `reviewer_id`, `summary_group_id`, `signature_locked`,
  `pdf_storage_path`, any `status` other than the seed's `"draft"`.
- `trait_grades` stays the seed's `{}` — always (invariant §1.2 item 2).
- Only **accepted** blocks land. A rejected block falls back to empty/seed. A block
  whose `fit_reports` entry has `overflow: true` cannot be accepted until the user
  edits it under budget in the review panel (§6) — the Apply action is disabled
  for it.
- FITREP variant: v1 always uses `getFitrepSeed()` (= `FITREP_W2_O6`,
  `f1610020-…`). O7/O8 users create via `/evaluations/new` (which paygrade-gates
  form codes); wiring `suggestFormCode` into apply is a noted refinement, not v1.
- After apply the caller navigates: `router.push(`/evaluations/${saved.id}`)` —
  the user lands on the normal `EvaluationForm` where `runFullValidation` governs
  submit exactly as for a hand-typed draft. Identity/occasion gaps surfacing as
  normal form errors is expected for a draft.

---

## 6. UI — `/brag-sheet` (`app/brag-sheet/page.tsx`)

`"use client"` page in the repo pattern (`app/board-confidence/page.tsx`): profile
via `getSession()` in a `useEffect`, redirect to `/login` when absent, wrapped in
`<AppShell profile={profile} breadcrumbs={[{ label: "Brag Sheet" }]}>` and
`<RoleGuard user={profile} allowedRoles={["Sailor","Rater","Senior Rater","Reporting Senior","Admin"]}>`
(every signed-in role — it is the Sailor's own tool). All inputs use
`apex-input` / `apex-select`, labels via `apex-filter-label`, explicit `aria-label`
on every select (repo a11y convention). Page title `apex-page-title` "Brag Sheet",
subtitle naming the active sheet's period and report type.

Components under `components/bragSheet/` (names are the contract; colocation of
small ones in the page file is permitted):

- **`BragDisclaimerBanner`** — renders `BRAG_AI_DISCLAIMER` verbatim in an
  `apex-card` with `border-l-4` accent (`var(--accent-gold)`), `role="note"`,
  `aria-label="AI drafting disclaimer"`. At the top of the page AND again at the
  top of `AutofillReviewPanel` (§1.1). A short-form line also renders in the page
  footer.
- **Sheet list + header bar** — `listMyBragSheets` newest-first; "New Brag Sheet"
  opens a small form (report type select gated to the user's paygrade the same way
  `/evaluations/new` gates form codes; period from/to `<input type="date">`) →
  `createBragSheet`. Selecting a sheet loads the editor.
- **`BragSheetEditor`** — accordion of the 11 `BRAG_SECTIONS` (section title +
  blurb + "feeds Blocks …" chip from metadata). Repeating-row sections (`duties`,
  `accomplishments`, `pfa`, quals/education/awards, bullets inside
  job/leadership/off_duty, `periods_unavailable`) get add-row / remove-row
  controls (`apex-btn-secondary` "+ Add", per-row remove with
  `aria-label="Remove row"`). Field-level rules enforced inline: `abbrev`
  maxLength 14 with a live counter; `goals.career_recommendations` max 2 rows,
  maxLength 20 each; `counseling.counselor` maxLength 22; `pfa.result` a select of
  P/B/F/M/W/N; `duties.is_most_significant` a radio across primary rows (exactly
  one). Every `BragBullet` row is text + optional metrics input; an empty metrics
  field shows a passive hint chip "no metric". Save is debounced
  (`saveBragSheet(id, { data })`) with the repo's save-message surface.
- **Toolbar** — four actions:
  - **Download PDF**: fetch `/fonts/CourierPrime-Regular.ttf` →
    `generateBragSheetPdf(sheet, { courierPrime })` → Blob download named
    `brag-sheet-<period_to>.pdf` (client-side; no route).
  - **Download JSON**: Blob of the full `BragSheet` row (pretty-printed), named
    `brag-sheet-<period_to>.json`.
  - **Import JSON**: `<input type="file" accept="application/json">` →
    `JSON.parse` → `BragSheetDataSchema.safeParse(parsed.data ?? parsed)` (accepts
    either a full row export or a bare payload). Failure ⇒ inline error naming the
    first Zod issue path; success ⇒ confirm dialog ("Replace the current sheet's
    contents?") then editor state replaced and saved.
  - **Upload PDF (drag-drop zone)** — `UploadZone`: drag-drop or click, PDF only,
    caption "Prior evals and PRIMS PDFs are read in your browser session only —
    never stored." → `extractBragPdf(file)` → **`ExtractPreview`** panel: grouped
    suggestion cards (admin fields, duties, quals, PFA cycles, bullets) each with
    an Accept button that merges that one item into the editor state (bullets
    append to `accomplishments` as `{ text }`). Nothing merges without a click.
    422 renders the route's message verbatim.
- **`BragConsentModal`** — patterned on `components/board/BoardConsentModal.tsx`.
  Opens when the user hits Generate on a sheet whose `consented_at` is null.
  Copy (verbatim):

  > **AI Drafting Consent.** Before APEX can generate evaluation draft text for
  > you: (1) Your brag sheet content, summaries of your prior APEX evaluations,
  > and your LaDR checklist status will be sent to the AI model configured by this
  > server. (2) Your DoD ID number is removed from the payload before it is sent.
  > Never enter classified information anywhere in a brag sheet. (3) Generated
  > text is a proposal — every block requires your explicit review before it
  > touches an evaluation, and trait grades and the Block 45 promotion
  > recommendation are never generated. (4) Each generation run is recorded in the
  > APEX audit log.
  >
  > Declining keeps the brag sheet fully usable — only AI drafting is disabled.

  Buttons: "I consent — enable AI drafting" (`apex-btn-primary`) →
  `recordAiConsent(sheet.id)` then proceed; "Not now" closes, page stays browsable.
- **Generate control** — on mount, `getAutofillAvailability()`; `available: false`
  hides the Generate button and shows a muted line "AI drafting is not configured
  on this server." Otherwise: pitch select (`10` / `12`, labeled "Block 43 pitch")
  + "Generate EVAL Draft" (`apex-btn-primary`; label swaps EVAL/CHIEFEVAL/FITREP
  by `report_type`), disabled in flight; 429 → retry toast; 502 → "Model output
  unusable — try again"; result (or `sheet.last_autofill` on load) opens:
- **`AutofillReviewPanel`** — side-by-side review, brag source left, generated
  right:
  - `BragDisclaimerBanner` on top (again).
  - **Per-block cards** (comments, 29A, 29B, 28, 44 when present, 41, 20): the
    generated text in a Courier `<pre>` at the block's CPL, with:
    - **Citation chips** — one chip per `GeneratedItem`, hover/focus reveals the
      source path(s) and, when the path points into `brag`, the cited source text
      rendered beside it (the "side-by-side": clicking a chip scrolls/highlights
      the source row in the editor). `citation_failures` render as struck-through
      ghost rows with "removed — citation did not resolve".
    - **Fit meter** — for comments/29B/28/44: `linesUsed / maxLines` bar from
      `fit_reports` (e.g. "16 / 18 lines at 90 CPL"), green under target, amber at
      max, red on overflow. 29A shows a char counter (`n/14`) driven by its own
      `fit_reports.primary_duty_abbrev` entry (overflow state and disabled Accept
      apply to it exactly as to the line-based blocks); 41 shows `n/20 × 2`.
    - **Overflow state** — `overflow: true`: red flag, `truncation_preview`
      rendered with the `dropped_lines` below it struck through, and two actions:
      "Regenerate shorter" (re-POST) and "Edit manually" (opens an inline
      textarea live-checked with `checkCommentFit`/`measureTextFit`). Accept is
      disabled until the edited text fits (§5.3).
    - **Accept / Edit / Reject** per block. Accepted (or accept-after-edit) blocks
      populate `AcceptedBlocks`; Block 20 renders read-only ("computed from your
      PFA rows") — not accept/rejectable.
  - **Missing-info list** — every `MissingInfoFlag` as a row: block badge,
    `message`, and a "Go to field" link when `field` names a `brag.*` path.
  - **Dry-run panel** — `dry_run` (`ValidationResult`) rendered in the same visual
    grammar as `ValidationResultsModal`: errors then warnings, each with its
    block badge — "what final validation will say before you apply anything".
  - **Promotion advisory card** — recommendation + rationale + citation chips,
    visually distinct (`apex-badge-*`), headed "ADVISORY ONLY — not written to the
    form" and footed with the rationale's own closing sentence. No control exists
    to copy it into Block 45.
  - **"Create draft <EVAL|CHIEFEVAL|FITREP>"** (`apex-btn-primary`) — enabled once
    ≥1 block is accepted and no accepted block overflows →
    `applyBragDraft(userId, sheet, accepted, pitch)` → `router.push(/evaluations/<id>)`.

---

## 7. Post-generation validation pipeline (normative — route/service order)

Implemented in `runAutofill` (§4.6); this section is the single source of truth.

1. **PARSE** — `AutofillModelOutputSchema` over the model output (required keys,
   types, enums enforced; unknown keys — `trait_grades` above all — stripped, §4.6
   parse rule). Parse failure → **one** retry with the Zod error text appended as
   `retry_feedback`; second failure → throw `AutofillModelError` (route → 502, no
   partial apply).
2. **CITATION RESOLUTION** (anti-fabrication gate) — `resolveCitation` on every
   `GeneratedItem.sources` path against the actual `AutofillRequest`. An item with
   zero resolvable sources is stripped from `items[]` AND its `text` is deleted
   from `block.text` (exact-substring removal; collapse the doubled whitespace/
   newline left behind); recorded in `citation_failures`. It never reaches the
   user. `promotion_advisory.sources` are resolved the same way; if none resolve,
   the advisory's `recommendation` is kept but `rationale` is replaced with
   `"No cited evidence survived validation — advisory withheld."`.
3. **DETERMINISTIC BLOCK 20** — recompute `collapsePfa(req.brag)`; **overwrite**
   `blocks.physical_readiness.text` (server value always wins) and assert
   `/^[PBFMWN]*$/`. If any cycle has `result: "B"` and `blocks.primary_duties.text`
   contains no PFA note (no `/\b\d{2}-[12]\b/` match), append
   `MissingInfoFlag{ block: 29, field: "brag.pfa", message: "A Bad-Day/B cycle
   requires a PFA comment in Block 29 (BUPERSINST 1610.10H)." }`.
4. **FIT CHECKS** (`lib/commentFit` — the same wrap as screen + PDF, true
   WYSIWYG):
   - `comments` → `checkCommentFit(text, req.pitch)` (18 lines, 90/84 CPL)
   - `primary_duties` → `measureTextFit(text, 91, getPrimaryDutiesFieldFit(report_type).maxLines, 20)`
   - `command_achievements` → `measureTextFit(text, 91, 3)`
   - `qualifications` → `measureTextFit(text, 91, 2)` (EVAL only)
   - `primary_duty_abbrev` → `measureTextFit(text, PRIMARY_DUTY_ABBREV_MAX, 1)`
     (14 chars × 1 line — a >14-char abbrev overflows and gets a `fit_reports`
     entry like every other narrative block, so the retry (step 5) and the
     §5.3/§6 no-overflow apply gate both cover it)
   - `career_recommendations` → trim + upcase each entry, then
     `entries.length <= CAREER_REC_SLOTS` and each `<= CAREER_REC_MAX`; violations
     drop the offending entry with a `MissingInfoFlag{ block: 41 }`.
5. **OVERFLOW HANDLING** — any failed fit from step 4: **one** automatic model
   retry with concrete feedback per failed block, e.g.
   `"comments used 21/18 lines at 90 CPL — cut 3 lines"` (from
   `fit.linesUsed`/`maxLines`/`charsPerLine`). The retry output re-enters the
   pipeline at step 1 (parse) and steps 2–4 re-run. Still overflowing → return
   anyway with `overflow: true`, `truncation_preview =
   wrappedLines.slice(0, maxLines).join("\n")`, `dropped_lines =
   wrappedLines.slice(maxLines)`. The server NEVER silently truncates and the
   client NEVER auto-applies an overflowing block (§5.3, §6).
6. **DRY-RUN `runFullValidation`** — merge the surviving blocks into a copy of the
   would-be draft (every generated block treated as accepted) and attach
   `runFullValidation(merged)` as `dry_run` — the UI shows what final validation
   would say BEFORE the user applies anything. The merged draft is constructed
   **inline in the pipeline** using the same field mapping as §5.3 (admin
   identity fields, `period_from`/`period_to`, `comments`,
   `career_recommendations`, `block_values` including the deterministic Block
   20/30/31 values, `report_type` context) — but **without** the §5.3 seed
   spread: `getEvalSeed`/`getChiefEvalSeed`/`getFitrepSeed` live in
   `lib/formDefinitions.ts`, which executes `createBrowserClient()` at module
   scope, and the §4 import-safety rule bars every `lib/bragSheet/*` file from
   that transitive `lib/supabaseClient` import. Seed-only defaults the inline
   draft lacks may surface as extra dry-run findings; that is acceptable — §5.3
   already treats identity/occasion gaps on a fresh draft as expected form
   errors, and the authoritative gate remains submit-time `runFullValidation`
   on the real draft.
7. **ADVISORY GATING** — `promotion_advisory` passes through for display only;
   nothing in this pipeline or the apply flow writes it to
   `Evaluation.promotion_recommendation` (invariant §1.2 item 3).

APPLY is a separate explicit user action per block (§5.3/§6) — autofill output is
a proposal object, never a direct write to the evaluation row.

---

## 8. Environment

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | existing | browser + route session |
| `SUPABASE_SERVICE_ROLE_KEY` | existing | admin client in the autofill route |
| `BOARD_NARRATIVE_BASE_URL` | optional | DIRECT mode: any OpenAI-compatible endpoint (shared with board-confidence — one config surface, §4.1) |
| `BOARD_NARRATIVE_API_KEY` | optional | DIRECT mode key (omit for keyless local endpoints) |
| `BOARD_NARRATIVE_MODEL` | optional | native id (direct) or `provider/model` (gateway); default `anthropic/claude-opus-4.8` |
| `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` | optional | GATEWAY mode auth |

No AI configuration ⇒ brag sheet, PDF, JSON, and extraction all work; only
Generate is hidden (503 / `available: false`). Next.js bundling: no
`next.config.mjs` change needed for unpdf; if `next build` ever warns on its
embedded pdf.js dynamic imports, the escape hatch is
`experimental.serverComponentsExternalPackages: ["unpdf"]`.

---

## 9. Testing

Vitest + jsdom + globals, `setupFiles: ./tests/setup.ts`, `@/` alias, files at
`tests/unit/<name>.test.ts`, included in the default scoped run
(`vitest.config.ts`). No live network anywhere in CI. AI mocking convention
(boardConfidenceNarrative.test.ts): `vi.hoisted` + `vi.mock("ai", ...)` replacing
only `generateText`; env vars saved/set/deleted per test in `beforeEach`, restored
in `afterAll`.

### 9.1 `tests/unit/aiProvider.test.ts`

- Direct mode: `BOARD_NARRATIVE_BASE_URL` set ⇒ returns an object model with the
  expected `modelId`, `mode: "direct"`.
- Gateway mode: only `AI_GATEWAY_API_KEY` ⇒ string model, `mode: "gateway"`.
- Precedence: both configured ⇒ direct wins.
- Keyless ⇒ `null`. Env read at call time (mutate env between two calls, assert
  different results).
- **Regression gate:** the existing 12 tests in
  `tests/unit/boardConfidenceNarrative.test.ts` run unmodified and green after the
  narrative.ts refactor (they pin model string-vs-object, `BOARD_NARRATIVE_*`
  names, `maxRetries: 1`, absence of sampling params).

### 9.2 `tests/unit/bragSheetTemplate.test.ts`

- `emptyBragSheetData()` satisfies `BragSheetDataSchema.parse`.
- JSON round-trip: fixture payload → `JSON.stringify` → `JSON.parse` →
  `BragSheetDataSchema.parse` → deep-equal to the fixture.
- `collapsePfa`: `[P, B, F]` cycles ⇒ `"PBF"`; empty ⇒ `""`; order preserved.

### 9.3 `tests/unit/bragSheetPdf.test.ts` (template/PDF smoke)

- Generate a PDF from a fixture sheet (name `"JONES, CARL R"`, one duty with
  months, one bullet with metrics, two PFA rows), parse the bytes back with
  unpdf's `extractText`, assert sentinels present: member name, "Duties Assigned"
  (section bars render `BRAG_SECTIONS.title` verbatim — §4.4 mandates UPPERCASE
  for field labels only; extraction is case-sensitive), the bullet text,
  `BRAG_PDF_FOOTER` substring, "Page 1 of".
- Pagination: a fixture with 60 accomplishment bullets produces ≥2 pages
  (`getPageCount`), footer on every page.
- Empty sheet renders (no throw) and contains "— none entered —".
- Works with and without the `courierPrime` font bytes (fallback path).

### 9.4 `tests/unit/bragSheetExtract.test.ts`

- Fixture built in-test with `generateBragSheetPdf` (or the fitrepOverlay path)
  containing known sentinels; `extractPdfText` recovers them fully in memory.
- `suggestFromText` unit fixtures (plain strings, no PDF needed): prior-eval text
  ⇒ `kind: "prior_eval"`, name/USS/duty-months/bullets extracted per the §4.5
  regexes; PRIMS text with `"25-1 ... P ... OUTSTANDING"` ⇒ `kind: "prims"`, one
  `BragPfaCycle{ cycle: "25-1", result: "P", prt_category: "Outstanding" }`;
  garbage ⇒ `kind: "unknown"`, empty suggestions, no throw.
- Route: 400 missing file, 400 non-PDF type, 413 oversize (assert against the
  literal `10 * 1024 * 1024` — `MAX_EXTRACT_BYTES` is deliberately not exported
  from the route file, §5.1), 422 zero-text.

### 9.5 `tests/unit/bragSheetAutofill.test.ts` (mocked provider)

Mock `"ai"`'s `generateText`; drive `runAutofill` with a scripted `callModel` where
pipeline-only behavior is under test.

- **Call shape:** with direct env set, invoke
  `buildCallModel(resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL)!)` once and
  assert `generateText` receives `system === AUTOFILL_SYSTEM_PROMPT`,
  `maxRetries: 1`, an `abortSignal`, an `output` present, and NO
  `temperature`/`top_p`/`top_k`. (Drive `buildCallModel` directly — `runAutofill`
  takes an injected `callModel` and never calls `generateText` itself, §4.6.)
- **Budgets single-source:** the serialized prompt's `budgets` deep-equal
  `computeBudgets(...)`, and `computeBudgets("EVAL","10")` /
  `("CHIEFEVAL","12")` match the commentFit constants (90/84 CPL, 18 lines, 29B
  3-vs-4 lines, lead 20, 14, 91×3, 91×2, 2×20). `qualifications` budget absent for
  CHIEFEVAL/FITREP.
- **PII sentinel:** plant a 10-digit `dod_id` in the fixture; assert the
  serialized prompt does not contain it.
- **Citation coverage:** every item in every returned block has ≥1 source; a
  scripted output containing an item citing `brag.duties[9].bullets[0]`
  (nonexistent) comes back with that item stripped from `items` and `text`, and
  one `citation_failures` entry naming the bad path.
- **Missing-info passthrough:** flags emitted by the scripted model survive to the
  response; the Block-20 "B without 29B note" server-side flag is appended.
- **Block 20 overwrite:** scripted model echoes `"XX"`; response carries the
  server-computed `"PB"`.
- **Overflow:** scripted 21-line comments at 90 CPL ⇒ exactly one retry whose
  `retry_feedback` contains `"21/18"`; scripted second overflow ⇒ response with
  `overflow: true`, `truncation_preview` = first 18 wrapped lines,
  `dropped_lines.length === 3`, and no truncation of `blocks.comments.text`. A
  scripted 15-char `primary_duty_abbrev` that persists through the retry ⇒
  `fit_reports.primary_duty_abbrev.overflow === true`.
- **Strip semantics:** scripted output containing a `trait_grades` key parses
  successfully and the key is absent from the response.
- **Parse failure:** scripted non-conforming output twice ⇒ `AutofillModelError`.
- **Dry-run:** response `dry_run` is a `ValidationResult` produced from the merged
  draft (spy on `runFullValidation` receiving `comments` = the generated text).

### 9.6 `tests/unit/bragSheetRoute.test.ts`

Mock `@/lib/supabaseClient` (`getRouteUserId`, `createAdminClient`) and
`@/lib/bragSheet/service`; import handlers directly (pattern:
`boardConfidenceRoute.test.ts`).

- Autofill POST: 401 unauthenticated; 400 bad body (`pitch: "11"`, missing
  `bragSheetId`); 404 unknown sheet; 403 non-owner (including a caller whose
  profile claims Admin — no role lookup occurs); 403 `consented_at: null` with the
  exact consent message; 503 keyless (all `BOARD_NARRATIVE_*` + gateway vars
  deleted) **before** any DB access; 429 at the concurrency cap (3 concurrent,
  third rejected, counter releases); 502 on `AutofillModelError`; 500 generic on
  the fail-closed audit throw; 200 returns the service response.
- Autofill GET: 401; `{ available: false, model: null }` keyless;
  `{ available: true, model: "anthropic/claude-opus-4.8" }` with gateway auth.
- Fail-closed audit (service-level): audit insert error ⇒ `last_autofill` nulled
  and throw; compensating update also failing ⇒ CRITICAL log + throw.

### 9.7 Apply-flow test (in `bragSheetTemplate.test.ts` or its own file)

With `saveDraft` mocked: `applyBragDraft` passes a draft whose
`promotion_recommendation === "Promotable"` (never the advisory), whose
`trait_grades` is `{}`, which contains none of the custody/system fields (§5.3
MUST-NOT list), whose `block_values.physical_readiness === collapsePfa(sheet.data)`,
and which omits `qualifications` for CHIEFEVAL; and it links
`evaluation_id` + sets `status: "submitted"` on the sheet afterward.

---

## 10. Out of scope for v1 (explicit)

- **Scanned-image OCR** — extraction is text-layer only; image-only PDFs get a
  clean 422 with guidance. No OCR dependency.
- **Google Docs / collaborative live editing** — single-owner editing via RLS;
  export/import is PDF + JSON only.
- **Command-level brag sheet review flows** — no Rater/RS visibility into member
  brag sheets, no routing, no sharing. Owner-only end to end (mirrors the
  board-confidence owner-only decision; on-behalf deferred until real server-side
  role authority exists).
- **NAVFIT import** — uploaded prior evals feed *suggestions* only; no structured
  NAVFIT 98 file ingestion.
- **Per-section DB tables / SQL over bullets** — single JSONB by design (§3).
- **AI drafting of Blocks 30/31, 45, 47, and 33–39** — 30/31 pass through
  deterministically from the sheet; 45/47 and trait grades are human-only.
- **O7/O8 FITREP form-code selection in apply** (§5.3 note) and any admin/precept
  UI. **bupersGuidelines.json line-count text fix** (§1.4) ships as its own
  one-line follow-up, not in this feature branch.

---

## 11. Deliverable file inventory

| Path | Kind |
|---|---|
| `supabase/migrations/006_brag_sheet.sql` | new (DDL in §3, verbatim) |
| `types/navpers.ts` | edit: add `export` to `TRAIT_KEYS` (line 11; currently module-private — the §6 EVAL trait-hint select needs it, and `lib/traitAverage.ts`'s exported `TRAIT_KEYS` is a cross-form superset, not a substitute) |
| `lib/aiProvider.ts` | new (§4.1) |
| `lib/boardConfidence/narrative.ts` | edit: resolution swapped to `resolveAiModel`; public API unchanged (§4.1) |
| `lib/bragSheet/types.ts` | new (§4.2, verbatim shapes) |
| `lib/bragSheet/template.ts` | new (§4.3) |
| `lib/bragSheet/pdf.ts` | new (§4.4) |
| `lib/bragSheet/extract.ts` | new (§4.5) |
| `lib/bragSheet/autofill.ts` | new (§4.6, prompt verbatim) |
| `lib/bragSheet/service.ts` | new (§4.7) |
| `lib/bragSheetService.ts` | new (§4.8, §5.3) |
| `app/api/brag-sheet/extract/route.ts` | new (§5.1) |
| `app/api/brag-sheet/autofill/route.ts` | new (§5.2, GET + POST) |
| `app/brag-sheet/page.tsx` | new (§6) |
| `components/bragSheet/*` (BragDisclaimerBanner, BragSheetEditor, UploadZone, ExtractPreview, BragConsentModal, AutofillReviewPanel) | new (colocation permitted, §6) |
| `tests/unit/{aiProvider,bragSheetTemplate,bragSheetPdf,bragSheetExtract,bragSheetAutofill,bragSheetRoute}.test.ts` | new (§9) |

No new dependencies: `pdf-lib`, `@pdf-lib/fontkit`, `unpdf`,
`@ai-sdk/openai-compatible`, `ai`, and `zod` are all already in `package.json`.

Reused, not re-derived: `wrapTextToWidth` / `measureTextFit` / `checkCommentFit` /
`FIELD_FIT` / `getPrimaryDutiesFieldFit` / `PRIMARY_DUTY_ABBREV_MAX`
(`lib/commentFit.ts`), `runFullValidation` (`lib/validationEngine.ts`),
`saveDraft` (`lib/evaluationService.ts`), `getEvalSeed` / `getChiefEvalSeed` /
`getFitrepSeed` (`lib/formDefinitions.ts`), `CAREER_REC_SLOTS` / `CAREER_REC_MAX`
/ `COUNSELOR_MAX` / `PROMOTION_RECOMMENDATIONS` / trait key sets
(`types/navpers.ts` — `TRAIT_KEYS` needs the one-word `export` edit above;
`CHIEFEVAL_TRAIT_KEYS` / `FITREP_TRAIT_KEYS` are already exported), `LadrCategory` / `LadrStatus` / `LadrMilestone`
(`lib/boardConfidence/types.ts`), `DEFAULT_NARRATIVE_MODEL`
(`lib/boardConfidence/narrative.ts`), `computeTraitAverage`
(`lib/traitAverage.ts`), `paygradeOf` (`lib/paygrade.ts`), `createAdminClient` /
`getRouteUserId` / `createBrowserClient` (`lib/supabaseClient.ts`), `logAction`
inventory convention (`lib/auditService.ts`), the Courier Prime embed + font
fallback (`lib/pdfOverlay.ts:262-273`), `AppShell` / `RoleGuard` /
`ValidationResultsModal` visual grammar, and the `apex-*` tokens
(`app/globals.css`).
