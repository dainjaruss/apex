// components/board/RecordEntryForm.tsx
//
// Structured PSR/ESR record entry for the Board Confidence Analyzer (spec §6,
// tab 1). All data here is member-entered reference data persisted to
// member_board_records. The free-form quals section is reference-only and is
// never read by the rubric; attachments are stored but never parsed or scored.
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
  listBoardDocs,
  uploadBoardDoc,
} from "@/lib/boardConfidenceService";

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
  const [docs, setDocs] = useState<{ name: string }[]>([]);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listBoardDocs(userId)
      .then(setDocs)
      .catch((err: any) => setDocError(err?.message || "Could not list attachments."));
  }, [userId]);

  const handleUpload = async (file: File) => {
    setDocBusy(true);
    setDocError(null);
    try {
      await uploadBoardDoc(userId, file);
      setDocs(await listBoardDocs(userId));
    } catch (err: any) {
      setDocError(err?.message || "Upload failed.");
    } finally {
      setDocBusy(false);
      if (fileRef.current) fileRef.current.value = "";
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
            {ratings.map((r) => (
              <option key={r} value={r}>
                {r}
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

      {/* Attachments */}
      <Section title="Attachments (optional)" hint="Attachments are stored for your reference only; they are never read or scored.">
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            className="text-xs"
            aria-label="Upload a record attachment"
            disabled={docBusy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          {docError && (
            <p className="text-xs text-red-400" role="alert">
              {docError}
            </p>
          )}
          {docs.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              No attachments uploaded.
            </p>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => (
                <li
                  key={d.name}
                  className="flex items-center justify-between gap-2 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <span className="font-mono truncate">{d.name}</span>
                  <button
                    type="button"
                    className="apex-btn-secondary py-0.5 px-2 text-xs"
                    disabled={docBusy}
                    onClick={() => handleDeleteDoc(d.name)}
                    aria-label={`Delete attachment ${d.name}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
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
