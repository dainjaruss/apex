import { createBrowserClient } from "./supabaseClient";

const supabase = createBrowserClient();

// Cache for offline/local-testing so we don't break if DB connection is spotty
const localFormDefs: Record<string, any> = {
  EVAL: {
    id: "e1616260-cafe-4b08-9df2-5d8f28d8b4cd",
    form_code: "EVAL",
    navpers_number: "1616/26",
    paygrade_range: "E1-E6",
    blocks: {
      title: "Evaluation Report and Counseling Record (E1-E6)",
      blocks: [
        { number: 1, name: "Name", type: "text", required: true },
        { number: 2, name: "Grade/Rate", type: "text", required: true },
        { number: 3, name: "Designator", type: "text", required: false },
        {
          number: 4,
          name: "DoD ID",
          type: "text",
          required: true,
          pattern: "^[0-9]{10}$",
        },
        { number: 5, name: "Duty Status", type: "text", required: true },
        { number: 6, name: "UIC", type: "text", required: true, length: 5 },
        { number: 7, name: "Ship/Station", type: "text", required: true },
        { number: 8, name: "Promotion Status", type: "text", required: true },
      ],
    },
  },
  CHIEFEVAL: {
    id: "c1616270-cafe-4b08-9df2-5d8f28d8b4cd",
    form_code: "CHIEFEVAL",
    navpers_number: "1616/27",
    paygrade_range: "E7-E9",
    blocks: {
      title: "Chief Evaluation Report and Counseling Record (E7-E9)",
      blocks: [
        { number: 1, name: "Name", type: "text", required: true },
        { number: 2, name: "Grade/Rate", type: "text", required: true },
        { number: 3, name: "Designator", type: "text", required: false },
        { number: 4, name: "DoD ID", type: "text", required: true, pattern: "^[0-9]{10}$" },
        { number: 5, name: "Duty Status", type: "text", required: true },
        { number: 6, name: "UIC", type: "text", required: true, length: 5 },
        { number: 7, name: "Ship/Station", type: "text", required: true },
        { number: 8, name: "Promotion Status", type: "text", required: true },
      ],
    },
  },
  FITREP_W2_O6: {
    id: "f1610020-cafe-4b08-9df2-5d8f28d8b4cd",
    form_code: "FITREP_W2_O6",
    navpers_number: "1610/2",
    paygrade_range: "W2-O6",
    blocks: {
      title: "Fitness Report and Counseling Record (W2-O6)",
      blocks: [
        { number: 1, name: "Name", type: "text", required: true },
        { number: 2, name: "Grade", type: "text", required: true },
        { number: 3, name: "Designator", type: "text", required: false },
        { number: 4, name: "DoD ID", type: "text", required: true, pattern: "^[0-9]{10}$" },
        { number: 5, name: "Duty Status", type: "text", required: true },
        { number: 6, name: "UIC", type: "text", required: true, length: 5 },
        { number: 7, name: "Ship/Station", type: "text", required: true },
        { number: 43, name: "Comments on Performance", type: "textarea", required: true },
      ],
    },
  },
};

// Fetch single form specification (tries db, falls back to local cache)
export const getFormDefinition = async (code: string) => {
  try {
    const { data, error } = await supabase
      .from("form_definitions")
      .select("*")
      .eq("form_code", code)
      .eq("active", true)
      .single();

    if (error) {
      console.warn(
        "DB read failed for form spec. Using offline seed data.",
        error.message,
      );
      return localFormDefs[code] || null;
    }
    return data;
  } catch (err) {
    console.error("Exception in getFormDefinition:", err);
    return localFormDefs[code] || null;
  }
};

// List all active layouts (used on "create new evaluation" picker page)
export const listActiveForms = async () => {
  try {
    const { data, error } = await supabase
      .from("form_definitions")
      .select("id, form_code, navpers_number, paygrade_range")
      .eq("active", true);

    if (error) {
      console.warn(
        "Could not list active layouts. Defaulting to local cache list.",
      );
      return Object.values(localFormDefs);
    }
    return data;
  } catch {
    return Object.values(localFormDefs);
  }
};

// Returns a blank EVAL record state
export const getEvalSeed = () => {
  return {
    form_definition_id: "e1616260-cafe-4b08-9df2-5d8f28d8b4cd", // NAVPERS 1616/26 (E1-E6)
    member_name: "",
    dod_id: "",
    grade_rate: "",
    designator: "",
    period_from: new Date().toISOString().split("T")[0],
    period_to: new Date().toISOString().split("T")[0],
    duty_status: "ACT",
    uic: "00000",
    ship_station: "",
    promotion_status: "Regular",
    // Traits start ungraded — per BUPERSINST 1610.10H an untouched trait is blank, not a
    // default grade. The rater grades each trait (or marks the report Not Observed).
    trait_grades: {},
    comments: "",
    career_recommendations: ["", ""],
    promotion_recommendation: "Promotable",
    retention: "Recommended",
    status: "draft",
    // Occasion (Blocks 10-13) and Type (Blocks 16-18) start unchecked — the preparer
    // selects them. Both groups are multi-select per BUPERSINST 1610.10H.
    block_values: {
      billet_subcategory: "NA",
    },
  };
};

// Returns a blank CHIEFEVAL record state (NAVPERS 1616/27, E7-E9)
export const getChiefEvalSeed = () => {
  return {
    form_definition_id: "c1616270-cafe-4b08-9df2-5d8f28d8b4cd", // NAVPERS 1616/27 (E7-E9)
    report_type: "CHIEFEVAL" as const,
    member_name: "",
    dod_id: "",
    grade_rate: "",
    designator: "",
    period_from: new Date().toISOString().split("T")[0],
    period_to: new Date().toISOString().split("T")[0],
    duty_status: "ACT",
    uic: "00000",
    ship_station: "",
    promotion_status: "Regular",
    // CPO traits start ungraded — rater grades each (BUPERSINST 1610.10H Ch. 10).
    trait_grades: {},
    comments: "",
    career_recommendations: ["", ""],
    promotion_recommendation: "Promotable",
    // No retention for CHIEFEVAL (E7-E9 career Sailors — Block 47 N/A).
    status: "draft",
    block_values: {
      billet_subcategory: "NA",
    },
  };
};

// Returns a blank FITREP record state
export const getFitrepSeed = (formCode = "FITREP_W2_O6") => {
  const formId =
    formCode === "FITREP_O7_O8"
      ? "f1610050-cafe-4b08-9df2-5d8f28d8b4cd"
      : "f1610020-cafe-4b08-9df2-5d8f28d8b4cd";
  return {
    form_definition_id: formId,
    report_type: "FITREP" as const,
    member_name: "",
    dod_id: "",
    grade_rate: "",
    designator: "",
    period_from: new Date().toISOString().split("T")[0],
    period_to: new Date().toISOString().split("T")[0],
    duty_status: "ACT",
    uic: "00000",
    ship_station: "",
    promotion_status: "Regular",
    // Officer traits start ungraded (BUPERSINST 1610.10H Ch. 9).
    trait_grades: {},
    comments: "",
    career_recommendations: ["", ""],
    promotion_recommendation: "Promotable",
    // No retention for FITREP (officers — Block 47 N/A).
    status: "draft",
    block_values: {
      billet_subcategory: "NA",
    },
  };
};
