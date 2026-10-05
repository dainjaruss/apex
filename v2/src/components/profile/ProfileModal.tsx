// src/components/profile/ProfileModal.tsx
//
// Modal for managing the active Sailor Profile, SSN, UIC, and Local Storage status.

import React, { useState } from "react";
import { Profile } from "@/types";
import { UIC_PATTERN } from "@/types/navpers";
import { db } from "@/lib/db";
import { User, HardDrive, ShieldCheck, Check, X, AlertCircle } from "lucide-react";
import { NmciSafeForm } from "@/components/NmciSafeForm";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfile: Profile;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  activeProfile,
}) => {
  const [formData, setFormData] = useState<Profile>({ ...activeProfile });
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const visibleRate = (formData.rate || formData.navy_rank || "").trim();
    const uic = (formData.uic || "").toUpperCase().trim();
    if (
      !formData.last_name.trim() ||
      !formData.first_name.trim() ||
      !visibleRate ||
      !uic
    ) {
      alert("Last name, first name, rate, and UIC are required.");
      return;
    }
    if (!UIC_PATTERN.test(uic)) {
      alert("UIC must be exactly 5 characters, and the first four must be numbers (for example 00024).");
      return;
    }
    await db.profiles.put({
      ...formData,
      last_name: formData.last_name.toUpperCase().trim(),
      first_name: formData.first_name.toUpperCase().trim(),
      middle_initial: (formData.middle_initial || "").toUpperCase().trim(),
      rate: (formData.rate || "").toUpperCase().trim(),
      uic,
      ship_station: (formData.ship_station || "").toUpperCase().trim(),
    });
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Sailor Profile & Local Storage
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure your identity for automatic block pre-filling and continuity tracking.
              </p>
            </div>
          </div>
          <button type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <NmciSafeForm className="p-6 space-y-5">
          {/* Storage Architecture Callout */}
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl flex items-start gap-3 text-xs text-blue-900 dark:text-blue-200">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Zero-Server Client-Side Storage</p>
              <p className="text-blue-700 dark:text-blue-300 leading-relaxed">
                APEX v2 operates 100% offline inside your browser sandbox using IndexedDB. No PII or evaluation data is ever transmitted to an external server. You can export/backup your full records under the <strong>Save / Load Session</strong> tab.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Last Name (Block 1)
              </label>
              <input
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg uppercase"
                placeholder="FRANKLYN"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                First Name (Block 1)
              </label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg uppercase"
                placeholder="DAIN"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                MI (Block 1)
              </label>
              <input
                type="text"
                maxLength={1}
                value={formData.middle_initial || ""}
                onChange={(e) => setFormData({ ...formData, middle_initial: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg uppercase text-center"
                placeholder="A"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Rate / Rank (Block 2)
              </label>
              <input
                type="text"
                required
                value={formData.rate || formData.navy_rank}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value, navy_rank: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg uppercase"
                placeholder="e.g. IT1, YN2, CPO, LCDR"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                SSN
              </label>
              <input
                type="text"
                maxLength={11}
                value={formData.dod_id}
                onChange={(e) => setFormData({ ...formData, dod_id: e.target.value.replace(/[^0-9-]/g, "") })}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder="000-00-0000"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Command UIC (Block 8)
              </label>
              <input
                type="text"
                maxLength={5}
                required
                value={formData.uic}
                onChange={(e) => setFormData({ ...formData, uic: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono uppercase bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder="e.g. 00024"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ship / Station (Block 9)
              </label>
              <input
                type="text"
                value={formData.ship_station || ""}
                onChange={(e) => setFormData({ ...formData, ship_station: e.target.value })}
                className="w-full px-3 py-2 text-sm uppercase bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder="e.g. NAVSEA WASHINGTON DC"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-blue-600" />
              IndexedDB: <code className="font-mono text-slate-700 dark:text-slate-300">ApexNavyLocalDB</code>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                data-nmci-submit=""
                onClick={() => void handleSave()}
                className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" /> Saved!
                  </>
                ) : (
                  "Update Profile"
                )}
              </button>
            </div>
          </div>
        </NmciSafeForm>
      </div>
    </div>
  );
};
