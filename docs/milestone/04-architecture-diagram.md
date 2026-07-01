# APEX — System Architecture Diagram

Use this figure in **Section A** (Software Standards) or **Section C** (UI/Design) of the milestone PDF. Export the Mermaid diagram as PNG/SVG using [mermaid.live](https://mermaid.live) or a VS Code Mermaid extension.

---

## Figure A-1. APEX High-Level Architecture

**Suggested caption:** *Figure A-1. APEX three-tier architecture — React/Next.js client, authenticated API routes with server-side authorization, and Supabase Postgres with Row Level Security.*

```mermaid
flowchart TB
  subgraph Client["Browser (React / Next.js App Router)"]
    Pages["Pages<br/>Dashboard · Eval Wizard · Review Workflow · Export"]
    Components["Components<br/>Form Blocks · Signature Pad · RoleGuard"]
    LibClient["Client lib<br/>permissions · validation hooks · supabase anon"]
  end

  subgraph Server["Next.js Server (API Routes)"]
    Auth["Session<br/>getRouteUserId()"]
    Routes["Enforced Routes<br/>eval-route · sign · eval-lock<br/>eval-correct · eval-finalize<br/>summary-group-attach · pdf"]
    AdminClient["Service Role Client<br/>createAdminClient()"]
  end

  subgraph Supabase["Supabase Cloud"]
    AuthSvc["Supabase Auth<br/>email / password"]
    DB[("PostgreSQL")]
    RLS["Row Level Security<br/>custody · participants · oversight"]
    Triggers["Triggers<br/>enforce_summary_group_fields"]
  end

  Pages --> Components
  Components --> LibClient
  LibClient -->|"anon key + JWT"| AuthSvc
  LibClient -->|"RLS-scoped reads/writes"| DB

  Pages -->|"fetch POST"| Routes
  Routes --> Auth
  Auth --> AuthSvc
  Routes -->|"authorize caller"| AdminClient
  AdminClient -->|"bypass RLS for<br/>validated writes"| DB

  DB --> RLS
  DB --> Triggers
  AuthSvc --> DB
```

---

## Figure A-2. Evaluation Routing State Machine

**Suggested caption:** *Figure A-2. Custody routing stages — each transition is authorized by role and recorded in audit_logs.*

```mermaid
stateDiagram-v2
  [*] --> sailor: Create draft
  sailor --> rater: Route forward
  rater --> senior_rater: Route forward
  senior_rater --> reporting_senior: Route forward
  reporting_senior --> debrief: Begin debrief
  debrief --> locked: RS signs Block 50 / finalize
  locked --> [*]

  rater --> sailor: Recycle
  senior_rater --> rater: Recycle
  reporting_senior --> senior_rater: Recycle
```

---

## Figure A-3. Application Navigation Map

**Suggested caption:** *Figure A-3. Primary navigation structure — role-gated entries shown in dashed boxes.*

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
  ViewEval --> Export["/evaluations/:id/export"]

  Dashboard -.->|"RS / Admin"| SummaryGroups["/summary-groups"]
  Dashboard -.->|"Admin"| Admin["/admin"]
  Dashboard --> Profile["/profile"]

  ViewEval --> PDFPreview["/pdf-preview"]
```

---

## Figure A-4. Security Layers (Defense in Depth)

**Suggested caption:** *Figure A-4. Security enforcement layers applied to every sensitive evaluation action.*

```mermaid
flowchart TD
  Request["User action<br/>(route, sign, attach group)"]
  L1["Layer 1: UI<br/>hasPermission() · RoleGuard"]
  L2["Layer 2: API Route<br/>session + custody + role check"]
  L3["Layer 3: Business rules<br/>Zod · BUPERS eligibility"]
  L4["Layer 4: Database<br/>RLS · triggers · constraints"]
  Audit["audit_logs"]

  Request --> L1
  L1 -->|"allowed"| L2
  L2 -->|"authorized"| L3
  L3 -->|"valid"| L4
  L4 --> Audit
  L1 -->|"denied"| Deny["403 / hidden control"]
  L2 -->|"denied"| Deny
  L3 -->|"denied"| Deny
```

---

## Figure A-5. Data Model (Core Entities)

**Suggested caption:** *Figure A-5. Core database entities and relationships for evaluations, profiles, and summary groups.*

```mermaid
erDiagram
  profiles ||--o{ evaluations : "creates / holds"
  profiles ||--o{ summary_groups : "reporting_senior"
  summary_groups ||--o{ evaluations : "summary_group_id"
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
    uuid current_holder_id FK
    uuid summary_group_id FK
    text routing_stage
    uuid[] participants
    jsonb block_values
    jsonb trait_grades
  }

  summary_groups {
    uuid id PK
    uuid reporting_senior_id FK
    date period_to
    text grade_rate
    text promotion_status
    text status
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
│  Dashboard · Eval Wizard · Review Workflow · PDF Export      │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────┐
│              NEXT.JS API ROUTES (authorized)                 │
│  eval-route · sign · eval-lock · summary-group-attach · pdf  │
└───────────────────────────┬─────────────────────────────────┘
                            │ service role (after auth check)
┌───────────────────────────▼─────────────────────────────────┐
│                    SUPABASE (Auth + Postgres)                │
│  RLS · audit_logs · triggers · summary_groups                │
└─────────────────────────────────────────────────────────────┘
```

---

## Recommended Figures for 7–10 Page PDF

| Include | Figure | Page estimate |
|---------|--------|---------------|
| Required | A-1 High-Level Architecture | 0.5 page |
| Required | A-3 Navigation Map | 0.25 page |
| Optional | A-2 Routing State Machine | 0.25 page |
| Optional | A-4 Security Layers | 0.25 page |
| Optional | A-5 Data Model | 0.5 page |

**Minimum for rubric:** A-1 + A-3 plus 8 UI screenshots from `02-screenshot-capture-list.md`.

---

*End of architecture diagram document.*
