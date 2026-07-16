"use client";

import { useState, useEffect } from "react";

function ConsentHeader() {
  return (
    <div
      className="space-y-2 border-b pb-4"
      style={{ borderColor: "var(--border)" }}
    >
      <h2 className="text-xl font-bold apex-heading tracking-wide flex items-center gap-2">
        <span>🔒</span> Welcome to APEX – Terms & Consent
      </h2>
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        Before entering this application, please review our system access terms.
        By continuing, you agree to our Terms of Service and Cookie Policy:
      </p>
    </div>
  );
}

function ConsentTerms() {
  return (
    <div
      className="space-y-4 text-sm"
      style={{ color: "var(--foreground)" }}
    >
      <div>
        <strong className="apex-heading block mb-1">User Tracking:</strong>
        To analyze system performance and fulfill project requirements, user
        activity and interaction logs are recorded during your session.
      </div>
      <div>
        <strong className="apex-heading block mb-1">Cookie Consent:</strong>
        This application utilizes technical cookies and local storage tokens
        necessary to keep you securely logged in.
      </div>
      <div>
        <strong className="apex-heading block mb-1">Intended Use:</strong>
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
    window.location.href = "https://www.google.com";
  };

  if (!show) return null;

  return (
    <div className="apex-modal-overlay">
      <div className="w-full max-w-2xl p-8 rounded-2xl apex-card space-y-6 shadow-2xl">
        <ConsentHeader />
        <ConsentTerms />

        <div
          className="pt-6 flex flex-col-reverse sm:flex-row justify-end gap-3 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={handleDecline}
            className="apex-btn-secondary text-sm"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="apex-btn-primary text-sm"
          >
            Accept and Enter
          </button>
        </div>
      </div>
    </div>
  );
}