// app/summary-groups/page.tsx
//
// Privileged screen (Reporting Senior / Admin / GroupManager) to create promotion-
// recommendation summary groups and review existing ones. A group fixes the five
// BUPERSINST-shared fields that member evals inherit.

"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProfile } from "@/lib/profileService";
import { createBrowserClient } from "@/lib/supabaseClient";
import { canManageSummaryGroups } from "@/lib/permissions";
import {
  createSummaryGroup,
  listSummaryGroups,
  setGroupStatus,
  listEvalsInGroup,
  getGroupRecommendations,
  getSummaryGroupAverage,
} from "@/lib/summaryGroupService";
import {
  checkForcedDistribution,
  tallyRecommendations,
  ForcedDistributionResult,
} from "@/lib/forcedDistribution";
import { PROMOTION_STATUS_OPTIONS } from "@/types/navpers";
import { Profile, SummaryGroup } from "@/types";
import AppShell from "@/components/layout/AppShell";
import { FORM_LABEL, formFieldClass } from "@/lib/formStyles";

const FIELD = formFieldClass();

export default function SummaryGroupsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<SummaryGroup[]>([]);
  const [seniors, setSeniors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () =>
    setGroups(await listSummaryGroups().catch(() => []));

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }
      setProfile(await getProfile(session.user.id));
      const { data } = await createBrowserClient()
        .from("profiles")
        .select("id,first_name,last_name")
        .eq("preferred_role", "Reporting Senior");
      setSeniors(data || []);
      await reload();
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <Center text="Loading summary groups..." />;
  if (!profile || !canManageSummaryGroups(profile)) {
    return (
      <Center
        text="Access restricted — Reporting Senior or Admin only."
        onBack={() => router.push("/dashboard")}
      />
    );
  }

  return (
    <AppShell
      profile={profile}
      title="Summary Groups"
      subtitle="Create promotion-recommendation groups and review forced distribution"
      badge="Reporting Senior"
      maxWidth="5xl"
    >
      <div className="space-y-6">
        <GroupForm
          seniors={seniors}
          createdBy={profile.id}
          onCreated={reload}
        />
        <GroupList groups={groups} onChanged={reload} />
      </div>
    </AppShell>
  );
}

function GroupForm({
  seniors,
  createdBy,
  onCreated,
}: {
  seniors: any[];
  createdBy: string;
  onCreated: () => void;
}) {
  const [g, setG] = useState<SummaryGroup>({
    name: "",
    reporting_senior_id: "",
    period_to: "",
    grade_rate: "",
    promotion_status: "Regular",
    command_employment: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof SummaryGroup, v: string) =>
    setG((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setError(null);
    if (
      !g.name ||
      !g.reporting_senior_id ||
      !g.period_to ||
      !g.grade_rate ||
      !g.command_employment
    ) {
      setError("All fields are required.");
      return;
    }
    setSaving(true);
    try {
      await createSummaryGroup(g, createdBy);
      setG({ ...g, name: "" });
      onCreated();
    } catch (e: any) {
      setError(e.message || "Failed to create group.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="apex-form-panel space-y-4">
      <h3
        className="text-lg font-bold gold-accent border-b pb-2"
        style={{ borderColor: "var(--border)" }}
      >
        Create Summary Group
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={FORM_LABEL}>Group Name</label>
          <input
            className={FIELD}
            value={g.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="PO1 Regular 2025 / CDR SMITH"
          />
        </div>
        <div>
          <label className={FORM_LABEL}>Reporting Senior</label>
          <select
            className={FIELD}
            value={g.reporting_senior_id}
            onChange={(e) => set("reporting_senior_id", e.target.value)}
          >
            <option value="">Select RS</option>
            {seniors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.last_name}, {s.first_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FORM_LABEL}>Ending Date</label>
          <input
            type="date"
            className={FIELD}
            value={g.period_to}
            onChange={(e) => set("period_to", e.target.value)}
          />
        </div>
        <div>
          <label className={FORM_LABEL}>Paygrade (Grade/Rate)</label>
          <input
            className={FIELD}
            value={g.grade_rate}
            onChange={(e) => set("grade_rate", e.target.value.toUpperCase())}
            placeholder="PO1"
          />
        </div>
        <div>
          <label className={FORM_LABEL}>Promotion Status</label>
          <select
            className={FIELD}
            value={g.promotion_status}
            onChange={(e) => set("promotion_status", e.target.value)}
          >
            {PROMOTION_STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={FORM_LABEL}>Command Employment</label>
          <textarea
            className={`${FIELD} h-16`}
            value={g.command_employment}
            onChange={(e) => set("command_employment", e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-red-400 text-xs font-semibold">{error}</p>}
      <button
        onClick={submit}
        disabled={saving}
        className="apex-btn-primary disabled:opacity-50 text-sm"
      >
        {saving ? "Creating…" : "Create Group"}
      </button>
    </div>
  );
}

function GroupList({
  groups,
  onChanged,
}: {
  groups: SummaryGroup[];
  onChanged: () => void;
}) {
  if (!groups.length)
    return (
      <p className="text-sm text-slate-500">
        No summary groups yet. Create one above.
      </p>
    );
  return (
    <div className="space-y-3">
      <h3 className="apex-section-title">Existing Groups</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <GroupCard key={g.id} g={g} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function GroupCard({
  g,
  onChanged,
}: {
  g: SummaryGroup;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [evals, setEvals] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fd, setFd] = useState<ForcedDistributionResult | null>(null);
  const [groupAverage, setGroupAverage] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Forced-distribution status for the whole group (the RS has oversight, so RLS exposes every
  // member). Drives the inline status pill and the hard block on closing an over-cap group.
  useEffect(() => {
    let active = true;
    getGroupRecommendations(g.id!)
      .then((recs) => {
        if (active)
          setFd(
            checkForcedDistribution(
              tallyRecommendations(recs).distribution,
              g.grade_rate,
            ),
          );
      })
      .catch(() => {
        if (active) setFd(null);
      });
    getSummaryGroupAverage(g.id!)
      .then((res) => {
        if (active) setGroupAverage(res.average);
      })
      .catch(() => {
        if (active) setGroupAverage(null);
      });
    return () => {
      active = false;
    };
  }, [g.id, g.grade_rate]);

  const toggleExpand = async () => {
    const next = !open;
    setOpen(next);
    if (next && evals === null)
      setEvals(await listEvalsInGroup(g.id!).catch(() => []));
  };
  const toggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setErr(null);
    // Hard block: a group that exceeds the EVALMAN forced-distribution caps may not be closed.
    if (g.status === "open" && fd && !fd.compliant) {
      setErr(
        `Cannot close — fix the distribution first. ${fd.violations.map((v) => v.message).join(" ")}`,
      );
      return;
    }
    setBusy(true);
    try {
      await setGroupStatus(g.id!, g.status === "open" ? "closed" : "open");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`apex-card p-4 text-sm ${fd && !fd.compliant ? "border-red-500/40" : ""}`}
    >
      <div className="flex justify-between items-start gap-2">
        <button onClick={toggleExpand} className="text-left min-w-0">
          <h4 className="font-bold apex-heading truncate">{g.name}</h4>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            {g.grade_rate} · {g.promotion_status} · ends {g.period_to} · Group
            Avg: {groupAverage !== null ? groupAverage.toFixed(2) : "N/A"}
          </p>
        </button>
        <button
          onClick={toggleStatus}
          disabled={busy}
          title="Toggle whether new evals may join"
          className={`shrink-0 text-[10px] px-2 py-0.5 rounded uppercase font-bold border transition ${g.status === "open" ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/50 hover:bg-emerald-900/40" : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"}`}
        >
          {g.status} · {g.status === "open" ? "Close" : "Reopen"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-1 truncate">
        {g.command_employment}
      </p>

      {/* Block 46 distribution + forced-distribution status */}
      {fd && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span
            className={`px-1.5 py-0.5 rounded uppercase font-bold border ${fd.compliant ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/50" : "bg-red-950/40 text-red-300 border-red-900/50"}`}
          >
            {fd.compliant ? "Within limits" : "Over limit"}
          </span>
          <span className="text-slate-400">
            EP {fd.distribution["Early Promote"]}/{fd.earlyPromoteMax} · MP{" "}
            {fd.distribution["Must Promote"]} · P{" "}
            {fd.distribution["Promotable"]} · obs {fd.observedCount}
          </span>
        </div>
      )}
      {err && (
        <p className="text-red-400 text-[11px] font-semibold mt-2">{err}</p>
      )}
      <button
        onClick={toggleExpand}
        className="text-[11px] text-blue-400 hover:underline mt-2"
      >
        {open ? "Hide evaluations" : "View evaluations in this group"}
      </button>
      {open && (
        <div className="mt-2 border-t border-slate-800/60 pt-2 space-y-1">
          {evals === null ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : evals.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              No evaluations in this group yet.
            </p>
          ) : (
            evals.map((ev) => {
              const recommendationShort = ev.promotion_recommendation
                ? ev.promotion_recommendation === "Early Promote"
                  ? "EP"
                  : ev.promotion_recommendation === "Must Promote"
                    ? "MP"
                    : ev.promotion_recommendation === "Promotable"
                      ? "P"
                      : ev.promotion_recommendation === "Progressing"
                        ? "PR"
                        : "SP"
                : null;
              const badgeText =
                [
                  recommendationShort,
                  ev.trait_average
                    ? `${Number(ev.trait_average).toFixed(2)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Draft";

              return (
                <button
                  key={ev.id}
                  onClick={() =>
                    router.push(`/evaluations/${ev.id}?tab=preview`)
                  }
                  title="Open the document preview for this evaluation"
                  className="w-full text-left flex justify-between items-center text-xs px-2 py-1 rounded hover:bg-slate-800/40"
                >
                  <span className="text-slate-200 truncate">
                    {ev.member_name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold shrink-0 ml-2">
                    {badgeText}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function Center({ text, onBack }: { text: string; onBack?: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen text-sm gap-4 px-6 text-center"
      style={{ background: "var(--background)", color: "var(--muted-foreground)" }}
    >
      <span>{text}</span>
      {onBack && (
        <button type="button" onClick={onBack} className="apex-btn-secondary">
          Return to Dashboard
        </button>
      )}
    </div>
  );
}
