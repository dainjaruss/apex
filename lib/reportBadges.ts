/** Status / routing chips for report & dashboard surfaces */
export function evaluationStatusBadgeClass(
  status: string,
  routingStage?: string,
): string {
  if (
    routingStage === "locked" ||
    status === "completed" ||
    status === "archived"
  )
    return "apex-badge-locked";
  if (routingStage === "reporting_senior") return "apex-badge-reporting-senior";
  if (routingStage && routingStage !== "sailor") return "apex-badge-routing";
  if (status === "ready_for_review") return "apex-badge-review";
  return "apex-badge-draft";
}

export function formatEvaluationStatus(
  status: string,
  routingStage?: string,
): string {
  if (routingStage && routingStage !== "sailor" && routingStage !== "locked") {
    return routingStage.replace(/_/g, " ");
  }
  return status.replace(/_/g, " ");
}