import { Activity, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function ActivityLogPanel() {
  const activity = trpc.platform.audit.useQuery();
  return <section className="blueprint-panel mt-5 p-5"><div className="flex items-center gap-3"><Activity className="size-5 text-cyan-300" /><div><p className="eyebrow">AUDIT TRAIL</p><h2 className="mt-1 text-xl font-semibold text-white">Recent protected activity</h2></div></div>{activity.isLoading ? <p className="empty-state"><Loader2 className="mr-2 inline size-4 animate-spin" />Loading activity records…</p> : activity.error ? <p className="empty-state">Activity records could not be loaded for this scope.</p> : activity.data?.data.length ? <div className="mt-5 overflow-auto"><table className="technical-table"><thead><tr><th>Action</th><th>Target</th><th>Actor role</th><th>Timestamp</th></tr></thead><tbody>{activity.data.data.slice(0, 10).map(record => <tr key={record.id}><td className="font-mono text-xs text-cyan-100">{record.action}</td><td>{record.targetType} {record.targetId ? `#${record.targetId}` : ""}</td><td><span className="technical-chip">{record.actorRole}</span></td><td>{new Date(record.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="empty-state">No auditable activity is available in your current scope.</p>}</section>;
}
