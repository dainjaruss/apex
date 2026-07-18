import { createBrowserClient } from "./supabaseClient";

function getSupabase() {
  return createBrowserClient();
}

// Board Confidence uploads are session-ephemeral: destroyed at logout, and
// swept here at the next login for sessions that ended without one (closed
// browser, expired token). Never blocks auth — failures are logged only.
export const purgeBoardDocs = async (userId: string) => {
  try {
    const storage = getSupabase().storage;
    const { data: files, error } = await storage.from("board-docs").list(userId);
    if (error) {
      console.error("Board doc purge: list failed:", error.message);
      return;
    }
    if (!files?.length) return;
    const { error: removeError } = await storage
      .from("board-docs")
      .remove(files.map((f) => `${userId}/${f.name}`));
    if (removeError)
      console.error("Board doc purge: remove failed:", removeError.message);
  } catch (err) {
    console.error("Board doc purge failed:", err);
  }
};

// user authentication with password
export const signInWithPassword = async (email: string, pass: string) => {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email,
    password: pass,
  });
  if (error) {
    console.error("Login failed for email:", email, error.message);
    throw error;
  }
  // Sweep ephemeral board docs left by a session that never logged out.
  if (data?.user?.id) await purgeBoardDocs(data.user.id);
  return data;
};

// register new user
export const signUpWithEmail = async (
  email: string,
  pass: string,
  profileMeta: {
    firstName: string;
    lastName: string;
    middleInitial?: string;
    dodId?: string;
    uic?: string;
    navyRank: string;
    command: string;
    preferredRole:
      "Sailor" | "Rater" | "Senior Rater" | "Reporting Senior" | "Admin";
  },
) => {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password: pass,
    options: {
      data: {
        first_name: profileMeta.firstName,
        last_name: profileMeta.lastName,
        middle_initial: profileMeta.middleInitial || "",
        dod_id: profileMeta.dodId || "",
        uic: profileMeta.uic || "",
        navy_rank: profileMeta.navyRank,
        command: profileMeta.command,
        preferred_role: profileMeta.preferredRole,
      },
    },
  });
  if (error) {
    console.error("Registration failed:", error.message);
    throw error;
  }
  return data;
};

// end user session
export const signOut = async () => {
  const supabase = getSupabase();
  // Destroy ephemeral board docs BEFORE the session ends (owner RLS needs it).
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id;
    if (uid) await purgeBoardDocs(uid);
  } catch (err) {
    console.error("Board doc purge on logout failed:", err);
  }
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Logout error:", error.message);
    throw error;
  }
};

// resend verification email
export const resendVerificationEmail = async (email: string) => {
  const { error } = await getSupabase().auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) {
    console.error("Failed to resend verification:", error.message);
    throw error;
  }
};

// get active user session
export const getSession = async () => {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) {
    console.error("Session retrieval error:", error.message);
    return null;
  }
  return data.session;
};

// get active user ID helper
export const getSessionUserId = async () => {
  const session = await getSession();
  return session?.user?.id || null;
};

// gets users roles to restrict dashboard view access

export const getCurrentUserRoles = async () => {
  const userId = await getSessionUserId();
  if (!userId) return { preferred: null, assigned: [] };

  // Fetch the role from the public profiles table we created
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("preferred_role, assigned_roles")
    .eq("id", userId)
    .single();

  if (error) {
    console.warn(
      "Profile read failed, using fallback or default. Error:",
      error.message,
    );
    return { preferred: null, assigned: [] };
  }

  return {
    preferred: data?.preferred_role || null,
    assigned:
      data?.assigned_roles ||
      (data?.preferred_role ? [data.preferred_role] : ["Sailor"]),
  };
};
