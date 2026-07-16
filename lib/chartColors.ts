/**
 * Chart and activity dot colors — values are defined in app/globals.css (--chart-*).
 * Import helpers instead of hardcoding hex in components.
 */

const stageKey = (stage: string) => stage.replace(/_/g, "-");

export function chartStageColor(stage: string): string {
  return `var(--chart-stage-${stageKey(stage)}, var(--chart-fallback))`;
}

const roleKey: Record<string, string> = {
  Sailor: "sailor",
  Rater: "rater",
  "Senior Rater": "senior-rater",
  "Reporting Senior": "reporting-senior",
  Admin: "admin",
};

export function chartRoleColor(role: string): string {
  const k = roleKey[role] ?? "unknown";
  return `var(--chart-role-${k}, var(--chart-fallback))`;
}

export const chartAxisColor = "var(--chart-axis)";