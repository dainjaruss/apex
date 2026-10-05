// src/components/workspace/WorkspaceManager.tsx
//
// Session Persistence & Workspace Backup Module.
// Lets Sailors and Reporting Seniors save their entire session to a single
// portable .apex file to resume on any NMCI computer or share with admin.

import React, { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, seedInitialDataIfEmpty } from "@/lib/db";
import { downloadWorkspaceCard, exportWorkspaceToFile, importWorkspaceFromFile } from "@/lib/sessionTransfer";
import { importWorkspaceCard } from "@/lib/workspaceScope";
import { useWorkspaceIdentity } from "@/lib/useWorkspaceIdentity";
import {
  downloadOpenWorkspace,
  importWorkspaceSqlite,
  isSqliteWorkspace,
  WorkspaceReplaceNeeded,
} from "@/lib/workspaceSqlite";
import {
  Download,
  Upload,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Shield,
} from "lucide-react";

export const WorkspaceManager: React.FC = () => {
  const identity = useWorkspaceIdentity();
  const evalCount = useLiveQuery(() => db.evaluations.count(), []);
  const contCount = useLiveQuery(() => db.continuity_records.count(), []);
  const rscaCount = useLiveQuery(() => db.rsca_records.count(), []);
  const roster = useLiveQuery(() => db.roster.toArray(), []);

  const [isExporting, setIsExporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadOpenWorkspace("APEX_Navy_Workspace");
      setImportStatus("Saved the open workspace as a SQLite file.");
    } catch (err: any) {
      setImportStatus(`Save Error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleJsonExport = async () => {
    setIsExporting(true);
    try {
      await exportWorkspaceToFile("APEX_Navy_Workspace");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isSqliteWorkspace(bytes)) {
        setImportStatus("Opening workspace file...");
        try {
          const result = await importWorkspaceSqlite(bytes);
          setImportStatus(
            `Opened workspace: ${result.evalCount} evaluations, ${result.continuityCount} continuity records, ${result.rscaCount} RSCA records.`,
          );
        } catch (err: any) {
          if (err instanceof WorkspaceReplaceNeeded && confirm(`${err.message} Continue?`)) {
            const result = await importWorkspaceSqlite(bytes, { force: true });
            setImportStatus(
              `Opened workspace: ${result.evalCount} evaluations, ${result.continuityCount} continuity records, ${result.rscaCount} RSCA records.`,
            );
          } else if (!(err instanceof WorkspaceReplaceNeeded)) {
            throw err;
          } else {
            setImportStatus("Left the open workspace in place.");
          }
        }
      } else {
        setImportStatus("Importing workspace data...");
        const result = await importWorkspaceFromFile(file);
        setImportStatus(
          `Successfully restored: ${result.evalCount} evaluations, ${result.continuityCount} continuity records, ${result.rscaCount} RSCA records!`
        );
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setImportStatus(`Import Error: ${err.message}`);
    }
  };

  const handleCardExport = () => {
    try {
      downloadWorkspaceCard();
      setImportStatus("Saved this workspace card. It has no report in it.");
    } catch (err: unknown) {
      setImportStatus(`Card error: ${err instanceof Error ? err.message : "Could not export the card."}`);
    }
  };

  const handleCardSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const entry = await importWorkspaceCard(file);
      setImportStatus(`Roster now includes ${entry.holder_name} (${entry.holder_role}).`);
    } catch (err: unknown) {
      setImportStatus(`Card error: ${err instanceof Error ? err.message : "Could not import the card."}`);
    } finally {
      if (cardInputRef.current) cardInputRef.current.value = "";
    }
  };

  const handleResetData = async () => {
    const reseed = identity?.scope === "command";
    const confirmed = confirm(
      reseed
        ? "Reset the command workspace to the demo records? Save the .sqlite file first if you need this roster."
        : "Clear the reports in this workspace? Save the .sqlite file first if you need this report.",
    );
    if (!confirmed) return;
    await db.evaluations.clear();
    await db.continuity_records.clear();
    await db.rsca_records.clear();
    await db.summary_groups.clear();
    await db.roster.clear();
    if (reseed) await seedInitialDataIfEmpty();
    alert(reseed ? "Command workspace reset to the demo records." : "Reports in this workspace were cleared.");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
            Zero-Server Persistence
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            NMCI / Flank Speed Resilient
          </span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
          Workspace Session & Data Management
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
          Save your complete APEX session (reports, RSCA baselines, and continuity timelines) to a portable file to continue your work on any NMCI computer or share with your admin department.
        </p>
      </div>

      {/* Main Storage Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Save Workspace File */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Save Complete Workspace
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Writes the open workspace to a <code className="font-mono text-blue-600 font-semibold">.sqlite</code> file. That file is the record you keep or hand to the next person. One person saves it at a time.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1 font-mono text-slate-600 dark:text-slate-400">
              <div>Evaluations: <span className="font-bold text-slate-900 dark:text-white">{evalCount ?? 0}</span></div>
              <div>Continuity Chain: <span className="font-bold text-slate-900 dark:text-white">{contCount ?? 0}</span></div>
              <div>RSCA Baselines: <span className="font-bold text-slate-900 dark:text-white">{rscaCount ?? 0}</span></div>
            </div>
          </div>

          <button type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Packaging File..." : "Save Workspace (.sqlite)"}
          </button>
          <button type="button"
            onClick={handleJsonExport}
            disabled={isExporting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 text-xs font-medium"
          >
            Download JSON copy (.apex)
          </button>
        </div>

        {/* Card 2: Load Workspace File */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Load Workspace Session
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Select a <code className="font-mono text-emerald-600 font-semibold">.sqlite</code> workspace file to replace the open workspace. A JSON <code className="font-mono text-emerald-600 font-semibold">.apex</code> file still loads too.
              </p>
            </div>

            {importStatus && (
              <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 p-3 rounded-lg text-xs text-emerald-800 dark:text-emerald-300">
                {importStatus}
              </div>
            )}
          </div>

          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".sqlite,.apex,.json"
              className="hidden"
            />
            <button type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Select File to Load
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
          <FileCheck className="w-5 h-5 text-blue-600" />
          Workspace card
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          The card is this file's address: a name, a role, and an id. It contains no report and no ranking. The command workspace imports each sailor's card onto the roster.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCardExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white rounded-lg text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            Export workspace card
          </button>
          {identity?.scope === "command" && (
            <button
              type="button"
              onClick={() => cardInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold"
            >
              <Upload className="w-3.5 h-3.5" />
              Import workspace card
            </button>
          )}
        </div>
        <input
          type="file"
          ref={cardInputRef}
          onChange={(event) => void handleCardSelect(event)}
          accept=".json"
          className="hidden"
        />
        {identity?.scope === "command" && (
          <ul className="text-xs font-mono text-slate-600 dark:text-slate-300 space-y-1">
            {roster && roster.length > 0 ? (
              roster.map((entry) => (
                <li key={entry.id}>
                  {entry.holder_name} · {entry.holder_role} · {entry.id}
                </li>
              ))
            ) : (
              <li>No cards imported yet.</li>
            )}
          </ul>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
          <HardDrive className="w-5 h-5 text-blue-600" />
          Local workspace
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          This browser keeps the open workspace in IndexedDB. Save Workspace writes the .sqlite file you share. A forwarded report leaves as one .apex.json file and an Outlook draft. The next person loads it with Import Report.
        </p>
        <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-200 dark:border-slate-800">
          <span className="text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            IndexedDB Local Engine Active
          </span>
          <button type="button"
            onClick={handleResetData}
            className="text-xs text-red-600 hover:text-red-700 underline flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Local Data
          </button>
        </div>
      </div>
    </div>
  );
};
