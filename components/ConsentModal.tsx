"use client";

import { useState, useEffect } from "react";

function ConsentHeader() {
  return (
    <div className="space-y-2 border-b border-[#3e6e99]/20 pb-4">
      <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
        <span>🔒</span> Welcome to APEX – Terms & Consent
      </h2>
      <p className="text-sm text-[#91aec9]">
        Before entering this application, please review our system access terms.
        By continuing, you agree to our Terms of Service and Cookie Policy:
      </p>
    </div>
  );
}

function ConsentTerms() {
  return (
    <div className="space-y-4 text-sm text-[#c0d6e4]">
      <div>
        <strong className="text-white block mb-1">User Tracking:</strong>
        To analyze system performance and fulfill project requirements, user
        activity and interaction logs are recorded during your session.
      </div>
      <div>
        <strong className="text-white block mb-1">Cookie Consent:</strong>
        This application utilizes technical cookies and local storage tokens
        necessary to keep you securely logged in.
      </div>
      <div>
        <strong className="text-white block mb-1">Intended Use:</strong>
        This application is provided solely for academic assessment by the
        Florida Institute of Technology. Malicious usage or attempts to disrupt
        service will result in session termination.
      </div>
    </div>
  );
}

export default function ConsentModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if consent has already been given
    const consent = localStorage.getItem("apex_consent_accepted");
    if (!consent) {
      setShow(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("apex_consent_accepted", "true");
    setShow(false);
  };

  const handleDecline = () => {
    // If they decline, send them away from the app
    window.location.href = "https://www.google.com";
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0b132b]/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl p-8 rounded-2xl glass-panel space-y-6 border border-[#3e6e99]/30 shadow-2xl">
        <ConsentHeader />
        <ConsentTerms />

        <div className="pt-6 flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-[#3e6e99]/20">
          <button
            onClick={handleDecline}
            className="px-6 py-2.5 rounded text-[#91aec9] hover:bg-[#1c2541] hover:text-white transition-colors font-medium text-sm"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-6 py-2.5 rounded bg-blue-700 hover:bg-blue-600 text-white font-bold transition-all shadow-lg text-sm"
          >
            Accept and Enter
          </button>
        </div>
      </div>
    </div>
  );
}
