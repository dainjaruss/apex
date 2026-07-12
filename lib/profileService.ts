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

const keyMap: Record<string, string> = {
  firstName: "first_name",
  lastName: "last_name",
  middleInitial: "middle_initial",
  dodId: "dod_id",
  uic: "uic",
  navyRank: "navy_rank",
  command: "command",
  preferredRole: "preferred_role",
};

// Updates preferred role or command for the profile
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
    preferredRole?:
      "Sailor" | "Rater" | "Senior Rater" | "Reporting Senior" | "Admin";
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
