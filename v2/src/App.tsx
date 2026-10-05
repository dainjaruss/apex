// src/App.tsx
//
// Main Application Shell for APEX v2 (Navy Performance Exchange).
// Runs 100% in-browser with zero server requirements. Designed for Forge / NMCI.

import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, seedInitialDataIfEmpty, DEFAULT_PROFILE } from "@/lib/db";
import { Evaluation, Profile, FormCode } from "@/types";
import { EvalList } from "@/components/evaluations/EvalList";
import { EvalEditor } from "@/components/evaluations/EvalEditor";
import { NewEvalPicker } from "@/components/evaluations/NewEvalPicker";
import { ContinuityInspector } from "@/components/continuity/ContinuityInspector";
import { RscaMatrix } from "@/components/rsca/RscaMatrix";
import { WorkspaceManager } from "@/components/workspace/WorkspaceManager";
import { ProfileModal } from "@/components/profile/ProfileModal";
import { getEvalSeed, getChiefEvalSeed, getFitrepSeed } from "@/lib/formDefinitions";
import { ROUTING_STAGES } from "@/lib/routingService";
import { canManageSummaryGroups } from "@/lib/permissions";
import {
  FileText,
  CalendarCheck,
  TrendingUp,
  HardDrive,
  Moon,
  Sun,
  Bell,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  X,
} from "lucide-react";

export function App() {
  const [activeTab, setActiveTab] = useState<"evaluations" | "continuity" | "rsca" | "workspace">("evaluations");
  const [editingEval, setEditingEval] = useState<Evaluation | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const profiles = useLiveQuery(() => db.profiles.toArray(), []);
  const activeProfile: Profile = profiles?.[0] || DEFAULT_PROFILE;
  const isLeadership = canManageSummaryGroups(activeProfile);

  // Automatically switch tab away from RSCA if user switches to Sailor/Rater role
  useEffect(() => {
    if (!isLeadership && activeTab === "rsca") {
      setActiveTab("evaluations");
    }
  }, [isLeadership, activeTab]);

  const evaluations = useLiveQuery(() => db.evaluations.toArray(), []);

  // Compute pending action evaluations for the active user's role
  const pendingActionEvals = (evaluations || []).filter((ev) => {
    const role = activeProfile.preferred_role;
    const stage = ev.routing_stage || "sailor";
    if (role === "Sailor") {
      return stage === "sailor" || stage === "debrief" || Boolean(ev.return_notes);
    }
    if (role === "Rater") {
      return stage === "rater" || ev.current_holder_role === "Rater";
    }
    if (role === "Senior Rater") {
      return stage === "senior_rater" || ev.current_holder_role === "Senior Rater";
    }
    if (role === "Reporting Senior") {
      return stage === "reporting_senior" || ev.current_holder_role === "Reporting Senior";
    }
    if (role === "Admin") {
      return true;
    }
    return false;
  });

  // Initialize and seed sample data on first run
  useEffect(() => {
    seedInitialDataIfEmpty();
  }, []);

  // Sync dark mode class to html document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const handleStartNewEval = (formCode: FormCode) => {
    let seed: any;
    let reportType: "EVAL" | "CHIEFEVAL" | "FITREP" = "EVAL";

    if (formCode === "CHIEFEVAL") {
      seed = getChiefEvalSeed();
      reportType = "CHIEFEVAL";
    } else if (formCode.startsWith("FITREP")) {
      seed = getFitrepSeed(formCode);
      reportType = "FITREP";
    } else {
      seed = getEvalSeed();
      reportType = "EVAL";
    }

    const today = new Date().toISOString().split("T")[0];
    const newEval: Evaluation = {
      ...seed,
      id: `eval-${Date.now()}`,
      report_type: reportType,
      member_name: `${activeProfile.last_name}, ${activeProfile.first_name} ${activeProfile.middle_initial || ""}`.trim(),
      dod_id: activeProfile.dod_id || "1234567890",
      grade_rate: activeProfile.rate || activeProfile.navy_rank || "PO1",
      period_from: today,
      period_to: today,
      duty_status: "ACT",
      uic: activeProfile.uic || "00024",
      ship_station: activeProfile.ship_station || "NAVSEA WASHINGTON DC",
      promotion_status: "Regular",
      trait_grades: {},
      comments: "",
      career_recommendations: ["", ""],
      promotion_recommendation: "Promotable",
      retention: "Recommended",
      status: "draft",
      routing_stage: "sailor",
      block_values: {
        ...seed.block_values,
        physical_readiness: "P",
        comment_pitch: "10",
        comment_pitch_v: 2,
        periodic: true,
        regular_report: true,
        reporting_senior_name: "KIRK, JAMES T",
        reporting_senior_grade: "CAPT",
        reporting_senior_designator: "1110",
        reporting_senior_title: "COMMANDING OFFICER",
        reporting_senior_uic: "00024",
        reporting_senior_dod_id: "9876543210",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.evaluations.put(newEval);
    setIsCreatingNew(false);
    setEditingEval(newEval);
  };

  const handleRoleChange = async (role: Profile["preferred_role"]) => {
    const updated = { ...activeProfile, preferred_role: role };
    await db.profiles.put(updated);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Top Enterprise Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              ⚓
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-slate-900 dark:text-white text-base">
                  APEX <span className="text-blue-600 dark:text-blue-400">v2</span>
                </span>
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  FORGE EDITION
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-none">
                U.S. Navy Performance Exchange | Zero-Server Engine
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl text-xs font-semibold">
            <button type="button"
              onClick={() => {
                setActiveTab("evaluations");
                setEditingEval(null);
                setIsCreatingNew(false);
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === "evaluations"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Evaluations
            </button>

            <button type="button"
              onClick={() => {
                setActiveTab("continuity");
                setEditingEval(null);
                setIsCreatingNew(false);
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === "continuity"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              Continuity & Gap Inspector
            </button>

            {isLeadership && (
              <button type="button"
                onClick={() => {
                  setActiveTab("rsca");
                  setEditingEval(null);
                  setIsCreatingNew(false);
                }}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === "rsca"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                RSCA & Summary Groups
              </button>
            )}

            <button type="button"
              onClick={() => {
                setActiveTab("workspace");
                setEditingEval(null);
                setIsCreatingNew(false);
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === "workspace"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              Save / Load Session
            </button>
          </nav>

          {/* User Profile, Notifications, & Role Switcher */}
          <div className="flex items-center gap-3">
            {/* Clickable Sailor Profile Badge */}
            <button type="button"
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-right group cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              title="Click to view & edit your Sailor Profile and Local Storage"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 border border-blue-200 dark:border-blue-700 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-xs shrink-0">
                {activeProfile.first_name?.[0] || "S"}{activeProfile.last_name?.[0] || "P"}
              </div>
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-xs font-bold text-slate-900 dark:text-white leading-none group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {activeProfile.last_name}, {activeProfile.first_name}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {activeProfile.rate || activeProfile.navy_rank} | UIC: {activeProfile.uic}
                </span>
              </div>
            </button>

            {/* Notification Bell with Badge Popover */}
            <div className="relative">
              <button type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Action Notifications"
              >
                <Bell className="w-4 h-4" />
                {pendingActionEvals.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                )}
              </button>

              {/* Notification Flyout */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        Action Inbox ({pendingActionEvals.length})
                      </span>
                    </div>
                    <button type="button"
                      onClick={() => setShowNotifications(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {pendingActionEvals.length > 0 ? (
                      pendingActionEvals.map((ev) => {
                        const stageInfo = ROUTING_STAGES.find((s) => s.id === ev.routing_stage);
                        return (
                          <div
                            key={ev.id}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 transition-colors text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {ev.member_name} ({ev.grade_rate})
                              </span>
                              <span className="font-mono text-[10px] text-slate-500">
                                Ending: {ev.period_to}
                              </span>
                            </div>

                            <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                              {stageInfo?.label || "1. Sailor Draft"}
                            </div>

                            {ev.return_notes && (
                              <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 p-1.5 rounded flex items-center gap-1 font-mono">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span className="truncate">Rework: "{ev.return_notes}"</span>
                              </div>
                            )}

                            <button type="button"
                              onClick={() => {
                                setEditingEval(ev);
                                setActiveTab("evaluations");
                                setShowNotifications(false);
                              }}
                              className="w-full mt-1 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1 shadow-xs transition-colors"
                            >
                              <span>Review & Action</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-6 text-center text-xs text-slate-500">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5 opacity-80" />
                        All caught up! No evaluations awaiting action for your role ({activeProfile.preferred_role}).
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Role Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs">
              <select
                value={activeProfile.preferred_role}
                onChange={(e) => handleRoleChange(e.target.value as any)}
                className="bg-transparent border-0 font-semibold text-slate-800 dark:text-slate-200 text-xs focus:ring-0 cursor-pointer"
                title="Active Role Perspective"
              >
                <option value="Sailor">Role: Sailor</option>
                <option value="Rater">Role: Rater (LPO)</option>
                <option value="Senior Rater">Role: Senior Rater (CPO)</option>
                <option value="Reporting Senior">Role: Reporting Senior</option>
                <option value="Admin">Role: Admin Officer</option>
              </select>
            </div>

            {/* Dark Mode Toggle */}
            <button type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Toggle theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8">
        {activeTab === "evaluations" && (
          isCreatingNew ? (
            <NewEvalPicker
              onSelectForm={handleStartNewEval}
              onCancel={() => setIsCreatingNew(false)}
            />
          ) : editingEval ? (
            <EvalEditor
              evaluation={editingEval}
              activeProfile={activeProfile}
              onBack={() => setEditingEval(null)}
              onSave={(updated) => setEditingEval(updated)}
            />
          ) : (
            <EvalList
              activeProfile={activeProfile}
              onSelectEval={(ev) => setEditingEval(ev)}
              onCreateEval={(reportType) => {
                if (reportType === "CHIEFEVAL") handleStartNewEval("CHIEFEVAL");
                else if (reportType === "FITREP") handleStartNewEval("FITREP_W2_O6");
                else handleStartNewEval("EVAL");
              }}
              onStartNewFlow={() => setIsCreatingNew(true)}
            />
          )
        )}

        {activeTab === "continuity" && <ContinuityInspector />}

        {activeTab === "rsca" && (
          <RscaMatrix
            activeProfile={activeProfile}
            onSelectEval={(ev) => {
              setEditingEval(ev);
              setActiveTab("evaluations");
            }}
          />
        )}

        {activeTab === "workspace" && <WorkspaceManager />}
      </main>

      {/* Sailor Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        activeProfile={activeProfile}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>APEX v2 — Designed for Department of the Navy (DON) Forge Runtime</span>
          <span className="font-mono text-[11px]">BUPERSINST 1610.10H Compliant | IndexedDB Local Engine | Pack & Route Fallback</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
