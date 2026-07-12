# APEX – Advanced Performance Evaluation eXchange

**A Web-Based Navy Fitness Report Management System with Real-Time Validation and Officially Compliant PDF Export**

**Student:** Dain A. Franklyn  
**Course:** CIS 5898 – Projects in Computer Information Systems  
**Professor:** Kaled Slhoub, PhD  
**Institution:** Florida Institute of Technology  
**Term:** Summer 2026 (8-Week Term 1)  
**Date:** 12 July 2026

## Project Overview

APEX is a full-stack web application that digitizes and modernizes the U.S. Navy enlisted performance evaluation workflow. It strictly follows BUPERSINST 1610.10H (EVALMAN) and the official NAVPERS forms while adding real-time validation, Canvas-based overflow detection, secure role-based workflow, and client-side PDF generation that exactly matches the 2025 Navy templates. The application demonstrates a production-grade solution to documented fleet pain points including formatting rejections, manual routing delays, and DDIL limitations.

## Technologies and Resources Used

All libraries and frameworks are open-source. Exact versions, licenses, and attributions are listed in `package.json` (included in this zip). Full source comments and a dedicated README section also document every dependency.

**Frontend**

- Next.js 14 (App Router) + React + TypeScript
- Tailwind CSS + shadcn/ui

**Backend / Database / Auth**

- Supabase (managed PostgreSQL, Auth, Storage, Edge Functions, Row Level Security)

**Core Features**

- Custom Canvas text-measurement utility (`lib/validationEngine.ts`)
- pdf-lib for client-side PDF generation (`lib/pdfOverlay.ts`)
- Self-hosted Courier Prime monospace fonts (`public/fonts/`)

**Testing & Deployment**

- Vitest (unit/integration)
- Playwright (end-to-end)
- Vercel (frontend) + Supabase (backend)

**Data Sources**

- _BUPERSINST 1610.10H_ (attached PDF: MYZh6)
- _NAVPERS 1616/26_ (attached PDF: SsRg8)
- Parsed into `lib/bupersGuidelines.json` for runtime use

No proprietary or closed-source components were used. The complete source tree, including `package.json`, all source files, migrations, tests, and the two Navy reference PDFs, is contained in this submission zip.

## Setup and Running the Program

### 1. Prerequisites & Installation

- **Node.js:** v18.0.0 or higher (`node -v`)
- **Package Manager:** `npm` (included with Node.js)
- **Editor:** VS Code or any modern development environment

To install project dependencies, open your terminal in the project root and run:

```bash
npm install
```

### 2. Environment Configuration (`.env.local`)

Copy the provided `.env.example` file to create your local environment configuration:

```bash
cp .env.example .env.local
```

Configure the required Supabase environment variables in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Optional: Seed testing password for E2E accounts
E2E_TEST_PASSWORD=your_secure_test_password
```

### 3. Database & Seeding Setup

If connecting to a fresh Supabase project or local Supabase instance:

1. Apply the SQL schema migrations located in `supabase/migrations/` (either via the Supabase dashboard SQL editor or `npx supabase db reset`).
2. Seed the database with standardized test roles, Navy command hierarchies, and sample evaluations:

```bash
npm run db:seed
```

_(To reset and re-seed the database at any time, run `npm run db:seed:reset`)_. Detailed information about the seeded test users, summary groups, and stress testing evaluations can be found in the [Test Users & Evaluation Data Guide](docs/test-users-and-evals.md).

### 4. Running the Application Locally

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your web browser. The system will load the APEX portal.

### 5. Running Automated Test Suites

APEX includes extensive unit, integration, and end-to-end (E2E) test suites to ensure strict BUPERSINST 1610.10H compliance:

- **Unit & Integration Tests (Vitest):**
  ```bash
  npm run test
  ```
- **Run All Tests Across All Scopes:**
  ```bash
  npm run test:all
  ```
- **End-to-End Workflow Tests (Playwright):**
  ```bash
  npm run test:e2e
  ```
- **Codebase Linting & Formatting (Prettier):**
  ```bash
  npm run format
  ```

---

## How to Use APEX (Step-by-Step User Guide)

APEX enforces a structured, role-based chain of command workflow modeled directly after official Navy evaluation procedures. Below is the complete step-by-step guide for drafting, validating, reviewing, signing, and exporting a NAVPERS 1616/26 evaluation report.

### Step 1: Authentication & Role Selection

1. **Log In:** Navigate to `/login` and sign in using your account credentials (or one of the seeded `@franklyn.dev` test accounts; see [docs/test-users-and-evals.md](docs/test-users-and-evals.md) for the complete list of test credentials, summary groups, and pre-seeded evaluations).
2. **Profile & Role Configuration:** Every user profile has an assigned Navy rank, UIC, command name, and a **Preferred Role**:
   - `Sailor` (Evaluated member creating their initial input/draft)
   - `Rater` (Chief Petty Officer / E7–E9 drafting performance trait marks)
   - `Senior Rater` (Division Officer / Department Head conducting intermediate review)
   - `Reporting Senior` (Commanding Officer / O4+ authorizing final signature & forced distribution)
   - `Admin` (Personnel/Admin office oversight)

### Step 2: Drafting a New NAVPERS 1616/26 Evaluation

1. From the dashboard, click **"Draft New Evaluation"** (or select an existing draft to edit).
2. **Administrative Blocks (1–19, 21, 28, 29):** Enter the evaluated member's full name (`LAST, FIRST MI`), rate, designator, DoD ID (synthetic 10-digit number), UIC, ship/station, duty status, promotion status, date reported, and report period (`From` / `To`). Select the appropriate multi-select **Occasion for Report** (Blocks 10–13) and **Type of Report** (Blocks 16–18).
3. **Performance Trait Grades (Blocks 33–39):** Grade the seven core performance traits (`Professional Knowledge`, `Quality of Work`, `Command/Org Climate/EO`, `Military Bearing/Character`, `Personal Job Accomplishment/Initiative`, `Teamwork`, `Leadership`) from `1.0` to `5.0` or `NOB` (Not Observed). The system automatically calculates the Block 40 **Individual Trait Average**.
4. **Narrative Comments (Block 43) & Qualifications (Block 44):** Enter performance substantiations, command achievements, and earned qualifications.

### Step 3: Real-Time BUPERS Validation & Courier Line Wrap Engine

As you type, APEX runs continuous validation against `BUPERSINST 1610.10H` rules via `lib/validationEngine.ts`:

- **Inline Guidelines:** Click or focus any field to view context-sensitive Navy regulations parsed from `lib/bupersGuidelines.json`.
- **Block 43 Physical Box Measurement:** Instead of generic character counts, APEX uses an exact HTML5 Canvas text-measurement algorithm (`checkCommentFit`) to calculate exact physical line wrapping at 10-pitch and 12-pitch Courier font sizes. If your narrative exceeds the physical bounds of the official box on NAVPERS 1616/26, the system immediately highlights the overflow line count and blocks submission.
- **Substantiation & Promotion Gates:** The engine enforces hard policy gates—such as requiring Block 43 comments to explicitly substantiate any `1.0` mark or three+ `2.0` marks, and flagging any `2.0` mark in Command Climate (`Block 35`) or Character (`Block 36`) that attempts to receive a `Promotable` or higher recommendation.

### Step 4: Review Workflow & Chain of Command Routing

Custody passes sequentially through the chain of command:

1. **Route Forward:** Once a Sailor or Rater completes their portion, open the **Review Workflow** tab on the evaluation report screen (`/evaluations/[id]`). Select the next custodian from the dropdown (`Rater` → `Senior Rater` → `Reporting Senior`) and click **"Route Forward →"**.
2. **Recycle for Correction:** If a reviewer identifies an error or missing detail, they can enter corrective feedback in the comments box and click **"← Recycle to Previous Holder"**. This returns custody one step back while preserving a complete, immutable audit trail in the **Recycle / Review History** timeline (`review_approvals`).
3. **Debrief & Minor Corrections:** When custody reaches the Reporting Senior or Admin, they can initiate **"Begin Debrief"**. During debrief, participants can apply whitelisted administrative or narrative corrections via `/api/eval-correct` without restarting the entire routing chain.

### Step 5: Digital Signatures & Report Locking

Digital signatures are applied sequentially in the **Details / Signatures** panel (`/api/sign`):

1. **Sign Blocks 47–49:** The Member (`Block 47`), Rater (`Block 48`), and Senior Rater (`Block 49`) authenticate with their email, password, and typed name. The system generates a cryptographic timestamp and records the signature action in the `audit_logs` table.
2. **Reporting Senior Signature (Block 50 — Final Lock):** When the Reporting Senior signs `Block 50`, the system automatically locks the report (`signature_locked: true`, `routing_stage: 'locked'`). Once locked, all input fields become read-only across the application.

### Step 6: Summary Group & Forced Distribution Compliance (EVALMAN Table 1-2)

For evaluations within a competitive summary group (same paygrade, promotion status, ending date, and Reporting Senior):

1. **Summary Group Eligibility:** During routing or review, select an eligible summary group from the Group Picker. The system enforces `enforce_summary_group_fields()` triggers at the database level to guarantee that shared group fields (`period_to`, `grade_rate`, `promotion_status`, `report_type`, `command`) are frozen and identical across all attached evaluations.
2. **Forced Distribution Gate:** Before finalization (`/api/eval-finalize`), APEX evaluates the summary group's promotion recommendations (`Early Promote`, `Must Promote`, `Promotable`, `Progressing`, `Significant Problems`) against the strict mathematical caps of **EVALMAN Table 1-2** (`checkForcedDistribution`). If the group exceeds the maximum allowable `Early Promote` quota, finalization and export are strictly blocked until the Reporting Senior adjusts the group distribution.

### Step 7: Official PDF Export & Verification

Once an evaluation passes all validation checks and forced distribution rules:

1. Navigate to the **Export Portal** (`/evaluations/[id]/export`).
2. Review the **EVALMAN Validation Check Results** summary indicating all rules and Courier text bounds are `PASSED`.
3. Click **"View Document Preview"** or **"Download Official NAVPERS 1616/26 PDF"**.
4. The system invokes `lib/pdfOverlay.ts` and `@pdf-lib/fontkit`, rendering the exact evaluation data onto the official unauthenticated NAVPERS 1616/26 form template (`SsRg8.pdf`) using embedded Courier Prime monospace fonts. The exported PDF is pixel-perfect, fully compliant, and ready for physical signature or direct transmission to `PERS-32`.

---

## Citations and Attribution

All official Navy documents are attached as PDFs (`BUPERSINST 1610.10.pdf` and `navpers-1616-26_2025.pdf`) and cited in the report (MLA style). Every open-source library is listed with exact versions in `package.json` and attributed with license notices and inline comments throughout the source code.

**AI Attribution & Code Assistance Disclosure:**
To accelerate development and maintain alignment with modern software engineering practices, AI assistance was utilized in the following project areas:

- **Seed Scripts & Generated Data:** Development of the E2E database seeder (`scripts/seed-e2e.ts`) and stress test data seeder (`scripts/seed-stress.ts`), as well as the generation of realistic synthetic evaluation files (`tests/fixtures/e2e-ids.json` and `tests/fixtures/stress-evals-summary.json`).
- **Boilerplate Test Cases & Fixtures:** Construction of initial Playwright and Vitest test scaffolding, mock test suite fixtures, and basic validation wrappers.
- **Codebase Sanitization & Comment Cleanup:** Configuring and executing Prettier to standardize code indentation, spacing, and semi-colon consistency across all TypeScript, TSX, and JSON files, alongside removing or re-aligning temporary academic grading checklists, scaffolding instructions, and redundant development comments to ensure a clean, production-ready repository.

**Dain A. Franklyn**  
Florida Institute of Technology  
July 2026
