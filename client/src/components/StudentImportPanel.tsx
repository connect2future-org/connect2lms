import { useState } from "react";
import { FileSpreadsheet, FolderPlus, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { parseStudentImportFile } from "@/lib/importFile";
import { downloadRosterTemplate } from "@/lib/excelTemplates";
import { trpc } from "@/lib/trpc";

type Preview = {
  batchId?: number;
  summary: { total: number; valid: number; invalid: number; existing: number; duplicates: number; new: number };
  rows: Array<{
    rowNumber: number;
    name: string;
    email: string;
    username: string;
    studentId?: string;
    usn?: string;
    branch?: string;
    semester?: string;
    section?: string;
    className?: string;
    errors: string[];
    valid: boolean;
  }>;
};

type TableRecord = {
  id: number;
  name: string;
  description: string | null;
  studentUserIds: number[];
  students: Array<{ id: number; name: string | null }>;
};

export function StudentImportPanel({ onImportConfirmed }: { onImportConfirmed?: () => void }) {
  const utils = trpc.useUtils();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [password, setPassword] = useState("");
  const [tableTargetMode, setTableTargetMode] = useState<"new" | "existing" | "none">("new");
  const [newTableName, setNewTableName] = useState("");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  // Queries & Mutations
  const tablesQuery = trpc.tables.list.useQuery();
  const previewMutation = trpc.imports.preview.useMutation();
  const confirmMutation = trpc.imports.confirm.useMutation();
  const createTable = trpc.tables.create.useMutation();
  const addStudentsToTable = trpc.tables.addStudents.useMutation();
  const deleteTable = trpc.tables.delete.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      void utils.tables.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const tables = (tablesQuery.data?.data ?? []) as TableRecord[];

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setPreview(null);
    try {
      const rows = await parseStudentImportFile(file);
      if (!rows.length) throw new Error("No student rows were found after reading the header row.");
      const result = await previewMutation.mutateAsync({ sourceName: file.name, rows });
      setPreview(result.data as Preview);

      // Auto-set suggested table name if blank
      if (!newTableName) {
        setNewTableName(file.name.replace(/\.[^/.]+$/, "") + " Table");
      }
      toast.success("Preview generated. Confirm to safely import students and populate the student table.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to parse the import file.");
    }
  };

  const confirmImport = async () => {
    if (!preview?.batchId) return;

    try {
      const result = await confirmMutation.mutateAsync({
        batchId: preview.batchId,
        defaultTemporaryPassword: password || "NorthstarPass123!",
      });

      // Fetch latest list of students to resolve IDs
      const updatedStudentsRes = await utils.people.teacher.listStudents.fetch();
      const updatedStudents = (updatedStudentsRes?.data ?? []) as Array<{
        id: number;
        name: string | null;
        email: string | null;
        username?: string | null;
      }>;

      // Extract imported usernames and emails
      const importedUsernames = new Set(preview.rows.map((r) => r.username.toLowerCase()));
      const importedEmails = new Set(preview.rows.map((r) => r.email.toLowerCase()));

      const matchingStudentIds = updatedStudents
        .filter(
          (s) =>
            (s.username && importedUsernames.has(s.username.toLowerCase())) ||
            (s.email && importedEmails.has(s.email.toLowerCase()))
        )
        .map((s) => s.id);

      // Handle table creation or existing table population with DEDUPLICATION
      if (tableTargetMode === "new" && matchingStudentIds.length > 0) {
        const tableNameToCreate = newTableName.trim() || "Imported Roster Table";
        await createTable.mutateAsync({
          name: tableNameToCreate,
          description: `Created from roster import (${matchingStudentIds.length} students)`,
          studentUserIds: Array.from(new Set(matchingStudentIds)), // Deduplicated
        });
        toast.success(`Student table "${tableNameToCreate}" created with ${matchingStudentIds.length} deduplicated students.`);
      } else if (tableTargetMode === "existing" && selectedTableId && matchingStudentIds.length > 0) {
        const targetTable = tables.find((t) => t.id === selectedTableId);
        if (targetTable) {
          const deduplicatedIds = Array.from(new Set([...targetTable.studentUserIds, ...matchingStudentIds]));
          await addStudentsToTable.mutateAsync({
            tableId: selectedTableId,
            studentUserIds: deduplicatedIds,
          });
          toast.success(`Added ${matchingStudentIds.length} students to table "${targetTable.name}".`);
        }
      }

      toast.success(
        `Import confirmed: ${result.data.summary.created} new created and ${result.data.summary.updated} updated.`
      );

      setPreview(null);
      setPassword("");
      setNewTableName("");
      void utils.tables.list.invalidate();
      void utils.people.teacher.overview.invalidate();
      onImportConfirmed?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The server could not confirm this import.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Roster Intake Section */}
      <section className="blueprint-panel p-5" aria-labelledby="student-import-title">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">STUDENT DIRECTORY / IMPORT STUDIO</p>
            <h2 id="student-import-title" className="mt-1 text-xl font-semibold text-white">
              Validated roster intake
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-blue-100/70">
              Upload a CSV, XLSX, or XLS roster. The server maps known columns, validates each record, creates/updates student records, and populates student tables with automatic deduplication.
            </p>
          </div>
          <ShieldCheck className="size-7 shrink-0 text-cyan-300" aria-hidden="true" />
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/15 bg-cyan-950/15 px-4 py-3">
          <p className="text-xs leading-5 text-blue-100/70">
            Use canonical headers <span className="font-mono text-cyan-200">Name, Email, Username, Student ID, USN, Branch, Semester, Section, Class</span>.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={downloadRosterTemplate}
            className="shrink-0 border-cyan-300/40 text-cyan-100 hover:bg-cyan-300/10"
          >
            <FileSpreadsheet className="mr-2 size-4" />
            Download template
          </Button>
        </div>

        <label className="file-drop-zone flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-cyan-300/45 px-4 py-5 transition hover:border-cyan-200 hover:bg-white/5">
          {previewMutation.isPending ? <Loader2 className="size-5 animate-spin text-cyan-300" /> : <Upload className="size-5 text-cyan-300" />}
          <span className="text-sm text-blue-50">
            Choose roster file <span className="text-blue-200/60">(CSV, XLSX, XLS · max. 10 MB)</span>
          </span>
          <Input
            className="sr-only"
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            disabled={previewMutation.isPending}
          />
        </label>

        {/* Preview & Target Table Options */}
        {preview && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(preview.summary).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-blue-200/65">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>

            {/* Target Table Configuration & Password */}
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-950/20 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FolderPlus className="size-4 text-cyan-300" />
                Student Table Assignment & Deduplication
              </h3>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition ${tableTargetMode === "new" ? "border-cyan-300 bg-cyan-300/10" : "border-white/15 bg-slate-950/30"}`}>
                  <input
                    type="radio"
                    name="tableTarget"
                    checked={tableTargetMode === "new"}
                    onChange={() => setTableTargetMode("new")}
                  />
                  <div>
                    <p className="text-xs font-semibold text-white">Create New Table</p>
                    <p className="text-[11px] text-blue-100/60">Generate a custom student table</p>
                  </div>
                </label>

                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition ${tableTargetMode === "existing" ? "border-cyan-300 bg-cyan-300/10" : "border-white/15 bg-slate-950/30"}`}>
                  <input
                    type="radio"
                    name="tableTarget"
                    checked={tableTargetMode === "existing"}
                    onChange={() => setTableTargetMode("existing")}
                  />
                  <div>
                    <p className="text-xs font-semibold text-white">Add to Existing Table</p>
                    <p className="text-[11px] text-blue-100/60">Append & deduplicate into table</p>
                  </div>
                </label>

                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition ${tableTargetMode === "none" ? "border-cyan-300 bg-cyan-300/10" : "border-white/15 bg-slate-950/30"}`}>
                  <input
                    type="radio"
                    name="tableTarget"
                    checked={tableTargetMode === "none"}
                    onChange={() => setTableTargetMode("none")}
                  />
                  <div>
                    <p className="text-xs font-semibold text-white">Master Directory Only</p>
                    <p className="text-[11px] text-blue-100/60">Do not assign to custom table</p>
                  </div>
                </label>
              </div>

              {tableTargetMode === "new" && (
                <div>
                  <label className="text-xs font-semibold text-blue-100/75">New Student Table Name</label>
                  <Input
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    className="mt-1 border-white/20 bg-slate-950/40 text-white"
                    placeholder="e.g. Section B Roster Table"
                  />
                </div>
              )}

              {tableTargetMode === "existing" && (
                <div>
                  <label className="text-xs font-semibold text-blue-100/75">Select Target Student Table</label>
                  <select
                    value={selectedTableId || ""}
                    onChange={(e) => setSelectedTableId(Number(e.target.value) || null)}
                    className="mt-1 w-full h-9 border border-white/20 bg-slate-950/60 px-3 text-xs text-white rounded"
                  >
                    <option value="">Choose existing table...</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.students.length} students)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-blue-100">
                  Temporary password for new students (Optional — defaults to USN)
                </label>
                <PasswordInput
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 border-white/20 bg-slate-950/40 text-white"
                  placeholder="Defaults to student USN"
                />
              </div>
            </div>

            {/* Preview Table */}
            <div className="max-h-80 overflow-auto rounded-lg border border-white/10">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#08245f] text-blue-100">
                  <tr>
                    <th className="p-3">Row</th>
                    <th className="p-3">Student</th>
                    <th className="p-3">Email / Username</th>
                    <th className="p-3">USN / ID</th>
                    <th className="p-3">Branch</th>
                    <th className="p-3">Term</th>
                    <th className="p-3">Validation Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-white/10 text-blue-50/85">
                      <td className="p-3 font-mono text-xs">{row.rowNumber}</td>
                      <td className="p-3 font-medium text-white">{row.name || "—"}</td>
                      <td className="p-3">
                        {row.email || "—"}
                        <span className="block text-xs text-blue-200/55">{row.username}</span>
                      </td>
                      <td className="p-3 font-mono text-xs">{row.usn || row.studentId || "—"}</td>
                      <td className="p-3">{row.branch || "—"}</td>
                      <td className="p-3">
                        {[row.semester, row.section, row.className].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className={`p-3 ${row.valid ? "text-emerald-300 font-semibold" : "text-amber-300"}`}>
                        {row.valid ? "Ready" : row.errors.join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              onClick={() => void confirmImport()}
              disabled={confirmMutation.isPending || preview.summary.valid === 0}
              className="w-full bg-cyan-300 text-[#05205c] hover:bg-cyan-200 font-bold py-3 text-sm"
            >
              {confirmMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4" />}
              Confirm Safe Roster Import & Create/Populate Student Table
            </Button>
          </div>
        )}
      </section>

      {/* Managed Custom Tables & Delete Table Panel */}
      <section className="blueprint-panel p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <p className="eyebrow">CUSTOM STUDENT TABLES</p>
            <h2 className="text-lg font-semibold text-white">Manage & Delete Custom Tables</h2>
            <p className="text-xs text-blue-100/70 mt-0.5">
              Review existing custom student tables created via import or manual grouping.
            </p>
          </div>
        </div>

        {tables.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => (
              <div key={t.id} className="rounded-xl border border-white/15 bg-slate-950/40 p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white text-base">{t.name}</h3>
                    <span className="technical-chip">{t.students.length} students</span>
                  </div>
                  {t.description && <p className="mt-1 text-xs text-blue-100/60 line-clamp-2">{t.description}</p>}
                </div>
                <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                  <a href="/teacher/tables" className="text-xs font-semibold text-cyan-200 hover:underline">
                    View in Studio →
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete table "${t.name}"? (Students remain in master roster)`)) {
                        deleteTable.mutate({ tableId: t.id });
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs text-rose-300 hover:text-rose-100 font-semibold"
                  >
                    <Trash2 className="size-3.5" />
                    Delete Table
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state mt-4">No custom student tables created yet.</p>
        )}
      </section>
    </div>
  );
}
