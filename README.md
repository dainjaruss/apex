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
- *BUPERSINST 1610.10H* (attached PDF: MYZh6)  
- *NAVPERS 1616/26* (attached PDF: SsRg8)  
- Parsed into `lib/bupersGuidelines.json` for runtime use  

No proprietary or closed-source components were used. The complete source tree, including `package.json`, all source files, migrations, tests, and the two Navy reference PDFs, is contained in this submission zip.

## Setup and Running (for Grading)
1. Unzip the archive.  
2. Open the folder in VS Code (or any editor).  
3. Review `package.json` for the complete dependency list and `README.md` for attributions.  
4. The report document and both Navy PDFs are in the root for immediate verification.  
5. The application can be started locally with `npm run dev` if desired (`.env.example` is provided).

## Citations and Attribution
All official Navy documents are attached as PDFs and cited in the report (MLA style). Every open-source library is listed with version in `package.json` and attributed with license notices and inline comments throughout the source code. This zip contains everything the professor needs for complete offline grading.

**Dain A. Franklyn**  
Florida Institute of Technology  
July 2026