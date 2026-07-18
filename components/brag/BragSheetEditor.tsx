// components/brag/BragSheetEditor.tsx
//
// Accordion editor for the 11 brag sheet sections (spec §6). Section order,
// titles, blurbs, and "feeds Blocks …" chips come from BRAG_SECTIONS
// (lib/bragSheet/template.ts). Repeating-row sections get add/remove controls
// per the components/board/RecordEntryForm.tsx pattern. Field-level rules
// enforced inline: abbrev ≤14 with live counter, career recs ≤2 × 20 chars,
// counselor ≤22, PFA result P/B/F/M/W/N, exactly one most-significant primary
// duty. Rows carry data-brag-path so citation chips and missing-info links can
// scroll to their source.
//

"use client";

import React from "react";
import type {
  BragAccomplishment,
  BragAdmin,
  BragBullet,
  BragDuty,
  BragPfaCycle,
  BragSheet,
  BragSheetData,
} from "@/lib/bragSheet/types";
import { BRAG_SECTIONS, collapsePfa } from "@/lib/bragSheet/template";
import { PRIMARY_DUTY_ABBREV_MAX } from "@/lib/commentFit";
import {
  CAREER_REC_MAX,
  CAREER_REC_SLOTS,
  CHIEFEVAL_TRAIT_KEYS,
  COUNSELOR_MAX,
  DUTY_STATUS_OPTIONS,
  FITREP_TRAIT_KEYS,
  TRAIT_KEYS,
} from "@/types/navpers";

const SECTION_META = Object.fromEntries(BRAG_SECTIONS.map((m) => [m.key, m]));

const DUTY_KINDS: BragDuty["kind"][] = [
  "primary",
  "collateral",
  "watchstanding",
  "temadd",
];
const PFA_RESULTS: BragPfaCycle["result"][] = ["P", "B", "F", "M", "W", "N"];
const PRT_CATEGORIES: NonNullable<BragPfaCycle["prt_category"]>[] = [
  "Outstanding",
  "Excellent",
  "Good",
  "Satisfactory",
  "Probationary",
];
const BCA_OPTIONS: NonNullable<BragPfaCycle["bca"]>[] = [
  "within",
  "not_within",
  "waived",
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

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span
      className="text-[10px] tabular-nums"
      style={{ color: value > max ? "var(--destructive)" : "var(--subtle)" }}
    >
      {value}/{max}
    </span>
  );
}

function RemoveButton({
  onClick,
  ariaLabel = "Remove row",
}: {
  onClick: () => void;
  ariaLabel?: string;
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

function AddButton({ onClick, label = "+ Add" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="apex-btn-secondary py-1 px-3 text-xs"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Row({
  children,
  path,
}: {
  children: React.ReactNode;
  path?: string;
}) {
  return (
    <div
      data-brag-path={path}
      className="flex flex-wrap items-end gap-3 border-b pb-3 last:border-b-0 last:pb-0"
      style={{ borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

/** Section as a native <details> accordion — title, blurb, feeds chip (§6). */
function Section({
  sectionKey,
  defaultOpen,
  headerExtra,
  children,
}: {
  sectionKey: keyof BragSheetData;
  defaultOpen?: boolean;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const meta = SECTION_META[sectionKey];
  return (
    <details
      className="apex-card"
      open={defaultOpen}
      data-brag-path={sectionKey}
    >
      <summary className="cursor-pointer select-none p-4 flex items-center justify-between gap-3 flex-wrap">
        <span className="min-w-0">
          <span className="text-sm font-bold gold-accent uppercase tracking-wider block">
            {meta.title}
          </span>
          <span
            className="text-xs block mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            {meta.blurb}
          </span>
        </span>
        <span className="apex-badge-draft px-2.5 py-1 text-[11px] shrink-0">
          feeds {meta.feeds}
        </span>
      </summary>
      <div className="px-4 pb-4 space-y-3">
        {headerExtra}
        {children}
      </div>
    </details>
  );
}

/** Repeating BragBullet rows: text + optional metrics ("no metric" hint chip). */
function BulletRows({
  label,
  bullets,
  pathPrefix,
  onChange,
}: {
  label: string;
  bullets: BragBullet[];
  pathPrefix: string;
  onChange: (next: BragBullet[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="apex-filter-label">{label}</span>
        <AddButton onClick={() => onChange([...bullets, { text: "" }])} />
      </div>
      {bullets.length === 0 && (
        <p className="text-xs" style={{ color: "var(--subtle)" }}>
          None entered.
        </p>
      )}
      {bullets.map((b, i) => (
        <Row key={i} path={`${pathPrefix}[${i}]`}>
          <Field label="Bullet (action + result)" className="flex-1 min-w-[220px]">
            <input
              className="apex-input text-sm"
              value={b.text}
              onChange={(e) => onChange(upd(bullets, i, { text: e.target.value }))}
            />
          </Field>
          <Field label="Metrics (optional)" className="w-44">
            <input
              className="apex-input text-sm"
              placeholder='"$1.2M", "12 Sailors"'
              value={b.metrics ?? ""}
              onChange={(e) =>
                onChange(upd(bullets, i, { metrics: e.target.value || undefined }))
              }
            />
          </Field>
          {!b.metrics && (
            <span className="apex-badge-draft px-2 py-0.5 text-[10px] mb-1.5">
              no metric
            </span>
          )}
          <RemoveButton onClick={() => onChange(rm(bullets, i))} />
        </Row>
      ))}
    </div>
  );
}

export default function BragSheetEditor({
  data,
  reportType,
  onChange,
}: {
  data: BragSheetData;
  reportType: BragSheet["report_type"];
  onChange: (next: BragSheetData) => void;
}) {
  const set = (patch: Partial<BragSheetData>) => onChange({ ...data, ...patch });
  const setAdmin = (patch: Partial<BragAdmin>) =>
    set({ admin: { ...data.admin, ...patch } });

  const traitKeys: readonly string[] =
    reportType === "CHIEFEVAL"
      ? CHIEFEVAL_TRAIT_KEYS
      : reportType === "FITREP"
        ? FITREP_TRAIT_KEYS
        : TRAIT_KEYS;

  const a = data.admin;
  const pfaCode = collapsePfa(data);

  return (
    <div className="space-y-3">
      {/* 1 — Admin Data */}
      <Section sectionKey="admin" defaultOpen>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Member name (LAST, FIRST MI)">
            <input
              className="apex-input text-sm"
              value={a.member_name ?? ""}
              onChange={(e) => setAdmin({ member_name: e.target.value })}
            />
          </Field>
          <Field label="Grade / rate">
            <input
              className="apex-input text-sm"
              value={a.grade_rate ?? ""}
              onChange={(e) => setAdmin({ grade_rate: e.target.value })}
            />
          </Field>
          <Field label="Designator">
            <input
              className="apex-input text-sm"
              value={a.designator ?? ""}
              onChange={(e) => setAdmin({ designator: e.target.value })}
            />
          </Field>
          <Field label="DoD ID">
            <input
              className="apex-input text-sm"
              inputMode="numeric"
              value={a.dod_id ?? ""}
              onChange={(e) => setAdmin({ dod_id: e.target.value })}
            />
          </Field>
          <Field label="Duty status">
            <select
              className="apex-select text-sm"
              aria-label="Duty status"
              value={a.duty_status ?? ""}
              onChange={(e) =>
                setAdmin({
                  duty_status: (e.target.value ||
                    undefined) as BragAdmin["duty_status"],
                })
              }
            >
              <option value="">—</option>
              {DUTY_STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="UIC">
            <input
              className="apex-input text-sm"
              maxLength={5}
              value={a.uic ?? ""}
              onChange={(e) => setAdmin({ uic: e.target.value })}
            />
          </Field>
          <Field label="Ship / station">
            <input
              className="apex-input text-sm"
              value={a.ship_station ?? ""}
              onChange={(e) => setAdmin({ ship_station: e.target.value })}
            />
          </Field>
          <Field label="Date reported">
            <input
              type="date"
              className="apex-input text-sm"
              value={a.date_reported ?? ""}
              onChange={(e) => setAdmin({ date_reported: e.target.value })}
            />
          </Field>
          <Field label="Prior report end">
            <input
              type="date"
              className="apex-input text-sm"
              value={a.prior_report_end ?? ""}
              onChange={(e) => setAdmin({ prior_report_end: e.target.value })}
            />
          </Field>
          <Field label="Date of rate">
            <input
              type="date"
              className="apex-input text-sm"
              value={a.date_of_rate ?? ""}
              onChange={(e) => setAdmin({ date_of_rate: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="apex-filter-label">
              Periods not available for duty
            </span>
            <AddButton
              onClick={() =>
                setAdmin({
                  periods_unavailable: [
                    ...a.periods_unavailable,
                    { start: "", end: "", reason: "" },
                  ],
                })
              }
            />
          </div>
          {a.periods_unavailable.map((p, i) => (
            <Row key={i} path={`admin.periods_unavailable[${i}]`}>
              <Field label="Start">
                <input
                  type="date"
                  className="apex-input text-sm"
                  value={p.start}
                  onChange={(e) =>
                    setAdmin({
                      periods_unavailable: upd(a.periods_unavailable, i, {
                        start: e.target.value,
                      }),
                    })
                  }
                />
              </Field>
              <Field label="End">
                <input
                  type="date"
                  className="apex-input text-sm"
                  value={p.end}
                  onChange={(e) =>
                    setAdmin({
                      periods_unavailable: upd(a.periods_unavailable, i, {
                        end: e.target.value,
                      }),
                    })
                  }
                />
              </Field>
              <Field label="Reason" className="flex-1 min-w-[180px]">
                <input
                  className="apex-input text-sm"
                  value={p.reason}
                  onChange={(e) =>
                    setAdmin({
                      periods_unavailable: upd(a.periods_unavailable, i, {
                        reason: e.target.value,
                      }),
                    })
                  }
                />
              </Field>
              <RemoveButton
                onClick={() =>
                  setAdmin({ periods_unavailable: rm(a.periods_unavailable, i) })
                }
              />
            </Row>
          ))}
        </div>
      </Section>

      {/* 2 — Duties Assigned */}
      <Section
        sectionKey="duties"
        headerExtra={
          <div className="flex justify-end">
            <AddButton
              onClick={() =>
                set({
                  duties: [
                    ...data.duties,
                    {
                      title: "",
                      kind: "collateral",
                      months_assigned: 0,
                      bullets: [],
                    },
                  ],
                })
              }
            />
          </div>
        }
      >
        {data.duties.length === 0 && (
          <p className="text-xs" style={{ color: "var(--subtle)" }}>
            None entered.
          </p>
        )}
        {data.duties.map((d, i) => (
          <div
            key={i}
            data-brag-path={`duties[${i}]`}
            className="rounded-lg border p-3 space-y-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Duty title" className="flex-1 min-w-[180px]">
                <input
                  className="apex-input text-sm"
                  value={d.title}
                  onChange={(e) =>
                    set({ duties: upd(data.duties, i, { title: e.target.value }) })
                  }
                />
              </Field>
              <Field label="Kind">
                <select
                  className="apex-select text-sm"
                  aria-label={`Duty ${i + 1} kind`}
                  value={d.kind}
                  onChange={(e) =>
                    set({
                      duties: upd(data.duties, i, {
                        kind: e.target.value as BragDuty["kind"],
                      }),
                    })
                  }
                >
                  {DUTY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Months">
                <input
                  type="number"
                  min={0}
                  className="apex-input text-sm w-20"
                  value={d.months_assigned}
                  onChange={(e) =>
                    set({
                      duties: upd(data.duties, i, {
                        months_assigned: Number(e.target.value) || 0,
                      }),
                    })
                  }
                />
              </Field>
              <Field label="29A abbrev">
                <span className="flex items-center gap-1.5">
                  <input
                    className="apex-input text-sm w-40 font-mono"
                    maxLength={PRIMARY_DUTY_ABBREV_MAX}
                    value={d.abbrev ?? ""}
                    onChange={(e) =>
                      set({
                        duties: upd(data.duties, i, {
                          abbrev: e.target.value || undefined,
                        }),
                      })
                    }
                  />
                  <Counter
                    value={(d.abbrev ?? "").length}
                    max={PRIMARY_DUTY_ABBREV_MAX}
                  />
                </span>
              </Field>
              {d.kind === "primary" && (
                <label
                  className="flex items-center gap-2 text-xs pb-2"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <input
                    type="radio"
                    name="most-significant-duty"
                    checked={!!d.is_most_significant}
                    onChange={() =>
                      set({
                        duties: data.duties.map((row, j) => ({
                          ...row,
                          is_most_significant: j === i,
                        })),
                      })
                    }
                    aria-label={`Mark duty ${i + 1} most significant`}
                  />
                  Most significant (leads 29B, names 29A)
                </label>
              )}
              <RemoveButton onClick={() => set({ duties: rm(data.duties, i) })} />
            </div>
            <BulletRows
              label="Accomplishments in this duty"
              bullets={d.bullets}
              pathPrefix={`duties[${i}].bullets`}
              onChange={(next) =>
                set({ duties: upd(data.duties, i, { bullets: next }) })
              }
            />
          </div>
        ))}
      </Section>

      {/* 3 — Job Information */}
      <Section sectionKey="job">
        <Field label="Principal responsibilities / scope">
          <textarea
            className="apex-input text-sm"
            rows={3}
            value={data.job.responsibilities}
            onChange={(e) =>
              set({ job: { ...data.job, responsibilities: e.target.value } })
            }
          />
        </Field>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="apex-filter-label">Equipment operated / qualified on</span>
            <AddButton
              onClick={() =>
                set({ job: { ...data.job, equipment: [...data.job.equipment, ""] } })
              }
            />
          </div>
          {data.job.equipment.map((eq, i) => (
            <Row key={i} path={`job.equipment[${i}]`}>
              <input
                className="apex-input text-sm flex-1"
                aria-label={`Equipment ${i + 1}`}
                value={eq}
                onChange={(e) =>
                  set({
                    job: {
                      ...data.job,
                      equipment: data.job.equipment.map((v, j) =>
                        j === i ? e.target.value : v,
                      ),
                    },
                  })
                }
              />
              <RemoveButton
                onClick={() =>
                  set({ job: { ...data.job, equipment: rm(data.job.equipment, i) } })
                }
              />
            </Row>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Customers / commands served">
            <input
              className="apex-input text-sm"
              value={data.job.customers}
              onChange={(e) =>
                set({ job: { ...data.job, customers: e.target.value } })
              }
            />
          </Field>
          <Field label="Classified material responsibility (unclassified wording)">
            <input
              className="apex-input text-sm"
              value={data.job.classified_material ?? ""}
              onChange={(e) =>
                set({
                  job: {
                    ...data.job,
                    classified_material: e.target.value || undefined,
                  },
                })
              }
            />
          </Field>
        </div>
        <BulletRows
          label="Contributions to team / command results"
          bullets={data.job.team_contributions}
          pathPrefix="job.team_contributions"
          onChange={(next) =>
            set({ job: { ...data.job, team_contributions: next } })
          }
        />
      </Section>

      {/* 4 — Supervision & Leadership */}
      <Section sectionKey="leadership">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Military personnel supervised">
            <input
              type="number"
              min={0}
              className="apex-input text-sm"
              value={data.leadership.supervised_military}
              onChange={(e) =>
                set({
                  leadership: {
                    ...data.leadership,
                    supervised_military: Number(e.target.value) || 0,
                  },
                })
              }
            />
          </Field>
          <Field label="Civilians supervised">
            <input
              type="number"
              min={0}
              className="apex-input text-sm"
              value={data.leadership.supervised_civilian}
              onChange={(e) =>
                set({
                  leadership: {
                    ...data.leadership,
                    supervised_civilian: Number(e.target.value) || 0,
                  },
                })
              }
            />
          </Field>
          <Field label="Supervised via subordinates">
            <input
              type="number"
              min={0}
              className="apex-input text-sm"
              value={data.leadership.supervised_via_subordinates}
              onChange={(e) =>
                set({
                  leadership: {
                    ...data.leadership,
                    supervised_via_subordinates: Number(e.target.value) || 0,
                  },
                })
              }
            />
          </Field>
          <Field label="Equipment value responsible for">
            <input
              className="apex-input text-sm"
              placeholder='"$4.5M"'
              value={data.leadership.equipment_value ?? ""}
              onChange={(e) =>
                set({
                  leadership: {
                    ...data.leadership,
                    equipment_value: e.target.value || undefined,
                  },
                })
              }
            />
          </Field>
          <Field label="Budget managed">
            <input
              className="apex-input text-sm"
              value={data.leadership.budget_managed ?? ""}
              onChange={(e) =>
                set({
                  leadership: {
                    ...data.leadership,
                    budget_managed: e.target.value || undefined,
                  },
                })
              }
            />
          </Field>
        </div>
        <BulletRows
          label="Instructor roles"
          bullets={data.leadership.instructor_roles}
          pathPrefix="leadership.instructor_roles"
          onChange={(next) =>
            set({ leadership: { ...data.leadership, instructor_roles: next } })
          }
        />
        <BulletRows
          label="Counseling / mentoring given"
          bullets={data.leadership.mentoring}
          pathPrefix="leadership.mentoring"
          onChange={(next) =>
            set({ leadership: { ...data.leadership, mentoring: next } })
          }
        />
        <BulletRows
          label="Retention efforts"
          bullets={data.leadership.retention_efforts}
          pathPrefix="leadership.retention_efforts"
          onChange={(next) =>
            set({ leadership: { ...data.leadership, retention_efforts: next } })
          }
        />
      </Section>

      {/* 5 — Individual Accomplishments */}
      <Section
        sectionKey="accomplishments"
        headerExtra={
          <div className="flex justify-end">
            <AddButton
              onClick={() =>
                set({ accomplishments: [...data.accomplishments, { text: "" }] })
              }
            />
          </div>
        }
      >
        {data.accomplishments.length === 0 && (
          <p className="text-xs" style={{ color: "var(--subtle)" }}>
            None entered.
          </p>
        )}
        {data.accomplishments.map((acc, i) => (
          <Row key={i} path={`accomplishments[${i}]`}>
            <Field label="Bullet (action + result)" className="flex-1 min-w-[220px]">
              <input
                className="apex-input text-sm"
                value={acc.text}
                onChange={(e) =>
                  set({
                    accomplishments: upd(data.accomplishments, i, {
                      text: e.target.value,
                    }),
                  })
                }
              />
            </Field>
            <Field label="Metrics (optional)" className="w-40">
              <input
                className="apex-input text-sm"
                value={acc.metrics ?? ""}
                onChange={(e) =>
                  set({
                    accomplishments: upd(data.accomplishments, i, {
                      metrics: e.target.value || undefined,
                    }),
                  })
                }
              />
            </Field>
            <Field label="Trait hint">
              <select
                className="apex-select text-sm"
                aria-label={`Accomplishment ${i + 1} trait hint`}
                value={acc.trait_hint ?? ""}
                onChange={(e) =>
                  set({
                    accomplishments: upd(data.accomplishments, i, {
                      trait_hint: e.target.value || undefined,
                    } as Partial<BragAccomplishment>),
                  })
                }
              >
                <option value="">—</option>
                {traitKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
            {!acc.metrics && (
              <span className="apex-badge-draft px-2 py-0.5 text-[10px] mb-1.5">
                no metric
              </span>
            )}
            <RemoveButton
              onClick={() => set({ accomplishments: rm(data.accomplishments, i) })}
            />
          </Row>
        ))}
      </Section>

      {/* 6 — Qualifications, Awards & Education */}
      <Section sectionKey="qualifications">
        {(
          [
            ["quals", "Qualifications (warfare / watch / rate)"],
            ["awards", "Awards (personal, LOC/LOA)"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="apex-filter-label">{label}</span>
              <AddButton
                onClick={() =>
                  set({
                    qualifications: {
                      ...data.qualifications,
                      [key]: [
                        ...data.qualifications[key],
                        { title: "", date: "" },
                      ],
                    },
                  })
                }
              />
            </div>
            {data.qualifications[key].map((q, i) => (
              <Row key={i} path={`qualifications.${key}[${i}]`}>
                <Field label="Title" className="flex-1 min-w-[200px]">
                  <input
                    className="apex-input text-sm"
                    value={q.title}
                    onChange={(e) =>
                      set({
                        qualifications: {
                          ...data.qualifications,
                          [key]: upd(data.qualifications[key], i, {
                            title: e.target.value,
                          }),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    className="apex-input text-sm"
                    value={q.date}
                    onChange={(e) =>
                      set({
                        qualifications: {
                          ...data.qualifications,
                          [key]: upd(data.qualifications[key], i, {
                            date: e.target.value,
                          }),
                        },
                      })
                    }
                  />
                </Field>
                <RemoveButton
                  onClick={() =>
                    set({
                      qualifications: {
                        ...data.qualifications,
                        [key]: rm(data.qualifications[key], i),
                      },
                    })
                  }
                />
              </Row>
            ))}
          </div>
        ))}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="apex-filter-label">
              Education (courses / degrees / certs)
            </span>
            <AddButton
              onClick={() =>
                set({
                  qualifications: {
                    ...data.qualifications,
                    education: [
                      ...data.qualifications.education,
                      { title: "", date: "" },
                    ],
                  },
                })
              }
            />
          </div>
          {data.qualifications.education.map((q, i) => (
            <Row key={i} path={`qualifications.education[${i}]`}>
              <Field label="Title" className="flex-1 min-w-[200px]">
                <input
                  className="apex-input text-sm"
                  value={q.title}
                  onChange={(e) =>
                    set({
                      qualifications: {
                        ...data.qualifications,
                        education: upd(data.qualifications.education, i, {
                          title: e.target.value,
                        }),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  className="apex-input text-sm"
                  value={q.date}
                  onChange={(e) =>
                    set({
                      qualifications: {
                        ...data.qualifications,
                        education: upd(data.qualifications.education, i, {
                          date: e.target.value,
                        }),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Credit hours">
                <input
                  type="number"
                  min={0}
                  className="apex-input text-sm w-24"
                  value={q.credit_hours ?? ""}
                  onChange={(e) =>
                    set({
                      qualifications: {
                        ...data.qualifications,
                        education: upd(data.qualifications.education, i, {
                          credit_hours: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        }),
                      },
                    })
                  }
                />
              </Field>
              <RemoveButton
                onClick={() =>
                  set({
                    qualifications: {
                      ...data.qualifications,
                      education: rm(data.qualifications.education, i),
                    },
                  })
                }
              />
            </Row>
          ))}
        </div>
      </Section>

      {/* 7 — Off-Duty */}
      <Section sectionKey="off_duty">
        <BulletRows
          label="Off-duty education"
          bullets={data.off_duty.education}
          pathPrefix="off_duty.education"
          onChange={(next) =>
            set({ off_duty: { ...data.off_duty, education: next } })
          }
        />
        <BulletRows
          label="Community / volunteer"
          bullets={data.off_duty.community}
          pathPrefix="off_duty.community"
          onChange={(next) =>
            set({ off_duty: { ...data.off_duty, community: next } })
          }
        />
        <BulletRows
          label="Navy public relations"
          bullets={data.off_duty.navy_pr}
          pathPrefix="off_duty.navy_pr"
          onChange={(next) =>
            set({ off_duty: { ...data.off_duty, navy_pr: next } })
          }
        />
        <Field label="Civilian employment (reservists)">
          <input
            className="apex-input text-sm"
            value={data.off_duty.civilian_employment ?? ""}
            onChange={(e) =>
              set({
                off_duty: {
                  ...data.off_duty,
                  civilian_employment: e.target.value || undefined,
                },
              })
            }
          />
        </Field>
      </Section>

      {/* 8 — Physical Readiness (PRIMS) */}
      <Section
        sectionKey="pfa"
        headerExtra={
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
              BLOCK 20 CODE: {pfaCode || "—"}
            </p>
            <AddButton
              onClick={() =>
                set({ pfa: [...data.pfa, { cycle: "", result: "P" }] })
              }
            />
          </div>
        }
      >
        {data.pfa.length === 0 && (
          <p className="text-xs" style={{ color: "var(--subtle)" }}>
            None entered.
          </p>
        )}
        {data.pfa.map((c, i) => (
          <Row key={i} path={`pfa[${i}]`}>
            <Field label='Cycle ("25-1")'>
              <input
                className="apex-input text-sm w-20"
                value={c.cycle}
                onChange={(e) =>
                  set({ pfa: upd(data.pfa, i, { cycle: e.target.value }) })
                }
              />
            </Field>
            <Field label="Result">
              <select
                className="apex-select text-sm"
                aria-label={`PFA cycle ${i + 1} result`}
                value={c.result}
                onChange={(e) =>
                  set({
                    pfa: upd(data.pfa, i, {
                      result: e.target.value as BragPfaCycle["result"],
                    }),
                  })
                }
              >
                {PFA_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PRT category">
              <select
                className="apex-select text-sm"
                aria-label={`PFA cycle ${i + 1} PRT category`}
                value={c.prt_category ?? ""}
                onChange={(e) =>
                  set({
                    pfa: upd(data.pfa, i, {
                      prt_category: (e.target.value ||
                        undefined) as BragPfaCycle["prt_category"],
                    }),
                  })
                }
              >
                <option value="">—</option>
                {PRT_CATEGORIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PRT score">
              <input
                type="number"
                min={0}
                className="apex-input text-sm w-20"
                value={c.prt_score ?? ""}
                onChange={(e) =>
                  set({
                    pfa: upd(data.pfa, i, {
                      prt_score: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    }),
                  })
                }
              />
            </Field>
            <Field label="BCA">
              <select
                className="apex-select text-sm"
                aria-label={`PFA cycle ${i + 1} BCA`}
                value={c.bca ?? ""}
                onChange={(e) =>
                  set({
                    pfa: upd(data.pfa, i, {
                      bca: (e.target.value || undefined) as BragPfaCycle["bca"],
                    }),
                  })
                }
              >
                <option value="">—</option>
                {BCA_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <label
              className="flex items-center gap-2 text-xs pb-2"
              style={{ color: "var(--muted-foreground)" }}
            >
              <input
                type="checkbox"
                checked={!!c.medically_waived}
                onChange={(e) =>
                  set({
                    pfa: upd(data.pfa, i, {
                      medically_waived: e.target.checked || undefined,
                    }),
                  })
                }
                aria-label={`PFA cycle ${i + 1} medically waived`}
              />
              Waived
            </label>
            <Field label="Notes" className="flex-1 min-w-[160px]">
              <input
                className="apex-input text-sm"
                value={c.notes ?? ""}
                onChange={(e) =>
                  set({
                    pfa: upd(data.pfa, i, { notes: e.target.value || undefined }),
                  })
                }
              />
            </Field>
            <RemoveButton onClick={() => set({ pfa: rm(data.pfa, i) })} />
          </Row>
        ))}
      </Section>

      {/* 9 — Future Goals */}
      <Section sectionKey="goals">
        <div className="space-y-2" data-brag-path="goals.career_recommendations">
          <div className="flex items-center justify-between gap-2">
            <span className="apex-filter-label">
              Block 41 career recommendations ({CAREER_REC_SLOTS} × {CAREER_REC_MAX}{" "}
              chars)
            </span>
            {data.goals.career_recommendations.length < CAREER_REC_SLOTS && (
              <AddButton
                onClick={() =>
                  set({
                    goals: {
                      ...data.goals,
                      career_recommendations: [
                        ...data.goals.career_recommendations,
                        "",
                      ],
                    },
                  })
                }
              />
            )}
          </div>
          {data.goals.career_recommendations.map((rec, i) => (
            <Row key={i} path={`goals.career_recommendations[${i}]`}>
              <span className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                <input
                  className="apex-input text-sm font-mono flex-1"
                  maxLength={CAREER_REC_MAX}
                  aria-label={`Career recommendation ${i + 1}`}
                  value={rec}
                  onChange={(e) =>
                    set({
                      goals: {
                        ...data.goals,
                        career_recommendations:
                          data.goals.career_recommendations.map((v, j) =>
                            j === i ? e.target.value : v,
                          ),
                      },
                    })
                  }
                />
                <Counter value={rec.length} max={CAREER_REC_MAX} />
              </span>
              <RemoveButton
                onClick={() =>
                  set({
                    goals: {
                      ...data.goals,
                      career_recommendations: rm(
                        data.goals.career_recommendations,
                        i,
                      ),
                    },
                  })
                }
              />
            </Row>
          ))}
        </div>
        <Field label="Desired next duties / schools">
          <textarea
            className="apex-input text-sm"
            rows={2}
            value={data.goals.desired_duties}
            onChange={(e) =>
              set({ goals: { ...data.goals, desired_duties: e.target.value } })
            }
          />
        </Field>
        <Field label="Long-term goals (advisory context only)">
          <textarea
            className="apex-input text-sm"
            rows={2}
            value={data.goals.goals_statement ?? ""}
            onChange={(e) =>
              set({
                goals: {
                  ...data.goals,
                  goals_statement: e.target.value || undefined,
                },
              })
            }
          />
        </Field>
      </Section>

      {/* 10 — Counseling Record */}
      <Section sectionKey="counseling">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label='Date counseled (ISO date, "NOT REQ" or "NOT PERF")'>
            <input
              className="apex-input text-sm"
              value={data.counseling.date_counseled ?? ""}
              onChange={(e) =>
                set({
                  counseling: {
                    ...data.counseling,
                    date_counseled: e.target.value || undefined,
                  },
                })
              }
            />
          </Field>
          <Field label="Counselor">
            <span className="flex items-center gap-1.5">
              <input
                className="apex-input text-sm flex-1"
                maxLength={COUNSELOR_MAX}
                value={data.counseling.counselor ?? ""}
                onChange={(e) =>
                  set({
                    counseling: {
                      ...data.counseling,
                      counselor: e.target.value || undefined,
                    },
                  })
                }
              />
              <Counter
                value={(data.counseling.counselor ?? "").length}
                max={COUNSELOR_MAX}
              />
            </span>
          </Field>
        </div>
      </Section>

      {/* 11 — Other Items for Consideration */}
      <Section sectionKey="additional">
        <Field label="Anything else the reporting senior should know">
          <textarea
            className="apex-input text-sm"
            rows={4}
            value={data.additional}
            onChange={(e) => set({ additional: e.target.value })}
          />
        </Field>
      </Section>
    </div>
  );
}
