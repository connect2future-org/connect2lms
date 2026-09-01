import React, { useMemo, useState } from "react";
import { BookOpenCheck, Clipboard, Download, FileSpreadsheet, Loader2, Plus, Send, Trash2, Trophy, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { BlueprintShell } from "@/components/BlueprintShell";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { trpc } from "@/lib/trpc";
import { toAssessmentQuestions, type AssessmentQuestionDraft } from "@/lib/assessmentForm";
import { downloadQuestionTemplate, parseQuestionImportFile, downloadRosterTemplate } from "@/lib/excelTemplates";

const emptyStudent = { name: "", email: "", username: "", usn: "", studentId: "", branch: "", semester: "", section: "", className: "", temporaryPassword: "" };
const emptyQuestion: AssessmentQuestionDraft = { questionText: "", firstOption: "", secondOption: "", thirdOption: "", fourthOption: "", correctOption: "a" };
function defaultStartAt() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function defaultEndAt() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const emptyAssessment = { title: "", durationMinutes: "30", startAt: defaultStartAt(), endAt: defaultEndAt(), accessCode: "", questions: [emptyQuestion], editingId: null as number | null };

type StudentRow = { id: number; name: string | null; email: string | null; status: string; profile?: { importBatchId?: number | null; studentId?: string | null; usn?: string | null; branch?: string | null; semester?: string | null; section?: string | null; className?: string | null } };
type PublishTarget = { assessmentId: number; title: string };

function makeCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function downloadCsv(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

async function copyValue(value: string | null | undefined, label: string) {
  if (!value) return;
  try { await navigator.clipboard.writeText(value); toast.success(`${label} copied.`); }
  catch { toast.error(`Unable to copy the ${label.toLowerCase()}.`); }
}

export default function TeacherDashboard() {
  const utils = trpc.useUtils();
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [assessmentForm, setAssessmentForm] = useState(emptyAssessment);
  const [filter, setFilter] = useState("");
  const [publishTarget, setPublishTarget] = useState<PublishTarget | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [questionFileInputKey, setQuestionFileInputKey] = useState(0);

  const [targetTableForNewStudent, setTargetTableForNewStudent] = useState<number | "none">("none");

  const overview = trpc.people.teacher.overview.useQuery();
  const tests = trpc.assessments.teacherList.useQuery();
  const results = trpc.assessments.teacherResults.useQuery();
  const tablesQuery = trpc.tables.list.useQuery();

  const addStudentsToTable = trpc.tables.addStudents.useMutation();

  const createStudent = trpc.people.teacher.createStudent.useMutation({
    onSuccess: async (res) => {
      const createdStudentId = res.data?.id;
      if (createdStudentId && targetTableForNewStudent !== "none") {
        try {
          await addStudentsToTable.mutateAsync({
            tableId: targetTableForNewStudent,
            studentUserIds: [createdStudentId],
          });
          const tableName = tablesList.find(t => t.id === targetTableForNewStudent)?.name || "table";
          toast.success(`Student created and added to "${tableName}".`);
        } catch (err) {
          toast.error("Student was created, but could not be added to the selected table.");
        }
      } else {
        toast.success("Student created inside your teaching scope.");
      }
      setStudentForm(emptyStudent);
      setTargetTableForNewStudent("none");
      void utils.people.teacher.overview.invalidate();
      void utils.tables.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const createAssessment = trpc.assessments.create.useMutation({ onSuccess: () => { toast.success("Validated MCQ assessment saved as a draft."); setAssessmentForm(emptyAssessment); setQuestionFileInputKey(key => key + 1); void utils.assessments.teacherList.invalidate(); }, onError: error => toast.error(error.message) });
  const updateAssessment = trpc.assessments.update.useMutation({ onSuccess: () => { toast.success("Draft assessment updated."); setAssessmentForm(emptyAssessment); setQuestionFileInputKey(key => key + 1); void utils.assessments.teacherList.invalidate(); }, onError: error => toast.error(error.message) });
  const publish = trpc.assessments.publish.useMutation({ onSuccess: result => { toast.success(result.message); setPublishTarget(null); setSelectedStudentIds([]); void utils.assessments.teacherList.invalidate(); }, onError: error => toast.error(error.message) });
  const removeAssessment = trpc.assessments.remove.useMutation({ onSuccess: result => { toast.success(result.message); void utils.assessments.teacherList.invalidate(); }, onError: error => toast.error(error.message) });
  const hardDeleteAssessment = trpc.assessments.hardDelete.useMutation({ onSuccess: result => { toast.success(result.message); void utils.assessments.teacherList.invalidate(); }, onError: error => toast.error(error.message) });
  const manageAccessCode = trpc.assessments.manageAccessCode.useMutation({ onSuccess: result => { toast.success(result.message); void utils.assessments.teacherList.invalidate(); }, onError: error => toast.error(error.message) });
  const deleteStudent = trpc.people.teacher.deleteStudent.useMutation({ onSuccess: () => { toast.success("Student account removed from active access."); void utils.people.teacher.overview.invalidate(); }, onError: error => toast.error(error.message) });
  const toggleResultsPublish = trpc.assessments.toggleResultsPublish.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      void utils.assessments.teacherResults.invalidate();
      void utils.assessments.teacherList.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const data = overview.data?.data as { metrics?: Record<string, number>; students?: StudentRow[] } | undefined;
  const metrics = data?.metrics ?? {};
  const students = data?.students ?? [];
  const normalizedFilter = filter.trim().toLowerCase();

  const visibleStudents = students.filter(student => !normalizedFilter || [student.name, student.email, student.profile?.studentId, student.profile?.usn, student.profile?.branch, student.status].some(value => String(value ?? "").toLowerCase().includes(normalizedFilter)));
  const eligibleStudents = students.filter(student => student.status === "ACTIVE");
  const visibleTests = (tests.data?.data ?? []).filter(test => !normalizedFilter || [test.title, test.status, test.accessCode].some(value => String(value ?? "").toLowerCase().includes(normalizedFilter)));
  const visibleResults = (results.data?.data ?? []).filter(result => !normalizedFilter || [result.assessmentTitle, result.studentName, result.studentEmail, result.status].some(value => String(value ?? "").toLowerCase().includes(normalizedFilter)));

  const selectedStudentCount = useMemo(() => selectedStudentIds.filter(id => eligibleStudents.some(student => student.id === id)).length, [selectedStudentIds, eligibleStudents]);

  const exportStudents = () => downloadCsv("student-directory.csv", makeCsv([["Name", "Email", "Username", "Student ID", "USN", "Branch", "Semester", "Section", "Class", "Roster Source"], ...students.map(student => [student.name, student.email, "", student.profile?.studentId, student.profile?.usn, student.profile?.branch, student.profile?.semester, student.profile?.section, student.profile?.className, student.profile?.importBatchId ? "Confirmed Excel import" : "Manual provisioning"])]));
  const exportResults = () => downloadCsv("assessment-results.csv", makeCsv([["Assessment", "Student", "Email", "Status", "Score", "Percentage", "Integrity events", "Submitted"], ...(results.data?.data ?? []).map(result => [result.assessmentTitle, result.studentName, result.studentEmail, result.status, result.score, result.percentage, result.violationCount, result.submittedAt ? new Date(result.submittedAt).toISOString() : ""])]));

  const updateQuestion = (index: number, key: keyof AssessmentQuestionDraft, value: string) => setAssessmentForm(current => ({ ...current, questions: current.questions.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  const importQuestions = async (file: File | undefined) => { if (!file) return; try { const questions = await parseQuestionImportFile(file); setAssessmentForm(current => ({ ...current, questions })); toast.success(`${questions.length} questions loaded into the MCQ builder.`); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to extract questions from this file."); } finally { setQuestionFileInputKey(key => key + 1); } };

  const submitAssessment = (event: React.FormEvent) => {
    event.preventDefault();
    const startAt = new Date(assessmentForm.startAt);
    const endAt = new Date(assessmentForm.endAt);
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      toast.error("Please enter valid start and end window dates.");
      return;
    }
    if (endAt <= startAt) {
      toast.error("The end window date/time must be after the start window date/time.");
      return;
    }
    const payload = { title: assessmentForm.title, startAt, endAt, durationMinutes: Number(assessmentForm.durationMinutes), maxAttempts: 1, accessCodeEnabled: Boolean(assessmentForm.accessCode), accessCode: assessmentForm.accessCode || undefined, randomizeQuestions: true, randomizeOptions: true, negativeMarking: false, antiCheat: { requireFullscreen: true, detectTabSwitch: true, detectWindowBlur: true, detectFullscreenExit: true, detectClipboard: true, detectContextMenu: true, detectShortcuts: true, violationThreshold: 5, autoSubmitOnThreshold: true }, questions: toAssessmentQuestions(assessmentForm.questions) };
    if (assessmentForm.editingId) updateAssessment.mutate({ ...payload, assessmentId: assessmentForm.editingId });
    else createAssessment.mutate(payload);
  };
  const publishSelected = () => { if (!publishTarget) return; if (!selectedStudentCount) { toast.error("Select at least one active student in your teaching scope."); return; } publish.mutate({ assessmentId: publishTarget.assessmentId, target: "SELECTED_ACTIVE", studentIds: selectedStudentIds }); };

  const tablesList = (tablesQuery.data?.data ?? []) as Array<{ id: number; name: string; students: StudentRow[] }>;
  const [selectedPublishTableId, setSelectedPublishTableId] = useState<number | null>(null);
  const targetTable = tablesList.find(t => t.id === selectedPublishTableId);

  return (
    <BlueprintShell role="TEACHER">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">TEACHER / ASSESSMENT OPERATIONS</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Assessment studio & command center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100/70">
            Build MCQ drafts, publish to custom student tables or all students, and review student test performance and integrity results.
          </p>
        </div>
        <label className="block text-xs font-semibold text-blue-100/75">
          Filter managed records
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="mt-1.5 w-full border-white/20 bg-slate-950/40 text-white lg:w-64"
            placeholder="Student, assessment, status…"
          />
        </label>
      </header>

      {/* Overview Metrics Cards */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active students", eligibleStudents.length],
          ["Assessments", metrics.assessments ?? 0],
          ["Assignments", metrics.assignments ?? 0],
          ["Submitted attempts", (results.data?.data ?? []).length],
        ].map(([label, value]) => (
          <div key={String(label)} className="metric-card">
            <BookOpenCheck className="size-5 text-cyan-300" />
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      {/* MCQ Builder & Assessment Register */}
      <section className="mt-5 grid items-start gap-5 xl:grid-cols-[1.05fr_.95fr]">
        {/* MCQ Builder Form — left column */}
        <section className="blueprint-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">MCQ AUTHORING ENGINE</p>
              <h2 className="mt-1 text-xl font-semibold text-white">
                {assessmentForm.editingId ? `Edit Assessment #${assessmentForm.editingId}` : "Create MCQ assessment"}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={downloadQuestionTemplate} className="border-cyan-300/40 text-cyan-100 hover:bg-cyan-300/10">
                <Download className="mr-2 size-4" />
                Excel template
              </Button>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-cyan-300/40 bg-slate-950/40 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/10">
                <Upload className="mr-2 size-4" />
                Import XLSX
                <input key={questionFileInputKey} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void importQuestions(e.target.files?.[0])} className="hidden" />
              </label>
            </div>
          </div>

          <form onSubmit={submitAssessment} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-blue-100/75 lg:col-span-2">
                Assessment title
                <Input required value={assessmentForm.title} onChange={(e) => setAssessmentForm((c) => ({ ...c, title: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white" placeholder="e.g. Data Structures & Algorithms Midterm" />
              </label>
              <label className="text-xs font-semibold text-blue-100/75">
                Start Window (Opens at)
                <Input required type="datetime-local" value={assessmentForm.startAt} onChange={(e) => setAssessmentForm((c) => ({ ...c, startAt: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white text-xs" />
              </label>
              <label className="text-xs font-semibold text-blue-100/75">
                End Window (Closes at)
                <Input required type="datetime-local" value={assessmentForm.endAt} onChange={(e) => setAssessmentForm((c) => ({ ...c, endAt: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white text-xs" />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-blue-100/75">
                Test Duration (Minutes per attempt)
                <Input required type="number" min={1} max={720} value={assessmentForm.durationMinutes} onChange={(e) => setAssessmentForm((c) => ({ ...c, durationMinutes: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white" placeholder="30" />
              </label>
            </div>

            <div>
              <label className="text-xs font-semibold text-blue-100/75">
                Access code <span className="font-normal text-blue-100/50">(optional — leave blank for open access)</span>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={assessmentForm.accessCode}
                    onChange={(e) => setAssessmentForm((c) => ({ ...c, accessCode: e.target.value }))}
                    className="border-white/20 bg-slate-950/40 text-white font-mono"
                    placeholder="e.g. QUIZ2026"
                    maxLength={32}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAssessmentForm((c) => ({ ...c, accessCode: Math.random().toString(36).slice(2, 9).toUpperCase() }))}
                    className="shrink-0 border-cyan-300/40 text-cyan-100 hover:bg-cyan-300/10"
                  >
                    Generate
                  </Button>
                </div>
              </label>
            </div>

            <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
              {assessmentForm.questions.map((question, index) => (
                <div key={index} className="rounded-xl border border-white/10 bg-slate-950/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-300">Question {index + 1}</span>
                    {assessmentForm.questions.length > 1 && (
                      <button type="button" onClick={() => setAssessmentForm((c) => ({ ...c, questions: c.questions.filter((_, i) => i !== index) }))} className="text-xs text-rose-300 hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                  <Input required value={question.questionText} onChange={(e) => updateQuestion(index, "questionText", e.target.value)} className="border-white/20 bg-slate-950/40 text-white" placeholder="Type question text..." />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["firstOption", "secondOption", "thirdOption", "fourthOption"] as const).map((optKey, optIdx) => {
                      const optId = ["a", "b", "c", "d"][optIdx];
                      return (
                        <div key={optKey} className="flex items-center gap-2">
                          <input type="radio" name={`correct-${index}`} checked={question.correctOption === optId} onChange={() => updateQuestion(index, "correctOption", optId)} className="accent-cyan-300" />
                          <Input required value={question[optKey]} onChange={(e) => updateQuestion(index, optKey, e.target.value)} className="border-white/20 bg-slate-950/40 text-white text-xs" placeholder={`Option ${optId.toUpperCase()}`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setAssessmentForm((c) => ({ ...c, questions: [...c.questions, { ...emptyQuestion }] }))} className="border-cyan-300/40 text-cyan-100 hover:bg-cyan-300/10">
                <Plus className="mr-2 size-4" />
                Add question
              </Button>
              <Button disabled={createAssessment.isPending || updateAssessment.isPending} className="bg-cyan-300 text-[#05205c] hover:bg-cyan-200">
                {(createAssessment.isPending || updateAssessment.isPending) && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save {assessmentForm.questions.length} question{assessmentForm.questions.length === 1 ? "" : "s"} as draft
              </Button>
            </div>
          </form>
        </section>

        {/* Authored Assessments Register — right column */}
        <section className="blueprint-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">ASSESSMENT REGISTER</p>
              <h2 className="mt-1 text-xl font-semibold text-white">My authored assessments</h2>
            </div>
            <span className="technical-chip">Publish targets: active students & student tables</span>
          </div>

          {publishTarget && (
            <div className="mt-5 rounded-xl border border-cyan-300/25 bg-cyan-950/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">PUBLISH TARGET</p>
                  <h3 className="mt-1 font-semibold text-white">{publishTarget.title}</h3>
                  <p className="mt-1 text-sm text-blue-100/70">Target all students, a custom student table, or specific roster students.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPublishTarget(null);
                    setSelectedStudentIds([]);
                    setSelectedPublishTableId(null);
                  }}
                  className="text-xs font-bold text-blue-200 hover:text-white"
                >
                  Cancel
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => publish.mutate({ assessmentId: publishTarget.assessmentId, target: "ALL_ACTIVE" })}
                  disabled={publish.isPending || !eligibleStudents.length}
                  className="rounded-lg border border-white/15 p-3 text-left transition hover:border-cyan-200 disabled:opacity-50"
                >
                  <span className="block text-sm font-semibold text-white">All roster students</span>
                  <span className="mt-1 block text-xs text-blue-100/65">Publish to {eligibleStudents.length} active students.</span>
                </button>
                <div className="rounded-lg border border-white/15 p-3">
                  <p className="text-sm font-semibold text-white">Publish to Student Table</p>
                  <select
                    value={selectedPublishTableId || ""}
                    onChange={(e) => setSelectedPublishTableId(Number(e.target.value) || null)}
                    className="mt-2 w-full h-8 border border-white/20 bg-slate-950/60 px-2 text-xs text-white rounded"
                  >
                    <option value="">Select a student table...</option>
                    {tablesList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.students.length} students)
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!selectedPublishTableId) return;
                      publish.mutate({ assessmentId: publishTarget.assessmentId, target: "TABLE", tableId: selectedPublishTableId });
                    }}
                    disabled={publish.isPending || !selectedPublishTableId}
                    className="mt-3 w-full bg-cyan-300 text-[#05205c] hover:bg-cyan-200"
                  >
                    <Send className="mr-2 size-4" />
                    Publish to Table ({targetTable?.students.length ?? 0})
                  </Button>
                </div>
                <div className="rounded-lg border border-white/15 p-3">
                  <p className="text-sm font-semibold text-white">Selected roster students</p>
                  <div className="mt-2 max-h-32 space-y-2 overflow-auto">
                    {eligibleStudents.map((student) => (
                      <label key={student.id} className="flex items-center gap-2 text-xs text-blue-100/80">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.id)}
                          onChange={(event) =>
                            setSelectedStudentIds((current) => (event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id)))
                          }
                        />
                        {student.name} <span className="text-blue-200/50">{student.profile?.usn || student.profile?.studentId || student.email}</span>
                      </label>
                    ))}
                  </div>
                  <Button type="button" onClick={publishSelected} disabled={publish.isPending || !selectedStudentCount} className="mt-3 w-full bg-cyan-300 text-[#05205c] hover:bg-cyan-200">
                    <Send className="mr-2 size-4" />
                    Publish selected ({selectedStudentCount})
                  </Button>
                </div>
              </div>
            </div>
          )}

          {visibleTests.length ? (
            <div className="mt-5 overflow-auto">
              <table className="technical-table">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Published Target</th>
                    <th>Window</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Results Status</th>
                    <th>Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTests.map((test) => {
                    const assignedCount = (test as any).assignedCount ?? 0;
                    const assignedTables = ((test as any).assignedTables ?? []) as string[];
                    return (
                      <tr key={test.id}>
                        <td className="font-semibold text-white">
                          {test.title}
                          <span className="block text-xs text-blue-200/55">{test.questions?.length ?? 0} questions</span>
                        </td>
                        <td>
                          {test.status === "PUBLISHED" || assignedCount > 0 ? (
                            <div className="space-y-1">
                              <span className="technical-chip border-cyan-400/40 text-cyan-300">
                                {assignedCount} student{assignedCount !== 1 ? "s" : ""}
                              </span>
                              {assignedTables.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {assignedTables.map((tName) => (
                                    <span key={tName} className="technical-chip text-[10px] bg-slate-900/60">
                                      {tName}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-blue-200/50">Not published</span>
                          )}
                        </td>
                        <td>{new Date(test.startAt).toLocaleString()}</td>
                        <td>{test.accessCodeEnabled ? <span className="font-mono text-xs">{test.accessCode || "—"}</span> : "Disabled"}</td>
                        <td>
                          <span className="technical-chip">{test.status}</span>
                        </td>
                        <td>
                          {test.status === "PUBLISHED" ? (
                            test.resultsPublished ? (
                              <span className="technical-chip border-emerald-400/40 text-emerald-300">Published</span>
                            ) : (
                              <span className="technical-chip border-amber-400/40 text-amber-200">Hidden</span>
                            )
                          ) : (
                            <span className="text-xs text-blue-200/50">—</span>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {test.status === "DRAFT" && (
                              <>
                                <button
                                  onClick={() => {
                                    const sDate = new Date(test.startAt);
                                    sDate.setMinutes(sDate.getMinutes() - sDate.getTimezoneOffset());
                                    const eDate = new Date(test.endAt);
                                    eDate.setMinutes(eDate.getMinutes() - eDate.getTimezoneOffset());
                                    setAssessmentForm({
                                      title: test.title,
                                      durationMinutes: String(test.durationMinutes),
                                      startAt: sDate.toISOString().slice(0, 16),
                                      endAt: eDate.toISOString().slice(0, 16),
                                      accessCode: test.accessCode ?? "",
                                      editingId: test.id,
                                      questions: (test.questions ?? []).map((question) => ({
                                        questionText: question.questionText,
                                        firstOption: question.options.find((option) => option.id === "a")?.text ?? "",
                                        secondOption: question.options.find((option) => option.id === "b")?.text ?? "",
                                        thirdOption: question.options.find((option) => option.id === "c")?.text ?? "",
                                        fourthOption: question.options.find((option) => option.id === "d")?.text ?? "",
                                        correctOption: question.correctOptionId,
                                      })),
                                    });
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }}
                                  className="technical-chip inline-flex items-center gap-1 hover:border-cyan-200"
                                >
                                  <BookOpenCheck className="size-3" />
                                  Edit
                                </button>
                                <button onClick={() => setPublishTarget({ assessmentId: test.id, title: test.title })} className="technical-chip hover:border-cyan-200">
                                  Publish
                                </button>
                              </>
                            )}
                            {test.status === "PUBLISHED" && (
                              <>
                                <button
                                  onClick={() => setPublishTarget({ assessmentId: test.id, title: test.title })}
                                  className="technical-chip border-cyan-300/40 text-cyan-200 hover:border-cyan-200"
                                  title="Assign/Republish this test to additional students or tables"
                                >
                                  Republish / Assign
                                </button>
                                <button
                                  onClick={() => toggleResultsPublish.mutate({ assessmentId: test.id, publish: !test.resultsPublished })}
                                  className={`technical-chip ${test.resultsPublished ? "border-amber-300/40 text-amber-200 hover:border-amber-200" : "border-emerald-300/40 text-emerald-300 hover:border-emerald-200"}`}
                                >
                                  {test.resultsPublished ? "Hide results" : "Publish results"}
                                </button>
                              </>
                            )}
                          {test.accessCode && (
                            <>
                              <button onClick={() => void copyValue(test.accessCode, "Quiz code")} className="technical-chip inline-flex items-center gap-1 hover:border-cyan-200">
                                <Clipboard className="size-3" />
                                Copy code
                              </button>
                              {test.status === "PUBLISHED" && (
                                <button onClick={() => manageAccessCode.mutate({ assessmentId: test.id, action: "REGENERATE" })} className="technical-chip hover:border-cyan-200">
                                  Regenerate
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => {
                              if (window.confirm(`${test.status === "DRAFT" ? "Delete" : "Archive"} ${test.title}?`)) {
                                removeAssessment.mutate({ assessmentId: test.id });
                              }
                            }}
                            className="technical-chip inline-flex items-center gap-1 text-rose-200 hover:border-rose-300"
                          >
                            <Trash2 className="size-3" />
                            {test.status === "DRAFT" ? "Delete" : "Archive"}
                          </button>
                          {test.status === "ARCHIVED" && (
                            <button
                              onClick={() => {
                                if (window.confirm(`⚠️ PERMANENT DELETE\n\nThis will permanently erase "${test.title}" along with ALL questions, assignments, and student attempt records.\n\nThis CANNOT be undone. Are you absolutely sure?`)) {
                                  hardDeleteAssessment.mutate({ assessmentId: test.id });
                                }
                              }}
                              className="technical-chip inline-flex items-center gap-1 border-red-500/50 text-red-300 hover:border-red-400 hover:bg-red-500/10 font-semibold"
                            >
                              <Trash2 className="size-3" />
                              Permanent Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No authored assessments match the current filter.</p>
          )}
        </section>
      </section>

      {/* Manual Provisioning — below Assessment Register */}
      <section className="blueprint-panel mt-5 p-5">
        <p className="eyebrow">MANUAL PROVISIONING</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Add a single student</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const username = (studentForm.username || studentForm.usn || studentForm.studentId || studentForm.email.split("@")[0]).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
            const password = (studentForm.temporaryPassword || studentForm.usn || studentForm.studentId || "Northstar123!").trim();
            createStudent.mutate({
              ...studentForm,
              username: username.length >= 3 ? username : `stu_${Date.now().toString(36)}`,
              temporaryPassword: password.length >= 8 ? password : "Northstar123!",
            });
          }}
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="text-xs font-semibold text-blue-100/75">
            Full Name
            <Input required value={studentForm.name} onChange={(e) => setStudentForm((c) => ({ ...c, name: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white" placeholder="e.g. Tanvi Gupta" />
          </label>
          <label className="text-xs font-semibold text-blue-100/75">
            Email Address
            <Input required type="email" value={studentForm.email} onChange={(e) => setStudentForm((c) => ({ ...c, email: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white" placeholder="e.g. tanvi@institution.edu" />
          </label>
          <label className="text-xs font-semibold text-blue-100/75">
            USN / Roll Number
            <Input value={studentForm.usn} onChange={(e) => setStudentForm((c) => ({ ...c, usn: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white" placeholder="e.g. 1MS21CS001" />
          </label>
          <label className="text-xs font-semibold text-blue-100/75">
            Branch / Dept
            <Input value={studentForm.branch} onChange={(e) => setStudentForm((c) => ({ ...c, branch: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white" placeholder="e.g. CSE" />
          </label>
          <label className="text-xs font-semibold text-blue-100/75">
            Semester / Term
            <Input value={studentForm.semester} onChange={(e) => setStudentForm((c) => ({ ...c, semester: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white" placeholder="e.g. 6th Sem" />
          </label>
          <label className="text-xs font-semibold text-blue-100/75">
            Section
            <Input value={studentForm.section} onChange={(e) => setStudentForm((c) => ({ ...c, section: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white" placeholder="e.g. Section A" />
          </label>
          <label className="text-xs font-semibold text-blue-100/75 sm:col-span-2 lg:col-span-2">
            Assign to Student Table <span className="font-normal text-blue-100/50">(optional)</span>
            <select
              value={targetTableForNewStudent}
              onChange={(e) => setTargetTableForNewStudent(e.target.value === "none" ? "none" : Number(e.target.value))}
              className="mt-1 flex h-9 w-full rounded-md border border-white/20 bg-slate-950/40 px-3 py-1 text-xs text-white shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="none">Master Directory Only (No custom table)</option>
              {tablesList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.students.length} students)
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-blue-100/75 sm:col-span-2 lg:col-span-1">
            Temporary Password <span className="font-normal text-blue-100/50">(optional)</span>
            <PasswordInput value={studentForm.temporaryPassword} onChange={(e) => setStudentForm((c) => ({ ...c, temporaryPassword: e.target.value }))} className="mt-1 border-white/20 bg-slate-950/40 text-white" placeholder="Defaults to USN" />
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Button disabled={createStudent.isPending || addStudentsToTable.isPending || !studentForm.name || !studentForm.email} className="w-full bg-cyan-300 text-[#05205c] hover:bg-cyan-200">
              {(createStudent.isPending || addStudentsToTable.isPending) && <Loader2 className="mr-2 size-4 animate-spin" />}
              Add student
            </Button>
          </div>
        </form>
      </section>

      {/* Enhanced Results & Integrity Review Section */}
      <section className="blueprint-panel mt-5 p-5" id="results">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">RESULTS / INTEGRITY REVIEW</p>
            <h2 className="mt-1 text-xl font-semibold text-white flex items-center gap-2">
              <Trophy className="size-5 text-cyan-300" />
              Teacher-scoped assessment results
            </h2>
            <p className="mt-1 text-sm text-blue-100/70">
              Review student score percentages, submission status, and proctoring integrity events. Publish test scores to make them visible on student dashboards.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#results"
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/40 bg-cyan-950/30 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-300/10"
            >
              <Trophy className="size-3.5" />
              Check results
            </a>
            <button onClick={exportResults} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:border-cyan-200 hover:text-white">
              <Download className="size-4" />
              Export CSV
            </button>
          </div>
        </div>

        {visibleResults.length ? (
          <div className="mt-5 overflow-auto">
            <table className="technical-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Student</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>Integrity Events</th>
                  <th>Result Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleResults.map((result) => (
                  <tr key={result.attemptId}>
                    <td className="font-semibold text-white">{result.assessmentTitle}</td>
                    <td>
                      <p className="font-medium text-white">{result.studentName}</p>
                      <p className="text-xs text-blue-100/60">{result.studentEmail}</p>
                    </td>
                    <td>{result.score} pts</td>
                    <td>
                      <span className="font-mono text-cyan-300 font-semibold">{result.percentage}%</span>
                    </td>
                    <td>
                      <span className={result.violationCount > 0 ? "text-amber-300 font-semibold" : "text-emerald-300"}>
                        {result.violationCount} event{result.violationCount === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td>
                      {result.resultsPublished ? (
                        <span className="technical-chip border-emerald-400/40 text-emerald-300">Published to student</span>
                      ) : (
                        <span className="technical-chip border-amber-400/40 text-amber-200">Hidden from student</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => toggleResultsPublish.mutate({ assessmentId: result.assessmentId, publish: !result.resultsPublished })}
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
        ) : (
          <p className="empty-state">No submitted attempts match the current filter.</p>
        )}
      </section>

      <ActivityLogPanel />
    </BlueprintShell>
  );
}
