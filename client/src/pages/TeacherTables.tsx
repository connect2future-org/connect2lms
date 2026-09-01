import React, { useState } from "react";
import { Download, FileSpreadsheet, FolderPlus, GitMerge, Loader2, MoveRight, Pencil, Plus, ShieldCheck, Trash2, Upload, UsersRound, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { BlueprintShell } from "@/components/BlueprintShell";
import { trpc } from "@/lib/trpc";
import { downloadRosterTemplate, exportTableToExcel } from "@/lib/excelTemplates";
import { parseStudentImportFile } from "@/lib/importFile";

type StudentInTable = {
  id: number;
  name: string | null;
  email: string | null;
  username?: string | null;
  status: string;
  profile?: {
    studentId?: string | null;
    usn?: string | null;
    branch?: string | null;
    semester?: string | null;
    section?: string | null;
    className?: string | null;
  };
};

type TableRecord = {
  id: number;
  name: string;
  description: string | null;
  studentUserIds: number[];
  students: StudentInTable[];
};

type ImportPreview = {
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

export default function TeacherTables() {
  const utils = trpc.useUtils();

  // Mode state for table creation: 'manual' | 'excel'
  const [createMode, setCreateMode] = useState<"manual" | "excel">("manual");
  const [tableName, setTableName] = useState("");
  const [tableDesc, setTableDesc] = useState("");

  // Excel intake state inside table dashboard
  const [excelTableName, setExcelTableName] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Maps student id → effective password shown in dashboard
  const [studentPasswordMap, setStudentPasswordMap] = useState<Record<number, string>>({});

  // Selection & modal state
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [mergeName, setMergeName] = useState("");
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [deleteSourcesOnMerge, setDeleteSourcesOnMerge] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
  const [selectedStudentForTransfer, setSelectedStudentForTransfer] = useState<number[]>([]);
  const [tablePage, setTablePage] = useState(1);
  const TABLE_PAGE_SIZE = 10;

  // Edit student modal state
  const [editingStudent, setEditingStudent] = useState<StudentInTable | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    usn: "",
    studentCode: "",
    branch: "",
    semester: "",
    section: "",
    className: "",
  });

  // Queries & Mutations
  const tablesQuery = trpc.tables.list.useQuery();
  const allStudentsQuery = trpc.people.teacher.listStudents.useQuery();

  const previewMutation = trpc.imports.preview.useMutation();
  const confirmMutation = trpc.imports.confirm.useMutation();

  const createTable = trpc.tables.create.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setTableName("");
      setTableDesc("");
      void utils.tables.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteTable = trpc.tables.delete.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      if (selectedTableId === res.data.tableId) setSelectedTableId(null);
      void utils.tables.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeStudentFromTable = trpc.tables.removeStudent.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      void utils.tables.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const addStudentsToTable = trpc.tables.addStudents.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      void utils.tables.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const transferStudents = trpc.tables.transferStudents.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setSelectedStudentForTransfer([]);
      void utils.tables.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const mergeTables = trpc.tables.mergeTables.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setMergeName("");
      setSelectedForMerge([]);
      void utils.tables.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStudent = trpc.people.teacher.updateStudent.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setEditingStudent(null);
      void utils.tables.list.invalidate();
      void utils.people.teacher.listStudents.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteStudentAccess = trpc.people.teacher.deleteStudent.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      void utils.tables.list.invalidate();
      void utils.people.teacher.listStudents.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const purgeStudent = trpc.people.teacher.purgeStudent.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      void utils.tables.list.invalidate();
      void utils.people.teacher.listStudents.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const tables = (tablesQuery.data?.data ?? []) as TableRecord[];
  const allStudents = (allStudentsQuery.data?.data ?? []) as StudentInTable[];

  const activeTable = tables.find((t) => t.id === selectedTableId) || tables[0] || null;

  // Handle Excel file upload to create new table from roster
  const handleExcelImport = async (file: File | undefined) => {
    if (!file) return;
    setImportPreview(null);
    try {
      const rows = await parseStudentImportFile(file);
      if (!rows.length) throw new Error("No student rows found in the roster file.");
      const result = await previewMutation.mutateAsync({ sourceName: file.name, rows });
      setImportPreview(result.data as ImportPreview);
      if (!excelTableName.trim()) {
        setExcelTableName(file.name.replace(/\.[^/.]+$/, "") + " Table");
      }
      toast.success("Roster preview created. Confirm to populate the table.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to parse Excel file.");
    }
  };

  // Confirm Excel import & create student table with all imported student IDs
  const confirmExcelTableImport = async () => {
    if (!importPreview?.batchId) return;
    const finalTableName = excelTableName.trim() || "Excel Roster Table";
    // Determine effective password to pass: custom if non-empty, else empty (server defaults to USN)
    const effectivePassword = tempPassword.trim();
    try {
      const confirmRes = await confirmMutation.mutateAsync({
        batchId: importPreview.batchId,
        defaultTemporaryPassword: effectivePassword.length >= 6 ? effectivePassword : undefined,
      });

      // Refetch all students to get latest IDs
      const updatedStudentsRes = await utils.people.teacher.listStudents.fetch();
      const updatedStudents = (updatedStudentsRes?.data ?? []) as StudentInTable[];

      // Match imported usernames or emails
      const importedUsernames = new Set(importPreview.rows.map((r) => r.username.toLowerCase()));
      const importedEmails = new Set(importPreview.rows.map((r) => r.email.toLowerCase()));

      const matchingIds = updatedStudents
        .filter(
          (s) =>
            (s.username && importedUsernames.has(s.username.toLowerCase())) ||
            (s.email && importedEmails.has(s.email.toLowerCase()))
        )
        .map((s) => s.id);

      // Map student IDs to their effective password for dashboard display
      const newPasswordMap: Record<number, string> = {};
      const importedRowsByEmail = new Map(importPreview.rows.map((r) => [r.email.toLowerCase(), r]));
      for (const s of updatedStudents) {
        if (s.email && importedRowsByEmail.has(s.email.toLowerCase())) {
          const row = importedRowsByEmail.get(s.email.toLowerCase())!;
          // Custom password wins; otherwise show USN
          newPasswordMap[s.id] = effectivePassword.length >= 6 ? effectivePassword : (row.usn || row.studentId || row.username || "USN");
        }
      }
      setStudentPasswordMap((prev) => ({ ...prev, ...newPasswordMap }));

      // Create new student table populated with imported students
      await createTable.mutateAsync({
        name: finalTableName,
        description: `Imported from Excel file: ${importPreview.rows.length} rows (${confirmRes.data.summary.created} created, ${confirmRes.data.summary.updated} updated)`,
        studentUserIds: matchingIds,
      });

      toast.success(`Table "${finalTableName}" created with ${matchingIds.length} students.`);
      setImportPreview(null);
      setExcelTableName("");
      setTempPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm Excel table import.");
    }
  };

  const startEditStudent = (student: StudentInTable) => {
    setEditingStudent(student);
    setEditForm({
      name: student.name || "",
      usn: student.profile?.usn || "",
      studentCode: student.profile?.studentId || "",
      branch: student.profile?.branch || "",
      semester: student.profile?.semester || "",
      section: student.profile?.section || "",
      className: student.profile?.className || "",
    });
  };

  return (
    <BlueprintShell role="TEACHER">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">TEACHER / MULTI-TABLE MANAGEMENT</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Student tables & Excel studio</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100/70">
            Create custom named tables manually or directly from Excel rosters, edit student records, transfer students, merge tables, and purge student data.
          </p>
        </div>
      </header>

      {/* Top creation & merge grid */}
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Create Table Panel (Manual + Excel Intake) */}
        <div className="blueprint-panel p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderPlus className="size-5 text-cyan-300" />
              <h2 className="text-base font-semibold text-white">Create new student table</h2>
            </div>
            <div className="flex rounded-lg border border-white/15 bg-slate-950/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setCreateMode("manual")}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  createMode === "manual" ? "bg-cyan-300 text-[#05205c]" : "text-blue-100 hover:text-white"
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("excel")}
                className={`rounded px-2.5 py-1 font-semibold transition ${
                  createMode === "excel" ? "bg-cyan-300 text-[#05205c]" : "text-blue-100 hover:text-white"
                }`}
              >
                From Excel
              </button>
            </div>
          </div>

          {createMode === "manual" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!tableName.trim()) return;
                createTable.mutate({ name: tableName, description: tableDesc });
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="text-xs font-semibold text-blue-100/75">Table name</label>
                <Input
                  required
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="mt-1 border-white/20 bg-slate-950/40 text-white"
                  placeholder="e.g., Section A - Batch 2026"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-blue-100/75">Description (optional)</label>
                <Input
                  value={tableDesc}
                  onChange={(e) => setTableDesc(e.target.value)}
                  className="mt-1 border-white/20 bg-slate-950/40 text-white"
                  placeholder="e.g., Morning shift students"
                />
              </div>
              <Button disabled={createTable.isPending} className="w-full bg-cyan-300 text-[#05205c] hover:bg-cyan-200">
                {createTable.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
                Create table
              </Button>
            </form>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-blue-100/75">New table name</label>
                <Input
                  value={excelTableName}
                  onChange={(e) => setExcelTableName(e.target.value)}
                  className="mt-1 border-white/20 bg-slate-950/40 text-white"
                  placeholder="e.g., Civil 5th Sem Roster Table"
                />
              </div>
              <label className="file-drop-zone flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-cyan-300/40 p-3 transition hover:border-cyan-200 hover:bg-white/5">
                {previewMutation.isPending ? <Loader2 className="size-4 animate-spin text-cyan-300" /> : <Upload className="size-4 text-cyan-300" />}
                <span className="text-xs text-blue-100">Upload Excel / CSV roster file</span>
                <Input
                  className="sr-only"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => void handleExcelImport(e.target.files?.[0])}
                  disabled={previewMutation.isPending}
                />
              </label>
              <div className="flex justify-between items-center text-[11px] text-blue-100/60">
                <span>Canonical headers: Name, Email, USN, Branch</span>
                <button type="button" onClick={downloadRosterTemplate} className="text-cyan-200 hover:underline">
                  Template
                </button>
              </div>

              {importPreview && (
                <div className="mt-3 rounded-lg border border-cyan-300/30 bg-cyan-950/30 p-3 space-y-3">
                  <div className="flex justify-between text-xs text-white font-semibold">
                    <span>File parsed: {importPreview.rows.length} rows</span>
                    <span className="text-emerald-300">{importPreview.summary.valid} valid</span>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-blue-100">
                      Temporary password for new students (Optional — defaults to USN)
                    </label>
                    <PasswordInput
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      className="border-white/20 bg-slate-950/40 text-white text-xs"
                      placeholder="Defaults to student USN"
                    />
                  </div>
                  <Button
                    onClick={() => void confirmExcelTableImport()}
                    disabled={confirmMutation.isPending || importPreview.summary.valid === 0}
                    className="w-full bg-cyan-300 text-[#05205c] hover:bg-cyan-200 text-xs font-bold"
                  >
                    {confirmMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="mr-2 size-4" />
                    )}
                    Confirm & Create Student Table
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Merge Tables Panel */}
        <div className="blueprint-panel p-5">
          <div className="flex items-center gap-3">
            <GitMerge className="size-6 text-cyan-300" />
            <div>
              <p className="eyebrow">MERGE TABLES</p>
              <h2 className="text-lg font-semibold text-white">Combine multiple tables</h2>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedForMerge.length < 2 || !mergeName.trim()) {
                toast.error("Select at least 2 tables and provide a new table name.");
                return;
              }
              mergeTables.mutate({
                sourceTableIds: selectedForMerge,
                newTableName: mergeName,
                deleteSourcesAfterMerge: deleteSourcesOnMerge,
              });
            }}
            className="mt-4 space-y-3"
          >
            <div>
              <label className="text-xs font-semibold text-blue-100/75">New merged table name</label>
              <Input
                value={mergeName}
                onChange={(e) => setMergeName(e.target.value)}
                className="mt-1 border-white/20 bg-slate-950/40 text-white"
                placeholder="e.g., Combined Batch A & B"
              />
            </div>
            <div className="max-h-24 overflow-auto rounded border border-white/10 p-2 space-y-1">
              {tables.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-xs text-blue-100">
                  <input
                    type="checkbox"
                    checked={selectedForMerge.includes(t.id)}
                    onChange={(e) =>
                      setSelectedForMerge((curr) => (e.target.checked ? [...curr, t.id] : curr.filter((id) => id !== t.id)))
                    }
                  />
                  <span>{t.name}</span>
                  <span className="text-blue-200/50">({t.students.length} students)</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-blue-100/70">
              <input
                type="checkbox"
                checked={deleteSourcesOnMerge}
                onChange={(e) => setDeleteSourcesOnMerge(e.target.checked)}
              />
              Delete source tables after merging
            </label>
            <Button
              disabled={mergeTables.isPending || selectedForMerge.length < 2}
              className="w-full border border-cyan-300/40 bg-cyan-950/40 text-cyan-100 hover:bg-cyan-900/50"
            >
              {mergeTables.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GitMerge className="mr-2 size-4" />}
              Merge selected ({selectedForMerge.length})
            </Button>
          </form>
        </div>

        {/* Global Overview Metrics */}
        <div className="blueprint-panel p-5 flex flex-col justify-between">
          <div>
            <p className="eyebrow">TABLE STATISTICS</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Roster summary</h2>
            <div className="mt-4 space-y-3">
              <div className="metric-card">
                <FolderPlus className="size-5 text-cyan-300" />
                <span>Custom tables</span>
                <strong>{tables.length}</strong>
              </div>
              <div className="metric-card">
                <UsersRound className="size-5 text-emerald-300" />
                <span>Total students</span>
                <strong>{allStudents.length}</strong>
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-blue-100/60 leading-5">
            Export any custom table as a standardized Excel file matching the roster template format.
          </p>
        </div>
      </section>



      {/* Main Table Explorer */}
      <section className="blueprint-panel mt-6 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow">TABLE SELECTOR</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {activeTable ? activeTable.name : "No tables created yet"}
            </h2>
            {activeTable?.description && <p className="mt-1 text-sm text-blue-100/70">{activeTable.description}</p>}
          </div>

          {activeTable && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => exportTableToExcel(activeTable.name, activeTable.students)}
                className="border-cyan-300/40 text-cyan-100 hover:bg-cyan-300/10"
              >
                <Download className="mr-2 size-4" />
                Export table to Excel (.xlsx)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (confirm(`Delete whole table "${activeTable.name}"? (Students will remain in your master directory)`)) {
                    deleteTable.mutate({ tableId: activeTable.id });
                  }
                }}
                className="border-rose-300/40 text-rose-200 hover:bg-rose-500/20"
              >
                <Trash2 className="mr-2 size-4" />
                Delete whole table
              </Button>
            </div>
          )}
        </div>

        {/* Table Selector Tabs */}
        {tables.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2 border-b border-white/10 pb-3">
            {tables.map((t) => (
              <button
                key={t.id}
                onClick={() => { setSelectedTableId(t.id); setTablePage(1); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTable?.id === t.id
                    ? "bg-cyan-300 text-[#05205c]"
                    : "border border-white/15 text-blue-100 hover:border-cyan-300/50"
                }`}
              >
                {t.name} ({t.students.length})
              </button>
            ))}
          </div>
        )}

        {/* Student Data Table inside Active Table */}
        {activeTable ? (
          <div className="mt-5">
            {/* Add students from master directory dropdown */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-300/20 bg-cyan-950/20 p-3">
              <span className="text-xs font-semibold text-blue-100">Add student to "{activeTable.name}":</span>
              <select
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val) {
                    addStudentsToTable.mutate({ tableId: activeTable.id, studentUserIds: [val] });
                  }
                  e.target.value = "";
                }}
                className="h-8 border border-white/20 bg-slate-950/60 px-3 text-xs text-white rounded"
              >
                <option value="">Select student from master list...</option>
                {allStudents
                  .filter((s) => !activeTable.studentUserIds.includes(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.email}) - {s.profile?.studentId || s.profile?.usn || "No ID"}
                    </option>
                  ))}
              </select>
            </div>

            {/* Students Table */}
            <div className="overflow-x-auto">
              <table className="technical-table w-full">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        onChange={(e) =>
                          setSelectedStudentForTransfer(e.target.checked ? activeTable.students.map((s) => s.id) : [])
                        }
                        checked={
                          activeTable.students.length > 0 &&
                          selectedStudentForTransfer.length === activeTable.students.length
                        }
                      />
                    </th>
                    <th>Student</th>
                    <th>USN</th>
                    <th>
                      <span className="flex items-center gap-1">
                        Credentials
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="ml-1 text-[10px] text-cyan-300 hover:text-cyan-100 underline"
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </span>
                    </th>
                    <th>Branch / Term</th>
                    <th>Status</th>
                    <th>Table Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTable.students.length ? (
                    (() => {
                      const totalPages = Math.max(1, Math.ceil(activeTable.students.length / TABLE_PAGE_SIZE));
                      const safePage = Math.min(tablePage, totalPages);
                      const pagedStudents = activeTable.students.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE);
                      return pagedStudents.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedStudentForTransfer.includes(s.id)}
                              onChange={(e) =>
                                setSelectedStudentForTransfer((curr) =>
                                  e.target.checked ? [...curr, s.id] : curr.filter((id) => id !== s.id)
                                )
                              }
                            />
                          </td>
                          <td>
                            <p className="font-medium text-white">{s.name || "Unnamed"}</p>
                            <p className="text-xs text-blue-100/60">{s.email}</p>
                          </td>
                          <td className="font-mono text-xs">
                            {s.profile?.usn || "—"}
                          </td>
                          <td className="font-mono text-xs">
                            {(() => {
                              const knownPw = studentPasswordMap[s.id];
                              const displayPw = knownPw || s.profile?.usn || "USN";
                              return (
                                <>
                                  <span className={`font-semibold ${knownPw ? "text-emerald-300" : "text-cyan-300"}`}>
                                    {showPassword ? displayPw : "••••••••"}
                                  </span>
                                </>
                              );
                            })()}
                          </td>
                          <td>
                            {s.profile?.branch || "—"}{" "}
                            <span className="text-xs text-blue-200/50">
                              {[s.profile?.semester, s.profile?.section].filter(Boolean).join(" / ")}
                            </span>
                          </td>
                          <td>
                            <span className="technical-chip">{s.status}</span>
                          </td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => startEditStudent(s)} className="technical-chip hover:border-cyan-300 text-cyan-200 inline-flex items-center gap-1">
                                <Pencil className="size-3" />
                                Edit
                              </button>
                              <button type="button" onClick={() => removeStudentFromTable.mutate({ tableId: activeTable.id, studentUserId: s.id })} className="technical-chip hover:border-amber-300 text-amber-200">
                                Remove from table
                              </button>
                              <button type="button" onClick={() => { if (confirm(`Disable access for ${s.name}?`)) { deleteStudentAccess.mutate({ studentId: s.id }); } }} className="technical-chip text-rose-300 hover:border-rose-300">
                                Disable
                              </button>
                              <button type="button" onClick={() => { if (confirm(`PERMANENT DELETE: Delete ${s.name} completely from the system? This action cannot be undone.`)) { purgeStudent.mutate({ studentId: s.id }); } }} className="technical-chip text-rose-200 hover:border-rose-400 font-semibold">
                                Delete student
                              </button>
                            </div>
                          </td>
                        </tr>
                      ));
                    })()
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <p className="empty-state">No students in this table yet. Add students using the options above.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {activeTable.students.length > TABLE_PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-xs text-blue-100/60">
                  {(() => {
                    const totalPages = Math.max(1, Math.ceil(activeTable.students.length / TABLE_PAGE_SIZE));
                    const safePage = Math.min(tablePage, totalPages);
                    return `Showing ${(safePage - 1) * TABLE_PAGE_SIZE + 1}–${Math.min(safePage * TABLE_PAGE_SIZE, activeTable.students.length)} of ${activeTable.students.length} students`;
                  })()}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTablePage(p => Math.max(1, p - 1))}
                    disabled={tablePage <= 1}
                    className="border-white/20 text-blue-100 hover:border-cyan-300 disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                    Prev
                  </Button>
                  {Array.from({ length: Math.max(1, Math.ceil(activeTable.students.length / TABLE_PAGE_SIZE)) }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === Math.ceil(activeTable.students.length / TABLE_PAGE_SIZE) || Math.abs(p - tablePage) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "..." ? (
                        <span key={`ellipsis-${idx}`} className="px-1 text-xs text-blue-100/40">…</span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setTablePage(item as number)}
                          className={`h-7 min-w-[1.75rem] rounded px-1.5 text-xs font-bold transition ${
                            tablePage === item ? "bg-cyan-300 text-[#05205c]" : "border border-white/15 text-blue-100 hover:border-cyan-300"
                          }`}
                        >
                          {item}
                        </button>
                      )
                    )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTablePage(p => Math.min(Math.ceil(activeTable.students.length / TABLE_PAGE_SIZE), p + 1))}
                    disabled={tablePage >= Math.ceil(activeTable.students.length / TABLE_PAGE_SIZE)}
                    className="border-white/20 text-blue-100 hover:border-cyan-300 disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Transfer selected students bar */}
            {selectedStudentForTransfer.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-300/30 bg-cyan-950/40 p-4">
                <span className="text-sm font-semibold text-white">
                  {selectedStudentForTransfer.length} student(s) selected for transfer:
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={transferTargetId || ""}
                    onChange={(e) => setTransferTargetId(Number(e.target.value))}
                    className="h-9 border border-white/20 bg-slate-950/60 px-3 text-xs text-white rounded"
                  >
                    <option value="">Select target table...</option>
                    {tables
                      .filter((t) => t.id !== activeTable.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    disabled={!transferTargetId || transferStudents.isPending}
                    onClick={() => {
                      if (!transferTargetId) return;
                      transferStudents.mutate({
                        sourceTableId: activeTable.id,
                        targetTableId: transferTargetId,
                        studentUserIds: selectedStudentForTransfer,
                      });
                    }}
                    className="bg-cyan-300 text-[#05205c] hover:bg-cyan-200"
                  >
                    <MoveRight className="mr-2 size-4" />
                    Move to target table
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="empty-state mt-5">Create your first table using the panel above.</p>
        )}
      </section>

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="blueprint-panel w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="eyebrow">STUDENT DATA EDITOR</p>
                <h2 className="text-lg font-semibold text-white">Edit {editingStudent.name}</h2>
              </div>
              <button onClick={() => setEditingStudent(null)} className="text-blue-100 hover:text-white">
                <X className="size-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateStudent.mutate({
                  studentId: editingStudent.id,
                  name: editForm.name,
                  usn: editForm.usn,
                  studentCode: editForm.studentCode,
                  branch: editForm.branch,
                  semester: editForm.semester,
                  section: editForm.section,
                  className: editForm.className,
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-xs font-semibold text-blue-100/75">Full Name</label>
                <Input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((curr) => ({ ...curr, name: e.target.value }))}
                  className="mt-1 border-white/20 bg-slate-950/40 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-blue-100/75">USN</label>
                  <Input
                    value={editForm.usn}
                    onChange={(e) => setEditForm((curr) => ({ ...curr, usn: e.target.value }))}
                    className="mt-1 border-white/20 bg-slate-950/40 text-white"
                    placeholder="e.g., 4MN23CV030"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-blue-100/75">Student ID</label>
                  <Input
                    value={editForm.studentCode}
                    onChange={(e) => setEditForm((curr) => ({ ...curr, studentCode: e.target.value }))}
                    className="mt-1 border-white/20 bg-slate-950/40 text-white"
                    placeholder="e.g., STU-030"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-blue-100/75">Branch / Department</label>
                  <Input
                    value={editForm.branch}
                    onChange={(e) => setEditForm((curr) => ({ ...curr, branch: e.target.value }))}
                    className="mt-1 border-white/20 bg-slate-950/40 text-white"
                    placeholder="e.g., Civil Engineering"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-blue-100/75">Semester</label>
                  <Input
                    value={editForm.semester}
                    onChange={(e) => setEditForm((curr) => ({ ...curr, semester: e.target.value }))}
                    className="mt-1 border-white/20 bg-slate-950/40 text-white"
                    placeholder="e.g., 5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-blue-100/75">Section</label>
                  <Input
                    value={editForm.section}
                    onChange={(e) => setEditForm((curr) => ({ ...curr, section: e.target.value }))}
                    className="mt-1 border-white/20 bg-slate-950/40 text-white"
                    placeholder="e.g., A"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-blue-100/75">Class / Course</label>
                  <Input
                    value={editForm.className}
                    onChange={(e) => setEditForm((curr) => ({ ...curr, className: e.target.value }))}
                    className="mt-1 border-white/20 bg-slate-950/40 text-white"
                    placeholder="e.g., B.E. Civil"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="outline" onClick={() => setEditingStudent(null)} className="border-white/20 text-white">
                  Cancel
                </Button>
                <Button disabled={updateStudent.isPending} className="bg-cyan-300 text-[#05205c] hover:bg-cyan-200 font-bold">
                  {updateStudent.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save Student Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </BlueprintShell>
  );
}
