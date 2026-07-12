"use client";

import { useEffect, useState, useMemo } from "react";
import { createBrowserClient } from "@/lib/supabaseClient";
import { Profile, Evaluation } from "@/types";

const supabase = createBrowserClient();

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  accent,
  icon,
  sub,
}: {
  label: string;
  value: string | number;
  accent: string;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <div
      className="admin-stat-card"
      style={{ "--stat-accent": accent } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--muted-foreground)" }}
          >
            {label}
          </p>
          <p className="text-3xl font-black tabular-nums text-white">{value}</p>
          {sub && (
            <p className="text-[10px]" style={{ color: "var(--subtle)" }}>
              {sub}
            </p>
          )}
        </div>
        <div
          className="shrink-0 p-2.5 rounded-xl"
          style={{ background: `${accent}18`, border: `1px solid ${accent}35` }}
        >
          {icon}
        </div>
      </div>
      <div
        className="h-0.5 rounded-full mt-3"
        style={{
          background: `linear-gradient(90deg, ${accent} 0%, transparent 100%)`,
          opacity: 0.5,
        }}
      />
    </div>
  );
}

// ── Horizontal bar ─────────────────────────────────────────────────────────
function HBar({
  label,
  value,
  max,
  color,
  pct,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  pct: string;
}) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-white">{label}</span>
        <span style={{ color: "var(--subtle)" }}>
          {value} <span className="text-[10px]">({pct})</span>
        </span>
      </div>
      <div
        className="h-2 rounded-full"
        style={{ background: "rgba(255,255,255,0.05)" }}
      >
        <div
          className="h-2 rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${w}%`,
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
          }}
        />
      </div>
    </div>
  );
}

// ── Donut segment (SVG) ────────────────────────────────────────────────────
function DonutChart({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-xs" style={{ color: "var(--subtle)" }}>
          No evaluation data
        </p>
      </div>
    );
  }

  const r = 50,
    cx = 60,
    cy = 60,
    strokeWidth = 16;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 120 120" width="140" height="140" className="shrink-0">
        {segments.map((seg) => {
          if (seg.value === 0) return null;
          const pct = seg.value / total;
          const dash = pct * circumference;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle
              key={seg.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-currentOffset}
              strokeLinecap="round"
              className="transition-all duration-700"
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "60px 60px",
              }}
            />
          );
        })}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fill="white"
          fontSize="18"
          fontWeight="800"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fill="#94a8c4"
          fontSize="8"
          fontWeight="600"
        >
          TOTAL
        </text>
      </svg>

      <div className="space-y-2 flex-1 min-w-0">
        {segments
          .filter((s) => s.value > 0)
          .map((seg) => (
            <div key={seg.label} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: seg.color }}
              />
              <span className="text-white font-medium truncate">
                {seg.label}
              </span>
              <span
                className="ml-auto tabular-nums"
                style={{ color: "var(--subtle)" }}
              >
                {seg.value}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Activity Item ──────────────────────────────────────────────────────────
function ActivityItem({ ev }: { ev: Evaluation }) {
  const stage = ev.routing_stage || "draft";
  const stageColor: Record<string, string> = {
    sailor: "#3b82f6",
    rater: "#f59e0b",
    senior_rater: "#a855f7",
    reporting_senior: "#10b981",
    debrief: "#ec4899",
    locked: "#64748b",
    draft: "#3b82f6",
  };
  const color = stageColor[stage] || "#3b82f6";
  const timeAgo = formatTimeAgo(ev.updated_at || ev.created_at || "");

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg transition hover:bg-white/[0.03]">
      <div
        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
        style={{ background: color, boxShadow: `0 0 6px ${color}60` }}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-semibold text-white truncate">
          {ev.member_name || "Unnamed"}
        </p>
        <p className="text-[10px]" style={{ color: "var(--subtle)" }}>
          {stage.replace(/_/g, " ")} · {ev.status?.replace(/_/g, " ")}
        </p>
      </div>
      <span
        className="text-[10px] shrink-0 tabular-nums"
        style={{ color: "var(--subtle)" }}
      >
        {timeAgo}
      </span>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [evalRes, profileRes] = await Promise.all([
        supabase
          .from("evaluations")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase.from("profiles").select("*"),
      ]);
      if (evalRes.data) setEvals(evalRes.data as Evaluation[]);
      if (profileRes.data) setProfiles(profileRes.data as Profile[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const stats = useMemo(() => {
    const statusCounts = {
      draft: 0,
      ready_for_review: 0,
      completed: 0,
      archived: 0,
    };
    const stageCounts: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};
    let locked = 0;

    for (const ev of evals) {
      statusCounts[ev.status as keyof typeof statusCounts] =
        (statusCounts[ev.status as keyof typeof statusCounts] || 0) + 1;
      const stage = ev.routing_stage || "unrouted";
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      if (ev.signature_locked) locked++;
    }

    for (const p of profiles) {
      const r = p.preferred_role || "Unknown";
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    }

    const recentEvals = evals.slice(0, 8);

    return {
      statusCounts,
      stageCounts,
      roleCounts,
      locked,
      recentEvals,
      totalEvals: evals.length,
      totalUsers: profiles.length,
    };
  }, [evals, profiles]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl animate-pulse"
            style={{ background: "var(--card)" }}
          />
        ))}
      </div>
    );
  }

  const stageColors: Record<string, string> = {
    sailor: "#3b82f6",
    rater: "#f59e0b",
    senior_rater: "#a855f7",
    reporting_senior: "#10b981",
    debrief: "#ec4899",
    locked: "#64748b",
    unrouted: "#475569",
  };

  const stageLabels: Record<string, string> = {
    sailor: "Sailor",
    rater: "Rater",
    senior_rater: "Senior Rater",
    reporting_senior: "Reporting Senior",
    debrief: "Debrief",
    locked: "Locked",
    unrouted: "Unrouted",
  };

  const donutSegments = Object.entries(stats.stageCounts).map(([key, val]) => ({
    label: stageLabels[key] || key.replace(/_/g, " "),
    value: val,
    color: stageColors[key] || "#6b849f",
  }));

  const roleColors: Record<string, string> = {
    Sailor: "#3b82f6",
    Rater: "#f59e0b",
    "Senior Rater": "#a855f7",
    "Reporting Senior": "#10b981",
    Admin: "#ef4444",
  };
  const maxRoleCount = Math.max(...Object.values(stats.roleCounts), 1);

  // Completion rate
  const completionRate =
    stats.totalEvals > 0
      ? Math.round((stats.statusCounts.completed / stats.totalEvals) * 100)
      : 0;

  // Active in pipeline (not completed/archived)
  const activeInPipeline =
    stats.totalEvals -
    stats.statusCounts.completed -
    stats.statusCounts.archived;

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            System Analytics
          </h2>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            Real-time evaluation pipeline and user metrics
          </p>
        </div>
        <span className="apex-badge text-[9px]">LIVE</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Evaluations"
          value={stats.totalEvals}
          accent="#22d3ee"
          sub={`${activeInPipeline} active in pipeline`}
          icon={
            <svg
              className="w-5 h-5"
              stroke="#22d3ee"
              fill="none"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
        />
        <StatCard
          label="Completion Rate"
          value={`${completionRate}%`}
          accent="#34d399"
          sub={`${stats.statusCounts.completed} completed`}
          icon={
            <svg
              className="w-5 h-5"
              stroke="#34d399"
              fill="none"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Active Users"
          value={stats.totalUsers}
          accent="#a855f7"
          sub={`${Object.keys(stats.roleCounts).length} roles assigned`}
          icon={
            <svg
              className="w-5 h-5"
              stroke="#a855f7"
              fill="none"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Signature Locked"
          value={stats.locked}
          accent="#fbbf24"
          sub="Awaiting finalization"
          icon={
            <svg
              className="w-5 h-5"
              stroke="#fbbf24"
              fill="none"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          }
        />
      </div>

      {/* Pipeline Status Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="admin-analytics-panel">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-cyan-400" />
            Evaluation Status Pipeline
          </h3>
          <div className="space-y-3">
            <HBar
              label="Draft"
              value={stats.statusCounts.draft}
              max={stats.totalEvals}
              color="#3b82f6"
              pct={`${stats.totalEvals ? Math.round((stats.statusCounts.draft / stats.totalEvals) * 100) : 0}%`}
            />
            <HBar
              label="Ready for Review"
              value={stats.statusCounts.ready_for_review}
              max={stats.totalEvals}
              color="#f59e0b"
              pct={`${stats.totalEvals ? Math.round((stats.statusCounts.ready_for_review / stats.totalEvals) * 100) : 0}%`}
            />
            <HBar
              label="Completed"
              value={stats.statusCounts.completed}
              max={stats.totalEvals}
              color="#34d399"
              pct={`${stats.totalEvals ? Math.round((stats.statusCounts.completed / stats.totalEvals) * 100) : 0}%`}
            />
            <HBar
              label="Archived"
              value={stats.statusCounts.archived}
              max={stats.totalEvals}
              color="#64748b"
              pct={`${stats.totalEvals ? Math.round((stats.statusCounts.archived / stats.totalEvals) * 100) : 0}%`}
            />
          </div>
        </div>

        {/* Routing Stage Donut */}
        <div className="admin-analytics-panel">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-purple-400" />
            Routing Stage Distribution
          </h3>
          <DonutChart segments={donutSegments} />
        </div>
      </div>

      {/* Role Distribution + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="admin-analytics-panel">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-amber-400" />
            Role Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.roleCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([role, count]) => (
                <HBar
                  key={role}
                  label={role}
                  value={count}
                  max={maxRoleCount}
                  color={roleColors[role] || "#6b849f"}
                  pct={`${stats.totalUsers ? Math.round((count / stats.totalUsers) * 100) : 0}%`}
                />
              ))}
          </div>
        </div>

        <div className="admin-analytics-panel">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-emerald-400" />
            Recent Activity
          </h3>
          {stats.recentEvals.length > 0 ? (
            <div
              className="space-y-0.5 max-h-64 overflow-y-auto"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(255,255,255,0.1) transparent",
              }}
            >
              {stats.recentEvals.map((ev) => (
                <ActivityItem key={ev.id} ev={ev} />
              ))}
            </div>
          ) : (
            <p
              className="text-xs py-8 text-center"
              style={{ color: "var(--subtle)" }}
            >
              No evaluation activity yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
