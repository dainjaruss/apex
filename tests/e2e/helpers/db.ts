import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import dotenv from "dotenv";
import { buildValidEval, FORM_DEFINITION_ID } from "../../fixtures/validEval";
import { loadE2EIds } from "./e2e-ids";

function loadEnv() {
  dotenv.config({ path: resolve(process.cwd(), ".env.local") });
  dotenv.config({ path: resolve(process.cwd(), ".env") });
}

function adminClient() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Supabase env vars missing for E2E DB helper");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface EvalState {
  routing_stage?: string;
  current_holder_id?: string;
  signature_locked?: boolean;
  status?: string;
}

export async function getEvalState(evalId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("evaluations")
    .select("routing_stage, current_holder_id, signature_locked, status")
    .eq("id", evalId)
    .single();
  if (error) throw new Error(error.message);
  return data as EvalState;
}

export async function assertEvalState(evalId: string, expected: EvalState) {
  const state = await getEvalState(evalId);
  for (const [key, value] of Object.entries(expected)) {
    if (value === undefined) continue;
    if (state[key as keyof EvalState] !== value) {
      throw new Error(
        `Eval ${evalId}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(state[key as keyof EvalState])}`,
      );
    }
  }
}

export async function resetRoutingEval() {
  const ids = loadE2EIds();
  const admin = adminClient();
  const base = buildValidEval();
  const { error } = await admin
    .from("evaluations")
    .update({
      ...base,
      created_by: ids.users.sailor,
      current_holder_id: ids.users.sailor,
      previous_holder_id: null,
      routing_stage: "sailor",
      participants: [ids.users.sailor],
      signature_locked: false,
      status: "draft",
      member_name: "DOE, JOHN A",
      form_definition_id: FORM_DEFINITION_ID,
      summary_group_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ids.evals.routing);
  if (error) throw new Error(error.message);
  await admin
    .from("review_approvals")
    .delete()
    .eq("evaluation_id", ids.evals.routing);
}

export async function resetRecycleEval() {
  const ids = loadE2EIds();
  const admin = adminClient();
  const payload = buildValidEval({
    created_by: ids.users.sailor,
    current_holder_id: ids.users.rater,
    previous_holder_id: ids.users.sailor,
    routing_stage: "rater",
    participants: [ids.users.sailor, ids.users.rater],
    signature_locked: false,
    status: "draft",
    member_name: "DOE, JOHN A (RECYCLE)",
    form_definition_id: FORM_DEFINITION_ID,
  });
  const { error } = await admin
    .from("evaluations")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ids.evals.recycle);
  if (error) throw new Error(error.message);
  await admin
    .from("review_approvals")
    .delete()
    .eq("evaluation_id", ids.evals.recycle);
}

export async function countReviewApprovals(evalId: string, status?: string) {
  const admin = adminClient();
  let q = admin
    .from("review_approvals")
    .select("id", { count: "exact", head: true })
    .eq("evaluation_id", evalId);
  if (status) q = q.eq("approval_status", status);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
