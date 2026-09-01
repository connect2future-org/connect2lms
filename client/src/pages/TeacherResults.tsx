import { Download, Search, Trophy, Filter } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BlueprintShell } from "@/components/BlueprintShell";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type ResultRow = {
  attemptId: number;
  assessmentId: number;
  assessmentTitle: string;
  resultsPublished: boolean;
  studentId: number;
  studentName: string | null;
  studentEmail: string | null;
  status: string;
  score: number | null;
  totalMarks: number;
  percentage: number | null;
  violationCount: number;
  submittedAt: Date | string | null;
};

type TableRecord = {
  id: number;
  name: string;
  studentUserIds: number[];
};

function makeCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function downloadCsv(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

export default function TeacherResults() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedTableId, setSelectedTableId] = useState<number | "all">("all");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<number | "all">("all");

  const results = trpc.assessments.teacherResults.useQuery();
  const tablesQuery = trpc.tables.list.useQuery();
  const tables = (tablesQuery.data?.data ?? []) as TableRecord[];

  const toggleResultsPublish = trpc.assessments.toggleResultsPublish.useMutation({
    onSuccess: res => { toast.success(res.message); void utils.assessments.teacherResults.invalidate(); },
    onError: err => toast.error(err.message),
  });

  const publishAllResults = trpc.assessments.publishAllResults.useMutation({
    onSuccess: res => { toast.success(res.message); void utils.assessments.teacherResults.invalidate(); },
    onError: err => toast.error(err.message),
  });

  const allResults = (results.data?.data ?? []) as ResultRow[];

  // Build unique assessments list from results
  const assessmentOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of allResults) if (!seen.has(r.assessmentId)) seen.set(r.assessmentId, r.assessmentTitle);
    return Array.from(seen.entries()).map(([id, title]) => ({ id, title }));
  }, [allResults]);

  // Build student→table map
  const studentTableMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const table of tables) {
      for (const sid of table.studentUserIds) {
        const existing = map.get(sid) ?? [];
        map.set(sid, [...existing, table.name]);
      }
    }
    return map;
  }, [tables]);

  // Apply filters
  const needle = search.trim().toLowerCase();
  const filteredResults = useMemo(() => {
    return allResults.filter(r => {
      // Assessment filter
      if (selectedAssessmentId !== "all" && r.assessmentId !== selectedAssessmentId) return false;
      // Table filter
      if (selectedTableId !== "all") {
        const table = tables.find(t => t.id === selectedTableId);
        if (!table || !table.studentUserIds.includes(r.studentId)) return false;
      }
      // Search filter
      if (needle && ![r.assessmentTitle, r.studentName, r.studentEmail, r.status].some(v => String(v ?? "").toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [allResults, selectedAssessmentId, selectedTableId, needle, tables]);

  // Group by assessment
  const grouped = useMemo(() => {
    const groups = new Map<number, { title: string; resultsPublished: boolean; rows: ResultRow[] }>();
    for (const r of filteredResults) {
      if (!groups.has(r.assessmentId)) groups.set(r.assessmentId, { title: r.assessmentTitle, resultsPublished: r.resultsPublished, rows: [] });
      groups.get(r.assessmentId)!.rows.push(r);
    }
    return Array.from(groups.entries()).map(([id, g]) => ({ assessmentId: id, ...g }));
  }, [filteredResults]);

  const publishedCount = allResults.filter(r => r.resultsPublished).length;
  const unpublishedCount = allResults.filter(r => !r.resultsPublished).length;
  const avgPct = allResults.length ? Math.round(allResults.reduce((s, r) => s + Number(r.percentage ?? 0), 0) / allResults.length) : null;

  const exportResults = () => downloadCsv("teacher-results.csv", makeCsv([
    ["Assessment", "Student", "Email", "Table(s)", "Status", "Score", "Percentage", "Integrity Events", "Results Published"],
    ...filteredResults.map(r => [
      r.assessmentTitle, r.studentName, r.studentEmail,
      (studentTableMap.get(r.studentId) ?? ["No table"]).join(" | "),
      r.status, r.score, r.percentage, r.violationCount, r.resultsPublished ? "Yes" : "No",
    ]),
  ]));

  return (
    <BlueprintShell role="TEACHER">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">TEACHER / RESULTS DASHBOARD</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Test results</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100/70">
            Review all student attempt records grouped by assessment. Filter by table or test to see results per cohort.
          </p>
        </div>
        <label className="block text-xs font-semibold text-blue-100/75">
          Search results
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-blue-200/50" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border-white/20 bg-slate-950/40 pl-9 text-white lg:w-72"
              placeholder="Student, assessment, status…"
            />
          </div>
        </label>
      </header>

      {/* Metrics */}
      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        <div className="metric-card"><Trophy className="size-5 text-cyan-300" /><span>Total attempts</span><strong>{allResults.length}</strong></div>
        <div className="metric-card"><Trophy className="size-5 text-emerald-300" /><span>Published</span><strong>{publishedCount}</strong></div>
        <div className="metric-card"><Trophy className="size-5 text-amber-300" /><span>Hidden</span><strong>{unpublishedCount}</strong></div>
        <div className="metric-card"><Trophy className="size-5 text-cyan-300" /><span>Avg score</span><strong>{avgPct !== null ? `${avgPct}%` : "—"}</strong></div>
      </section>

      {/* Filters + Bulk Actions */}
      <section className="blueprint-panel mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="size-4 text-cyan-300" />
            <label className="text-xs font-semibold text-blue-100/75">
              Filter by table
              <select
                value={selectedTableId}
                onChange={e => setSelectedTableId(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="ml-2 h-8 rounded border border-white/20 bg-slate-950/60 px-2 text-xs text-white"
              >
                <option value="all">All tables</option>
                {tables.map(t => <option key={t.id} value={t.id}>{t.name} ({t.studentUserIds.length})</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-blue-100/75">
              Filter by assessment
              <select
                value={selectedAssessmentId}
                onChange={e => setSelectedAssessmentId(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="ml-2 h-8 rounded border border-white/20 bg-slate-950/60 px-2 text-xs text-white"
              >
                <option value="all">All assessments</option>
                {assessmentOptions.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => publishAllResults.mutate({ publish: true })}
              disabled={publishAllResults.isPending || unpublishedCount === 0}
              className="bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-50"
            >
              Publish all results
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => publishAllResults.mutate({ publish: false })}
              disabled={publishAllResults.isPending || publishedCount === 0}
              className="border-amber-400/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
            >
              Hide all results
            </Button>
            <button
              type="button"
              onClick={exportResults}
              disabled={!filteredResults.length}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:border-cyan-200 hover:text-white disabled:opacity-40"
            >
              <Download className="size-4" />
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* Grouped by Assessment */}
      {results.isLoading ? (
        <div className="blueprint-panel mt-5 flex min-h-40 items-center justify-center text-blue-100">Loading results…</div>
      ) : grouped.length === 0 ? (
        <p className="empty-state mt-5">No results match the current filters.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {grouped.map(group => (
            <section key={group.assessmentId} className="blueprint-panel p-5">
              {/* Assessment header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="eyebrow">ASSESSMENT</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{group.title}</h2>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="technical-chip">{group.rows.length} attempt{group.rows.length !== 1 ? "s" : ""}</span>
                    {group.resultsPublished ? (
                      <span className="technical-chip border-emerald-400/40 text-emerald-300">Results visible to students</span>
                    ) : (
                      <span className="technical-chip border-amber-400/40 text-amber-200">Results hidden from students</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleResultsPublish.mutate({ assessmentId: group.assessmentId, publish: !group.resultsPublished })}
                    disabled={toggleResultsPublish.isPending}
                    className={`technical-chip ${group.resultsPublished ? "border-amber-300/40 text-amber-200 hover:border-amber-200" : "border-emerald-300/40 text-emerald-300 hover:border-emerald-200"}`}
                  >
                    {group.resultsPublished ? "Hide results" : "Publish results"}
                  </button>
                </div>
              </div>

              {/* Results table */}
              <div className="mt-4 overflow-x-auto">
                <table className="technical-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Table(s)</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Percentage</th>
                      <th>Integrity Events</th>
                      <th>Result Visibility</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(result => (
                      <tr key={result.attemptId}>
                        <td>
                          <p className="font-medium text-white">{result.studentName}</p>
                          <p className="text-xs text-blue-100/60">{result.studentEmail}</p>
                        </td>
                        <td>
                          {(studentTableMap.get(result.studentId) ?? []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(studentTableMap.get(result.studentId) ?? []).map(tname => (
                                <span key={tname} className="technical-chip text-[10px]">{tname}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-blue-200/40">No table</span>
                          )}
                        </td>
                        <td><span className="technical-chip">{result.status}</span></td>
                        <td>
                          <span className="font-mono text-white">{result.score ?? 0} / {result.totalMarks}</span>
                        </td>
                        <td>
                          <span className="font-mono font-semibold text-cyan-300">{result.percentage ?? 0}%</span>
                        </td>
                        <td>
                          <span className={result.violationCount > 0 ? "font-semibold text-amber-300" : "text-emerald-300"}>
                            {result.violationCount} event{result.violationCount !== 1 ? "s" : ""}
                          </span>
                        </td>
                        <td>
                          {result.resultsPublished ? (
                            <span className="technical-chip border-emerald-400/40 text-emerald-300">Visible</span>
                          ) : (
                            <span className="technical-chip border-amber-400/40 text-amber-200">Hidden</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => toggleResultsPublish.mutate({ assessmentId: result.assessmentId, publish: !result.resultsPublished })}
                            disabled={toggleResultsPublish.isPending}
                            className={`technical-chip ${result.resultsPublished ? "border-amber-300/40 text-amber-200 hover:border-amber-200" : "border-emerald-300/40 text-emerald-300 hover:border-emerald-200"}`}
                          >
                            {result.resultsPublished ? "Unpublish" : "Publish score"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </BlueprintShell>
  );
}
