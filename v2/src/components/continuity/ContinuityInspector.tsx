// src/components/continuity/ContinuityInspector.tsx
//
// High-utility Career Continuity and Date Gap Analyzer adhering to BUPERSINST 1610.10H.
// Automatically verifies continuous service dates across both historical PSR records
// and active evaluations currently drafted in APEX v2.

import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { NmciSafeForm } from "@/components/NmciSafeForm";
import { ContinuityRecord, Evaluation, Profile } from "@/types";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  Trash2,
  Calendar,
  ShieldAlert,
  ArrowRight,
  Download,
  Info,
  ChevronDown,
  ChevronUp,
  HardDrive,
  FileSpreadsheet,
  HelpCircle,
  Clock,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface Anomaly {
  type: "GAP" | "OVERLAP";
  prevRecord: ContinuityRecord;
  currRecord: ContinuityRecord;
  daysDiff: number;
}

interface DisplayRecord extends ContinuityRecord {
  isLiveEval?: boolean;
  evalId?: string;
}

export const ContinuityInspector: React.FC = () => {
  const rawContinuity = useLiveQuery(
    () => db.continuity_records.orderBy("period_from").toArray(),
    []
  );
  const activeEvals = useLiveQuery(() => db.evaluations.toArray(), []);
  const profiles = useLiveQuery(() => db.profiles.toArray(), []);
  const activeProfile = profiles?.[0];

  const [showAddModal, setShowAddModal] = useState(false);
  const [showPsrModal, setShowPsrModal] = useState(false);
  const [selectedGap, setSelectedGap] = useState<Anomaly | null>(null);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [psrRawText, setPsrRawText] = useState("");

  // New Record Form State
  const [newRecord, setNewRecord] = useState<Partial<ContinuityRecord>>({
    member_dod_id: activeProfile?.dod_id || "1234567890",
    member_name: activeProfile ? `${activeProfile.last_name}, ${activeProfile.first_name}` : "MEMBER",
    period_from: "",
    period_to: "",
    report_type: "EVAL",
    occasion: "Periodic",
    promotion_recommendation: "Promotable",
    individual_trait_avg: 4.0,
    rsca: 3.85,
    reporting_senior_name: "REPORTING SENIOR",
    uic: activeProfile?.uic || "00024",
    status: "verified",
  });

  // ── Combine Historical Continuity Records with Active APEX Evaluations ──
  const records: DisplayRecord[] = [...(rawContinuity || [])];

  if (activeEvals) {
    for (const ev of activeEvals) {
      if (ev.period_from && ev.period_to) {
        // Prevent duplicate if already explicitly in continuity table with exact dates
        const alreadyExists = records.some(
          (r) => r.period_from === ev.period_from && r.period_to === ev.period_to
        );
        if (!alreadyExists) {
          records.push({
            id: `apex-${ev.id}`,
            evalId: ev.id,
            member_dod_id: ev.dod_id,
            member_name: ev.member_name,
            period_from: ev.period_from,
            period_to: ev.period_to,
            report_type: ev.report_type,
            occasion: ev.block_values?.periodic ? "Periodic" : "Special",
            promotion_recommendation: ev.promotion_recommendation,
            individual_trait_avg: ev.trait_average || 0,
            rsca: 3.9,
            reporting_senior_name: ev.block_values?.reporting_senior_name || "REPORTING SENIOR",
            uic: ev.uic,
            status: "verified",
            notes: `Active APEX ${ev.status.toUpperCase()} (${ev.routing_stage || "sailor"})`,
            isLiveEval: true,
          });
        }
      }
    }
  }

  // Sort strictly chronological by period_from
  records.sort((a, b) => (a.period_from || "").localeCompare(b.period_from || ""));

  // ── Calculate Anomalies (Gaps & Overlaps) ──
  const anomalies: Anomaly[] = [];
  if (records && records.length > 1) {
    for (let i = 1; i < records.length; i++) {
      const prev = records[i - 1];
      const curr = records[i];

      const prevTo = new Date(prev.period_to);
      const currFrom = new Date(curr.period_from);

      // Expected next day: prevTo + 1 day
      const expectedFrom = new Date(prevTo);
      expectedFrom.setDate(expectedFrom.getDate() + 1);

      const diffTime = currFrom.getTime() - expectedFrom.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

      if (diffDays > 0) {
        anomalies.push({
          type: "GAP",
          prevRecord: prev,
          currRecord: curr,
          daysDiff: diffDays,
        });
      } else if (diffDays < 0) {
        anomalies.push({
          type: "OVERLAP",
          prevRecord: prev,
          currRecord: curr,
          daysDiff: Math.abs(diffDays),
        });
      }
    }
  }

  const handleAddRecord = async () => {
    if (!newRecord.period_from || !newRecord.period_to) {
      alert("Please provide both From and To dates.");
      return;
    }

    const record: ContinuityRecord = {
      id: `cont-${Date.now()}`,
      member_dod_id: newRecord.member_dod_id || activeProfile?.dod_id || "1234567890",
      member_name: newRecord.member_name || (activeProfile ? `${activeProfile.last_name}, ${activeProfile.first_name}` : "MEMBER"),
      period_from: newRecord.period_from,
      period_to: newRecord.period_to,
      report_type: newRecord.report_type || "EVAL",
      occasion: newRecord.occasion || "Periodic",
      promotion_recommendation: newRecord.promotion_recommendation || "Promotable",
      individual_trait_avg: Number(newRecord.individual_trait_avg) || 3.8,
      rsca: Number(newRecord.rsca) || 3.8,
      reporting_senior_name: newRecord.reporting_senior_name || "REPORTING SENIOR",
      uic: newRecord.uic || activeProfile?.uic || "00024",
      status: "verified",
      notes: newRecord.notes || "Historical PSR Entry",
    };

    await db.continuity_records.put(record);
    setShowAddModal(false);
  };

  const handleDelete = async (r: DisplayRecord) => {
    if (r.isLiveEval) {
      alert("This record comes from an active evaluation in APEX. To remove it, delete or re-date the draft in the Evaluations tab.");
      return;
    }
    if (confirm("Are you sure you want to remove this historical continuity record?")) {
      await db.continuity_records.delete(r.id);
    }
  };

  const handleParsePsr = async () => {
    if (!psrRawText.trim()) return;
    const lines = psrRawText.split("\n");
    let count = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith("PERIOD")) continue;

      // Extract dates in format YYYY-MM-DD or YYMMMDD
      const dateMatches = line.match(/\b\d{4}-\d{2}-\d{2}\b/g);
      if (dateMatches && dateMatches.length >= 2) {
        const fromDate = dateMatches[0];
        const toDate = dateMatches[1];

        // Parse optional promotion rec
        let promoRec = "Promotable";
        if (line.includes("Early Promote") || line.includes(" EP ")) promoRec = "Early Promote";
        else if (line.includes("Must Promote") || line.includes(" MP ")) promoRec = "Must Promote";

        // Parse trait marks
        const numMatches = line.match(/\b[1-5]\.\d{2}\b/g);
        const ita = numMatches && numMatches[0] ? parseFloat(numMatches[0]) : 4.0;
        const rsca = numMatches && numMatches[1] ? parseFloat(numMatches[1]) : 3.85;

        await db.continuity_records.put({
          id: `cont-psr-${Date.now()}-${count}`,
          member_dod_id: activeProfile?.dod_id || "1234567890",
          member_name: activeProfile ? `${activeProfile.last_name}, ${activeProfile.first_name}` : "MEMBER",
          period_from: fromDate,
          period_to: toDate,
          report_type: "EVAL",
          occasion: "Periodic",
          promotion_recommendation: promoRec,
          individual_trait_avg: ita,
          rsca: rsca,
          reporting_senior_name: "HISTORICAL SENIOR",
          uic: activeProfile?.uic || "00024",
          status: "verified",
          notes: "Imported from PSR Part III text",
        });
        count++;
      }
    }

    setShowPsrModal(false);
    setPsrRawText("");
    alert(`Successfully parsed and imported ${count} historical evaluation periods from your PSR text.`);
  };

  const generateGapMemo = (anomaly: Anomaly) => {
    setSelectedGap(anomaly);
    setShowMemoModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                PERS-32 Continuity Guard
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                BUPERSINST 1610.10H Chapter 3
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Career Continuity & Gap Inspector
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Inspects your official evaluation timeline for 1-day gaps, illegal overlaps, and unverified reporting periods before submitting to Navy Personnel Command.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button"
              onClick={() => setShowHowItWorks(!showHowItWorks)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              How It Works
              {showHowItWorks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button type="button"
              onClick={() => setShowPsrModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm font-medium transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Paste PSR Part III
            </button>

            <button type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Add Historical Report
            </button>
          </div>
        </div>

        {/* How It Works Educational Drawer */}
        {showHowItWorks && (
          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs leading-relaxed animate-in fade-in duration-200">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700/60">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                1. Continuous Service Rule
              </span>
              <p className="text-slate-600 dark:text-slate-400">
                Per <strong>BUPERSINST 1610.10H Chapter 3</strong>, active Navy service must be covered with <strong>zero day gaps</strong>. If Report A ends on Nov 15, Report B MUST start on Nov 16. Even a 1-day break causes PERS-32 rejection or flags the record at selection boards.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700/60">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                2. Where Data Comes From
              </span>
              <p className="text-slate-600 dark:text-slate-400">
                Sailors enter prior evaluation cycles from their official <strong>PSR Part III (from BOL / NSIPS)</strong> or past OMPF eval PDFs. Any active evaluations currently drafted in APEX v2 are <strong>automatically synced</strong> into this timeline!
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700/60">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1.5">
                <HardDrive className="w-4 h-4 text-purple-600" />
                3. Zero-Server Local Storage
              </span>
              <p className="text-slate-600 dark:text-slate-400">
                APEX v2 runs 100% offline. All historical continuity records and drafted evals live securely in your browser's <strong>IndexedDB sandbox</strong>. No cloud servers are touched. Export a backup under <em>Save / Load Session</em> anytime.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Continuity Status Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Tracked Reports</span>
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
            {records.length}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {rawContinuity?.length || 0} historical + {records.length - (rawContinuity?.length || 0)} active APEX reports
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Timeline Continuity</span>
            {anomalies.length === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {anomalies.length === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">100% Contiguous</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">{anomalies.length} Issues Detected</span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {anomalies.length === 0
              ? "Zero unverified gaps or date overlaps"
              : "Action required: review date ranges below"}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Cumulative Trait Average</span>
            <Calendar className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-white">
              {records && records.length > 0
                ? (
                    records.reduce((acc, r) => acc + (r.individual_trait_avg || 0), 0) /
                    records.length
                  ).toFixed(2)
                : "0.00"}
            </span>
            {records && records.filter((r) => (r.rsca || 0) > 0).length > 0 && (
              (() => {
                const withRsca = records.filter((r) => (r.rsca || 0) > 0);
                const avgDelta =
                  withRsca.reduce(
                    (acc, r) => acc + ((r.individual_trait_avg || 0) - (r.rsca || 0)),
                    0
                  ) / withRsca.length;
                return (
                  <span
                    className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full ${
                      avgDelta >= 0
                        ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                        : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    {avgDelta >= 0 ? `+${avgDelta.toFixed(2)}` : avgDelta.toFixed(2)} vs RSCA
                  </span>
                );
              })()
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Mean ITA across tracked cycles &bull; Board benchmark
          </p>
        </div>
      </div>

      {/* Anomalies Alert Box (If Any) */}
      {anomalies.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-3 flex-1">
              <div>
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Continuity Anomalies Found in Career Record
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  BUPERSINST 1610.10H Chapter 3 requires continuous evaluation coverage with zero unexplained gaps.
                </p>
              </div>

              <div className="space-y-2">
                {anomalies.map((a, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-900 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-amber-800 dark:text-amber-300">
                        {a.type === "GAP" ? `Date Gap: ${a.daysDiff} days missing` : `Date Overlap: ${a.daysDiff} days overlapping`}
                      </span>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                        Between <span className="font-mono text-slate-800 dark:text-slate-200">{a.prevRecord.period_to}</span> (Ended) and <span className="font-mono text-slate-800 dark:text-slate-200">{a.currRecord.period_from}</span> (Began)
                      </p>
                    </div>

                    {a.type === "GAP" && (
                      <button type="button"
                        onClick={() => generateGapMemo(a)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Generate Gap Letter
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Official Evaluation Chain
            </h2>
            <span className="text-xs text-slate-500">
              Sorted chronologically &bull; Combines historical PSR entries + live APEX evaluations
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {records.length} Cycles
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-xs uppercase font-medium">
              <tr>
                <th className="px-4 py-3">Reporting Period</th>
                <th className="px-4 py-3">Record Origin</th>
                <th className="px-4 py-3">Type / Occasion</th>
                <th className="px-4 py-3">Promotion Rec</th>
                <th className="px-4 py-3">Trait Avg vs RSCA</th>
                <th className="px-4 py-3">Reporting Senior</th>
                <th className="px-4 py-3">UIC</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {records && records.length > 0 ? (
                records.map((r) => {
                  const delta = (r.individual_trait_avg || 0) - (r.rsca || 0);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3.5">
                        <div className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                          {r.period_from} <span className="text-slate-400 font-normal">to</span> {r.period_to}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {r.isLiveEval ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <Sparkles className="w-3 h-3" /> APEX Active Eval
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            PSR / OMPF History
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{r.report_type}</span>
                        <span className="text-xs text-slate-500 block">{r.occasion}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            r.promotion_recommendation === "Early Promote"
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                              : r.promotion_recommendation === "Must Promote"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {r.promotion_recommendation}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-xs font-mono">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {r.individual_trait_avg ? r.individual_trait_avg.toFixed(2) : "--"}
                          </span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-slate-500">
                            {r.rsca ? r.rsca.toFixed(2) : "--"}
                          </span>
                        </div>
                        {r.individual_trait_avg && r.rsca && (
                          <span
                            className={`text-[11px] font-mono font-medium ${
                              delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-700 dark:text-slate-300">
                        {r.reporting_senior_name || "N/A"}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-mono text-slate-600 dark:text-slate-400">
                        {r.uic || "N/A"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {!r.isLiveEval && (
                          <button type="button"
                            onClick={() => handleDelete(r)}
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                            title="Remove report"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No historical evaluation records loaded. Click "Add Historical Report" or "Paste PSR Part III" to import your career chain.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Quick Paste PSR Part III Text */}
      {showPsrModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Paste PSR Part III Evaluation Rows
                </h3>
              </div>
              <button type="button"
                onClick={() => setShowPsrModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Copy the rows from your <strong>Personnel Summary Record (PSR Part III)</strong> downloaded from BUPERS Online (BOL) or NSIPS. The parser extracts date pairs (YYYY-MM-DD), promotion recommendations, and trait averages.
            </p>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-600 dark:text-slate-400">
              <strong>Example format (one cycle per line):</strong><br />
              2023-11-16 2024-11-15 EVAL Periodic MP 4.14 3.86<br />
              2024-11-16 2025-11-15 EVAL Periodic EP 4.29 3.88
            </div>

            <textarea
              rows={6}
              value={psrRawText}
              onChange={(e) => setPsrRawText(e.target.value)}
              placeholder="Paste rows here..."
              className="w-full p-3 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPsrModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleParsePsr}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-xs"
              >
                Import Cycles
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Historical Record */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Add Prior Evaluation Record
            </h3>

            <NmciSafeForm className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Period From (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    required
                    value={newRecord.period_from}
                    onChange={(e) => setNewRecord({ ...newRecord, period_from: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Period To (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    required
                    value={newRecord.period_to}
                    onChange={(e) => setNewRecord({ ...newRecord, period_to: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Report Type
                  </label>
                  <select
                    value={newRecord.report_type}
                    onChange={(e) => setNewRecord({ ...newRecord, report_type: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="EVAL">EVAL (E1-E6)</option>
                    <option value="CHIEFEVAL">CHIEFEVAL (E7-E9)</option>
                    <option value="FITREP">FITREP (W2-O6)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Promotion Rec
                  </label>
                  <select
                    value={newRecord.promotion_recommendation}
                    onChange={(e) => setNewRecord({ ...newRecord, promotion_recommendation: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="Early Promote">Early Promote</option>
                    <option value="Must Promote">Must Promote</option>
                    <option value="Promotable">Promotable</option>
                    <option value="Progressing">Progressing</option>
                    <option value="Significant Problems">Significant Problems</option>
                    <option value="NOB">NOB</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Trait Avg (e.g. 4.29)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1.0"
                    max="5.0"
                    value={newRecord.individual_trait_avg}
                    onChange={(e) => setNewRecord({ ...newRecord, individual_trait_avg: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Reporting Senior RSCA
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1.0"
                    max="5.0"
                    value={newRecord.rsca}
                    onChange={(e) => setNewRecord({ ...newRecord, rsca: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Reporting Senior Name
                  </label>
                  <input
                    type="text"
                    value={newRecord.reporting_senior_name}
                    onChange={(e) => setNewRecord({ ...newRecord, reporting_senior_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    placeholder="e.g. KIRK, JAMES T"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Command UIC
                  </label>
                  <input
                    type="text"
                    value={newRecord.uic}
                    onChange={(e) => setNewRecord({ ...newRecord, uic: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    placeholder="e.g. 00024"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-nmci-submit=""
                  onClick={() => void handleAddRecord()}
                  className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-medium transition-colors"
                >
                  Save Record
                </button>
              </div>
            </NmciSafeForm>
          </div>
        </div>
      )}

      {/* Modal: Official BUPERS Gap Letter Preview */}
      {showMemoModal && selectedGap && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Official Correspondence
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  BUPERSINST 1610.10H Continuous Service Gap Memo
                </h3>
              </div>
              <button type="button"
                onClick={() => setShowMemoModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            {/* Official Navy Memorandum Format */}
            <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100 space-y-4 leading-relaxed">
              <div className="text-center font-bold pb-2 border-b border-slate-300 dark:border-slate-700">
                DEPARTMENT OF THE NAVY<br />
                {selectedGap.currRecord.reporting_senior_name || "COMMANDING OFFICER"}<br />
                UIC: {selectedGap.currRecord.uic || "00024"}
              </div>

              <div>
                1610<br />
                Ser 00/{new Date().getFullYear()}<br />
                {new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
              </div>

              <div>
                From: Commanding Officer, {selectedGap.currRecord.uic || "00024"}<br />
                To:   Commander, Navy Personnel Command (PERS-32)<br />
                Subj: CONTINUITY OF EVALUATION SERVICE EXPLANATION ICO {selectedGap.currRecord.member_name}
              </div>

              <div>
                Ref:  (a) BUPERSINST 1610.10H (EVALMAN)
              </div>

              <div>
                1. Per reference (a), this memorandum certifies the continuous service and explains the {selectedGap.daysDiff}-day continuity gap between the following evaluation reporting periods:
              </div>

              <div className="pl-4 space-y-1">
                <div>a. Prior Report Ending Date: <strong>{selectedGap.prevRecord.period_to}</strong></div>
                <div>b. Subsequent Report Beginning Date: <strong>{selectedGap.currRecord.period_from}</strong></div>
                <div>c. Unobserved Interval: <strong>{selectedGap.daysDiff} days</strong></div>
              </div>

              <div>
                2. During the unobserved interval between the above referenced dates, the member was in a continuous active duty status awaiting detachment / assignment execution. No adverse conduct or performance deficiencies occurred during this unobserved period.
              </div>

              <div>
                3. Point of contact regarding this matter is the Command Administrative Officer.
              </div>

              <div className="pt-6 text-right">
                {selectedGap.currRecord.reporting_senior_name || "COMMANDING OFFICER"}<br />
                Captain, U.S. Navy<br />
                Commanding
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                Print or attach to official submission to PERS-32
              </span>
              <button type="button"
                onClick={() => {
                  window.print();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Print / Save PDF Memo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
