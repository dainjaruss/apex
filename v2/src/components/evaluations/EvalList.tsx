// src/components/evaluations/EvalList.tsx
//
// Evaluation Dashboard: Role-tailored Action Queues, Custody Stage Indicators,
// Pack & Route Fallback (.apex.json), SharePoint List Sync, and 1-Click PDF Export.

import React, { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Evaluation, Profile, RoutingStage } from "@/types";
import { downloadEvaluationPdf } from "@/lib/pdfClient";
import { exportSingleEvalTransfer, importSingleEvalTransfer } from "@/lib/sessionTransfer";
import {
  getSharePointConfig,
  saveSharePointConfig,
  testSharePointConnection,
  syncEvaluationToSharePoint,
  SharePointConfig,
} from "@/lib/sharepointService";
import { ROUTING_STAGES } from "@/lib/routingService";
import {
  FileText,
  Plus,
  FileDown,
  Trash2,
  Upload,
  Edit3,
  Filter,
  Package,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Settings,
  X,
  Search,
  Check,
} from "lucide-react";

interface EvalListProps {
  activeProfile: Profile;
  onSelectEval: (evalRecord: Evaluation) => void;
  onCreateEval: (reportType: "EVAL" | "CHIEFEVAL" | "FITREP") => void;
  onStartNewFlow?: () => void;
}

type QueueTab = "ACTION_REQUIRED" | "IN_ROUTING" | "COMPLETED" | "ALL";

export const EvalList: React.FC<EvalListProps> = ({
  activeProfile,
  onSelectEval,
  onCreateEval,
  onStartNewFlow,
}) => {
  const evaluations = useLiveQuery(() => db.evaluations.orderBy("updated_at").reverse().toArray(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>("ALL");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // SharePoint Modal State
  const [showSpModal, setShowSpModal] = useState<boolean>(false);
  const [spConfig, setSpConfig] = useState<SharePointConfig>(getSharePointConfig());
  const [spTestResult, setSpTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTestingSp, setIsTestingSp] = useState<boolean>(false);

  // Import Handler (.apex.json)
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importSingleEvalTransfer(file);
      alert(`Successfully imported custody packet for ${imported.member_name} (${imported.period_to}).`);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the evaluation for ${name}?`)) {
      await db.evaluations.delete(id);
    }
  };

  const handleQuickPackDownload = async (ev: Evaluation) => {
    try {
      await exportSingleEvalTransfer(ev.id);
    } catch (err: any) {
      alert(`Pack & Route export failed: ${err.message}`);
    }
  };

  const handleQuickSpSync = async (ev: Evaluation) => {
    const res = await syncEvaluationToSharePoint(ev, spConfig);
    alert(res.message);
  };

  const handleSaveSpConfig = () => {
    saveSharePointConfig(spConfig);
    setShowSpModal(false);
  };

  const handleRunSpTest = async () => {
    setIsTestingSp(true);
    setSpTestResult(null);
    const result = await testSharePointConnection(spConfig);
    setSpTestResult({ ok: result.success, message: result.message });
    setIsTestingSp(false);
  };

  // Role Action Gating Helper
  const isActionRequiredForUser = (ev: Evaluation): boolean => {
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
      return true; // Admin oversees all
    }
    return false;
  };

  // Filter evaluations by queue tab, form type, and search query
  const actionRequiredEvals = evaluations?.filter(isActionRequiredForUser) || [];
  const inRoutingEvals = evaluations?.filter((ev) => (ev.routing_stage || "sailor") !== "locked") || [];
  const completedEvals = evaluations?.filter((ev) => ev.routing_stage === "locked") || [];

  const displayEvals = evaluations?.filter((ev) => {
    // 1. Tab filter
    if (activeQueueTab === "ACTION_REQUIRED" && !isActionRequiredForUser(ev)) return false;
    if (activeQueueTab === "IN_ROUTING" && ev.routing_stage === "locked") return false;
    if (activeQueueTab === "COMPLETED" && ev.routing_stage !== "locked") return false;

    // 2. Form type filter
    if (filterType !== "ALL" && ev.report_type !== filterType) return false;

    // 3. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = ev.member_name.toLowerCase().includes(q);
      const matchRate = ev.grade_rate.toLowerCase().includes(q);
      const matchDodId = ev.dod_id.toLowerCase().includes(q);
      return matchName || matchRate || matchDodId;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* ── Top Dashboard Header ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                Evaluation Hub
              </span>
              <span className="text-xs font-mono text-slate-500">
                Perspective: <strong className="text-blue-600 dark:text-blue-400">{activeProfile.preferred_role}</strong>
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Command Performance Reports
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Track custody pipelines, calibrate trait grades, enforce Table 1-1 quotas, and route reports via SharePoint or portable Pack & Route (.apex.json) packets.
            </p>
          </div>

          {/* Action Button Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportFile}
              accept=".json,.apex"
              className="hidden"
            />

            {/* Pack & Route Import Button */}
            <button type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-300 dark:border-slate-700"
              title="Import a routed evaluation packet (.apex.json) received via email or shared drive"
            >
              <Package className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Import Custody Packet (.apex.json)
            </button>

            {/* SharePoint Settings Button */}
            <button type="button"
              onClick={() => setShowSpModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-300 dark:border-slate-700"
              title="Configure command SharePoint List sync and REST email notifications"
            >
              <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              SharePoint Sync {spConfig.enabled ? "(On)" : "(Off)"}
            </button>

            {onStartNewFlow && (
              <button type="button"
                onClick={onStartNewFlow}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Draft New Report
              </button>
            )}

            <button type="button"
              onClick={() => onCreateEval("EVAL")}
              className="inline-flex items-center gap-1 px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 transition-colors"
            >
              + Quick EVAL
            </button>
            <button type="button"
              onClick={() => onCreateEval("CHIEFEVAL")}
              className="inline-flex items-center gap-1 px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 transition-colors"
            >
              + Quick CHIEF
            </button>
            <button type="button"
              onClick={() => onCreateEval("FITREP")}
              className="inline-flex items-center gap-1 px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 transition-colors"
            >
              + Quick FITREP
            </button>
          </div>
        </div>
      </div>

      {/* ── Role-Tailored Queue Tabs & Search Filter ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Queue View Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold overflow-x-auto">
          <button type="button"
            onClick={() => setActiveQueueTab("ACTION_REQUIRED")}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeQueueTab === "ACTION_REQUIRED"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Needs My Action</span>
            {actionRequiredEvals.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                {actionRequiredEvals.length}
              </span>
            )}
          </button>

          <button type="button"
            onClick={() => setActiveQueueTab("IN_ROUTING")}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeQueueTab === "IN_ROUTING"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <span>In-Routing ({inRoutingEvals.length})</span>
          </button>

          <button type="button"
            onClick={() => setActiveQueueTab("COMPLETED")}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeQueueTab === "COMPLETED"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Locked / Signed ({completedEvals.length})</span>
          </button>

          <button type="button"
            onClick={() => setActiveQueueTab("ALL")}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeQueueTab === "ALL"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <span>All ({evaluations?.length || 0})</span>
          </button>
        </div>

        {/* Form Type Filter & Search Bar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
            {["ALL", "EVAL", "CHIEFEVAL", "FITREP"].map((t) => (
              <button type="button"
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  filterType === t
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, rate, SSN..."
              className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white w-48 sm:w-60"
            />
          </div>
        </div>
      </div>

      {/* ── Evaluations Table ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-xs uppercase font-medium">
              <tr>
                <th className="px-4 py-3">Member Name / SSN</th>
                <th className="px-4 py-3">Form / Rate</th>
                <th className="px-4 py-3">Period Ending</th>
                <th className="px-4 py-3">Custody Stage & Holder</th>
                <th className="px-4 py-3">Trait Avg</th>
                <th className="px-4 py-3">Promotion Rec</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayEvals && displayEvals.length > 0 ? (
                displayEvals.map((ev) => {
                  const stageInfo = ROUTING_STAGES.find((s) => s.id === ev.routing_stage);
                  const isActionItem = isActionRequiredForUser(ev);

                  return (
                    <tr
                      key={ev.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                        isActionItem ? "bg-blue-50/20 dark:bg-blue-950/10" : ""
                      }`}
                    >
                      {/* Member Name */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {isActionItem && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" title="Action required by your role" />
                          )}
                          <div className="font-bold text-slate-900 dark:text-white">
                            {ev.member_name || "UNNAMED"}
                          </div>
                        </div>
                        <div className="text-xs font-mono text-slate-500 pl-3.5">
                          SSN: {ev.dod_id || "blank"}
                        </div>
                      </td>

                      {/* Form & Rate */}
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {ev.grade_rate}
                        </span>
                        <span className="text-xs text-slate-500 block">{ev.report_type}</span>
                      </td>

                      {/* Period Ending */}
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {ev.period_to || "--"}
                      </td>

                      {/* Custody Stage & Holder */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              ev.routing_stage === "locked"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                                : "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900"
                            }`}
                          >
                            {stageInfo?.label || "1. Sailor Draft"}
                          </span>

                          <div className="text-[11px] text-slate-500 font-mono">
                            Holder:{" "}
                            <span className="text-slate-800 dark:text-slate-200 font-medium">
                              {ev.current_holder_name || ev.member_name} ({ev.current_holder_role || "Sailor"})
                            </span>
                          </div>

                          {/* Rework Banner */}
                          {ev.return_notes && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 font-mono">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>Needs Rework: "{ev.return_notes.slice(0, 32)}..."</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Trait Average */}
                      <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {ev.trait_average ? ev.trait_average.toFixed(2) : "--"}
                      </td>

                      {/* Promotion Recommendation */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                            ev.promotion_recommendation === "Early Promote"
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                              : ev.promotion_recommendation === "Must Promote"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {ev.promotion_recommendation || "Unassigned"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button"
                            onClick={() => onSelectEval(ev)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 dark:hover:text-blue-400 transition-colors"
                            title="Open Editor & Routing Stepper"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {/* Quick Pack & Route download */}
                          <button type="button"
                            onClick={() => handleQuickPackDownload(ev)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="Pack & Route (.apex.json custody packet)"
                          >
                            <Package className="w-4 h-4" />
                          </button>

                          {/* Quick SharePoint sync if enabled */}
                          {spConfig.enabled && (
                            <button type="button"
                              onClick={() => handleQuickSpSync(ev)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 transition-colors"
                              title="Sync to SharePoint List"
                            >
                              <Cloud className="w-4 h-4" />
                            </button>
                          )}

                          <button type="button"
                            onClick={() => downloadEvaluationPdf(ev)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 transition-colors"
                            title="Download Official PDF"
                          >
                            <FileDown className="w-4 h-4" />
                          </button>

                          <button type="button"
                            onClick={() => handleDelete(ev.id, ev.member_name)}
                            className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                            title="Delete report"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-xs">
                    {activeQueueTab === "ACTION_REQUIRED"
                      ? `No evaluations currently require action for your active role (${activeProfile.preferred_role}).`
                      : "No evaluations match your search or filter. Draft a report or import a custody packet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SharePoint Settings Modal ── */}
      {showSpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  SharePoint List Integration & Notifications
                </h3>
              </div>
              <button type="button" onClick={() => setShowSpModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Connect APEX directly to your command SharePoint portal. When enabled, routed evaluations will sync to the designated SharePoint List and can trigger automated REST email alerts.
              </p>

              {/* Offline / Airgap Notice */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-blue-900 dark:text-blue-200 flex items-start gap-2">
                <Package className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Offline & Air-Gap Fallback:</span> If your division is deployed, underway, or lacks SharePoint list creation privileges, APEX's <strong>Pack & Route</strong> fallback works 100% offline via downloadable <code>.apex.json</code> files and Outlook <code>mailto:</code> drafts.
                </div>
              </div>

              {/* Enable Toggle */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={spConfig.enabled}
                  onChange={(e) => setSpConfig({ ...spConfig, enabled: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Enable SharePoint Custom List Sync
                </span>
              </label>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  SharePoint Site / Team URL
                </label>
                <input
                  type="url"
                  value={spConfig.siteUrl}
                  onChange={(e) => setSpConfig({ ...spConfig, siteUrl: e.target.value })}
                  placeholder="https://flankers.navy.mil/teams/DIV1"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  SharePoint Custom List Name
                </label>
                <input
                  type="text"
                  value={spConfig.listName}
                  onChange={(e) => setSpConfig({ ...spConfig, listName: e.target.value })}
                  placeholder="APEX_Evaluations"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={spConfig.emailNotify}
                  onChange={(e) => setSpConfig({ ...spConfig, emailNotify: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  Trigger SharePoint REST Email Utility (SP.Utilities.Utility.SendEmail) on routing
                </span>
              </label>

              {/* Test Connection Button & Result */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isTestingSp || !spConfig.siteUrl}
                  onClick={handleRunSpTest}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors disabled:opacity-50"
                >
                  {isTestingSp ? "Testing REST Endpoint..." : "Test SharePoint REST Connection"}
                </button>

                {spTestResult && (
                  <div
                    className={`mt-2 p-3 rounded-lg border text-xs ${
                      spTestResult.ok
                        ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 text-emerald-900 dark:text-emerald-200"
                        : "bg-amber-50 dark:bg-amber-950/50 border-amber-300 text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    {spTestResult.message}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSpModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSpConfig}
                className="px-4 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition-colors shadow-sm"
              >
                Save SharePoint Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
