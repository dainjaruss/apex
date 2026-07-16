"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { useEvaluations } from "@/hooks/useEvaluations";
import { createBrowserClient } from "@/lib/supabaseClient";
import AppShell from "@/components/layout/AppShell";
import UserAvatar, { getMemberInitials } from "@/components/brand/UserAvatar";

const supabase = createBrowserClient();

const STAGE_LABEL: Record<string, string> = {
  sailor: "Sailor",
  rater: "Rater",
  senior_rater: "Senior Rater",
  reporting_senior: "Reporting Senior",
  admin: "Admin",
  debrief: "Debrief",
  locked: "Locked",
};

type QueueTab = "all" | "action" | "drafts" | "finalized";

function statusBadgeClass(status: string, routingStage?: string) {
  if (
    routingStage === "locked" ||
    status === "completed" ||
    status === "archived"
  )
    return "apex-badge-locked";
  if (routingStage && routingStage !== "sailor") return "apex-badge-routing";
  if (status === "ready_for_review") return "apex-badge-review";
  return "apex-badge-draft";
}

function statusLabel(status: string, routingStage?: string) {
  if (routingStage && routingStage !== "sailor" && routingStage !== "locked") {
    return STAGE_LABEL[routingStage] || routingStage.replace(/_/g, " ");
  }
  return status.replace(/_/g, " ");
}

function formatUpdated(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 86_400_000) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString();
}

function DashboardStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="apex-dashboard-stat">
      <span
        className="apex-dashboard-stat-value"
        style={highlight ? { color: "var(--accent-gold)" } : undefined}
      >
        {value}
      </span>
      <span className="apex-dashboard-stat-label">{label}</span>
    </div>
  );
}

function partitionEvals(evaluations: any[], profileId?: string) {
  const mine = (e: any) => e.current_holder_id === profileId;
  const drafts = evaluations.filter(
    (e) =>
      mine(e) &&
      (e.routing_stage === "sailor" || !e.routing_stage) &&
      e.status !== "completed" &&
      e.status !== "archived",
  );
  const inbox = evaluations.filter(
    (e) =>
      mine(e) &&
      e.routing_stage &&
      e.routing_stage !== "sailor" &&
      e.routing_stage !== "locked" &&
      e.status !== "completed" &&
      e.status !== "archived",
  );
  const finalized = evaluations.filter(
    (e) =>
      e.status === "completed" ||
      e.status === "archived" ||
      e.routing_stage === "locked",
  );
  return { inbox, drafts, finalized };
}

function evalCategory(
  ev: any,
  profileId?: string,
): "action" | "drafts" | "finalized" | "other" {
  const { inbox, drafts, finalized } = partitionEvals([ev], profileId);
  if (inbox.length) return "action";
  if (drafts.length) return "drafts";
  if (finalized.length) return "finalized";
  return "other";
}

function EvalQueueTable({
  loading,
  rows,
  profileId,
  emptyMessage,
}: {
  loading: boolean;
  rows: any[];
  profileId?: string;
  emptyMessage: string;
}) {
  const router = useRouter();

  if (loading && rows.length === 0) {
    return (
      <div className="apex-card p-10 text-center">
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Loading evaluations…
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="apex-card p-12 text-center">
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="apex-card overflow-hidden">
      <table className="apex-data-table">
        <thead>
          <tr>
            <th>Sailor</th>
            <th>Rate</th>
            <th>Form</th>
            <th>Period</th>
            <th>Stage</th>
            <th>Updated</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ev) => {
            const badgeClass = statusBadgeClass(ev.status, ev.routing_stage);
            const badgeText = statusLabel(ev.status, ev.routing_stage);
            const cat = evalCategory(ev, profileId);
            const canEdit = cat === "drafts" || cat === "action";
            return (
              <tr key={ev.id}>
                <td>
                  <div className="flex items-center gap-2 min-w-0">
                    <UserAvatar
                      initials={getMemberInitials(ev.member_name)}
                      size="sm"
                      tone="blue"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold apex-heading truncate">
                        {ev.member_name || "Unnamed"}
                      </div>
                      <div
                        className="text-xs font-mono truncate"
                        style={{ color: "var(--subtle)" }}
                      >
                        {ev.id?.slice(0, 8)}…
                      </div>
                    </div>
                  </div>
                </td>
                <td>{ev.grade_rate || "—"}</td>
                <td className="font-mono text-xs">
                  {ev.report_type || "EVAL"}
                </td>
                <td className="text-xs whitespace-nowrap">
                  {ev.period_from} – {ev.period_to}
                </td>
                <td>
                  <span className={`${badgeClass} px-2 py-0.5 text-[10px]`}>
                    {badgeText}
                  </span>
                </td>
                <td className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {formatUpdated(ev.updated_at || ev.created_at)}
                </td>
                <td className="text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => router.push(`/evaluations/${ev.id}`)}
                    className="apex-btn-secondary py-1.5 px-3 text-xs mr-1"
                  >
                    View
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => router.push(`/evaluations/${ev.id}/edit`)}
                      className="apex-btn-primary py-1.5 px-3 text-xs"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { evaluations, loading, error } = useEvaluations();
  const [profile, setProfile] = useState<any>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [queueTab, setQueueTab] = useState<QueueTab>("all");
  const [sortBy, setSortBy] = useState("updated_desc");

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (data) setProfile(data);
    })();
  }, [router]);

  const processedEvals = useMemo(() => {
    let list = [...evaluations];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => {
        return (
          (e.member_name || "").toLowerCase().includes(q) ||
          (e.dod_id || "").toLowerCase().includes(q) ||
          (e.uic || "").toLowerCase().includes(q) ||
          (e.grade_rate || "").toLowerCase().includes(q) ||
          (e.id || "").toLowerCase().includes(q)
        );
      });
    }

    if (statusFilter !== "all") {
      list = list.filter((e) => e.status === statusFilter);
    }

    if (queueTab !== "all") {
      list = list.filter(
        (e) => evalCategory(e, profile?.id) === queueTab,
      );
    }

    list.sort((a, b) => {
      if (sortBy === "updated_desc") {
        return (
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
        );
      }
      if (sortBy === "name_asc") {
        return (a.member_name || "").localeCompare(b.member_name || "");
      }
      return 0;
    });

    return list;
  }, [evaluations, search, statusFilter, queueTab, sortBy, profile?.id]);

  const { inbox, drafts, finalized } = partitionEvals(
    evaluations,
    profile?.id,
  );

  return (
    <AppShell
      profile={profile}
      maxWidth="full"
      breadcrumbs={[{ label: "Dashboard" }]}
      topbarSearch={{
        value: search,
        onChange: setSearch,
        placeholder: "Search sailors, UIC, eval ID…",
      }}
      headerActions={
        <button
          type="button"
          onClick={() => router.push("/evaluations/new")}
          className="apex-btn-primary"
        >
          + New eval
        </button>
      }
    >
      {error && (
        <div className="mb-6 p-4 rounded-lg text-xs border border-red-500/30 bg-red-950/30 text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6">
        <h1 className="apex-page-title">Evaluation queue</h1>
        <p className="apex-page-subtitle">
          {processedEvals.length} visible report
          {processedEvals.length === 1 ? "" : "s"} · manage drafts and routing
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <DashboardStat
          label="Awaiting your action"
          value={inbox.length}
          highlight={inbox.length > 0}
        />
        <DashboardStat label="My drafts" value={drafts.length} />
        <DashboardStat label="Completed / locked" value={finalized.length} />
        <DashboardStat label="Total in queue" value={processedEvals.length} />
      </div>

      <div className="apex-card p-3 mb-4 flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-[var(--muted)]">
          {(
            [
              ["all", "All"],
              ["action", "Awaiting action"],
              ["drafts", "Drafts"],
              ["finalized", "Finalized"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setQueueTab(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                queueTab === key
                  ? "bg-[var(--card)] shadow-sm"
                  : "text-[var(--muted-foreground)]"
              }`}
              style={
                queueTab === key ? { color: "var(--heading)" } : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="apex-input max-w-[180px] py-2 text-xs"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="ready_for_review">Ready for review</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="apex-input max-w-[180px] py-2 text-xs"
        >
          <option value="updated_desc">Recently updated</option>
          <option value="name_asc">Name (A–Z)</option>
        </select>
      </div>

      <EvalQueueTable
        loading={loading}
        rows={processedEvals}
        profileId={profile?.id}
        emptyMessage="No evaluations match your filters."
      />
    </AppShell>
  );
}