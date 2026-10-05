// Which file a person holds. A member workspace never contains another sailor's
// report. Ranking fields travel only on a debrief copy.

import { db, DEFAULT_PROFILE } from "./db";
import {
  noteWorkspaceIdentity,
  readWorkspaceIdentity,
  type HolderRole,
  type WorkspaceIdentity,
  type WorkspaceScope,
} from "./workspaceSession";
import type { Evaluation, RosterEntry } from "@/types";

export type { HolderRole, WorkspaceIdentity, WorkspaceScope };
export type ReportRelease = "draft" | "review" | "debrief";

export interface WorkspaceCard {
  format: "APEX_WORKSPACE_CARD";
  version: "1";
  workspace_id: string;
  holder_name: string;
  holder_role: HolderRole;
}

const HOLDER_ROLES: HolderRole[] = ["Sailor", "Rater", "Senior Rater", "Reporting Senior"];

export function mintWorkspaceId(): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `ws-${uuid}`;
}

export function defaultRelease(scope: WorkspaceScope): ReportRelease {
  if (scope === "member") return "draft";
  return "review";
}

export function hasRankingContent(evaluation: Evaluation): boolean {
  if (evaluation.summary_group_average != null) return true;
  const distribution = evaluation.summary_group_distribution;
  if (distribution && Object.values(distribution).some((count) => Number(count) > 0)) return true;
  return Boolean(evaluation.promotion_recommendation && String(evaluation.promotion_recommendation).trim());
}

/** Draft and review copies omit the promotion mark, the breakdown, and the group average. */
export function copyForRelease(evaluation: Evaluation, release: ReportRelease): Evaluation {
  if (release === "debrief") {
    return { ...evaluation, ranking_released: true };
  }
  const {
    promotion_recommendation: _mark,
    summary_group_average: _average,
    summary_group_distribution: _distribution,
    ...rest
  } = evaluation;
  return { ...rest, ranking_released: false } as Evaluation;
}

export function canSeeRanking(scope: WorkspaceScope | null, evaluation: Evaluation): boolean {
  if (scope === "command") return true;
  return scope === "member" && evaluation.ranking_released === true;
}

export function transferRefusal(
  pkg: { release?: ReportRelease; addressed_to?: string; evaluation: Evaluation },
  identity: WorkspaceIdentity | null,
): string | null {
  if (pkg.addressed_to && identity && pkg.addressed_to !== identity.workspaceId) {
    return "This report is addressed to a different workspace.";
  }
  if (!pkg.release || !identity) return null;
  if (pkg.release === "debrief" && identity.scope !== "member") {
    return "A debrief copy opens only in the sailor's workspace.";
  }
  if (
    (pkg.release === "draft" || pkg.release === "review") &&
    (identity.scope === "member" || identity.scope === "reviewer") &&
    hasRankingContent(pkg.evaluation)
  ) {
    return "This report still contains summary-group ranking. Ask for a new copy.";
  }
  return null;
}

export function roleForScope(scope: WorkspaceScope, reviewerRole?: HolderRole): HolderRole {
  if (scope === "member") return "Sailor";
  if (scope === "command") return "Reporting Senior";
  if (reviewerRole === "Senior Rater") return "Senior Rater";
  return "Rater";
}

/**
 * Records the scope for this browser. A member or reviewer workspace drops any
 * reports and summary groups already stored here, so another sailor's ranking
 * cannot ride along in the file.
 */
export async function establishWorkspace(input: {
  scope: WorkspaceScope;
  holderName: string;
  holderRole: HolderRole;
}): Promise<WorkspaceIdentity> {
  const identity: WorkspaceIdentity = {
    scope: input.scope,
    workspaceId: mintWorkspaceId(),
    holderName: input.holderName.trim(),
    holderRole: input.holderRole,
  };
  if (!identity.holderName) throw new Error("Enter the name that should print on reports.");
  if (input.scope !== "command") {
    await db.evaluations.clear();
    await db.summary_groups.clear();
    await db.rsca_records.clear();
    await db.roster.clear();
  }
  const existing = (await db.profiles.toArray())[0];
  await db.profiles.put({
    ...(existing ?? DEFAULT_PROFILE),
    id: existing?.id ?? DEFAULT_PROFILE.id,
    preferred_role: input.holderRole,
  });
  noteWorkspaceIdentity(identity);
  return identity;
}

export function parseWorkspaceCard(value: unknown): RosterEntry {
  const card = value as Partial<WorkspaceCard>;
  if (card?.format !== "APEX_WORKSPACE_CARD" || !card.workspace_id || !card.holder_name) {
    throw new Error("Invalid workspace card. Expected APEX_WORKSPACE_CARD.");
  }
  if (!HOLDER_ROLES.includes(card.holder_role as HolderRole)) {
    throw new Error("The workspace card has no role.");
  }
  return {
    id: card.workspace_id,
    holder_name: card.holder_name,
    holder_role: card.holder_role as HolderRole,
  };
}

export async function importWorkspaceCard(file: File): Promise<RosterEntry> {
  const identity = readWorkspaceIdentity();
  if (identity?.scope !== "command") {
    throw new Error("Only the command workspace keeps the roster.");
  }
  const entry = parseWorkspaceCard(JSON.parse(await file.text()));
  await db.roster.put(entry);
  return entry;
}

export function workspaceCardFor(identity: WorkspaceIdentity): WorkspaceCard {
  return {
    format: "APEX_WORKSPACE_CARD",
    version: "1",
    workspace_id: identity.workspaceId,
    holder_name: identity.holderName,
    holder_role: identity.holderRole,
  };
}
