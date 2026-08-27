import { ChevronLeft, GraduationCap } from "lucide-react";
import { Link } from "wouter";
import { StudentImportPanel } from "@/components/StudentImportPanel";
import { BlueprintShell } from "@/components/BlueprintShell";

function TeacherImportContent() {
  return (
    <main className="blueprint-surface min-h-screen p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-blue-100/80 transition hover:text-white"><ChevronLeft className="size-4" />Return to command center</Link>
          <div className="flex items-center gap-2 text-blue-100"><GraduationCap className="size-5 text-cyan-300" /><span className="text-sm font-semibold tracking-wide">NORTHSTAR ASSESSMENTS</span></div>
        </div>
        <StudentImportPanel />
      </div>
    </main>
  );
}

export default function TeacherImport() {
  return <BlueprintShell role="TEACHER"><TeacherImportContent /></BlueprintShell>;
}
