import { Download, Search, UsersRound, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BlueprintShell } from "@/components/BlueprintShell";
import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 10;

type StudentRecord = {
  id: number;
  name: string | null;
  email: string | null;
  username?: string | null;
  status: string;
  profile?: {
    importBatchId?: number | null;
    studentId?: string | null;
    usn?: string | null;
    branch?: string | null;
    semester?: string | null;
    section?: string | null;
    className?: string | null;
  };
};

function makeCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function downloadDirectory(students: StudentRecord[]) {
  const csv = makeCsv([
    ["Name", "Email", "Username", "Student ID", "USN", "Branch", "Semester", "Section", "Class", "Roster Source", "Status"],
    ...students.map(student => [
      student.name,
      student.email,
      student.username,
      student.profile?.studentId,
      student.profile?.usn,
      student.profile?.branch,
      student.profile?.semester,
      student.profile?.section,
      student.profile?.className,
      student.profile?.importBatchId ? "Confirmed Excel import" : "Manual provisioning",
      student.status,
    ]),
  ]);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "student-directory.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function TeacherStudents() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const queryInput = useMemo(() => { const value = search.trim(); return value ? { search: value } : undefined; }, [search]);
  const query = trpc.people.teacher.listStudents.useQuery(queryInput);
  const students = (query.data?.data ?? []) as StudentRecord[];
  const activeCount = students.filter(student => student.status === "ACTIVE").length;
  const importedCount = students.filter(student => Boolean(student.profile?.importBatchId)).length;
  const manualCount = students.length - importedCount;

  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = students.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset page when search changes
  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <BlueprintShell role="TEACHER">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">TEACHER / STUDENT DIRECTORY</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Students</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100/70">
            One structured view of every student in your teaching scope, matching the roster template fields used for import and publishing.
          </p>
        </div>
        <label className="block text-xs font-semibold text-blue-100/75">
          Search directory
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-blue-200/50" />
            <Input value={search} onChange={event => handleSearch(event.target.value)} className="w-full border-white/20 bg-slate-950/40 pl-9 text-white lg:w-72" placeholder="Name, email, ID, or USN" />
          </div>
        </label>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="metric-card"><UsersRound className="size-5 text-cyan-300" /><span>Total records</span><strong>{students.length}</strong></div>
        <div className="metric-card"><UsersRound className="size-5 text-cyan-300" /><span>Active</span><strong>{activeCount}</strong></div>
        <div className="metric-card"><UsersRound className="size-5 text-cyan-300" /><span>Imported / manual</span><strong>{importedCount} / {manualCount}</strong></div>
      </section>

      <section className="blueprint-panel mt-5 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="eyebrow">STRUCTURED STUDENT RECORDS</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Roster-aligned directory</h2>
            <p className="mt-1 text-sm text-blue-100/70">The table is read-only for review. Use the Assessment studio for creation, deletion, publishing, and roster import controls.</p>
          </div>
          <button type="button" onClick={() => downloadDirectory(students)} disabled={!students.length} className="inline-flex items-center gap-2 self-start text-xs font-bold text-cyan-200 hover:text-white disabled:opacity-50">
            <Download className="size-4" />
            Export directory
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="technical-table min-w-[1120px]">
            <thead>
              <tr>
                <th>Student</th>
                <th>USN</th>
                <th>Branch</th>
                <th>Semester</th>
                <th>Section</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedStudents.length ? pagedStudents.map(student => (
                <tr key={student.id}>
                  <td>
                    <p className="font-medium text-white">{student.name || "Unnamed student"}</p>
                    <p className="text-xs text-blue-100/60">{student.email || "No email"}</p>
                  </td>
                  <td>
                    <p className="font-mono text-xs">{student.profile?.usn || "No USN"}</p>
                  </td>
                  <td>{student.profile?.branch || "—"}</td>
                  <td>{student.profile?.semester || "—"}</td>
                  <td>{student.profile?.section || "—"}</td>
                  <td><span className="technical-chip">{student.profile?.importBatchId ? "Excel roster" : "Manual"}</span></td>
                  <td><span className="technical-chip">{student.status}</span></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7}>
                    <p className="empty-state">{query.isLoading ? "Loading student records…" : "No student records match this search."}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {students.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-blue-100/60">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, students.length)} of {students.length} students
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="border-white/20 text-blue-100 hover:border-cyan-300 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
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
                        onClick={() => setPage(item as number)}
                        className={`h-7 min-w-[1.75rem] rounded px-1.5 text-xs font-bold transition ${
                          safePage === item
                            ? "bg-cyan-300 text-[#05205c]"
                            : "border border-white/15 text-blue-100 hover:border-cyan-300"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="border-white/20 text-blue-100 hover:border-cyan-300 disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </BlueprintShell>
  );
}
