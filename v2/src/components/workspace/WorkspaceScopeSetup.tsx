import React, { useState } from "react";
import { establishWorkspace, roleForScope } from "@/lib/workspaceScope";
import type { HolderRole, WorkspaceScope } from "@/lib/workspaceSession";

const CHOICES: Array<{ scope: WorkspaceScope; title: string; detail: string }> = [
  {
    scope: "member",
    title: "Sailor",
    detail: "One workspace for your own report. Group figures arrive with the debrief copy.",
  },
  {
    scope: "reviewer",
    title: "Rater or Senior Rater",
    detail: "The reports routed to you. One file can hold several sailors, each as their own report.",
  },
  {
    scope: "command",
    title: "Reporting Senior",
    detail: "The summary group. This file is the only copy that holds every report.",
  },
];

export const WorkspaceScopeSetup: React.FC = () => {
  const [scope, setScope] = useState<WorkspaceScope>("member");
  const [reviewerRole, setReviewerRole] = useState<HolderRole>("Rater");
  const [holderName, setHolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await establishWorkspace({
        scope,
        holderName,
        holderRole: roleForScope(scope, reviewerRole),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create the workspace.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Choose this workspace</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
          A summary group uses three kinds of file. This choice is stored in the workspace file. It is not an account.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CHOICES.map((choice) => (
          <button
            key={choice.scope}
            type="button"
            onClick={() => setScope(choice.scope)}
            className={`text-left rounded-xl border p-4 ${
              scope === choice.scope
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            }`}
          >
            <div className="font-bold text-slate-900 dark:text-white">{choice.title}</div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">{choice.detail}</p>
          </button>
        ))}
      </div>
      {scope === "reviewer" && (
        <div className="flex gap-2">
          {(["Rater", "Senior Rater"] as HolderRole[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setReviewerRole(role)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                reviewerRole === role
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      )}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
        <label htmlFor="workspace-holder-name" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
          Name on this workspace
        </label>
        <input
          id="workspace-holder-name"
          value={holderName}
          onChange={(event) => setHolderName(event.target.value)}
          placeholder="FRANKLYN, DAIN A"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
        >
          {saving ? "Saving..." : "Create workspace"}
        </button>
      </div>
    </div>
  );
};
