import { useState } from "react";
import { FileSpreadsheet, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { parseStudentImportFile } from "@/lib/importFile";
import { trpc } from "@/lib/trpc";

type Preview = {
  batchId?: number;
  summary: { total: number; valid: number; invalid: number; existing: number; duplicates: number; new: number };
  rows: Array<{ rowNumber: number; name: string; email: string; username: string; studentId?: string; usn?: string; branch?: string; semester?: string; section?: string; className?: string; errors: string[]; valid: boolean }>;
};

export function StudentImportPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [password, setPassword] = useState("");
  const previewMutation = trpc.imports.preview.useMutation();
  const confirmMutation = trpc.imports.confirm.useMutation();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setPreview(null);
    try {
      const rows = await parseStudentImportFile(file);
      if (!rows.length) throw new Error("No student rows were found after reading the header row.");
      const result = await previewMutation.mutateAsync({ sourceName: file.name, rows });
      setPreview(result.data as Preview);
      toast.success("Preview generated. No student records have been changed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to parse the import file.");
    }
  };

  const confirm = async () => {
    if (!preview?.batchId) return;
    if (password.length < 12) { toast.error("Set a temporary password of at least 12 characters."); return; }
    try {
      const result = await confirmMutation.mutateAsync({ batchId: preview.batchId, defaultTemporaryPassword: password });
      toast.success(`Import confirmed: ${result.data.summary.created} created and ${result.data.summary.updated} updated.`);
      setPreview(null);
      setPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The server could not confirm this import.");
    }
  };

  return (
    <section className="blueprint-panel p-5" aria-labelledby="student-import-title">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">STUDENT DIRECTORY / IMPORT</p>
          <h2 id="student-import-title" className="mt-1 text-xl font-semibold text-white">Validated roster intake</h2>
          <p className="mt-1 max-w-2xl text-sm text-blue-100/70">Upload a CSV, XLSX, or XLS roster. The server maps known columns, validates each record, and requires a separate confirmation before any student is created or updated. Scroll the preview horizontally to verify academic fields before confirming.</p>
        </div>
        <ShieldCheck className="size-7 shrink-0 text-cyan-300" aria-hidden="true" />
      </div>
      <label className="file-drop-zone flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-cyan-300/45 px-4 py-5 transition hover:border-cyan-200 hover:bg-white/5">
        {previewMutation.isPending ? <Loader2 className="size-5 animate-spin text-cyan-300" /> : <Upload className="size-5 text-cyan-300" />}
        <span className="text-sm text-blue-50">Choose roster file <span className="text-blue-200/60">(CSV, XLSX, XLS · max. 10 MB)</span></span>
        <Input className="sr-only" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={event => void handleFile(event.target.files?.[0])} disabled={previewMutation.isPending} />
      </label>
      {preview && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(preview.summary).map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-blue-200/65">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>)}
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-white/10">
            <table className="min-w-[980px] w-full text-left text-sm"><thead className="sticky top-0 bg-[#08245f] text-blue-100"><tr><th className="p-3">Row</th><th className="p-3">Student</th><th className="p-3">Email</th><th className="p-3">Student ID / USN</th><th className="p-3">Branch</th><th className="p-3">Term</th><th className="p-3">Validation</th></tr></thead><tbody>{preview.rows.slice(0, 25).map(row => <tr key={row.rowNumber} className="border-t border-white/10 text-blue-50/85"><td className="p-3 font-mono text-xs">{row.rowNumber}</td><td className="p-3">{row.name || "—"}</td><td className="p-3">{row.email || "—"}<span className="block text-xs text-blue-200/55">{row.username || "username auto-generated"}</span></td><td className="p-3">{row.studentId || row.usn || "—"}<span className="block text-xs text-blue-200/55">{row.usn && row.studentId ? row.usn : ""}</span></td><td className="p-3">{row.branch || "—"}</td><td className="p-3">{[row.semester, row.section, row.className].filter(Boolean).join(" / ") || "—"}</td><td className={`p-3 ${row.valid ? "text-emerald-300" : "text-amber-300"}`}>{row.valid ? "Ready" : row.errors.join(" ")}</td></tr>)}</tbody></table>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-cyan-300/20 bg-cyan-950/20 p-4 sm:flex-row sm:items-end">
            <div className="flex-1"><label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-blue-100">Temporary password for new students</label><PasswordInput value={password} onChange={event => setPassword(event.target.value)} className="border-white/20 bg-slate-950/40 text-white" placeholder="At least 12 characters" /></div>
            <Button onClick={() => void confirm()} disabled={confirmMutation.isPending || preview.summary.valid === 0} className="bg-cyan-300 text-[#05205c] hover:bg-cyan-200">{confirmMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4" />}Confirm safe import</Button>
          </div>
        </div>
      )}
    </section>
  );
}
