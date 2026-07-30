import { createBrowserClient } from "./supabaseClient";

const supabase = createBrowserClient();

// Gets profile details for a given userId
export const getProfile = async (uId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uId)
    .single();

  if (error) {
    console.error("getProfile failed for user", uId, error.message);
    throw error;
  }
  return data;
};

// preferred_role and assigned_roles are deliberately absent. Migration 009
// revokes UPDATE on those columns from `authenticated`, so including either one
// in the payload makes Postgres reject the ENTIRE statement with 42501 — even
// when the value is unchanged. Roles are granted server-side, never self-served.
const keyMap: Record<string, string> = {
  firstName: "first_name",
  lastName: "last_name",
  middleInitial: "middle_initial",
  dodId: "dod_id",
  uic: "uic",
  navyRank: "navy_rank",
  command: "command",
};

// Updates the self-service identity fields on a profile. Role is not one of them.
export const updateProfile = async (
  uId: string,
  updates: {
    firstName?: string;
    lastName?: string;
    middleInitial?: string;
    dodId?: string;
    uic?: string; // 5-char UIC from commands lookup
    navyRank?: string;
    command?: string;
  },
) => {
  // Map JS camelCase back to postgres snake_case dynamically
  const payload: Record<string, any> = {};

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined && keyMap[key]) {
      payload[keyMap[key]] = val;
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", uId)
    .select()
    .single();

  if (error) {
    console.error("updateProfile failed for user", uId, error.message);
    throw error;
  }
  return data;
};
