# NAVFIT 98 backward compatibility — MS Access export plan

**Goal:** Evaluations drafted and finalized in APEX export to a file format that **NAVFIT 98** can import (legacy “i2” / fleet workflow), so commands can keep using NAVFIT for batch submission to PERS while authoring in APEX.

**Status:** Planning — **blocked on MS Access schema** from stakeholder (table names, field types, keys, import procedure NAVFIT expects).

**Related today in APEX:**
- PDF overlay export (`app/api/pdf`, `lib/pdfOverlay.ts`, CHIEFEVAL/FITREP overlays)
- Export gate: `runFullValidation`, forced distribution, `app/evaluations/[id]/export/page.tsx`
- Canonical domain model: `Evaluation` + `block_values` (Supabase), Zod in `types/navpers.ts`

---

## 1. What we need from you (schema package)

Please provide one or more of:

| Artifact | Why |
|----------|-----|
| **`.mdb` / `.accdb` sample** (sanitized, no PII) | Ground-truth types, indexes, relationships |
| **Table dictionary** (export from Access: name, type, size, required, indexes) | Machine-readable mapping spec |
| **NAVFIT 98 import steps** (menu path, file extension, single vs multi-eval) | Defines deliverable shape (one row per eval vs header/detail) |
| **Sample “golden” import file** that NAVFIT accepts | Regression target for round-trip |
| **Form scope** | EVAL only first, or EVAL + CHIEFEVAL + FITREP (NAVFIT may be E1–E6-centric) |

Document any **fixed codes** NAVFIT uses (duty status, promotion rec, trait grades, occasion/type flags) that differ from APEX strings.

---

## 2. Discovery phase (after schema received)

1. **Inventory Access tables** used on import path (not every table in the DB—only those NAVFIT reads).
2. **Map APEX → Access** field-by-field:
   - `Evaluation` top-level columns
   - `block_values` JSON keys
   - `trait_grades` (EVAL 7 / CHIEFEVAL 7 / FITREP 8)
   - Signatures, summary group tallies, dates (ISO vs YYMMMDD vs Access serial dates)
3. **Identify non-portable data:** Supabase UUIDs, workflow state, audit logs — omit or map to NAVFIT equivalents.
4. **Import constraints:** max string lengths, required fields, enum values, checkbox encoding (`-1`/`0` vs `Y`/`N`).
5. **Spike:** import one APEX seed eval into NAVFIT on a VM; note every error dialog.

**Deliverable:** `docs/specs/navfit98-field-mapping.md` (signed off before build).

---

## 3. Technical options for generating Access-compatible files

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **A. Generate `.mdb` / `.accdb` directly** (e.g. Node: `node-adodb`, Python sidecar: `pyodbc` + Access driver, or export via Jackcess) | Closest to “drop file in NAVFIT folder” | Needs Windows Access drivers or pure-Java Jackcess; schema must be exact | **Preferred** if NAVFIT imports native Access only |
| **B. Generate `.csv` / fixed-width per NAVFIT spec** | Simple, testable | Only if NAVFIT documents CSV import | Use if discovery shows CSV path |
| **C. Generate XML/INI legacy format** | If NAVFIT supports it | Rare | Only if schema proves it |
| **D. Server-side Access automation** (Windows worker) | Uses real Access COM | Ops burden, not Vercel-friendly | Fallback for fleet on-prem |

**APEX default hosting (Vercel):** plan for **API route that returns a downloadable binary** produced by:
- **Phase 1:** build mapping + validation in TypeScript (pure data layer).
- **Phase 2:** implement writer library chosen in discovery (may be a small **Docker/Windows export worker** if Jackcess cannot match NAVFIT’s exact file version).

---

## 4. Proposed architecture (in-repo)

```
lib/navfit98/
  types.ts              # Access row shapes (from schema)
  mapEvaluationToNavfit.ts   # Evaluation → table rows
  validateNavfitPayload.ts   # pre-export gate (required NAVFIT fields)
  writeMdb.ts           # or writeCsv.ts — implementation TBD

app/api/export/navfit98/route.ts   # GET/POST by evaluation id(s)
  - auth + RBAC (reporting senior / admin)
  - runFullValidation + finalized status check (configurable)
  - stream application/octet-stream or .zip (multi-eval batch)

app/evaluations/[id]/export/page.tsx
  - “Download for NAVFIT 98” button next to PDF
```

**Batch export (later):** summary group → zip of one Access DB or one multi-row DB per NAVFIT batch rules.

---

## 5. Validation & compliance

- **Pre-export gate:** reuse `runFullValidation`; add **NAVFIT-specific** checks (fields Access marks NOT NULL, date formats, trait completeness).
- **No silent truncation:** if Access column width < APEX field, **block export** with block-number message (same UX as PDF gate).
- **Audit:** log export events in `auditService` (who, when, eval id, file hash).
- **PII:** export uses same DoD ID policy as PDF (no SSN in APEX fields).

---

## 6. Testing strategy

| Layer | Tests |
|-------|--------|
| Unit | `mapEvaluationToNavfit` fixtures per report_type (EVAL/CHIEFEVAL/FITREP) |
| Golden | Byte-compare or row-compare against stakeholder **golden .mdb** (minus timestamps) |
| Manual | NAVFIT 98 import checklist on Windows VM (document in `docs/how-to/navfit98-import-verify.md`) |
| CI | Unit + mapping only; Access COM tests optional nightly on self-hosted runner |

---

## 7. Phased delivery

### Phase 0 — Inputs (you)
- [ ] MS Access schema / sample DB / import SOP
- [ ] Confirm NAVFIT version and EVAL-only vs multi-form

### Phase 1 — Spec (1–2 weeks)
- [ ] Field mapping doc + gap list (APEX fields with no NAVFIT column)
- [ ] Choose writer technology
- [ ] ADR: `docs/adr/navfit98-export.md`

### Phase 2 — EVAL MVP export (2–3 weeks)
- [ ] Mapper + validator for NAVPERS 1616/26
- [ ] Single-eval download on export page
- [ ] Golden-file test with your sample

### Phase 3 — Batch & parity (1–2 weeks)
- [ ] Summary group batch export (if NAVFIT supports)
- [ ] CHIEFEVAL / FITREP only if NAVFIT 98 supports those forms

### Phase 4 — Fleet hardening
- [ ] Error catalog from pilot commands
- [ ] Optional on-prem export worker for air-gapped DDIL

---

## 8. Open questions (for schema review)

1. Does NAVFIT import **one evaluation per file** or **append to an existing command database**?
2. Are trait grades stored as **text (`4.0`)**, **numeric**, or **separate columns per block**?
3. How are **occasion (10–13)** and **type (16–18)** checkboxes encoded?
4. Is **Block 43** stored in Access at all, or only PDF/print path?
5. Does import require **reporting senior signature blocks** to be empty vs populated?
6. **CHIEFEVAL / FITREP:** same `.mdb` or different templates?

---

## 9. Next step

When you share the Access DB design, we will:
1. Fill `docs/specs/navfit98-field-mapping.md` with a complete column mapping.
2. Estimate Phase 2 effort and pick the writer stack.
3. Open a tracked issue/PR series: `feat/navfit98-export`.

*This plan does not implement export until the schema package is reviewed.*