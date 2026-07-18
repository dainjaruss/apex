// components/board/RecordEntryForm.tsx
//
// Structured PSR/ESR record entry for the Board Confidence Analyzer (spec §6,
// tab 1). All data here is member-entered reference data persisted to
// member_board_records. The free-form quals section is reference-only and is
// never read by the rubric. v1.5: uploaded documents can be parsed on demand
// ("Extract to record") into editable award/NEC/education/PFA rows so uploads
// feed the board confidence determination; nothing is scored until saved.
//

"use client";

import React, { useEffect, useRef, useState } from "react";
import type {
  AdverseEntry,
  AwardEntry,
  AwardLevel,
  EducationEntry,
  MemberBoardRecord,
  NecEntry,
  PfaCycle,
  QualEntry,
  TourEntry,
} from "@/lib/boardConfidence/types";
import {
  deleteBoardDoc,
  extractBoardDoc,
  listBoardDocs,
  uploadBoardDoc,
} from "@/lib/boardConfidenceService";
import { NAVY_RATINGS } from "@/lib/boardConfidence/ratings";

export interface FinalizedEvalRef {
  period_from: string;
  period_to: string;
  report_type: string;
}

interface RecordEntryFormProps {
  userId: string;
  record: MemberBoardRecord;
  ratings: string[];
  finalizedEvals: FinalizedEvalRef[];
  onChange: (patch: Partial<MemberBoardRecord>) => void;
  onSave: () => void;
  saving: boolean;
}

const AWARD_LEVELS: Array<[AwardLevel, string]> = [
  ["personal_achievement", "Personal achievement (NAM-tier)"],
  ["personal_commendation", "Personal commendation (NCM-tier)"],
  ["msm_or_above", "MSM and above"],
  ["unit", "Unit / campaign award"],
];

const EDUCATION_KINDS: Array<[EducationEntry["kind"], string]> = [
  ["degree", "Degree"],
  ["jst_credit", "JST credit"],
  ["course", "Course"],
];

const ADVERSE_KINDS: Array<[AdverseEntry["kind"], string]> = [
  ["page13", "Page 13"],
  ["njp", "NJP"],
  ["court_memo", "Court memo"],
  ["punitive_letter", "Punitive letter"],
  ["civil_conviction", "Civil conviction"],
  ["other", "Other"],
];

function upd<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((r, j) => (j === i ? { ...r, ...patch } : r));
}
function rm<T>(arr: T[], i: number): T[] {
  return arr.filter((_, j) => j !== i);
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className || ""}`}>
      <span className="apex-filter-label">{label}</span>
      {children}
    </label>
  );
}

// v1.3 typed record documents. FC 30-38 = the OMPF field codes a board sees
// (fitness reports/evals and related performance documents).
const DOC_TYPES = {
  ESR: "ESR (Electronic Service Record export)",
  PSR: "PSR (Performance Summary Record)",
  OMPF_FC_30_38: "OMPF documents, field codes 30–38",
} as const;

/** "ESR__file.pdf" → { label: "ESR", file: "file.pdf" } (legacy names untyped). */
function splitDocName(name: string): { label: string | null; file: string } {
  const i = name.indexOf("__");
  if (i > 0 && name.slice(0, i) in DOC_TYPES)
    return { label: name.slice(0, i).replace(/_/g, " "), file: name.slice(i + 2) };
  return { label: null, file: name };
}

function Section({
  title,
  hint,
  onAdd,
  empty,
  children,
}: {
  title: string;
  hint?: string;
  onAdd?: () => void;
  empty?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="apex-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
          {title}
        </h3>
        {onAdd && (
          <button
            type="button"
            className="apex-btn-secondary py-1 px-3 text-xs"
            onClick={onAdd}
          >
            + Add
          </button>
        )}
      </div>
      {hint && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {hint}
        </p>
      )}
      {empty ? (
        <p className="text-xs" style={{ color: "var(--subtle)" }}>
          None entered.
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-end gap-3 border-b pb-3 last:border-b-0 last:pb-0"
      style={{ borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

function VerifiedCheckbox({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <label
      className="flex items-center gap-2 text-xs pb-2"
      style={{ color: "var(--muted-foreground)" }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
      />
      Verified in OMPF
    </label>
  );
}

function RemoveButton({
  onClick,
  ariaLabel,
}: {
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className="apex-btn-secondary py-1 px-2.5 text-xs mb-1"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      ✕
    </button>
  );
}

export default function RecordEntryForm({
  userId,
  record,
  ratings,
  finalizedEvals,
  onChange,
  onSave,
  saving,
}: RecordEntryFormProps) {
  // ---- Attachments (reference-only storage, never parsed) ----
  // v1.3: typed record documents (ESR / PSR / OMPF FC 30-38), gated by a
  // PII-redaction confirmation; session-ephemeral (destroyed at logout).
  const [docs, setDocs] = useState<{ name: string }[]>([]);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docType, setDocType] = useState<keyof typeof DOC_TYPES>("ESR");
  const [redactionConfirmed, setRedactionConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listBoardDocs(userId)
      .then(setDocs)
      .catch((err: any) => setDocError(err?.message || "Could not list attachments."));
  }, [userId]);

  const handleUpload = async (file: File) => {
    if (!redactionConfirmed) {
      setDocError("Confirm PII redaction before uploading.");
      return;
    }
    setDocBusy(true);
    setDocError(null);
    try {
      // Stored name carries the document type so the list can label it.
      const typed = new File([file], `${docType}__${file.name}`, {
        type: file.type,
      });
      await uploadBoardDoc(userId, typed);
      setDocs(await listBoardDocs(userId));
    } catch (err: any) {
      setDocError(err?.message || "Upload failed.");
    } finally {
      setDocBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // v1.5: parse a stored doc into record suggestions and merge the new ones
  // into the editable form (dedup by title/code/cycle; nothing is saved or
  // scored until the member reviews the rows and clicks Save record).
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const handleExtractDoc = async (name: string) => {
    setDocBusy(true);
    setDocError(null);
    setExtractNote(null);
    try {
      const s = await extractBoardDoc(userId, name);
      const has = (list: { title?: string; code?: string; cycle?: string }[], v: string) =>
        list.some(
          (e) => (e.title ?? e.code ?? e.cycle ?? "").toLowerCase() === v.toLowerCase(),
        );
      const awards = s.awards.filter((a) => !has(record.awards, a.title));
      const necs = s.necs.filter((n) => !record.necs.some((e) => e.code === n.code));
      const education = s.education.filter((e) => !has(record.education, e.title));
      const pfa = s.pfa.filter((p) => !record.pfa_history.some((e) => e.cycle === p.cycle));
      onChange({
        awards: [...record.awards, ...awards],
        necs: [...record.necs, ...necs],
        education: [...record.education, ...education],
        pfa_history: [...record.pfa_history, ...pfa],
      });
      const total = awards.length + necs.length + education.length + pfa.length;
      setExtractNote(
        total === 0
          ? "No new entries found in that document."
          : `Added ${awards.length} award(s), ${necs.length} NEC(s), ${education.length} education, ${pfa.length} PFA cycle(s) — review the rows above, then Save record.`,
      );
    } catch (err: any) {
      setDocError(err?.message || "Extraction failed.");
    } finally {
      setDocBusy(false);
    }
  };

  const handleDeleteDoc = async (name: string) => {
    setDocBusy(true);
    setDocError(null);
    try {
      await deleteBoardDoc(userId, name);
      setDocs(await listBoardDocs(userId));
    } catch (err: any) {
      setDocError(err?.message || "Delete failed.");
    } finally {
      setDocBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Rating + target paygrade */}
      <section className="apex-card p-4 grid gap-4 sm:grid-cols-2">
        <Field label="Rating">
          <select
            className="apex-select"
            aria-label="Rating (selects which LaDR checklist loads)"
            value={record.rating_abbrev ?? ""}
            onChange={(e) => onChange({ rating_abbrev: e.target.value || null })}
          >
            <option value="">Select rating…</option>
            {/* v1.4: full static catalog — the dropdown works before any LaDR
                is stored; DB-stored ratings are annotated. */}
            {NAVY_RATINGS.map((r) => (
              <option key={r.abbrev} value={r.abbrev}>
                {r.abbrev} — {r.name}
                {ratings.includes(r.abbrev) ? " · LaDR stored" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target paygrade">
          <select
            className="apex-select"
            aria-label="Target paygrade"
            value={record.target_paygrade ?? ""}
            onChange={(e) =>
              onChange({
                target_paygrade: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">Select…</option>
            {[4, 5, 6, 7, 8, 9].map((p) => (
              <option key={p} value={p}>
                E-{p}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {/* Awards */}
      <Section
        title="Awards"
        hint="Personal and unit decorations from your PSR/OMPF. Unverified entries count at half value."
        onAdd={() =>
          onChange({
            awards: [
              ...record.awards,
              {
                title: "",
                level: "personal_achievement",
                date_awarded: "",
                verified_in_ompf: false,
              } as AwardEntry,
            ],
          })
        }
        empty={record.awards.length === 0}
      >
        {record.awards.map((a, i) => (
          <Row key={i}>
            <Field label="Title" className="min-w-[14rem] flex-1">
              <input
                className="apex-input"
                value={a.title}
                onChange={(e) =>
                  onChange({ awards: upd(record.awards, i, { title: e.target.value }) })
                }
              />
            </Field>
            <Field label="Level">
              <select
                className="apex-select"
                aria-label={`Award level for award ${i + 1}`}
                value={a.level}
                onChange={(e) =>
                  onChange({
                    awards: upd(record.awards, i, {
                      level: e.target.value as AwardLevel,
                    }),
                  })
                }
              >
                {AWARD_LEVELS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date awarded">
              <input
                type="date"
                className="apex-input"
                value={a.date_awarded}
                onChange={(e) =>
                  onChange({
                    awards: upd(record.awards, i, { date_awarded: e.target.value }),
                  })
                }
              />
            </Field>
            <VerifiedCheckbox
              checked={a.verified_in_ompf}
              onChange={(v) =>
                onChange({ awards: upd(record.awards, i, { verified_in_ompf: v }) })
              }
              ariaLabel={`Award ${i + 1} verified in OMPF`}
            />
            <RemoveButton
              onClick={() => onChange({ awards: rm(record.awards, i) })}
              ariaLabel={`Remove award ${i + 1}`}
            />
          </Row>
        ))}
      </Section>

      {/* NECs */}
      <Section
        title="NECs"
        hint="Navy Enlisted Classifications held."
        onAdd={() =>
          onChange({
            necs: [
              ...record.necs,
              { code: "", title: "", verified_in_ompf: false } as NecEntry,
            ],
          })
        }
        empty={record.necs.length === 0}
      >
        {record.necs.map((n, i) => (
          <Row key={i}>
            <Field label="Code">
              <input
                className="apex-input max-w-[8rem]"
                value={n.code}
                onChange={(e) =>
                  onChange({ necs: upd(record.necs, i, { code: e.target.value }) })
                }
              />
            </Field>
            <Field label="Title" className="min-w-[12rem] flex-1">
              <input
                className="apex-input"
                value={n.title ?? ""}
                onChange={(e) =>
                  onChange({
                    necs: upd(record.necs, i, { title: e.target.value || undefined }),
                  })
                }
              />
            </Field>
            <Field label="Date awarded">
              <input
                type="date"
                className="apex-input"
                value={n.date_awarded ?? ""}
                onChange={(e) =>
                  onChange({
                    necs: upd(record.necs, i, {
                      date_awarded: e.target.value || undefined,
                    }),
                  })
                }
              />
            </Field>
            <VerifiedCheckbox
              checked={n.verified_in_ompf}
              onChange={(v) =>
                onChange({ necs: upd(record.necs, i, { verified_in_ompf: v }) })
              }
              ariaLabel={`NEC ${i + 1} verified in OMPF`}
            />
            <RemoveButton
              onClick={() => onChange({ necs: rm(record.necs, i) })}
              ariaLabel={`Remove NEC ${i + 1}`}
            />
          </Row>
        ))}
      </Section>

      {/* Education */}
      <Section
        title="Education"
        hint="Degrees, JST credit, and completed courses."
        onAdd={() =>
          onChange({
            education: [
              ...record.education,
              { kind: "degree", title: "", verified_in_ompf: false } as EducationEntry,
            ],
          })
        }
        empty={record.education.length === 0}
      >
        {record.education.map((ed, i) => (
          <Row key={i}>
            <Field label="Kind">
              <select
                className="apex-select"
                aria-label={`Education entry ${i + 1} kind`}
                value={ed.kind}
                onChange={(e) =>
                  onChange({
                    education: upd(record.education, i, {
                      kind: e.target.value as EducationEntry["kind"],
                    }),
                  })
                }
              >
                {EDUCATION_KINDS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" className="min-w-[14rem] flex-1">
              <input
                className="apex-input"
                value={ed.title}
                onChange={(e) =>
                  onChange({
                    education: upd(record.education, i, { title: e.target.value }),
                  })
                }
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                className="apex-input"
                value={ed.date ?? ""}
                onChange={(e) =>
                  onChange({
                    education: upd(record.education, i, {
                      date: e.target.value || undefined,
                    }),
                  })
                }
              />
            </Field>
            <VerifiedCheckbox
              checked={ed.verified_in_ompf}
              onChange={(v) =>
                onChange({
                  education: upd(record.education, i, { verified_in_ompf: v }),
                })
              }
              ariaLabel={`Education entry ${i + 1} verified in OMPF`}
            />
            <RemoveButton
              onClick={() => onChange({ education: rm(record.education, i) })}
              ariaLabel={`Remove education entry ${i + 1}`}
            />
          </Row>
        ))}
      </Section>

      {/* PFA cycles */}
      <Section
        title="PFA history"
        hint="Physical Fitness Assessment cycles. A failure within 36 months of the board date is an adverse adjustment."
        onAdd={() =>
          onChange({
            pfa_history: [
              ...record.pfa_history,
              { cycle: "", date: "", result: "pass" } as PfaCycle,
            ],
          })
        }
        empty={record.pfa_history.length === 0}
      >
        {record.pfa_history.map((p, i) => (
          <Row key={i}>
            <Field label="Cycle">
              <input
                className="apex-input max-w-[9rem]"
                placeholder="e.g. 2026-1"
                value={p.cycle}
                onChange={(e) =>
                  onChange({
                    pfa_history: upd(record.pfa_history, i, { cycle: e.target.value }),
                  })
                }
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                className="apex-input"
                value={p.date}
                onChange={(e) =>
                  onChange({
                    pfa_history: upd(record.pfa_history, i, { date: e.target.value }),
                  })
                }
              />
            </Field>
            <Field label="Result">
              <select
                className="apex-select"
                aria-label={`PFA cycle ${i + 1} result`}
                value={p.result}
                onChange={(e) =>
                  onChange({
                    pfa_history: upd(record.pfa_history, i, {
                      result: e.target.value as PfaCycle["result"],
                    }),
                  })
                }
              >
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="excused">Excused</option>
              </select>
            </Field>
            <RemoveButton
              onClick={() => onChange({ pfa_history: rm(record.pfa_history, i) })}
              ariaLabel={`Remove PFA cycle ${i + 1}`}
            />
          </Row>
        ))}
      </Section>

      {/* Tours */}
      <Section
        title="Tours"
        hint="Duty tours in the last six years drive the leadership and sea-duty factors."
        onAdd={() =>
          onChange({
            tours: [
              ...record.tours,
              {
                title: "",
                start: "",
                end: null,
                sea_duty: false,
                leadership: false,
              } as TourEntry,
            ],
          })
        }
        empty={record.tours.length === 0}
      >
        {record.tours.map((t, i) => (
          <Row key={i}>
            <Field label="Title" className="min-w-[12rem] flex-1">
              <input
                className="apex-input"
                value={t.title}
                onChange={(e) =>
                  onChange({ tours: upd(record.tours, i, { title: e.target.value }) })
                }
              />
            </Field>
            <Field label="Start">
              <input
                type="date"
                className="apex-input"
                value={t.start}
                onChange={(e) =>
                  onChange({ tours: upd(record.tours, i, { start: e.target.value }) })
                }
              />
            </Field>
            <Field label="End (blank = current)">
              <input
                type="date"
                className="apex-input"
                value={t.end ?? ""}
                onChange={(e) =>
                  onChange({
                    tours: upd(record.tours, i, { end: e.target.value || null }),
                  })
                }
              />
            </Field>
            <label
              className="flex items-center gap-2 text-xs pb-2"
              style={{ color: "var(--muted-foreground)" }}
            >
              <input
                type="checkbox"
                checked={t.sea_duty}
                onChange={(e) =>
                  onChange({
                    tours: upd(record.tours, i, { sea_duty: e.target.checked }),
                  })
                }
                aria-label={`Tour ${i + 1} sea, arduous, or IA duty`}
              />
              Sea/Arduous/IA
            </label>
            <label
              className="flex items-center gap-2 text-xs pb-2"
              style={{ color: "var(--muted-foreground)" }}
            >
              <input
                type="checkbox"
                checked={t.leadership}
                onChange={(e) =>
                  onChange({
                    tours: upd(record.tours, i, { leadership: e.target.checked }),
                  })
                }
                aria-label={`Tour ${i + 1} leadership position`}
              />
              Leadership (LPO/LCPO/WCS/Section Leader)
            </label>
            <RemoveButton
              onClick={() => onChange({ tours: rm(record.tours, i) })}
              ariaLabel={`Remove tour ${i + 1}`}
            />
          </Row>
        ))}
      </Section>

      {/* Adverse entries */}
      <Section
        title="Adverse entries"
        hint="Page 13s, NJP, and similar. Each entry subtracts from the final score (capped)."
        onAdd={() =>
          onChange({
            adverse: [
              ...record.adverse,
              { kind: "page13", date: "" } as AdverseEntry,
            ],
          })
        }
        empty={record.adverse.length === 0}
      >
        {record.adverse.map((ad, i) => (
          <Row key={i}>
            <Field label="Kind">
              <select
                className="apex-select"
                aria-label={`Adverse entry ${i + 1} kind`}
                value={ad.kind}
                onChange={(e) =>
                  onChange({
                    adverse: upd(record.adverse, i, {
                      kind: e.target.value as AdverseEntry["kind"],
                    }),
                  })
                }
              >
                {ADVERSE_KINDS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                className="apex-input"
                value={ad.date}
                onChange={(e) =>
                  onChange({
                    adverse: upd(record.adverse, i, { date: e.target.value }),
                  })
                }
              />
            </Field>
            <Field label="Note (optional)" className="min-w-[12rem] flex-1">
              <input
                className="apex-input"
                value={ad.note ?? ""}
                onChange={(e) =>
                  onChange({
                    adverse: upd(record.adverse, i, {
                      note: e.target.value || undefined,
                    }),
                  })
                }
              />
            </Field>
            <RemoveButton
              onClick={() => onChange({ adverse: rm(record.adverse, i) })}
              ariaLabel={`Remove adverse entry ${i + 1}`}
            />
          </Row>
        ))}
      </Section>

      {/* Quals (reference-only, never scored) */}
      <Section
        title="Other qualifications (reference only)"
        hint="Free-form qualifications outside the LaDR checklist. Displayed back to you for reference — never scored; scored qualifications come exclusively from the LaDR Checklist tab."
        onAdd={() =>
          onChange({
            quals: [
              ...record.quals,
              { title: "", verified_in_ompf: false } as QualEntry,
            ],
          })
        }
        empty={record.quals.length === 0}
      >
        {record.quals.map((q, i) => (
          <Row key={i}>
            <Field label="Title" className="min-w-[14rem] flex-1">
              <input
                className="apex-input"
                value={q.title}
                onChange={(e) =>
                  onChange({ quals: upd(record.quals, i, { title: e.target.value }) })
                }
              />
            </Field>
            <Field label="Code">
              <input
                className="apex-input max-w-[10rem]"
                value={q.code ?? ""}
                onChange={(e) =>
                  onChange({
                    quals: upd(record.quals, i, { code: e.target.value || undefined }),
                  })
                }
              />
            </Field>
            <Field label="Date completed">
              <input
                type="date"
                className="apex-input"
                value={q.date_completed ?? ""}
                onChange={(e) =>
                  onChange({
                    quals: upd(record.quals, i, {
                      date_completed: e.target.value || undefined,
                    }),
                  })
                }
              />
            </Field>
            <VerifiedCheckbox
              checked={q.verified_in_ompf}
              onChange={(v) =>
                onChange({ quals: upd(record.quals, i, { verified_in_ompf: v }) })
              }
              ariaLabel={`Qualification ${i + 1} verified in OMPF`}
            />
            <RemoveButton
              onClick={() => onChange({ quals: rm(record.quals, i) })}
              ariaLabel={`Remove qualification ${i + 1}`}
            />
          </Row>
        ))}
      </Section>

      {/* Per-eval context */}
      <Section
        title="Per-eval context (RSCA & sea duty)"
        hint="One row per finalized evaluation. RSCA comes from your PSR Part III; check sea duty for reports earned on sea/arduous/IA duty."
        empty={finalizedEvals.length === 0}
      >
        {finalizedEvals.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--subtle)" }}>
            No finalized evaluations found — per-eval context becomes available
            once your reports are finalized.
          </p>
        ) : (
          finalizedEvals.map((ev) => {
            const ctx = record.eval_context[ev.period_to] ?? {};
            const setCtx = (patch: { rsca?: number; sea_duty?: boolean }, remove?: "rsca" | "sea_duty") => {
              const next = { ...record.eval_context };
              const entry: { rsca?: number; sea_duty?: boolean } = {
                ...(next[ev.period_to] ?? {}),
                ...patch,
              };
              if (remove) delete entry[remove];
              if (Object.keys(entry).length === 0) delete next[ev.period_to];
              else next[ev.period_to] = entry;
              onChange({ eval_context: next });
            };
            return (
              <Row key={ev.period_to}>
                <div
                  className="text-xs font-mono min-w-[16rem] pb-2"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {ev.report_type} · {ev.period_from} – {ev.period_to}
                </div>
                <Field label="RSCA">
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max="5"
                    className="apex-input max-w-[7rem]"
                    aria-label={`RSCA for report ending ${ev.period_to}`}
                    value={ctx.rsca ?? ""}
                    onChange={(e) =>
                      e.target.value === ""
                        ? setCtx({}, "rsca")
                        : setCtx({ rsca: Number(e.target.value) })
                    }
                  />
                </Field>
                <label
                  className="flex items-center gap-2 text-xs pb-2"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <input
                    type="checkbox"
                    checked={ctx.sea_duty ?? false}
                    // ponytail: unchecked removes the key (keeps the rubric's
                    // tour-overlap derivation) rather than storing false.
                    onChange={(e) =>
                      e.target.checked
                        ? setCtx({ sea_duty: true })
                        : setCtx({}, "sea_duty")
                    }
                    aria-label={`Sea duty for report ending ${ev.period_to}`}
                  />
                  Sea duty
                </label>
              </Row>
            );
          })
        )}
      </Section>

      {/* PSR attestation */}
      <label className="apex-card p-4 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={record.psr_entered}
          onChange={(e) => onChange({ psr_entered: e.target.checked })}
          aria-label="PSR section complete attestation"
        />
        <span>
          <span className="text-sm font-semibold apex-heading block">
            PSR section complete
          </span>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            I attest the structured PSR entries above are filled in from my
            Performance Summary Record.
          </span>
        </span>
      </label>

      {/* Record documents (v1.3): ESR / PSR / OMPF FC 30-38 uploads */}
      <Section
        title="Record documents (optional)"
        hint="Upload your ESR export, PSR, or OMPF documents (field codes 30–38). Use 'Extract to record' to pull awards, NECs, education, and PFA cycles from a document into the form above — in lieu of manual entry — for the board confidence determination. Documents are stored under your account only and destroyed at logout."
      >
        <div className="space-y-3">
          <div
            className="p-3 rounded-lg border text-xs leading-relaxed"
            role="note"
            aria-label="Redact PII before uploading"
            style={{
              borderColor: "var(--accent-gold)",
              color: "var(--muted-foreground)",
            }}
          >
            <strong className="apex-heading block mb-1">
              Redact PII before uploading.
            </strong>
            Remove or black out SSNs, DoD IDs, home addresses, and other
            personally identifiable information from every document before you
            upload it. Uploaded documents are session-ephemeral:{" "}
            <strong>they are destroyed when you log out.</strong>
          </div>

          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={redactionConfirmed}
              onChange={(e) => setRedactionConfirmed(e.target.checked)}
              aria-label="I have redacted PII from the documents I upload"
            />
            <span style={{ color: "var(--foreground)" }}>
              I have redacted PII from the document(s) I am uploading.
            </span>
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="apex-filter-label">Document type</span>
              <select
                className="apex-select text-xs"
                value={docType}
                onChange={(e) =>
                  setDocType(e.target.value as keyof typeof DOC_TYPES)
                }
                aria-label="Document type"
              >
                {Object.entries(DOC_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <input
              ref={fileRef}
              type="file"
              className="text-xs"
              aria-label="Upload a record document"
              disabled={docBusy || !redactionConfirmed}
              title={
                redactionConfirmed
                  ? undefined
                  : "Confirm PII redaction to enable uploads."
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </div>
          {docError && (
            <p className="text-xs text-red-400" role="alert">
              {docError}
            </p>
          )}
          {extractNote && (
            <p
              className="text-xs"
              role="status"
              style={{ color: "var(--accent-gold)" }}
            >
              {extractNote}
            </p>
          )}
          {docs.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              No documents uploaded.
            </p>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => {
                const { label, file } = splitDocName(d.name);
                return (
                <li
                  key={d.name}
                  className="flex items-center justify-between gap-2 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <span className="truncate">
                    {label && (
                      <span className="apex-badge mr-2">{label}</span>
                    )}
                    <span className="font-mono">{file}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      className="apex-btn-secondary py-0.5 px-2 text-xs"
                      disabled={docBusy}
                      onClick={() => handleExtractDoc(d.name)}
                      aria-label={`Extract record entries from ${d.name}`}
                    >
                      Extract to record
                    </button>
                    <button
                      type="button"
                      className="apex-btn-secondary py-0.5 px-2 text-xs"
                      disabled={docBusy}
                      onClick={() => handleDeleteDoc(d.name)}
                      aria-label={`Delete document ${d.name}`}
                    >
                      Delete
                    </button>
                  </span>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      <div className="flex justify-end">
        <button
          type="button"
          className="apex-btn-primary disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save record"}
        </button>
      </div>
    </div>
  );
}
