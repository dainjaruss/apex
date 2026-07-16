// components/report/AuditTab.tsx
//
// Read-only audit-log table for the report screen.

import React from "react";
import { AuditLog } from "@/lib/auditService";

export default function AuditTab({ auditLogs }: { auditLogs: AuditLog[] }) {
  return (
    <div className="apex-report-panel space-y-6">
      <div>
        <h3 className="text-base font-bold apex-heading flex items-center gap-2">
          <span className="text-[var(--primary)]" aria-hidden>
            ✦
          </span>{" "}
          Record Change History & Audit Logs
        </h3>
        <p className="text-xs apex-text-secondary mt-1">
          Every action taken on this report is logged for structural integrity
          and administrative audit.
        </p>
      </div>

      {auditLogs.length === 0 ? (
        <p className="text-xs font-mono apex-text-subtle">
          No audit logs found for this evaluation.
        </p>
      ) : (
        <div className="apex-card overflow-hidden border border-border">
          <table className="apex-data-table w-full text-xs">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log: any) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap font-mono apex-text-subtle">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td>
                    {log.profiles ? (
                      <span className="font-medium apex-heading">
                        {log.profiles.last_name}, {log.profiles.first_name}
                        <span className="text-[10px] apex-text-subtle block">
                          {log.profiles.preferred_role}
                        </span>
                      </span>
                    ) : (
                      <span className="apex-text-subtle">System</span>
                    )}
                  </td>
                  <td>
                    <span className="apex-audit-action-badge">{log.action}</span>
                  </td>
                  <td className="font-mono text-[10px] apex-text-secondary max-w-xs truncate">
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}