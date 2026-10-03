// src/components/evaluations/EvalEditor.tsx
//
// 4-Step Evaluation Wizard matching the original APEX v1 architecture.
// Integrates live Zod schema validation (BUPERSINST 1610.10H), the HTML5 Canvas
// measuring engine, Courier monospace pitch formatting, client-side PDF export,
// role-gated chain of custody routing, and context-sensitive BUPERS field helper text.

import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Evaluation, Profile, ValidationIssue } from "@/types";
import { db } from "@/lib/db";
import { canManageSummaryGroups } from "@/lib/permissions";
import { useLiveValidation } from "@/hooks/useLiveValidation";
import { useFinalValidation } from "@/hooks/useFinalValidation";
import { computeTraitAverage } from "@/lib/traitAverage";
import { downloadEvaluationPdf } from "@/lib/pdfClient";
import { exportSingleEvalTransfer } from "@/lib/sessionTransfer";
import { MeasuredCourierField } from "@/components/blocks/MeasuredCourierField";
import { CanvasCommentVisualizer } from "@/components/blocks/CanvasCommentVisualizer";
import { ValidationResultsModal } from "@/components/ValidationResultsModal";
import { RoutingStepper } from "@/components/routing/RoutingStepper";
import { BupersGuidelinesInline } from "@/components/blocks/BupersGuidelinesInline";
import {
  FIELD_FIT,
  getCommentCapacity,
  COMMENT_PITCH,
  resolveCommentPitch,
  getPrimaryDutiesFieldFit,
  PRIMARY_DUTY_ABBREV_MAX,
  type CommentPitch,
} from "@/lib/commentFit";
import {
  FileDown,
  Share2,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Eye,
  Sliders,
  ShieldCheck,
  Lock,
  BookOpen,
  HelpCircle,
  Sparkles,
} from "lucide-react";

interface EvalEditorProps {
  evaluation: Evaluation;
  activeProfile: Profile;
  onSave?: (updated: Evaluation) => void;
  onBack?: () => void;
}

const STEPS = [
  { id: 0, title: "1. Admin & Command Info" },
  { id: 1, title: "2. Performance Traits" },
  { id: 2, title: "3. Narrative & Comments" },
  { id: 3, title: "4. Signatures & RS Info" },
];

const EVAL_TRAITS = [
  { key: "knowledge", block: 33, label: "Professional Knowledge", standard1: "Deficient in rating knowledge; requires supervision.", standard3: "Solid rating expertise; completes work independently.", standard5: "Exceptional mastery; consulted across the command." },
  { key: "work", block: 34, label: "Quality of Work", standard1: "Needs rework; frequent errors or delays.", standard3: "Consistent, high-quality output meeting standards.", standard5: "Flawless accuracy; sets the benchmark for quality." },
  { key: "eo", block: 35, label: "Command Climate / Equal Opportunity", standard1: "Tolerates discrimination or harassment.", standard3: "Supports Navy core values and command harmony.", standard5: "Proactively champions equality and inclusion command-wide." },
  { key: "bearing", block: 36, label: "Military Bearing / Character", standard1: "Fails standards in uniform, conduct, or fitness.", standard3: "Maintains exemplary personal bearing and fitness.", standard5: "Impeccable appearance; model Sailor of the command." },
  { key: "accomplishment", block: 37, label: "Personal Job Accomplishment", standard1: "Fails to meet assigned goals without constant guidance.", standard3: "Consistently achieves mission objectives on time.", standard5: "Inspires others to exceed demanding milestones." },
  { key: "teamwork", block: 38, label: "Teamwork", standard1: "Disrupts cohesion; works poorly with others.", standard3: "Reliable team player; contributes to group success.", standard5: "Catalyst for team synergy and unit pride." },
  { key: "leadership", block: 39, label: "Leadership", standard1: "Avoids responsibility; fails to guide subordinates.", standard3: "Effective leader; guides subordinates to advance.", standard5: "Visionary deckplate leader; commands total respect." },
];

const CHIEFEVAL_TRAITS = [
  { key: "technical_mastery", block: 33, label: "Technical Mastery", standard1: "Substandard technical skills.", standard3: "Expert deckplate technician.", standard5: "Preeminent subject matter authority." },
  { key: "institutional_expertise", block: 34, label: "Institutional Expertise", standard1: "Unfamiliar with Navy instructions.", standard3: "Thorough understanding of naval regulations.", standard5: "Command advisor on all naval policies." },
  { key: "professionalism", block: 35, label: "Professionalism", standard1: "Conduct reflects poorly on the Mess.", standard3: "Exemplifies Chief standards.", standard5: "Gold standard of CPO professionalism." },
  { key: "integrity", block: 36, label: "Integrity", standard1: "Compromises moral standards.", standard3: "Honest, trustworthy, ethical.", standard5: "Unwavering moral courage and integrity." },
  { key: "accountability", block: 37, label: "Accountability (3.0 Gate)", standard1: "Avoids ownership of problems.", standard3: "Holds self and subordinates accountable.", standard5: "Demands uncompromising deckplate excellence." },
  { key: "deckplate_leadership", block: 38, label: "Deckplate Leadership", standard1: "Absent from workspace; poor presence.", standard3: "Visible, engaged deckplate leader.", standard5: "Beloved mentor with exceptional presence." },
  { key: "team_effectiveness", block: 39, label: "Team Effectiveness", standard1: "Creates division in the Mess.", standard3: "Builds a unified Chiefs Mess.", standard5: "Drives maximum combat readiness across unit." },
];

export const EvalEditor: React.FC<EvalEditorProps> = ({
  evaluation,
  activeProfile,
  onSave,
  onBack,
}) => {
  const [formData, setFormData] = useState<Evaluation>(evaluation);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [viewMode, setViewMode] = useState<"editor" | "canvas">("editor");

  // Context-sensitive field guidelines state
  const [activeField, setActiveField] = useState<string | null>("member_name");
  const [showGuidelines, setShowGuidelines] = useState<boolean>(true);

  // Summary Groups & Leadership RBAC
  const summaryGroups = useLiveQuery(() => db.summary_groups.toArray(), []);
  const isLeadership = canManageSummaryGroups(activeProfile);
  const currentGroup = summaryGroups?.find((g) => g.id === formData.summary_group_id);

  // Keep internal form data synced when prop changes
  useEffect(() => {
    setFormData(evaluation);
  }, [evaluation.id]);

  // Live Zod Schema Validation Engine (Central Feature - dynamic keystroke evaluation)
  const { isValid, errors, warnings, allIssues } = useLiveValidation(formData);

  // Final Validation Engine (On-Demand Pre-Flight Audit & Inspection Gate)
  const {
    isValidating,
    errors: finalErrors,
    warnings: finalWarnings,
    hasChecked: hasFinalChecked,
    runCheck,
  } = useFinalValidation();

  // Helper getters for field-level inline validation styling
  const getError = (field: string): string | undefined =>
    errors.find((i) => i.field === field)?.message;
  const hasError = (field: string): boolean => !!getError(field);
  const getWarning = (field: string): string | undefined =>
    warnings.find((i) => i.field === field)?.message;

  // Field input border styling helper
  const formFieldClass = (field: string, extraClasses = "") =>
    `w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs transition-colors focus:outline-none ${
      hasError(field)
        ? "border-2 border-red-500 ring-2 ring-red-500/20 bg-red-50/10 dark:bg-red-950/20"
        : "border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
    } ${extraClasses}`;

  // Pitch resolution for Block 43
  const pitch = resolveCommentPitch(formData.block_values);
  const charsPerLine = COMMENT_PITCH[pitch].charsPerLine;
  const maxLines = getCommentCapacity(formData.report_type, pitch);
  const primaryDutiesFit = getPrimaryDutiesFieldFit(formData.report_type);

  // Auto-calculate Trait Average
  const traitAvgResult = computeTraitAverage(formData.trait_grades);

  const handleFieldChange = (field: keyof Evaluation, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
      updated_at: new Date().toISOString(),
    }));
  };

  const handleBlockValueChange = (key: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      block_values: {
        ...prev.block_values,
        [key]: value,
      },
      updated_at: new Date().toISOString(),
    }));
  };

  const handleTraitGradeChange = (traitKey: string, grade: string) => {
    const updatedGrades = {
      ...formData.trait_grades,
      [traitKey]: grade,
    };
    const avgCalc = computeTraitAverage(updatedGrades);

    setFormData((prev) => ({
      ...prev,
      trait_grades: updatedGrades,
      trait_average: avgCalc.average ?? undefined,
      updated_at: new Date().toISOString(),
    }));
  };

  const handlePitchToggle = (newPitch: 10 | 12) => {
    handleBlockValueChange("comment_pitch", newPitch.toString());
  };

  const saveToDb = async () => {
    setIsSaving(true);
    const updated: Evaluation = {
      ...formData,
      trait_average: traitAvgResult.average ?? undefined,
      updated_at: new Date().toISOString(),
    };
    await db.evaluations.put(updated);
    if (onSave) onSave(updated);
    setTimeout(() => setIsSaving(false), 300);
  };

  // Run full final validation check on demand
  const handleTriggerVerify = async () => {
    await runCheck(formData);
    setShowValidationModal(true);
  };

  // Final validation gate before PDF generation
  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      await saveToDb();
      await downloadEvaluationPdf(formData);
    } catch (err: any) {
      alert(`PDF Generation failed: ${err.message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleFinalizeAndDownloadPdf = async () => {
    const audit = await runCheck(formData);
    if (audit.errors.length > 0) {
      setShowValidationModal(true);
      return;
    }
    await handleDownloadPdf();
  };

  // Jump to specific block & focus field from validation modal
  const handleJumpToBlock = (blockNumber: number, fieldName?: string) => {
    setShowValidationModal(false);
    if (blockNumber <= 21 || blockNumber === 28 || blockNumber === 29) {
      setCurrentStep(0);
    } else if (blockNumber >= 33 && blockNumber <= 40) {
      setCurrentStep(1);
    } else if (blockNumber === 41 || blockNumber === 43 || blockNumber === 44) {
      setCurrentStep(2);
    } else {
      setCurrentStep(3);
    }

    if (fieldName) {
      setActiveField(fieldName);
      setTimeout(() => {
        const el =
          document.getElementById(`field-${fieldName}`) ||
          document.getElementById(`eval-courier-${fieldName}`) ||
          document.querySelector(`[name="${fieldName}"]`);
        if (el) {
          (el as HTMLElement).focus();
          (el as HTMLElement).scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 180);
    }
  };

  const activeTraits = formData.report_type === "CHIEFEVAL" ? CHIEFEVAL_TRAITS : EVAL_TRAITS;

  // Filter errors accurately for the active step
  const stepErrors = errors.filter((err) => {
    const b = err.block || 0;
    const f = err.field || "";
    if (currentStep === 0) {
      return (b >= 1 && b <= 21) || b === 28 || b === 29 || f === "occasion" || f === "type";
    }
    if (currentStep === 1) {
      return (b >= 33 && b <= 40) || f.startsWith("trait_grades");
    }
    if (currentStep === 2) {
      return b === 41 || b === 43 || b === 44 || f === "comments" || f === "qualifications" || f === "career_recommendations";
    }
    return (
      (b >= 22 && b <= 27) ||
      (b >= 30 && b <= 32) ||
      b >= 45 ||
      f.startsWith("reporting_senior") ||
      f === "date_counseled" ||
      f === "counselor" ||
      f === "individual_counseled_signature" ||
      f === "promotion_recommendation" ||
      f === "retention"
    );
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* ── Top Header Bar ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                {formData.report_type} (NAVPERS {formData.report_type === "CHIEFEVAL" ? "1616/27" : "1616/26"})
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {formData.status.toUpperCase()}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {formData.member_name || "UNTITLED RECORD"}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {formData.grade_rate || "RATE"} | DOD ID: {formData.dod_id || "NOT SET"} | Ending: {formData.period_to || "YYYY-MM-DD"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors"
              >
                Back to List
              </button>
            )}

            <button
              onClick={handleTriggerVerify}
              disabled={isValidating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Run comprehensive BUPERSINST 1610.10H validation audit"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {isValidating ? "Auditing Rules..." : "Verify Rules"}
            </button>

            <button
              onClick={saveToDb}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Saving..." : "Save Draft"}
            </button>

            <button
              onClick={() => exportSingleEvalTransfer(formData.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 transition-colors"
              title="Pack and Route single file for review without database"
            >
              <Share2 className="w-3.5 h-3.5" />
              Route Draft (.apex.json)
            </button>

            <button
              onClick={handleFinalizeAndDownloadPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
              {isGeneratingPdf ? "Generating..." : "Download Official PDF"}
            </button>
          </div>
        </div>

        {/* ── Zod Live Validation & BUPERS Helper Status Rail ── */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleTriggerVerify}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                isValid
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                  : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800 animate-pulse"
              }`}
            >
              {isValid ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>100% BUPERS Compliant</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.length} BUPERS Validation {errors.length === 1 ? "Error" : "Errors"}</span>
                </>
              )}
            </button>

            {warnings.length > 0 && (
              <button
                onClick={handleTriggerVerify}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{warnings.length} Warnings</span>
              </button>
            )}

            <button
              onClick={handleTriggerVerify}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Audit Details & Rules Check →
            </button>

            {/* Master BUPERS Helper Text Toggle */}
            <button
              type="button"
              onClick={() => setShowGuidelines(!showGuidelines)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-xs border transition-colors ${
                showGuidelines
                  ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
                  : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
              }`}
              title="Toggle context-sensitive BUPERS regulatory guidelines"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>BUPERS Helper: {showGuidelines ? "On" : "Off"}</span>
            </button>
          </div>

          <div className="font-mono text-slate-500 text-xs">
            Trait Avg: <span className="font-bold text-slate-900 dark:text-white">{traitAvgResult.average ? traitAvgResult.average.toFixed(2) : "0.00"}</span> | Rec: <span className="font-bold text-slate-900 dark:text-white">{formData.promotion_recommendation}</span>
          </div>
        </div>

        {/* ── 4-Step Wizard Pill Navigation ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          {STEPS.map((step) => {
            const isCurrent = currentStep === step.id;
            const isPast = currentStep > step.id;
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`py-2 px-3 rounded-lg text-xs font-semibold text-left transition-all flex items-center justify-between ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-sm"
                    : isPast
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 hover:bg-blue-100"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                }`}
              >
                <span>{step.title}</span>
                {isPast && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 ml-1" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chain of Custody & Routing Stepper ── */}
      <RoutingStepper
        evaluation={formData}
        activeProfile={activeProfile}
        onEvaluationUpdated={(updated) => {
          setFormData(updated);
          if (onSave) onSave(updated);
        }}
      />

      {/* ── Step-Specific Validation Errors Banner ── */}
      {stepErrors.length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs space-y-1">
          <div className="font-bold text-red-900 dark:text-red-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Errors on this section ({stepErrors.length}):</span>
            </div>
            <button
              onClick={handleTriggerVerify}
              className="text-[11px] underline text-red-700 dark:text-red-300 hover:text-red-900"
            >
              Open Full Audit Modal
            </button>
          </div>
          <ul className="list-disc pl-6 space-y-0.5 text-red-800 dark:text-red-300">
            {stepErrors.map((e, idx) => (
              <li key={idx}>
                {e.block && <span className="font-mono font-bold mr-1">[Block {e.block}]</span>}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Contextual BUPERS Field Guideline Sticky Card ── */}
      {showGuidelines && activeField && (
        <BupersGuidelinesInline
          activeField={activeField}
          onDismiss={() => setActiveField(null)}
        />
      )}

      {/* ── STEP 1: Admin & Command Info (Blocks 1-15, 20-21, 28-29) ── */}
      {currentStep === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Step 1: Administrative Identification & Command Info
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Service member identification (Blocks 1–8), report occasions (Blocks 10–13), period dates (Blocks 14–15), and duty narratives (Blocks 28–29).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Block 1 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-member_name" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 1: Member Name
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("member_name")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                Format: LAST, FIRST MI (e.g. FRANKLYN, DAIN A).
              </p>
              <input
                id="field-member_name"
                type="text"
                value={formData.member_name}
                onFocus={() => setActiveField("member_name")}
                onChange={(e) => handleFieldChange("member_name", e.target.value.toUpperCase())}
                className={formFieldClass("member_name", "uppercase")}
                placeholder="LAST, FIRST MI"
              />
              {hasError("member_name") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("member_name")}</span>
                </p>
              )}
            </div>

            {/* Block 2 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-grade_rate" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 2: Grade / Rate
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("grade_rate")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                Standard Navy rate abbreviation (e.g. IT1, CPO, LCDR).
              </p>
              <input
                id="field-grade_rate"
                type="text"
                value={formData.grade_rate}
                onFocus={() => setActiveField("grade_rate")}
                onChange={(e) => handleFieldChange("grade_rate", e.target.value.toUpperCase())}
                className={formFieldClass("grade_rate", "uppercase")}
                placeholder="e.g. IT1"
              />
              {hasError("grade_rate") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("grade_rate")}</span>
                </p>
              )}
            </div>

            {/* Block 3 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-designator" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 3: Designator / Warfare
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("designator")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                Enlisted warfare (e.g. SW/IW) or 4-digit Officer designator.
              </p>
              <input
                id="field-designator"
                type="text"
                value={formData.designator || ""}
                onFocus={() => setActiveField("designator")}
                onChange={(e) => handleFieldChange("designator", e.target.value.toUpperCase())}
                placeholder="e.g. SW/IW"
                className={formFieldClass("designator")}
              />
              {hasError("designator") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("designator")}</span>
                </p>
              )}
              {!hasError("designator") && getWarning("designator") && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getWarning("designator")}</span>
                </p>
              )}
            </div>

            {/* Block 4 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-dod_id" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 4: DoD ID Number
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("dod_id")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                Exactly 10 numeric digits (do not enter SSN).
              </p>
              <input
                id="field-dod_id"
                type="text"
                maxLength={10}
                value={formData.dod_id}
                onFocus={() => setActiveField("dod_id")}
                onChange={(e) => handleFieldChange("dod_id", e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="10-digit DoD ID"
                className={formFieldClass("dod_id")}
              />
              {hasError("dod_id") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("dod_id")}</span>
                </p>
              )}
            </div>

            {/* Block 5 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-duty_status" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 5: Duty Status
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("duty_status")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                ACT (Active), TAR, INACT (Drill Reserve), or AT/ADOS.
              </p>
              <select
                id="field-duty_status"
                value={formData.duty_status}
                onFocus={() => setActiveField("duty_status")}
                onChange={(e) => handleFieldChange("duty_status", e.target.value)}
                className={formFieldClass("duty_status")}
              >
                <option value="ACT">ACT (Active Duty)</option>
                <option value="TAR">TAR / FTS</option>
                <option value="INACT">INACT (Selected Reserve)</option>
                <option value="AT/ADOS">AT / ADOS</option>
              </select>
              {hasError("duty_status") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("duty_status")}</span>
                </p>
              )}
            </div>

            {/* Block 6 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-uic" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 6: Command UIC
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("uic")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                Exactly 5 alphanumeric characters (e.g. N0024).
              </p>
              <input
                id="field-uic"
                type="text"
                maxLength={5}
                value={formData.uic}
                onFocus={() => setActiveField("uic")}
                onChange={(e) => handleFieldChange("uic", e.target.value.toUpperCase().slice(0, 5))}
                placeholder="5-char UIC"
                className={formFieldClass("uic", "uppercase")}
              />
              {hasError("uic") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("uic")}</span>
                </p>
              )}
            </div>

            {/* Block 7 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-ship_station" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 7: Ship / Station / Command
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("ship_station")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                Official command name or vessel hull designation.
              </p>
              <input
                id="field-ship_station"
                type="text"
                value={formData.ship_station}
                onFocus={() => setActiveField("ship_station")}
                onChange={(e) => handleFieldChange("ship_station", e.target.value.toUpperCase())}
                placeholder="e.g. NAVSEA WASHINGTON DC"
                className={formFieldClass("ship_station", "uppercase")}
              />
              {hasError("ship_station") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("ship_station")}</span>
                </p>
              )}
            </div>

            {/* Block 8 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-promotion_status" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 8: Promotion Status
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("promotion_status")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                Regular, Frocked, Selected, or Spot.
              </p>
              <select
                id="field-promotion_status"
                value={formData.promotion_status}
                onFocus={() => setActiveField("promotion_status")}
                onChange={(e) => handleFieldChange("promotion_status", e.target.value)}
                className={formFieldClass("promotion_status")}
              >
                <option value="Regular">Regular</option>
                <option value="Frocked">Frocked</option>
                <option value="Selected">Selected</option>
                <option value="Spot">Spot</option>
              </select>
              {hasError("promotion_status") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("promotion_status")}</span>
                </p>
              )}
            </div>

            {/* Block 9 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-date_reported" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 9: Date Reported
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("date_reported")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                Date member reported to command (YYYY-MM-DD).
              </p>
              <input
                id="field-date_reported"
                type="date"
                value={formData.block_values?.date_reported || ""}
                onFocus={() => setActiveField("date_reported")}
                onChange={(e) => handleBlockValueChange("date_reported", e.target.value)}
                className={formFieldClass("date_reported")}
              />
              {hasError("date_reported") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("date_reported")}</span>
                </p>
              )}
            </div>

            {/* Block 20 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-physical_readiness" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 20: Physical Readiness (PFA)
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("physical_readiness")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                P (Pass), F (Fail), M (Med Waived), W (Waived), N (No test).
              </p>
              <input
                id="field-physical_readiness"
                type="text"
                maxLength={1}
                value={formData.block_values?.physical_readiness || "P"}
                onFocus={() => setActiveField("physical_readiness")}
                onChange={(e) => handleBlockValueChange("physical_readiness", e.target.value.toUpperCase())}
                placeholder="P, F, M, W, or N"
                className={formFieldClass("physical_readiness", "uppercase")}
              />
              {hasError("physical_readiness") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("physical_readiness")}</span>
                </p>
              )}
            </div>

            {/* Block 21 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-billet_subcategory" className="font-semibold text-slate-700 dark:text-slate-300">
                  Block 21: Billet Subcategory
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("billet_subcategory")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                  title="View BUPERS guidance"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                NA (standard), BASIC, RESAC1, etc.
              </p>
              <input
                id="field-billet_subcategory"
                type="text"
                value={formData.block_values?.billet_subcategory || "NA"}
                onFocus={() => setActiveField("billet_subcategory")}
                onChange={(e) => handleBlockValueChange("billet_subcategory", e.target.value.toUpperCase())}
                className={formFieldClass("billet_subcategory", "uppercase")}
                placeholder="NA"
              />
              {hasError("billet_subcategory") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("billet_subcategory")}</span>
                </p>
              )}
            </div>
          </div>

          {/* Period of Report (Blocks 14-15) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Period of Report (Blocks 14–15)
              </h3>
              <button
                type="button"
                onClick={() => setActiveField("period_from")}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <HelpCircle className="w-3 h-3" /> Period Guidance
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              From date must connect seamlessly to the previous report date to prevent 1-day continuity gaps.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label htmlFor="field-period_from" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 14: Period From (YYYY-MM-DD)
                </label>
                <input
                  id="field-period_from"
                  type="date"
                  value={formData.period_from}
                  onFocus={() => setActiveField("period_from")}
                  onChange={(e) => handleFieldChange("period_from", e.target.value)}
                  className={formFieldClass("period_from")}
                />
                {hasError("period_from") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("period_from")}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-period_to" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 15: Period To (YYYY-MM-DD)
                </label>
                <input
                  id="field-period_to"
                  type="date"
                  value={formData.period_to}
                  onFocus={() => setActiveField("period_to")}
                  onChange={(e) => handleFieldChange("period_to", e.target.value)}
                  className={formFieldClass("period_to")}
                />
                {hasError("period_to") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("period_to")}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Occasion for Report (Blocks 10-13) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Occasion for Report (Blocks 10–13)
              </h3>
              <button
                type="button"
                onClick={() => setActiveField("periodic")}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <HelpCircle className="w-3 h-3" /> Occasion Rules
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              Select one primary occasion. Special reports require justification narrative in Block 43.
            </p>
            <div className="flex flex-wrap gap-4 text-xs">
              {[
                { key: "periodic", label: "Block 10: Periodic" },
                { key: "detachment_individual", label: "Block 11: Detachment of Individual" },
                { key: "promotion_frocking", label: "Block 12: Promotion / Frocking" },
                { key: "special", label: "Block 13: Special (Exclusive)" },
              ].map((occ) => (
                <label
                  key={occ.key}
                  className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 dark:text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={!!formData.block_values?.[occ.key]}
                    onFocus={() => setActiveField(occ.key)}
                    onChange={(e) => handleBlockValueChange(occ.key, e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span>{occ.label}</span>
                </label>
              ))}
            </div>
            {hasError("occasion") && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{getError("occasion")}</span>
              </p>
            )}
          </div>

          {/* Type of Report (Blocks 16-18) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Type of Report (Blocks 16–18)
              </h3>
              <button
                type="button"
                onClick={() => setActiveField("regular_report")}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <HelpCircle className="w-3 h-3" /> Type Guidance
              </button>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              {[
                { key: "regular_report", label: "Block 17: Regular" },
                { key: "concurrent_report", label: "Block 18: Concurrent" },
                { key: "not_observed", label: "Block 16: Not Observed (NOB)" },
              ].map((t) => (
                <label
                  key={t.key}
                  className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 dark:text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={!!formData.block_values?.[t.key]}
                    onFocus={() => setActiveField(t.key)}
                    onChange={(e) => handleBlockValueChange(t.key, e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
            {hasError("type") && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{getError("type")}</span>
              </p>
            )}
            {getWarning("type") && !hasError("type") && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{getWarning("type")}</span>
              </p>
            )}
          </div>

          {/* Blocks 28-29 Duties & Achievements (Canvas Monospace Measurement) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-6">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Command Employment & Duties (Blocks 28–29 · Courier Monospace Canvas)
            </h3>

            {/* Block 28 (Canvas Measured) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-command_achievements" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Block 28: Command Employment & Achievements
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("command_achievements")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                >
                  <HelpCircle className="w-3 h-3" /> Block 28 Rules
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-2">
                Operational mission and major command milestones during period ({FIELD_FIT.command_achievements.charsPerLine} chars/line × {FIELD_FIT.command_achievements.maxLines} lines).
              </p>
              <MeasuredCourierField
                fieldId="field-command_achievements"
                value={formData.block_values?.command_achievements || ""}
                onFocus={() => setActiveField("command_achievements")}
                onChange={(val) => handleBlockValueChange("command_achievements", val.toUpperCase())}
                charsPerLine={FIELD_FIT.command_achievements.charsPerLine}
                maxLines={FIELD_FIT.command_achievements.maxLines}
                placeholder="DESCRIBE COMMAND EMPLOYMENT AND MAJOR ACHIEVEMENTS..."
                error={getError("command_achievements")}
              />
            </div>

            {/* Block 29 (Canvas Measured) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Block 29: Primary / Collateral / Watchstanding Duties
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("primary_duties")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                >
                  <HelpCircle className="w-3 h-3" /> Block 29 Rules
                </button>
              </div>

              {/* 29A: Duty Abbreviation */}
              <div className="space-y-1">
                <label htmlFor="field-primary_duty_abbrev" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  29A · Most-Significant Primary Duty Abbreviation (Max {PRIMARY_DUTY_ABBREV_MAX} characters)
                </label>
                <div className={`flex w-fit max-w-full border rounded-xl py-1.5 px-3 bg-white dark:bg-slate-950 transition-colors ${
                  hasError("primary_duty_abbrev") ? "border-2 border-red-500 ring-2 ring-red-500/20" : "border-slate-300 dark:border-slate-800"
                }`}>
                  <input
                    id="field-primary_duty_abbrev"
                    type="text"
                    maxLength={PRIMARY_DUTY_ABBREV_MAX}
                    value={formData.block_values?.primary_duty_abbrev || ""}
                    onFocus={() => setActiveField("primary_duty_abbrev")}
                    onChange={(e) => handleBlockValueChange("primary_duty_abbrev", e.target.value.toUpperCase())}
                    placeholder="IT COMM TECH"
                    spellCheck={false}
                    className="bg-transparent font-mono text-xs uppercase focus:outline-none text-slate-900 dark:text-white"
                    style={{ width: `${PRIMARY_DUTY_ABBREV_MAX + 2}ch` }}
                  />
                </div>
                {hasError("primary_duty_abbrev") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("primary_duty_abbrev")}</span>
                  </p>
                )}
              </div>

              {/* 29B: Duties Narrative (Measured Courier Field) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  29B · Duties Narrative ({primaryDutiesFit.charsPerLine} CPL × {primaryDutiesFit.maxLines} lines{primaryDutiesFit.firstLineLead ? `, line 1 reserved for 29A` : ""})
                </label>
                <MeasuredCourierField
                  fieldId="field-primary_duties"
                  value={formData.block_values?.primary_duties || ""}
                  onFocus={() => setActiveField("primary_duties")}
                  onChange={(val) => handleBlockValueChange("primary_duties", val.toUpperCase())}
                  charsPerLine={primaryDutiesFit.charsPerLine}
                  maxLines={primaryDutiesFit.maxLines}
                  firstLineLead={primaryDutiesFit.firstLineLead}
                  placeholder="PRI: LEAD PETTY OFFICER; COLL: ACFL; WATCH: OOD IN-PORT..."
                  error={getError("primary_duties")}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Performance Traits (Blocks 33-39) ── */}
      {currentStep === 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Step 2: Performance Traits (Blocks 33–39)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Grade each trait from 1.0 to 5.0 against printed Navy behavioral anchor standards, or select NOB.
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-4 py-2 rounded-xl text-right">
              <span className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold uppercase tracking-wider block">
                Block 40 Trait Average
              </span>
              <span className="text-2xl font-bold font-mono text-blue-900 dark:text-blue-100">
                {traitAvgResult.average ? traitAvgResult.average.toFixed(2) : "0.00"}
              </span>
              <span className="text-[10px] text-slate-500 block">
                {traitAvgResult.gradedCount} of {activeTraits.length} graded
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {activeTraits.map((t) => {
              const currentGrade = formData.trait_grades?.[t.key] || "";
              const traitError = getError(`trait_grades.${t.key}`);

              return (
                <div
                  key={t.key}
                  id={`field-trait_grades.${t.key}`}
                  className={`p-4 rounded-xl border transition-all ${
                    traitError
                      ? "border-red-500 ring-2 ring-red-500/20 bg-red-50/10 dark:bg-red-950/20"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-mono text-xs font-bold">
                        Block {t.block}
                      </span>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                        {t.label}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setActiveField(t.key)}
                        className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 ml-1"
                      >
                        <HelpCircle className="w-3 h-3" /> Standards
                      </button>
                    </div>

                    {/* Radio Grading Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                      {["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"].map((grade) => (
                        <button
                          key={grade}
                          type="button"
                          onFocus={() => setActiveField(t.key)}
                          onClick={() => handleTraitGradeChange(t.key, grade)}
                          className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                            currentGrade === grade
                              ? "bg-blue-600 text-white shadow-xs scale-105"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {grade}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Standards Descriptions */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400">
                    <div className="p-2 rounded bg-white/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="font-bold text-red-600 dark:text-red-400 block mb-0.5">1.0 Below Standard:</span>
                      {t.standard1}
                    </div>
                    <div className="p-2 rounded bg-white/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="font-bold text-blue-600 dark:text-blue-400 block mb-0.5">3.0 Meets Standard:</span>
                      {t.standard3}
                    </div>
                    <div className="p-2 rounded bg-white/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-0.5">5.0 Greatly Exceeds:</span>
                      {t.standard5}
                    </div>
                  </div>

                  {traitError && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{traitError}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STEP 3: Narrative & Comments (Blocks 41, 43, 44) ── */}
      {currentStep === 2 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Step 3: Narrative & Comments (Blocks 41, 43, 44 · Monospace Canvas)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Full-fidelity Courier monospace layout matching NAVPERS 1616/26 PDF boundaries.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("editor")}
                  className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 ${
                    viewMode === "editor" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Editor Mode
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("canvas")}
                  className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 ${
                    viewMode === "canvas" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Canvas Visualizer
                </button>
              </div>

              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => handlePitchToggle(10)}
                  className={`px-2.5 py-1 rounded font-medium ${
                    pitch === "10" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs font-bold" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  10 Pitch (75 CPL)
                </button>
                <button
                  type="button"
                  onClick={() => handlePitchToggle(12)}
                  className={`px-2.5 py-1 rounded font-medium ${
                    pitch === "12" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs font-bold" : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  12 Pitch (90 CPL)
                </button>
              </div>
            </div>
          </div>

          {/* Block 41: Career Recommendations */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Block 41: Career Recommendations (2 Slots)
              </label>
              <button
                type="button"
                onClick={() => setActiveField("career_recommendations")}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <HelpCircle className="w-3 h-3" /> Recommendations Rules
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Future milestones or next assignments (max 20 characters per slot). Slot 1 required, Slot 2 optional.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="field-career_rec_0" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                  Slot 1 (Required)
                </label>
                <input
                  id="field-career_rec_0"
                  type="text"
                  maxLength={20}
                  value={formData.career_recommendations?.[0] || ""}
                  onFocus={() => setActiveField("career_recommendations")}
                  onChange={(e) => {
                    const next = [...(formData.career_recommendations || ["", ""])];
                    next[0] = e.target.value.toUpperCase();
                    handleFieldChange("career_recommendations", next);
                  }}
                  placeholder="e.g. CPO / LCPO"
                  className={formFieldClass("career_recommendations", "uppercase")}
                />
              </div>

              <div>
                <label htmlFor="field-career_rec_1" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                  Slot 2 (Optional)
                </label>
                <input
                  id="field-career_rec_1"
                  type="text"
                  maxLength={20}
                  value={formData.career_recommendations?.[1] || ""}
                  onFocus={() => setActiveField("career_recommendations")}
                  onChange={(e) => {
                    const next = [...(formData.career_recommendations || ["", ""])];
                    next[1] = e.target.value.toUpperCase();
                    handleFieldChange("career_recommendations", next);
                  }}
                  placeholder="e.g. RECRUITER"
                  className={formFieldClass("career_recommendations", "uppercase")}
                />
              </div>
            </div>
            {hasError("career_recommendations") && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{getError("career_recommendations")}</span>
              </p>
            )}
          </div>

          {/* Block 43 Editor View (Canvas Measured) */}
          <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="field-comments" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Block 43: Comments on Performance
              </label>
              <button
                type="button"
                onClick={() => setActiveField("comments")}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <HelpCircle className="w-3 h-3" /> Narrative Guidelines
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              Performance bullet narrative ({charsPerLine} CPL × {maxLines} lines capacity at {pitch}-pitch).
            </p>

            {viewMode === "editor" ? (
              <MeasuredCourierField
                fieldId="field-comments"
                value={formData.comments}
                onFocus={() => setActiveField("comments")}
                onChange={(val) => handleFieldChange("comments", val)}
                charsPerLine={charsPerLine}
                maxLines={maxLines}
                placeholder="ENTER PERFORMANCE NARRATIVE HERE (CAR/STAR BULLETS: CAUSE, ACTION, RESULTS)..."
                error={getError("comments")}
              />
            ) : (
              <CanvasCommentVisualizer
                text={formData.comments}
                charsPerLine={charsPerLine}
                maxLines={maxLines}
                pitch={pitch}
                blockNumber={formData.report_type === "CHIEFEVAL" ? 40 : 43}
              />
            )}
          </div>

          {/* Block 44: Qualifications / Achievements (Canvas Measured) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="field-qualifications" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Block 44: Qualifications / Achievements
              </label>
              <button
                type="button"
                onClick={() => setActiveField("qualifications")}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <HelpCircle className="w-3 h-3" /> Qualifications Guidance
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              Education, awards, community involvement, warfare qualifications earned during this period ({FIELD_FIT.qualifications.charsPerLine} chars/line × {FIELD_FIT.qualifications.maxLines} lines).
            </p>
            <MeasuredCourierField
              fieldId="field-qualifications"
              value={formData.block_values?.qualifications || ""}
              onFocus={() => setActiveField("qualifications")}
              onChange={(val) => handleBlockValueChange("qualifications", val.toUpperCase())}
              charsPerLine={FIELD_FIT.qualifications.charsPerLine}
              maxLines={FIELD_FIT.qualifications.maxLines}
              placeholder="ENTER QUALIFICATIONS, DEGREES, AWARDS, AND COMMUNITY IMPACT..."
              error={getError("qualifications")}
            />
          </div>
        </div>
      )}

      {/* ── STEP 4: Signatures & RS Info (Blocks 22-27, 30-32, 45, 47, 48) ── */}
      {currentStep === 3 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Step 4: Recommendations, Counseling & Reporting Senior Signatures
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Promotion recommendation (Block 45), Reporting Senior identification & address (Blocks 22–27, 48), and counseling records (Blocks 30–32).
            </p>
          </div>

          {/* Summary Group Cohort Status & Assignment */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Summary Group Cohort
                  </span>
                  <span
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold ${
                      currentGroup
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                    }`}
                  >
                    {currentGroup ? currentGroup.name : "Pending Command Assignment"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {isLeadership
                    ? "Assign this report to a summary group to pool trait averages and enforce Table 1-1 forced distribution limits."
                    : "Summary groups, peer ranking boards, and forced distribution quotas are managed by Command Leadership."}
                </p>
              </div>

              {isLeadership && summaryGroups && summaryGroups.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Assign Group:
                  </label>
                  <select
                    value={formData.summary_group_id || ""}
                    onChange={(e) => {
                      const val = e.target.value || undefined;
                      handleFieldChange("summary_group_id", val);
                    }}
                    className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Unassigned --</option>
                    {summaryGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.grade_rate})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Display stamped metrics if available */}
            {formData.summary_group_average != null && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-500">Block 50a Summary Group Avg:</span>{" "}
                  <strong className="text-blue-600 dark:text-blue-400 font-bold">
                    {formData.summary_group_average.toFixed(2)}
                  </strong>
                </div>
                {formData.block_values?.reporting_senior_rsca && (
                  <div>
                    <span className="text-slate-500">Block 50b RSCA:</span>{" "}
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {formData.block_values.reporting_senior_rsca}
                    </strong>
                  </div>
                )}
                {formData.trait_average != null && (
                  <div>
                    <span className="text-slate-500">Member Trait Avg:</span>{" "}
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {formData.trait_average.toFixed(2)}
                    </strong>{" "}
                    <span
                      className={`text-[11px] font-bold ${
                        formData.trait_average >= formData.summary_group_average
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      ({formData.trait_average - formData.summary_group_average >= 0 ? "+" : ""}
                      {(formData.trait_average - formData.summary_group_average).toFixed(2)} vs Group)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Block 45: Promotion Recommendation */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Block 45: Promotion Recommendation
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveField("promotion_recommendation")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                >
                  <HelpCircle className="w-3 h-3" /> Table 1-1 Quota Rules
                </button>
                {activeProfile.preferred_role !== "Reporting Senior" && activeProfile.preferred_role !== "Admin" && (
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 font-mono">
                    <Lock className="w-3 h-3" /> Locked: Assigned by Reporting Senior
                  </span>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mb-2">
              Early Promote (EP, maximum 20% Table 1-1 limit), Must Promote (MP), Promotable (P), Progressing, Significant Problems.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { val: "Early Promote", desc: "Top competitive performer. Limited by Table 1-1 quota (max 20%)." },
                { val: "Must Promote", desc: "Strong performer recommended for advancement." },
                { val: "Promotable", desc: "Solid performer capable of increased responsibility." },
                { val: "Progressing", desc: "Making progress; not ready for promotion." },
                { val: "Significant Problems", desc: "Unsatisfactory performance. Requires documentation." },
                { val: "NOB", desc: "Not Observed report." },
              ].map((rec) => {
                const isLocked = activeProfile.preferred_role !== "Reporting Senior" && activeProfile.preferred_role !== "Admin";
                return (
                  <button
                    key={rec.val}
                    type="button"
                    disabled={isLocked}
                    title={isLocked ? "Locked to Reporting Senior role" : undefined}
                    onFocus={() => setActiveField("promotion_recommendation")}
                    onClick={() => handleFieldChange("promotion_recommendation", rec.val)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formData.promotion_recommendation === rec.val
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500 font-bold"
                        : isLocked
                        ? "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-75"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <div className="text-sm">{rec.val}</div>
                    <div className="text-xs text-slate-500 mt-0.5 font-normal">{rec.desc}</div>
                  </button>
                );
              })}
            </div>
            {hasError("promotion_recommendation") && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{getError("promotion_recommendation")}</span>
              </p>
            )}
          </div>

          {/* Block 47: Retention (for Enlisted EVAL) */}
          {formData.report_type === "EVAL" && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Block 47: Retention Recommendation
                </label>
                <button
                  type="button"
                  onClick={() => setActiveField("retention")}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                >
                  <HelpCircle className="w-3 h-3" /> Retention Rules
                </button>
              </div>
              <div className="flex gap-4 mt-2">
                {["Recommended", "Not Recommended"].map((ret) => (
                  <label key={ret} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="retention"
                      value={ret}
                      checked={formData.retention === ret}
                      onChange={(e) => handleFieldChange("retention", e.target.value)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span>{ret}</span>
                  </label>
                ))}
              </div>
              {hasError("retention") && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{getError("retention")}</span>
                </p>
              )}
            </div>
          )}

          {/* Block 48: Reporting Senior Address (Canvas Measured) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="field-reporting_senior_address" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Block 48: Reporting Senior Address (Courier Monospace Canvas)
              </label>
              <button
                type="button"
                onClick={() => setActiveField("reporting_senior_address")}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <HelpCircle className="w-3 h-3" /> Address Rules
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              Official command mailing address of the Reporting Senior ({FIELD_FIT.reporting_senior_address.charsPerLine} chars/line × {FIELD_FIT.reporting_senior_address.maxLines} lines).
            </p>
            <MeasuredCourierField
              fieldId="field-reporting_senior_address"
              value={formData.block_values?.reporting_senior_address || ""}
              onFocus={() => setActiveField("reporting_senior_address")}
              onChange={(val) => handleBlockValueChange("reporting_senior_address", val.toUpperCase())}
              charsPerLine={FIELD_FIT.reporting_senior_address.charsPerLine}
              maxLines={FIELD_FIT.reporting_senior_address.maxLines}
              placeholder="COMMAND MAILING ADDRESS OF REPORTING SENIOR..."
              error={getError("reporting_senior_address")}
            />
          </div>

          {/* Performance Counseling (Blocks 30-32) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Performance Counseling (Blocks 30–32)
              </h3>
              <button
                type="button"
                onClick={() => setActiveField("date_counseled")}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <HelpCircle className="w-3 h-3" /> Counseling Guidance
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Performance counseling is required midway through reporting period per BUPERSINST 1610.10H.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label htmlFor="field-date_counseled" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 30: Date Counseled
                </label>
                <input
                  id="field-date_counseled"
                  type="date"
                  value={formData.block_values?.date_counseled || ""}
                  onFocus={() => setActiveField("date_counseled")}
                  onChange={(e) => handleBlockValueChange("date_counseled", e.target.value)}
                  className={formFieldClass("date_counseled")}
                />
                {hasError("date_counseled") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("date_counseled")}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-counselor" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 31: Counselor Name
                </label>
                <input
                  id="field-counselor"
                  type="text"
                  value={formData.block_values?.counselor || ""}
                  onFocus={() => setActiveField("counselor")}
                  onChange={(e) => handleBlockValueChange("counselor", e.target.value.toUpperCase())}
                  placeholder="e.g. SPOCK, S S (DLCPO)"
                  className={formFieldClass("counselor", "uppercase")}
                />
                {hasError("counselor") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("counselor")}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-individual_counseled_signature" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 32: Counseling Signature
                </label>
                <input
                  id="field-individual_counseled_signature"
                  type="text"
                  value={formData.block_values?.individual_counseled_signature || ""}
                  onFocus={() => setActiveField("individual_counseled_signature")}
                  onChange={(e) => handleBlockValueChange("individual_counseled_signature", e.target.value)}
                  placeholder="Acknowledged on file"
                  className={formFieldClass("individual_counseled_signature")}
                />
              </div>
            </div>
          </div>

          {/* Reporting Senior Details (Blocks 22-27) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Reporting Senior Identification (Blocks 22–27)
              </h3>
              <button
                type="button"
                onClick={() => setActiveField("reporting_senior_name")}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <HelpCircle className="w-3 h-3" /> Reporting Senior Rules
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Must match official command leadership delegation. Format: LASTNAME, FI [MI] (initials only).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label htmlFor="field-reporting_senior_name" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 22: Reporting Senior Name
                </label>
                <input
                  id="field-reporting_senior_name"
                  type="text"
                  value={formData.block_values?.reporting_senior_name || ""}
                  onFocus={() => setActiveField("reporting_senior_name")}
                  onChange={(e) => handleBlockValueChange("reporting_senior_name", e.target.value.toUpperCase())}
                  placeholder="e.g. KIRK, J T"
                  className={formFieldClass("reporting_senior_name", "uppercase")}
                />
                {hasError("reporting_senior_name") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("reporting_senior_name")}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-reporting_senior_grade" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 23: Grade / Rank
                </label>
                <input
                  id="field-reporting_senior_grade"
                  type="text"
                  value={formData.block_values?.reporting_senior_grade || ""}
                  onFocus={() => setActiveField("reporting_senior_grade")}
                  onChange={(e) => handleBlockValueChange("reporting_senior_grade", e.target.value.toUpperCase())}
                  placeholder="CAPT"
                  className={formFieldClass("reporting_senior_grade", "uppercase")}
                />
                {hasError("reporting_senior_grade") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("reporting_senior_grade")}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-reporting_senior_designator" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 24: Designator
                </label>
                <input
                  id="field-reporting_senior_designator"
                  type="text"
                  value={formData.block_values?.reporting_senior_designator || ""}
                  onFocus={() => setActiveField("reporting_senior_designator")}
                  onChange={(e) => handleBlockValueChange("reporting_senior_designator", e.target.value)}
                  placeholder="1110"
                  className={formFieldClass("reporting_senior_designator")}
                />
                {hasError("reporting_senior_designator") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("reporting_senior_designator")}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-reporting_senior_title" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 25: Title (Max 14 chars)
                </label>
                <input
                  id="field-reporting_senior_title"
                  type="text"
                  maxLength={14}
                  value={formData.block_values?.reporting_senior_title || ""}
                  onFocus={() => setActiveField("reporting_senior_title")}
                  onChange={(e) => handleBlockValueChange("reporting_senior_title", e.target.value.toUpperCase())}
                  placeholder="CO"
                  className={formFieldClass("reporting_senior_title", "uppercase")}
                />
                {hasError("reporting_senior_title") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("reporting_senior_title")}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-reporting_senior_uic" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 26: UIC (5 chars)
                </label>
                <input
                  id="field-reporting_senior_uic"
                  type="text"
                  maxLength={5}
                  value={formData.block_values?.reporting_senior_uic || ""}
                  onFocus={() => setActiveField("reporting_senior_uic")}
                  onChange={(e) => handleBlockValueChange("reporting_senior_uic", e.target.value.toUpperCase())}
                  placeholder="N0024"
                  className={formFieldClass("reporting_senior_uic", "uppercase")}
                />
                {hasError("reporting_senior_uic") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("reporting_senior_uic")}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-reporting_senior_dod_id" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Block 27: Reporting Senior DoD ID
                </label>
                <input
                  id="field-reporting_senior_dod_id"
                  type="text"
                  maxLength={10}
                  value={formData.block_values?.reporting_senior_dod_id || ""}
                  onFocus={() => setActiveField("reporting_senior_dod_id")}
                  onChange={(e) => handleBlockValueChange("reporting_senior_dod_id", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="10-digit DoD ID"
                  className={formFieldClass("reporting_senior_dod_id")}
                />
                {hasError("reporting_senior_dod_id") && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{getError("reporting_senior_dod_id")}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Wizard Footer Navigation & Final Verification Bar ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          disabled={currentStep === 0}
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 disabled:opacity-40 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Previous Step
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleTriggerVerify}
            disabled={isValidating}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            {isValidating ? "Auditing Rules..." : "Verify Rules"}
          </button>

          {currentStep < 3 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((s) => Math.min(3, s + 1))}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <span>Next Step</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalizeAndDownloadPdf}
              disabled={isGeneratingPdf}
              className={`inline-flex items-center gap-1.5 px-5 py-2 text-white rounded-lg text-xs font-semibold shadow-sm transition-all ${
                isValid
                  ? "bg-emerald-700 hover:bg-emerald-800"
                  : "bg-blue-700 hover:bg-blue-800"
              }`}
            >
              <FileDown className="w-4 h-4" />
              {isGeneratingPdf ? "Generating..." : "Finalize & Download Official PDF"}
            </button>
          )}
        </div>
      </div>

      {/* ── Validation Audit Modal with Interactive Jump-To-Block ── */}
      <ValidationResultsModal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        errors={hasFinalChecked ? finalErrors : errors}
        warnings={hasFinalChecked ? finalWarnings : warnings}
        reportType={formData.report_type}
        onJumpToBlock={handleJumpToBlock}
      />
    </div>
  );
};
