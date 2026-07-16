// app/evaluations/new/page.tsx
//
// Page route for drafting a new performance evaluation.
// Post-MVP: presents a paygrade-gated form picker so users can choose between
// EVAL (1616/26, E1-E6), CHIEFEVAL (1616/27, E7-E9), and FITREP (1610/2, W2-O6).
// The picker is pre-selected based on the user's navy_rank and can be overridden.
//

"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabaseClient";
import { getEvalSeed, getChiefEvalSeed, getFitrepSeed } from "@/lib/formDefinitions";
import { saveDraft } from "@/lib/evaluationService";
import EvaluationForm from "@/components/EvaluationForm";
import AppShell from "@/components/layout/AppShell";
import { Evaluation, FormCode } from "@/types";
import { paygradeOf } from "@/lib/paygrade";

const supabase = createBrowserClient();

// Determine the suggested form code for a given Navy rank string.
function suggestFormCode(rank?: string): FormCode {
  if (!rank) return "EVAL";
  const pg = paygradeOf(rank);
  if (!pg) return "EVAL";
  // E-7 through E-9 → CHIEFEVAL
  if (pg === "E-7" || pg === "E-8" || pg === "E-9") return "CHIEFEVAL";
  // W-2 through O-6 → FITREP
  const officerOrWarrant = /^(W-[2-5]|O-[1-6])$/.test(pg);
  if (officerOrWarrant) return "FITREP_W2_O6";
  // O-7+ → FITREP_O7_O8 (placeholder — same form picker entry for now)
  if (/^O-[78]$/.test(pg)) return "FITREP_O7_O8";
  return "EVAL";
}

// Returns a blank seed record for the selected form code.
function getSeedForForm(formCode: FormCode): any {
  if (formCode === "CHIEFEVAL") return getChiefEvalSeed();
  if (formCode === "FITREP_W2_O6" || formCode === "FITREP_O7_O8") return getFitrepSeed(formCode);
  return getEvalSeed();
}

// Form picker option metadata
const FORM_OPTIONS: { code: FormCode; navpers: string; label: string; range: string; badge: string }[] = [
  { code: "EVAL",        navpers: "1616/26", label: "Evaluation Report and Counseling Record",       range: "E1–E6", badge: "EVAL" },
  { code: "CHIEFEVAL",   navpers: "1616/27", label: "Chief Evaluation Report and Counseling Record", range: "E7–E9", badge: "CHIEFEVAL" },
  { code: "FITREP_W2_O6", navpers: "1610/2", label: "Fitness Report and Counseling Record",          range: "W2–O6", badge: "FITREP" },
];

export default function NewEvaluationPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [selectedForm, setSelectedForm] = useState<FormCode | null>(null);
  const [initialData, setInitialData] = useState<Evaluation | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthAndInitialize = async () => {
      const session = await getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }

      const { data: profData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profData) {
        setProfile(profData);
        // Pre-select the form based on the user's paygrade; they can change it.
        const suggested = suggestFormCode(profData.navy_rank);
        setSelectedForm(suggested);
      }
      setLoading(false);
    };
    checkAuthAndInitialize();
  }, [router]);

  // Called when the user confirms their form-code choice.
  const handleFormSelect = (code: FormCode) => {
    const seed = getSeedForForm(code) as any;
    if (profile) {
      const mi = profile.middle_initial ? ` ${profile.middle_initial}` : "";
      seed.member_name = `${profile.last_name}, ${profile.first_name}${mi}`.toUpperCase().trim();
      seed.dod_id = profile.dod_id || "";
      seed.grade_rate = profile.navy_rank || "";
      seed.ship_station = profile.command || "";
      seed.uic = profile.uic || "";
      seed.created_by = profile.id;
    }
    setSelectedForm(code);
    setInitialData(seed);
  };

  const handleSave = async (data: Evaluation) => {
    setIsSaving(true);
    try {
      const session = await getSession();
      if (!session?.user) throw new Error("Unauthenticated session");
      const saved = await saveDraft(session.user.id, data);
      router.push(saved?.id ? `/evaluations/${saved.id}` : "/dashboard");
    } catch (err: any) {
      console.error("Failed to create new draft:", err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInPlace = async (data: Evaluation) => {
    setIsSaving(true);
    try {
      const session = await getSession();
      if (!session?.user) throw new Error("Unauthenticated session");
      return await saveDraft(session.user.id, data);
    } catch (err: any) {
      console.error("Failed to save draft in place:", err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="apex-app-shell flex items-center justify-center min-h-screen text-sm font-mono apex-text-secondary">
        Initializing form template...
      </div>
    );
  }

  // ── Form picker — shown before the form loads ──────────────────────────────
  if (!initialData) {
    const suggested = suggestFormCode(profile?.navy_rank);
    return (
      <AppShell
        profile={profile}
        title="Draft New Report"
        subtitle="Select the NAVPERS form that matches the member's paygrade"
        badge="New Report"
        maxWidth="5xl"
      >
        <div className="space-y-4">
          {FORM_OPTIONS.map((opt) => {
            const isSuggested = opt.code === suggested;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => handleFormSelect(opt.code)}
                className={`apex-form-picker-card ${
                  isSuggested ? "apex-form-picker-card--recommended" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="apex-navpers-pill">
                        NAVPERS {opt.navpers}
                      </span>
                      <span className="apex-form-kind-badge">{opt.badge}</span>
                      {isSuggested && (
                        <span className="apex-form-picker-recommended">
                          ✓ Recommended for your paygrade
                        </span>
                      )}
                    </div>
                    <p className="apex-form-picker-title">{opt.label}</p>
                    <p className="apex-form-picker-hint">
                      Paygrade range: {opt.range}
                    </p>
                  </div>
                  <svg
                    className="apex-form-picker-chevron"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </AppShell>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  const formOption = FORM_OPTIONS.find((o) => o.code === selectedForm);
  return (
    <AppShell
      profile={profile}
      title={`Draft New ${formOption?.badge || "Report"}`}
      subtitle="Complete the blocks below — Navy policy rules verified in real time"
      badge={`New ${formOption?.badge || "Report"}`}
      maxWidth="6xl"
    >
      <EvaluationForm
        initialData={initialData}
        onSave={handleSave}
        onSaveInPlace={handleSaveInPlace}
        onCancel={() => router.push("/dashboard")}
        isSaving={isSaving}
        viewerRole={profile?.preferred_role}
        formCode={selectedForm || undefined}
      />
    </AppShell>
  );
}
