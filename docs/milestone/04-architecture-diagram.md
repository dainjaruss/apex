# APEX — System Architecture Diagram (Through Week 5)

Use this figure in **Section A** (Software Standards) or **Section C** (UI/Design) of the milestone PDF. Export the Mermaid diagram as PNG/SVG using [mermaid.live](https://mermaid.live) or a VS Code Mermaid extension.

> **Week 5 scope:** The solid nodes show what is built and demonstrable at Week 5 (auth, the EVAL wizard, the validation engine, and Supabase with RLS). Dashed “Planned” nodes show the Week 6–8 layers (PDF export, server-enforced routing/signing, summary groups) that the architecture is designed to accept without restructuring.

---

## Figure A-1. APEX High-Level Architecture

**Suggested caption:** *Figure A-1. APEX architecture at Week 5 — a React/Next.js client with a client-side validation engine over Supabase Postgres with Row Level Security. Server-enforced API routes are designed-for and arrive in Weeks 6–8 (dashed).*

```mermaid
flowchart TB
  subgraph Client["Browser (React / Next.js App Router)"]
    Pages["Pages<br/>Landing · Login/Register · Dashboard · Eval Wizard"]
    Components["Components<br/>Form Blocks · Inline BUPERS Guidance · Validation Modal"]
    LibClient["Client lib<br/>validationEngine · live/final validation hooks · commentFit"]
  end

  subgraph Supabase["Supabase Cloud"]
    AuthSvc["Supabase Auth<br/>email / password"]
    DB[("PostgreSQL")]
    RLS["Row Level Security<br/>owner-scoped reads/writes"]
  end

  subgraph Planned["Planned — Weeks 6–8 (designed-for)"]
    Routes["API Routes<br/>pdf · eval-route · sign · summary-group-attach"]
  end

  Pages --> Components
  Components --> LibClient
  LibClient -->|"validate before save"| LibClient
  LibClient -->|"anon key + JWT"| AuthSvc
  LibClient -->|"RLS-scoped reads/writes"| DB

  Pages -.->|"future fetch POST"| Routes
  Routes -.-> DB

  AuthSvc --> DB
  DB --> RLS
```

---

## Figure A-2. Evaluation Status Lifecycle (Week 5)

**Suggested caption:** *Figure A-2. Week 5 evaluation status lifecycle — a draft becomes ready_for_review once the full validation pass succeeds. The full multi-stage custody routing chain is a Week 7 extension (dashed).*

```mermaid
stateDiagram-v2
  [*] --> draft: Create / save draft
  draft --> draft: Edit (live validation)
  draft --> ready_for_review: Full validation passes
  ready_for_review --> draft: Reopen for edits

  note right of ready_for_review
    Planned (Week 7): custody routing
    Sailor -> Rater -> Senior Rater ->
    Reporting Senior -> Debrief -> Locked
  end note
```

---

## Figure A-3. Application Navigation Map

**Suggested caption:** *Figure A-3. Week 5 navigation structure. Dashed routes are implemented for later-week reveals (export, summary groups, admin).*

```mermaid
flowchart LR
  Landing["/"] --> Login["/login"]
  Landing --> Register["/register"]
  Login --> Dashboard["/dashboard"]
  Register --> Welcome["/welcome"]
  Welcome --> Dashboard

  Dashboard --> NewEval["/evaluations/new"]
  Dashboard --> ViewEval["/evaluations/:id"]
  ViewEval --> EditEval["/evaluations/:id/edit"]
  Dashboard --> Profile["/profile"]

  ViewEval -.->|"Week 6"| Export["/evaluations/:id/export"]
  Dashboard -.->|"post-MVP"| SummaryGroups["/summary-groups"]
  Dashboard -.->|"later"| Admin["/admin"]
```

---

## Figure A-4. Validation Layers (Defense in Depth)

**Suggested caption:** *Figure A-4. Week 5 validation enforcement — live UI validation, the EVALMAN-cited rules engine, and database constraints/RLS. Server-route authorization and RBAC are added in Weeks 6–9 (dashed).*

```mermaid
flowchart TD
  Input["User input<br/>(form field / save)"]
  L1["Layer 1: Live UI validation<br/>Zod + inline BUPERS guidance"]
  L2["Layer 2: Validation engine<br/>runFullValidation() · EVALMAN-cited rules · comment-fit"]
  L3["Layer 3: Database<br/>RLS (owner-scoped) · CHECK constraints"]
  Planned["Planned (Weeks 6–9):<br/>API-route authorization · RoleGuard RBAC"]

  Input --> L1
  L1 -->|"valid"| L2
  L2 -->|"passes"| L3
  L1 -->|"invalid"| Deny["Inline error / blocked save"]
  L2 -->|"errors"| Deny
  L3 -.-> Planned
```

---

## Figure A-5. Data Model (Week 5 — Migration 001)

**Suggested caption:** *Figure A-5. Core entities from the initial schema (migration 001). The summary_groups table and evaluation custody columns are added in migration 002 for the Week 7 routing feature.*

```mermaid
erDiagram
  profiles ||--o{ evaluations : "creates"
  form_definitions ||--o{ evaluations : "form_definition_id"
  evaluations ||--o{ audit_logs : "evaluation_id"
  evaluations ||--o{ review_approvals : "evaluation_id"

  profiles {
    uuid id PK
    text navy_rank
    text uic
    text preferred_role
    text dod_id
  }

  evaluations {
    uuid id PK
    uuid created_by FK
    uuid form_definition_id FK
    text status
    numeric trait_average
    jsonb trait_grades
    jsonb block_values
  }

  form_definitions {
    uuid id PK
    text form_code
    text navpers_number
    jsonb blocks
  }

  audit_logs {
    uuid id PK
    uuid evaluation_id FK
    uuid user_id FK
    text action
    jsonb details
  }
```

---

## How to Export for PDF

### Option A — Mermaid Live Editor
1. Open https://mermaid.live
2. Paste diagram code from above
3. Export → PNG or SVG
4. Insert into Word/Google Docs at ~6.5" width

### Option B — VS Code
1. Install “Markdown Preview Mermaid Support”
2. Preview this file
3. Screenshot or use export extension

### Option C — ASCII (fallback if Mermaid export unavailable)

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (React / Next.js)                 │
│  Landing · Login/Register · Dashboard · EVAL Wizard          │
│  Validation engine + comment-fit run client-side            │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS (anon key + JWT)
┌───────────────────────────▼─────────────────────────────────┐
│                    SUPABASE (Auth + Postgres)                │
│  Row Level Security (owner-scoped) · CHECK constraints       │
│  profiles · evaluations · form_definitions · audit_logs      │
└─────────────────────────────────────────────────────────────┘
   · · · Planned (Weeks 6–8): Next.js API routes for PDF,
         server-enforced routing/signing, and summary groups · · ·
```

---

## Recommended Figures for the Week 5 PDF

| Include | Figure | Page estimate |
|---------|--------|---------------|
| Required | A-1 High-Level Architecture (Week 5) | 0.5 page |
| Required | A-3 Navigation Map | 0.25 page |
| Optional | A-2 Status Lifecycle | 0.25 page |
| Optional | A-4 Validation Layers | 0.25 page |
| Optional | A-5 Data Model (Migration 001) | 0.5 page |

**Minimum for rubric:** A-1 + A-3 plus the 8 UI screenshots from `02-screenshot-capture-list.md`.

---

*End of architecture diagram document.*
