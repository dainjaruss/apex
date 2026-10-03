// src/components/rsca/RscaMatrix.tsx
//
// Summary Group & RSCA Matrix Module.
// Implements BUPERS Table 1-1 quota guards (EP/MP ceilings) and live
// Reporting Senior Cumulative Average (RSCA) delta forecasting.

import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { RscaHistoricalRecord, Evaluation } from "@/types";
import {
  Calculator,
  Save,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Users,
  Award,
  ChevronRight,
} from "lucide-react";

export const RscaMatrix: React.FC = () => {
  // Query RSCA records and active evaluations
  const rscaRecords = useLiveQuery(() => db.rsca_records.toArray(), []);
  const evaluations = useLiveQuery(() => db.evaluations.toArray(), []);

  const [selectedPaygrade, setSelectedPaygrade] = useState("E6");
  const [seniorName, setSeniorName] = useState("KIRK, JAMES T");
  const [seniorDodId, setSeniorDodId] = useState("9876543210");

  // Historical Baseline
  const currentRscaRecord = rscaRecords?.find(
    (r) => r.paygrade === selectedPaygrade && r.reporting_senior_dod_id === seniorDodId
  );

  const [historicalMarks, setHistoricalMarks] = useState<number>(382.4);
  const [historicalCount, setHistoricalCount] = useState<number>(98);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state if record loaded
  React.useEffect(() => {
    if (currentRscaRecord) {
      setHistoricalMarks(currentRscaRecord.historical_total_marks);
      setHistoricalCount(currentRscaRecord.historical_report_count);
    }
  }, [currentRscaRecord]);

  const currentRsca = historicalCount > 0 ? (historicalMarks / historicalCount).toFixed(2) : "0.00";

  // Filter batch evaluations matching selected paygrade
  const batchEvals = evaluations?.filter((e) => e.grade_rate.includes(selectedPaygrade)) || [];
  const batchCount = batchEvals.length;
  const batchMarks = batchEvals.reduce((acc, e) => acc + (e.trait_average || 0), 0);
  const batchAvg = batchCount > 0 ? (batchMarks / batchCount).toFixed(2) : "0.00";

  // Projected New RSCA
  const totalProjectedMarks = historicalMarks + batchMarks;
  const totalProjectedCount = historicalCount + batchCount;
  const projectedRsca =
    totalProjectedCount > 0 ? (totalProjectedMarks / totalProjectedCount).toFixed(2) : "0.00";
  const rscaShift = (parseFloat(projectedRsca) - parseFloat(currentRsca)).toFixed(2);

  // Table 1-1 Early Promote Maximum Limit (Enlisted)
  // For E-5/E-6: 20% EP limit, rounded UP to nearest whole number
  const epLimit = batchCount > 0 ? Math.max(1, Math.ceil(batchCount * 0.2)) : 0;
  const mpLimit = batchCount > 0 ? Math.max(1, Math.ceil(batchCount * 0.5)) : 0;

  const currentEpCount = batchEvals.filter((e) => e.promotion_recommendation === "Early Promote").length;
  const currentMpCount = batchEvals.filter((e) => e.promotion_recommendation === "Must Promote").length;
  const isEpOverQuota = currentEpCount > epLimit;

  const handleSaveRscaBaseline = async () => {
    const record: RscaHistoricalRecord = {
      id: currentRscaRecord?.id || `rsca-${seniorDodId}-${selectedPaygrade}`,
      reporting_senior_name: seniorName,
      reporting_senior_dod_id: seniorDodId,
      paygrade: selectedPaygrade,
      historical_total_marks: historicalMarks,
      historical_report_count: historicalCount,
      calculated_rsca: parseFloat(currentRsca),
      last_updated: new Date().toISOString(),
    };

    await db.rsca_records.put(record);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                Command Triad Tool
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                BUPERS Table 1-1 Quota Guard
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Summary Group & RSCA Matrix
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Forecasts how your current evaluation cycle shifts your permanent Reporting Senior Cumulative Average (RSCA) and enforces official BUPERS promotion recommendation ceilings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedPaygrade}
              onChange={(e) => setSelectedPaygrade(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white"
            >
              <option value="E5">E-5 Summary Group</option>
              <option value="E6">E-6 Summary Group</option>
              <option value="E7">E-7 (CHIEFEVAL)</option>
              <option value="E8">E-8 (CHIEFEVAL)</option>
              <option value="E9">E-9 (CHIEFEVAL)</option>
              <option value="O3">O-3 (FITREP)</option>
              <option value="O4">O-4 (FITREP)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Quota & RSCA Projection Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Current Historical RSCA */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Reporting Senior RSCA
          </span>
          <div className="text-3xl font-bold font-mono text-slate-900 dark:text-white mt-2">
            {currentRsca}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Based on {historicalCount} historical reports
          </p>
        </div>

        {/* Card 2: Current Batch Average */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Cycle Batch Trait Avg
          </span>
          <div className="text-3xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-2">
            {batchAvg}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {batchCount} reports in current {selectedPaygrade} group
          </p>
        </div>

        {/* Card 3: Projected RSCA Shift */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Projected RSCA Post-Sign
          </span>
          <div className="text-3xl font-bold font-mono text-slate-900 dark:text-white mt-2 flex items-center gap-2">
            {projectedRsca}
            <span
              className={`text-xs px-2 py-0.5 rounded font-sans font-semibold ${
                parseFloat(rscaShift) >= 0
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              }`}
            >
              {parseFloat(rscaShift) >= 0 ? `+${rscaShift}` : rscaShift}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Net cumulative movement across {totalProjectedCount} total
          </p>
        </div>

        {/* Card 4: Early Promote Quota Status */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Table 1-1 EP Quota
          </span>
          <div className="text-2xl font-bold mt-2">
            <span className={isEpOverQuota ? "text-red-600" : "text-emerald-600"}>
              {currentEpCount} awarded
            </span>
            <span className="text-slate-400 text-sm font-normal"> / max {epLimit}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isEpOverQuota ? (
              <span className="text-red-600 font-semibold">OVER QUOTA — Will be rejected</span>
            ) : (
              "Within BUPERS ceiling"
            )}
          </p>
        </div>
      </div>

      {/* Baseline Manager (Reporting Senior Ledger Configuration) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-4 h-4 text-blue-600" />
              Reporting Senior Historical Baseline Ledger
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Input your historical marks and report count for {selectedPaygrade} from your official BUPERS summary sheet.
            </p>
          </div>

          <button
            onClick={handleSaveRscaBaseline}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saveSuccess ? "Baseline Saved!" : "Save Baseline to Workspace"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4 text-xs">
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Reporting Senior Name
            </label>
            <input
              type="text"
              value={seniorName}
              onChange={(e) => setSeniorName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Reporting Senior DoD ID
            </label>
            <input
              type="text"
              value={seniorDodId}
              onChange={(e) => setSeniorDodId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Historical Cumulative Total Marks
            </label>
            <input
              type="number"
              step="0.1"
              value={historicalMarks}
              onChange={(e) => setHistoricalMarks(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-medium">
              Historical Total Reports Signed
            </label>
            <input
              type="number"
              value={historicalCount}
              onChange={(e) => setHistoricalCount(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
            />
          </div>
        </div>
      </div>

      {/* Cohort Breakout Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Current {selectedPaygrade} Summary Group Roster
          </h2>
          <span className="text-xs text-slate-500">
            Sorted by Individual Trait Average (Breakout Order)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-xs uppercase font-medium">
              <tr>
                <th className="px-4 py-3">Member Name</th>
                <th className="px-4 py-3">Rate / Designator</th>
                <th className="px-4 py-3">Period To</th>
                <th className="px-4 py-3">Trait Avg</th>
                <th className="px-4 py-3">Delta vs RSCA ({currentRsca})</th>
                <th className="px-4 py-3">Promotion Rec</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {batchEvals.length > 0 ? (
                batchEvals
                  .slice()
                  .sort((a, b) => (b.trait_average || 0) - (a.trait_average || 0))
                  .map((m, index) => {
                    const delta = (m.trait_average || 0) - parseFloat(currentRsca);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                          <span className="w-5 text-center text-xs font-mono text-slate-400">
                            #{index + 1}
                          </span>
                          {m.member_name}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                          {m.grade_rate} {m.designator ? `(${m.designator})` : ""}
                        </td>
                        <td className="px-4 py-3.5 text-xs font-mono text-slate-600 dark:text-slate-400">
                          {m.period_to}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {m.trait_average ? m.trait_average.toFixed(2) : "0.00"}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`text-xs font-mono font-bold ${
                              delta >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                              m.promotion_recommendation === "Early Promote"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                : m.promotion_recommendation === "Must Promote"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {m.promotion_recommendation}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right text-xs">
                          <span className="text-slate-500 capitalize">{m.status.replace("_", " ")}</span>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No active evaluations match paygrade {selectedPaygrade}. Create reports in the Evaluations tab to populate this group.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
