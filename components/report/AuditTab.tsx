// components/report/AuditTab.tsx
//
// Read-only audit-log table for the report screen.

import React from 'react'
import { AuditLog } from '@/lib/auditService'

export default function AuditTab({ auditLogs }: { auditLogs: AuditLog[] }) {
  return (
    <div className="glass-panel border border-slate-800 rounded-xl p-6 space-y-6">
      <div>
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span className="text-[#3e6e99]">✦</span> Record Change History & Audit Logs
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Every action taken on this report is logged for structural integrity and administrative audit.
        </p>
      </div>

      {auditLogs.length === 0 ? (
        <p className="text-xs font-mono text-slate-500">No audit logs found for this evaluation.</p>
      ) : (
        <div className="border border-slate-900 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="p-3">Timestamp</th>
                <th className="p-3">User</th>
                <th className="p-3">Action</th>
                <th className="p-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {auditLogs.map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-900/20 text-slate-300">
                  <td className="p-3 whitespace-nowrap font-mono text-slate-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {log.profiles ? (
                      <span className="font-medium text-slate-200">
                        {log.profiles.last_name}, {log.profiles.first_name}
                        <span className="text-[10px] text-slate-500 block">{log.profiles.preferred_role}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">System</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase font-bold tracking-wide bg-blue-950 text-blue-400 border border-blue-900/40">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[10px] text-slate-400 max-w-xs truncate">
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
