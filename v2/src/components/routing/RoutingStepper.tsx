// src/components/routing/RoutingStepper.tsx
//
// Visual BUPERS 5-Stage Routing Pipeline with Custody Handoffs,
// Pack & Route (.apex.json), and Outlook mailto notification.

import React, { useState } from "react";
import { Evaluation, RoutingStage, Profile } from "@/types";
import {
  ROUTING_STAGES,
  NEXT_STAGE_MAP,
  PREV_STAGE_MAP,
  executeEvaluationHandoff,
} from "@/lib/routingService";
import { exportSingleEvalTransfer } from "@/lib/sessionTransfer";
import {
  Send,
  RotateCcw,
  History,
  AlertTriangle,
  X,
  Mail,
  Package,
} from "lucide-react";

interface Props {
  evaluation: Evaluation;
  activeProfile: Profile;
  onEvaluationUpdated: (updated: Evaluation) => void;
}

export const RoutingStepper: React.FC<Props> = ({
  evaluation,
  activeProfile,
  onEvaluationUpdated,
}) => {
  const currentStage: RoutingStage = evaluation.routing_stage || "sailor";
  const currentStageIndex = ROUTING_STAGES.findIndex((s) => s.id === currentStage);

  const [modalMode, setModalMode] = useState<"FORWARD" | "RETURN" | "HISTORY" | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [routingNotes, setRoutingNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const nextStage = NEXT_STAGE_MAP[currentStage];
  const prevStage = PREV_STAGE_MAP[currentStage];

  const handleOpenForward = () => {
    // Sensible defaults based on next stage
    setRecipientName(
      nextStage === "rater"
        ? "SMITH, JOHN (LPO)"
        : nextStage === "senior_rater"
        ? "SPOCK, S. S. (DivO / CPO)"
        : nextStage === "reporting_senior"
        ? evaluation.block_values?.reporting_senior_name || "KIRK, JAMES T (CO)"
        : nextStage === "debrief"
        ? evaluation.member_name
        : "ADMIN OFFICER"
    );
    setRecipientEmail("shipmate@navy.mil");
    setRoutingNotes("");
    setStatusMessage(null);
    setModalMode("FORWARD");
  };

  const handleOpenReturn = () => {
    setRecipientName(
      prevStage === "sailor"
        ? evaluation.member_name
        : prevStage === "rater"
        ? "SMITH, JOHN (LPO)"
        : "SENIOR RATER"
    );
    setRecipientEmail("shipmate@navy.mil");
    setRoutingNotes("");
    setStatusMessage(null);
    setModalMode("RETURN");
  };

  const handleExecute = async () => {
    if (!recipientName.trim()) {
      alert("Please specify the recipient's name.");
      return;
    }

    if (modalMode === "RETURN" && !routingNotes.trim()) {
      alert("Please provide specific rework notes explaining the deficiencies.");
      return;
    }

    setIsProcessing(true);

    try {
      const result = await executeEvaluationHandoff({
        evaluation,
        action: modalMode as "FORWARD" | "RETURN",
        fromProfile: activeProfile,
        toHolderName: recipientName,
        toHolderEmail: recipientEmail,
        notes: routingNotes,
        mode: "PACK_AND_ROUTE",
        sendEmail,
      });

      onEvaluationUpdated(result.updatedEvaluation);

      if (sendEmail && result.mailtoUrl) {
        // Trigger Outlook email client
        window.location.href = result.mailtoUrl;
      }

      setModalMode(null);
    } catch (err: any) {
      alert(`Routing transition failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickPackDownload = async () => {
    try {
      await exportSingleEvalTransfer(evaluation.id);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Top Bar: Pipeline Stage & Custody Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              BUPERS Chain of Custody Pipeline
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
              <Package className="w-3 h-3 text-blue-500" />
              One report file
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              Current Custodian:
            </span>
            <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 px-2.5 py-0.5 rounded border border-blue-200 dark:border-blue-900">
              {evaluation.current_holder_name || evaluation.member_name} (
              {evaluation.current_holder_role || "Sailor"})
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Pack & Route download */}
          <button
            type="button"
            onClick={handleQuickPackDownload}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors"
            title="Download this one report as a .apex.json file"
          >
            <Package className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Export Report
          </button>

          <button
            type="button"
            onClick={() => setModalMode("HISTORY")}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            History ({evaluation.custody_chain?.length || 0})
          </button>

          {prevStage && (
            <button
              type="button"
              onClick={handleOpenReturn}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-semibold border border-amber-300 dark:border-amber-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Return with Notes
            </button>
          )}

          {nextStage && (
            <button
              type="button"
              onClick={handleOpenForward}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              Route Forward →
            </button>
          )}
        </div>
      </div>

      {/* Return Notes Banner (If Returned for Rework) */}
      {evaluation.return_notes && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg text-xs space-y-1">
          <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Returned by Senior Reviewer for Rework:</span>
          </div>
          <p className="text-amber-800 dark:text-amber-300 font-mono pl-5 italic">
            "{evaluation.return_notes}"
          </p>
        </div>
      )}

      {/* Pipeline 5-Stage Stepper Visualization */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-1">
        {ROUTING_STAGES.slice(0, 5).map((stage, idx) => {
          const isPassed = currentStageIndex > idx;
          const isCurrent = currentStageIndex === idx;

          return (
            <div
              key={stage.id}
              className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                isCurrent
                  ? "bg-blue-50 dark:bg-blue-950/50 border-blue-500 ring-2 ring-blue-500/20"
                  : isPassed
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-900/60"
                  : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isCurrent
                        ? "bg-blue-600 text-white"
                        : isPassed
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {isPassed ? "✓" : idx + 1}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    {stage.role}
                  </span>
                </div>
                <div
                  className={`text-xs font-bold ${
                    isCurrent
                      ? "text-blue-900 dark:text-blue-200"
                      : isPassed
                      ? "text-emerald-900 dark:text-emerald-200"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {stage.label}
                </div>
              </div>

              <div className="text-[10px] text-slate-500 mt-2 font-mono">
                {isCurrent ? "Active In-Review" : isPassed ? "Approved / Passed" : "Pending"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Forward / Return Transition */}
      {(modalMode === "FORWARD" || modalMode === "RETURN") && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {modalMode === "FORWARD"
                    ? "Forward Chain of Custody"
                    : "Return Evaluation with Notes"}
                </h3>
              </div>
              <button type="button"
                onClick={() => setModalMode(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-blue-900 dark:text-blue-200">
                <div className="font-bold flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-600" />
                  One report file
                </div>
                <p className="text-[11px] mt-0.5 text-blue-800 dark:text-blue-300">
                  Forwarding downloads this report. Outlook opens an email draft when email notification is checked. The next person loads it with Import Report.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Recipient Name & Title
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Recipient Official Navy Email (@navy.mil)
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="first.last.mil@us.navy.mil"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {modalMode === "FORWARD"
                    ? "Handoff Instructions / Notes (Optional)"
                    : "Rework Notes & Specific Deficiencies (Required)"}
                </label>
                <textarea
                  rows={3}
                  value={routingNotes}
                  onChange={(e) => setRoutingNotes(e.target.value)}
                  placeholder={
                    modalMode === "FORWARD"
                      ? "e.g. Ready for trait grading; verified PRT score and collateral bullets."
                      : "e.g. Block 43 line 4 exceeds line limits; please quantify impact metrics for C5ISR installation."
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              {/* Email Notification Option */}
              <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="font-medium flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  Generate & Send Official Navy CUI Email Notification (Outlook)
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleExecute}
                className="px-4 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {isProcessing
                  ? "Processing Handoff..."
                  : modalMode === "FORWARD"
                  ? "Confirm & Route Forward"
                  : "Confirm & Return Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Chain of Custody History */}
      {modalMode === "HISTORY" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Official Chain of Custody Log
                </h3>
              </div>
              <button type="button"
                onClick={() => setModalMode(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {evaluation.custody_chain && evaluation.custody_chain.length > 0 ? (
                evaluation.custody_chain.map((c, i) => (
                  <div
                    key={c.id || i}
                    className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-bold text-slate-900 dark:text-white capitalize">
                        {c.action.toUpperCase()} ➔ {c.stage}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(c.transitioned_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-400 font-mono">
                      From: <span className="font-semibold">{c.from_name}</span> | To:{" "}
                      <span className="font-semibold">{c.to_name}</span>
                    </div>
                    {c.notes && (
                      <div className="text-slate-700 dark:text-slate-300 font-mono italic pt-1 border-t border-slate-200 dark:border-slate-700/50">
                        "{c.notes}"
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No custody transitions recorded yet. Report is currently in initial draft stage.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
              >
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
