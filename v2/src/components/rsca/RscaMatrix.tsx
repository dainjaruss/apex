// src/components/rsca/RscaMatrix.tsx
//
// Command Leadership Summary Group & RSCA Hub.
// Implements BUPERSINST 1610.10H Table 1-1 / Table 1-2 forced distribution quotas,
// pooled Summary Group Average (SGA) calculations, Reporting Senior Cumulative Average (RSCA)
// baseline ledger, interactive breakout ranking, and candidate evaluation assignment.

import React, { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Evaluation, SummaryGroup, RscaHistoricalRecord, Profile } from "@/types";
import {
  computeSummaryGroupMetrics,
  stampSummaryGroupMetrics,
  createSummaryGroup,
  deleteSummaryGroup,
  addEvalToSummaryGroup,
  removeEvalFromSummaryGroup,
  generateSamplePeerEval,
} from "@/lib/summaryGroupService";
import {
  Calculator,
  Save,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  Users,
  Award,
  Plus,
  Trash2,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  UserPlus,
  Sparkles,
  Lock,
  Layers,
  ArrowRight,
  Filter,
  Check,
} from "lucide-react";

interface RscaMatrixProps {
  activeProfile?: Profile;
  onSelectEval?: (evaluation: Evaluation) => void;
}

export const RscaMatrix: React.FC<RscaMatrixProps> = ({ activeProfile, onSelectEval }) => {
  // Query all summary groups, evaluations, and RSCA historical records from IndexedDB
  const summaryGroups = useLiveQuery(() => db.summary_groups.toArray(), []);
  const evaluations = useLiveQuery(() => db.evaluations.toArray(), []);
  const rscaRecords = useLiveQuery(() => db.rsca_records.toArray(), []);

  // Active Summary Group ID state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Modal and drawer states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCandidateDrawer, setShowCandidateDrawer] = useState(false);
  const [stampStatus, setStampStatus] = useState<string | null>(null);
  const [showLedgerConfig, setShowLedgerConfig] = useState(false);

  // New Summary Group Form state
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPaygrade, setNewGroupPaygrade] = useState("E6");
  const [newGroupPeriodTo, setNewGroupPeriodTo] = useState("2026-11-15");
  const [newGroupPromotionStatus, setNewGroupPromotionStatus] = useState("Regular");
  const [newGroupDutyStatus, setNewGroupDutyStatus] = useState("ACT");
  const [newGroupUic, setNewGroupUic] = useState(activeProfile?.uic || "N0024");
  const [newGroupReportType, setNewGroupReportType] = useState<"EVAL" | "CHIEFEVAL" | "FITREP">("EVAL");
  const [newGroupBillet, setNewGroupBillet] = useState("NA");

  // Determine active group (fallback to first group or seeded group)
  const activeGroup = useMemo(() => {
    if (!summaryGroups || summaryGroups.length === 0) return null;
    if (selectedGroupId) {
      const found = summaryGroups.find((g) => g.id === selectedGroupId);
      if (found) return found;
    }
    return summaryGroups[0];
  }, [summaryGroups, selectedGroupId]);

  // Evaluations belonging to the active group
  const groupEvals = useMemo(() => {
    if (!activeGroup || !evaluations) return [];
    return evaluations.filter(
      (e) => e.summary_group_id === activeGroup.id || activeGroup.member_ids?.includes(e.id)
    );
  }, [activeGroup, evaluations]);

  // RSCA record for active group paygrade & reporting senior
  const activePaygrade = activeGroup?.grade_rate || "E6";
  const seniorDodId = activeGroup?.reporting_senior_dod_id || activeProfile?.dod_id || "9876543210";
  const seniorName = activeGroup?.reporting_senior_name || "KIRK, JAMES T";

  const currentRscaRecord = useMemo(() => {
    return rscaRecords?.find(
      (r) => r.paygrade === activePaygrade && (r.reporting_senior_dod_id === seniorDodId || !r.reporting_senior_dod_id)
    );
  }, [rscaRecords, activePaygrade, seniorDodId]);

  // Historical ledger form inputs
  const [historicalMarks, setHistoricalMarks] = useState<number>(382.4);
  const [historicalCount, setHistoricalCount] = useState<number>(98);
  const [saveLedgerSuccess, setSaveLedgerSuccess] = useState(false);

  React.useEffect(() => {
    if (currentRscaRecord) {
      setHistoricalMarks(currentRscaRecord.historical_total_marks);
      setHistoricalCount(currentRscaRecord.historical_report_count);
    }
  }, [currentRscaRecord]);

  // Compute live BUPERS metrics for active summary group
  const metrics = useMemo(() => {
    if (!activeGroup) return null;
    return computeSummaryGroupMetrics(activeGroup, groupEvals, {
      id: currentRscaRecord?.id || `rsca-${activePaygrade}`,
      reporting_senior_name: seniorName,
      reporting_senior_dod_id: seniorDodId,
      paygrade: activePaygrade,
      historical_total_marks: historicalMarks,
      historical_report_count: historicalCount,
      calculated_rsca: historicalCount > 0 ? historicalMarks / historicalCount : 0,
      last_updated: new Date().toISOString(),
    });
  }, [activeGroup, groupEvals, currentRscaRecord, seniorName, seniorDodId, activePaygrade, historicalMarks, historicalCount]);

  // Candidate evaluations eligible to be added to this summary group
  const candidateEvals = useMemo(() => {
    if (!activeGroup || !evaluations) return [];
    const memberIds = new Set(groupEvals.map((e) => e.id));
    return evaluations.filter((e) => {
      if (memberIds.has(e.id)) return false;
      // Match paygrade loosely (e.g. IT1 matches E6)
      const paygradeMatches =
        e.grade_rate.includes(activeGroup.grade_rate) ||
        (activeGroup.grade_rate === "E6" && e.grade_rate.endsWith("1")) ||
        (activeGroup.grade_rate === "E5" && e.grade_rate.endsWith("2")) ||
        (activeGroup.grade_rate === "E7" && e.grade_rate.endsWith("C")) ||
        (activeGroup.grade_rate === "E8" && e.grade_rate.endsWith("CS")) ||
        (activeGroup.grade_rate === "E9" && e.grade_rate.endsWith("CM"));
      return paygradeMatches;
    });
  }, [activeGroup, evaluations, groupEvals]);

  // Handler: Change member's promotion recommendation inline
  const handlePromotionRecChange = async (evalId: string, newRec: string) => {
    await db.evaluations.update(evalId, {
      promotion_recommendation: newRec,
      updated_at: new Date().toISOString(),
    });
  };

  // Handler: Add evaluation to active group
  const handleAddMember = async (evalId: string) => {
    if (!activeGroup) return;
    await addEvalToSummaryGroup(evalId, activeGroup.id);
  };

  // Handler: Remove evaluation from active group
  const handleRemoveMember = async (evalId: string) => {
    if (!activeGroup) return;
    await removeEvalFromSummaryGroup(evalId, activeGroup.id);
  };

  // Handler: Add all candidate evaluations to active group
  const handleAddAllCandidates = async () => {
    if (!activeGroup || candidateEvals.length === 0) return;
    for (const cand of candidateEvals) {
      await addEvalToSummaryGroup(cand.id, activeGroup.id);
    }
  };

  // Handler: Generate sample peer sailor in group
  const handleGenerateSamplePeer = async () => {
    if (!activeGroup) return;
    await generateSamplePeerEval(activeGroup.id, activeGroup, seniorName, seniorDodId);
  };

  // Handler: Stamp metrics to Block 50
  const handleStampMetrics = async () => {
    if (!activeGroup) return;
    try {
      const res = await stampSummaryGroupMetrics(activeGroup.id, currentRscaRecord);
      setStampStatus(`Successfully stamped SGA (${res.sga?.toFixed(2) ?? "N/A"}) and RSCA (${res.rsca.toFixed(2)}) across ${res.memberCount} evaluations!`);
      setTimeout(() => setStampStatus(null), 4000);
    } catch (e: any) {
      alert(`Error stamping metrics: ${e.message}`);
    }
  };

  // Handler: Save RSCA Ledger configuration
  const handleSaveLedger = async () => {
    const record: RscaHistoricalRecord = {
      id: currentRscaRecord?.id || `rsca-${seniorDodId}-${activePaygrade}`,
      reporting_senior_name: seniorName,
      reporting_senior_dod_id: seniorDodId,
      paygrade: activePaygrade,
      historical_total_marks: historicalMarks,
      historical_report_count: historicalCount,
      calculated_rsca: historicalCount > 0 ? historicalMarks / historicalCount : 0,
      last_updated: new Date().toISOString(),
    };
    await db.rsca_records.put(record);
    setSaveLedgerSuccess(true);
    setTimeout(() => setSaveLedgerSuccess(false), 2500);
  };

  // Handler: Create new Summary Group
  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await createSummaryGroup({
      name: newGroupName.trim() || `CY2026 ${newGroupPaygrade} Periodic Group`,
      grade_rate: newGroupPaygrade,
      period_to: newGroupPeriodTo,
      promotion_status: newGroupPromotionStatus,
      duty_status: newGroupDutyStatus,
      uic: newGroupUic,
      billet_subcategory: newGroupBillet,
      report_type: newGroupReportType,
      status: "open",
      reporting_senior_name: seniorName,
      reporting_senior_dod_id: seniorDodId,
    });

    setSelectedGroupId(created.id);
    setShowCreateModal(false);
    setNewGroupName("");
  };

  // Handler: Delete summary group
  const handleDeleteGroup = async (groupId: string) => {
    if (confirm("Are you sure you want to delete this summary group? All member evaluations will be retained and set to unassigned.")) {
      await deleteSummaryGroup(groupId);
      setSelectedGroupId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                Leadership Portal (Reporting Senior & Admin)
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                BUPERSINST 1610.10H Ch. 1
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Summary Groups & RSCA Matrix
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Command leadership cockpit for managing competitive summary groups, enforcing BUPERS Table 1-1 forced distribution ceilings, calculating authoritative pooled trait averages, and stamping Block 50 / 46 metrics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Summary Group
            </button>

            <button
              onClick={() => setShowLedgerConfig(!showLedgerConfig)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors"
            >
              <Calculator className="w-3.5 h-3.5 text-blue-600" />
              RSCA Ledger Baseline
            </button>
          </div>
        </div>

        {/* Summary Group Selector Toolbar */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Active Group:
            </label>
            {summaryGroups && summaryGroups.length > 0 ? (
              <select
                value={activeGroup?.id || ""}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-blue-500"
              >
                {summaryGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.grade_rate} · ends {g.period_to} · {g.member_ids?.length || 0} Sailors)
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-amber-600 italic">No summary groups found. Create one to begin.</span>
            )}
          </div>

          {activeGroup && (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                Paygrade: <strong className="text-slate-900 dark:text-white">{activeGroup.grade_rate}</strong>
              </span>
              <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                Period Ending: <strong className="text-slate-900 dark:text-white">{activeGroup.period_to}</strong>
              </span>
              <button
                onClick={() => handleDeleteGroup(activeGroup.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
                title="Delete this summary group"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stamp Status Banner */}
      {stampStatus && (
        <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{stampStatus}</span>
        </div>
      )}

      {/* Quota & RSCA Metrics Cockpit Cards */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Summary Group Average (SGA) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Summary Group Average (SGA)</span>
              <span className="text-[10px] font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                Block 50a / 46a
              </span>
            </span>
            <div className="text-3xl font-extrabold font-mono text-blue-600 dark:text-blue-400 mt-2">
              {metrics.summaryGroupAverage !== null ? metrics.summaryGroupAverage.toFixed(2) : "0.00"}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Pooled across {metrics.totalMembers} Sailors ({metrics.gradedMembers} graded)
            </p>
          </div>

          {/* Card 2: Reporting Senior RSCA */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Reporting Senior RSCA</span>
              <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                Block 50b / 46b
              </span>
            </span>
            <div className="text-3xl font-extrabold font-mono text-slate-900 dark:text-white mt-2 flex items-center gap-2">
              {metrics.rsca.toFixed(2)}
              {metrics.summaryGroupAverage !== null && (
                <span
                  className={`text-xs px-2 py-0.5 rounded font-sans font-bold ${
                    metrics.summaryGroupAverage >= metrics.rsca
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {(metrics.summaryGroupAverage - metrics.rsca >= 0 ? "+" : "") +
                    (metrics.summaryGroupAverage - metrics.rsca).toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Based on {historicalCount} career reports in paygrade
            </p>
          </div>

          {/* Card 3: Post-Sign RSCA Shift */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Projected RSCA Post-Sign
            </span>
            <div className="text-3xl font-extrabold font-mono text-slate-900 dark:text-white mt-2 flex items-center gap-2">
              {metrics.projectedRsca.toFixed(2)}
              <span
                className={`text-xs px-2 py-0.5 rounded font-sans font-bold ${
                  metrics.rscaShift >= 0
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {metrics.rscaShift >= 0 ? `+${metrics.rscaShift.toFixed(2)}` : metrics.rscaShift.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Cumulative movement across {historicalCount + metrics.totalMembers} total reports
            </p>
          </div>

          {/* Card 4: Forced Distribution Quota Status */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Table 1-1 Quota Guard</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                metrics.isEpOverQuota || metrics.isCombinedOverQuota
                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              }`}>
                {metrics.isEpOverQuota ? "EP OVER QUOTA" : metrics.isCombinedOverQuota ? "COMBINED OVER" : "WITHIN LIMITS"}
              </span>
            </span>
            <div className="text-2xl font-bold mt-2">
              <span className={metrics.isEpOverQuota ? "text-red-600" : "text-emerald-600"}>
                {metrics.counts.ep} EP
              </span>
              <span className="text-slate-400 text-xs font-normal"> / max {metrics.epLimit}</span>
              <span className="mx-2 text-slate-300 dark:text-slate-700">|</span>
              <span className={metrics.isCombinedOverQuota ? "text-red-600" : "text-blue-600"}>
                {metrics.counts.mp} MP
              </span>
              <span className="text-slate-400 text-xs font-normal"> / max {metrics.mpLimit}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {metrics.totalMembers === 0 ? "No reports in group" : `N=${metrics.totalMembers} | ${metrics.counts.p} Promotable`}
            </p>
          </div>
        </div>
      )}

      {/* Quota Warning Alert (If over BUPERS ceiling) */}
      {metrics && (metrics.isEpOverQuota || metrics.isCombinedOverQuota) && (
        <div className="bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 rounded-xl p-4 flex items-start gap-3 text-red-900 dark:text-red-200">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-bold text-sm">Forced Distribution Quota Violation</h4>
            <p className="mt-0.5">
              {metrics.isEpOverQuota && (
                <span>
                  You have awarded <strong>{metrics.counts.ep} Early Promote</strong> recommendations, which exceeds the Table 1-1 statutory ceiling of <strong>{metrics.epLimit}</strong> for a cohort of {metrics.totalMembers}.{" "}
                </span>
              )}
              {metrics.isCombinedOverQuota && (
                <span>
                  The combined EP + MP count (<strong>{metrics.counts.ep + metrics.counts.mp}</strong>) exceeds the 60% combined limit of <strong>{metrics.combinedLimit}</strong>.
                </span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-red-700 dark:text-red-300">
              Evaluations submitted over quota will be administratively rejected by NAVPERSCOM (PERS-32) per BUPERSINST 1610.10H Chapter 1, paragraph 1-14.
            </p>
          </div>
        </div>
      )}

      {/* RSCA Baseline Ledger Configuration (Collapsible) */}
      {showLedgerConfig && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                Reporting Senior Historical Baseline Ledger ({activePaygrade})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure your career cumulative marks and total reports signed from your official BUPERS RSCA summary report.
              </p>
            </div>

            <button
              onClick={handleSaveLedger}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saveLedgerSuccess ? "Saved to Workspace!" : "Save Baseline"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                Reporting Senior Name
              </label>
              <input
                type="text"
                value={seniorName}
                readOnly
                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-mono text-xs cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                Reporting Senior DoD ID
              </label>
              <input
                type="text"
                value={seniorDodId}
                readOnly
                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-mono text-xs cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                Historical Cumulative Marks ({activePaygrade})
              </label>
              <input
                type="number"
                step="0.1"
                value={historicalMarks}
                onChange={(e) => setHistoricalMarks(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
                Historical Reports Signed ({activePaygrade})
              </label>
              <input
                type="number"
                value={historicalCount}
                onChange={(e) => setHistoricalCount(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Summary Group Roster Table & Cohort Breakout */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Summary Group Cohort Roster ({metrics?.totalMembers || 0} Members)
              </h2>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded font-mono">
                Breakout Order
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked in descending order of Individual Trait Average (ITA). Adjust promotion recommendations to fit Table 1-1 ceilings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleStampMetrics}
              disabled={!activeGroup || groupEvals.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Stamp pooled SGA and RSCA into Block 50 of all evaluations"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Stamp Metrics to Block 50
            </button>

            <button
              onClick={handleGenerateSamplePeer}
              disabled={!activeGroup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors"
              title="Add a realistic sample peer sailor to test ranking dynamics"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Add Sample Peer
            </button>

            <button
              onClick={() => setShowCandidateDrawer(!showCandidateDrawer)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg text-xs font-semibold border border-blue-200 dark:border-blue-800 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Candidate Reports ({candidateEvals.length})
            </button>
          </div>
        </div>

        {/* Member Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-xs uppercase font-medium">
              <tr>
                <th className="px-4 py-3">Rank / Breakout</th>
                <th className="px-4 py-3">Member Name</th>
                <th className="px-4 py-3">Rate / Desig</th>
                <th className="px-4 py-3 text-center">ITA (Block 40)</th>
                <th className="px-4 py-3 text-center">$\Delta$ vs SGA</th>
                <th className="px-4 py-3 text-center">$\Delta$ vs RSCA</th>
                <th className="px-4 py-3">Promotion Recommendation</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {metrics && metrics.members.length > 0 ? (
                metrics.members.map((m) => {
                  const ev = m.evaluation;
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                        <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 inline-flex items-center justify-center text-xs">
                          #{m.rank}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        <button
                          onClick={() => onSelectEval && onSelectEval(ev)}
                          className="hover:underline text-left flex items-center gap-1.5"
                          title="Open evaluation editor"
                        >
                          <span>{ev.member_name}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400 opacity-60" />
                        </button>
                        <div className="text-[11px] font-normal text-slate-500 font-mono">
                          DoD ID: {ev.dod_id}
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {ev.grade_rate} {ev.designator ? `(${ev.designator})` : ""}
                      </td>

                      <td className="px-4 py-3 text-center font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {m.ita !== null ? m.ita.toFixed(2) : "NOB"}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {m.deltaSga !== null ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${
                              m.deltaSga >= 0
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {m.deltaSga >= 0 ? `+${m.deltaSga.toFixed(2)}` : m.deltaSga.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs font-mono">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {m.deltaRsca !== null ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${
                              m.deltaRsca >= 0
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {m.deltaRsca >= 0 ? `+${m.deltaRsca.toFixed(2)}` : m.deltaRsca.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs font-mono">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={ev.promotion_recommendation || "Promotable"}
                          onChange={(e) => handlePromotionRecChange(ev.id, e.target.value)}
                          className={`px-2.5 py-1 rounded text-xs font-bold font-sans border focus:ring-1 focus:ring-blue-500 ${
                            ev.promotion_recommendation === "Early Promote"
                              ? "bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
                              : ev.promotion_recommendation === "Must Promote"
                              ? "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                              : "bg-slate-50 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <option value="Early Promote">Early Promote (EP)</option>
                          <option value="Must Promote">Must Promote (MP)</option>
                          <option value="Promotable">Promotable (P)</option>
                          <option value="Progressing">Progressing</option>
                          <option value="Significant Problems">Significant Problems</option>
                          <option value="NOB">NOB</option>
                        </select>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onSelectEval && (
                            <button
                              onClick={() => onSelectEval(ev)}
                              className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs font-medium transition-colors"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveMember(ev.id)}
                            className="px-2 py-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded text-xs font-medium transition-colors"
                            title="Remove from this summary group"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No evaluations in this summary group yet. Click &quot;Add Candidate Reports&quot; or &quot;Add Sample Peer&quot; above to populate this cohort.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Candidate Reports Drawer / Section */}
      {showCandidateDrawer && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                Available Candidate Reports in Workspace ({candidateEvals.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluations drafted in your workspace matching paygrade {activePaygrade} that can be added to this competitive summary group.
              </p>
            </div>

            {candidateEvals.length > 0 && (
              <button
                onClick={handleAddAllCandidates}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add All Candidates ({candidateEvals.length})
              </button>
            )}
          </div>

          {candidateEvals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {candidateEvals.map((cand) => (
                <div
                  key={cand.id}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white">
                      {cand.member_name}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {cand.grade_rate} · Period: {cand.period_to} · ITA: {cand.trait_average ? cand.trait_average.toFixed(2) : "NOB"}
                    </div>
                    {cand.summary_group_id && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        Currently in group {cand.summary_group_id}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleAddMember(cand.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add to Group
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-500 text-xs">
              No matching candidate evaluations available. Create new evaluations in the Evaluations tab or use &quot;Add Sample Peer&quot; above.
            </div>
          )}
        </div>
      )}

      {/* Modal: Create New Summary Group */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                Create New Summary Group
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Summary Group Name / Cycle Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CY2026 E6 Periodic (NAVSEA)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Paygrade
                  </label>
                  <select
                    value={newGroupPaygrade}
                    onChange={(e) => {
                      const pg = e.target.value;
                      setNewGroupPaygrade(pg);
                      if (["E7", "E8", "E9"].includes(pg)) setNewGroupReportType("CHIEFEVAL");
                      else if (["W2", "W3", "W4", "W5", "O1", "O2", "O3", "O4", "O5", "O6"].includes(pg)) setNewGroupReportType("FITREP");
                      else setNewGroupReportType("EVAL");
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="E4">E-4</option>
                    <option value="E5">E-5</option>
                    <option value="E6">E-6</option>
                    <option value="E7">E-7 (CHIEFEVAL)</option>
                    <option value="E8">E-8 (CHIEFEVAL)</option>
                    <option value="E9">E-9 (CHIEFEVAL)</option>
                    <option value="O3">O-3 (FITREP)</option>
                    <option value="O4">O-4 (FITREP)</option>
                    <option value="O5">O-5 (FITREP)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Report Type
                  </label>
                  <select
                    value={newGroupReportType}
                    onChange={(e) => setNewGroupReportType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="EVAL">EVAL (NAVPERS 1616/26)</option>
                    <option value="CHIEFEVAL">CHIEFEVAL (NAVPERS 1616/27)</option>
                    <option value="FITREP">FITREP (NAVPERS 1610/2)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Period Ending Date (Period To)
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    value={newGroupPeriodTo}
                    onChange={(e) => setNewGroupPeriodTo(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newGroupPaygrade === "E6") setNewGroupPeriodTo("2026-11-15");
                      else if (newGroupPaygrade === "E5") setNewGroupPeriodTo("2026-03-15");
                      else if (newGroupPaygrade === "E7" || newGroupPaygrade === "E8") setNewGroupPeriodTo("2026-09-15");
                      else if (newGroupPaygrade === "O3") setNewGroupPeriodTo("2026-01-31");
                      else if (newGroupPaygrade === "O4") setNewGroupPeriodTo("2026-10-31");
                    }}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                  >
                    Set Navy Periodic
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Promotion Status (Block 8)
                  </label>
                  <select
                    value={newGroupPromotionStatus}
                    onChange={(e) => setNewGroupPromotionStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="Regular">Regular</option>
                    <option value="Frocked">Frocked</option>
                    <option value="Selected">Selected</option>
                    <option value="Spot">Spot</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Duty Status (Block 5)
                  </label>
                  <select
                    value={newGroupDutyStatus}
                    onChange={(e) => setNewGroupDutyStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="ACT">Active Duty (ACT)</option>
                    <option value="TAR">TAR / FTS</option>
                    <option value="INACT">Inactive Reserve (INACT)</option>
                    <option value="AT/ADOS">AT / ADOS</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Command UIC (Block 6)
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={newGroupUic}
                    onChange={(e) => setNewGroupUic(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Billet Subcat (Block 21)
                  </label>
                  <input
                    type="text"
                    value={newGroupBillet}
                    onChange={(e) => setNewGroupBillet(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold shadow-xs transition-colors"
                >
                  Create & Open Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
