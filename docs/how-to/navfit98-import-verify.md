# Verifying an APEX export in NAVFIT 98A

Automated round-trip tests (`tests/integration/navfit98Roundtrip.test.ts`)
prove the exported `.accdb` is structurally valid and byte-faithful to the
mapping spec. This checklist covers the part only a real NAVFIT 98A install
can prove: that NAVFIT displays, validates, and prints the imported reports.

Run it on a Windows machine with NAVFIT 98A **v30 or later** (the version
that uses `.accdb` databases).

## 1. Get the file

Export page → **Download for NAVFIT 98** (eval must be finalized/locked).
You get `NAVFIT98_<MEMBER_NAME>.accdb`.

## 2. Open it directly (primary path)

1. NAVFIT 98A → **File > Open Database** → select the downloaded `.accdb`.
2. Expand the **Root** folder — every exported report must be listed.
   *A report missing here means a broken `Reports.Parent` link (must be
   `"a " + FolderID`).*
3. Open each report and walk the blocks against the APEX PDF export:
   - Blocks 1–5: name, rate, designator. **Block 4 (SSN) is blank by
     design** — APEX stores DoD IDs, never SSNs. Key the SSN in NAVFIT if
     the command requires it.
   - Blocks 10–13 / 16–18: occasion and type checkboxes.
   - Blocks 14–15: period from/to dates (watch for off-by-one-day — would
     indicate a timezone bug; report it).
   - Block 20: physical readiness codes.
   - Blocks 29–31: primary duties, date counseled (`YYMMMDD`), counselor.
   - Blocks 33–39: trait grades on the correct rows. **For CHIEFEVAL,
     compare extra carefully** — the trait-column assignment is inferred
     (spec §8 open question 2).
   - Blocks 41–46: comments, qualifications, promotion recommendation,
     summary counts.
   - Block 47+: reporting senior info and address.
4. Run NAVFIT's own validation on a report (it will re-validate — APEX
   exports `IsValidated = 0` deliberately).
5. Print preview a report and compare against the APEX PDF.

## 3. Import into an existing command database (secondary path)

1. Open the command's working database, then **File > Import Data** and
   select the APEX `.accdb`.
2. Choose the Root folder — NAVFIT copies the folder and all reports
   under it.
3. Re-check steps 2.2–2.5 on the imported copies.

## 4. Record results

File findings as issues tagged `navfit98`. The open questions in
`docs/specs/navfit98-field-mapping.md` §8 each name what to look for —
especially `DateCounseled` display, CHIEFEVAL trait rows, and the
`ReportType` strings for FITREP/CHIEFEVAL ("FitRep"/"Chief" casing is
unverified against a NAVFIT-produced officer database).
