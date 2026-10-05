// Browser-side record of the open workspace file.
// The SQLite file is the record. These keys remember which generation is open,
// whether this browser has edits that are not in that file, and the custody
// tokens this browser is allowed to save with.

const RATCHET_KEY = "apex_v2_file_ratchet";
const DIRTY_KEY = "apex_v2_workspace_dirty";
const TOKEN_KEY = "apex_v2_report_lock_tokens";
const SCOPE_KEY = "apex_v2_workspace_scope";
const WORKSPACE_ID_KEY = "apex_v2_workspace_id";
const HOLDER_NAME_KEY = "apex_v2_holder_name";
const HOLDER_ROLE_KEY = "apex_v2_holder_role";

export type WorkspaceScope = "member" | "reviewer" | "command";
export type HolderRole = "Sailor" | "Rater" | "Senior Rater" | "Reporting Senior";

export interface WorkspaceIdentity {
  scope: WorkspaceScope;
  workspaceId: string;
  holderName: string;
  holderRole: HolderRole;
}

const SCOPES: WorkspaceScope[] = ["member", "reviewer", "command"];
const HOLDER_ROLES: HolderRole[] = ["Sailor", "Rater", "Senior Rater", "Reporting Senior"];

function isScope(value: string | null): value is WorkspaceScope {
  return SCOPES.includes(value as WorkspaceScope);
}

function isHolderRole(value: string | null): value is HolderRole {
  return HOLDER_ROLES.includes(value as HolderRole);
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function markWorkspaceDirty(): void {
  storage()?.setItem(DIRTY_KEY, "1");
}

export function isWorkspaceDirty(): boolean {
  return storage()?.getItem(DIRTY_KEY) === "1";
}

export function readFileRatchet(): string | null {
  return storage()?.getItem(RATCHET_KEY) ?? null;
}

/** Remember the file generation now open in this browser and clear the dirty flag. */
export function noteWorkspaceLoaded(fileRatchet: string): void {
  const store = storage();
  if (!store) return;
  store.setItem(RATCHET_KEY, fileRatchet);
  store.removeItem(DIRTY_KEY);
}

export function openConflictMessage(incomingRatchet: string): string | null {
  if (!isWorkspaceDirty()) return null;
  const opened = readFileRatchet();
  if (opened && incomingRatchet !== opened) {
    return "This workspace file has moved on since you opened it, and this browser has changes that are not in that file. Loading it replaces the open workspace.";
  }
  return "This browser has changes that are not saved in a workspace file. Loading this file replaces the open workspace.";
}

function readTokens(): Record<string, string> {
  const raw = storage()?.getItem(TOKEN_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function rememberLockToken(evaluationId: string, token: string): void {
  const tokens = readTokens();
  tokens[evaluationId] = token;
  storage()?.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function recallLockToken(evaluationId: string): string | null {
  return readTokens()[evaluationId] ?? null;
}

export function forgetLockToken(evaluationId: string): void {
  const tokens = readTokens();
  delete tokens[evaluationId];
  storage()?.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function readWorkspaceIdentity(): WorkspaceIdentity | null {
  const store = storage();
  if (!store) return null;
  const scope = store.getItem(SCOPE_KEY);
  const workspaceId = store.getItem(WORKSPACE_ID_KEY);
  const holderName = store.getItem(HOLDER_NAME_KEY);
  const holderRole = store.getItem(HOLDER_ROLE_KEY);
  if (!isScope(scope) || !workspaceId || !holderName || !isHolderRole(holderRole)) return null;
  return { scope, workspaceId, holderName, holderRole };
}

export function noteWorkspaceIdentity(identity: WorkspaceIdentity | null): void {
  const store = storage();
  if (!store) return;
  if (!identity) {
    store.removeItem(SCOPE_KEY);
    store.removeItem(WORKSPACE_ID_KEY);
    store.removeItem(HOLDER_NAME_KEY);
    store.removeItem(HOLDER_ROLE_KEY);
  } else {
    store.setItem(SCOPE_KEY, identity.scope);
    store.setItem(WORKSPACE_ID_KEY, identity.workspaceId);
    store.setItem(HOLDER_NAME_KEY, identity.holderName);
    store.setItem(HOLDER_ROLE_KEY, identity.holderRole);
  }
  try {
    globalThis.dispatchEvent?.(new Event("apex-workspace-identity"));
  } catch {
    // Tests without a window still keep the stored identity.
  }
}
