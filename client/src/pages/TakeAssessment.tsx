import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Maximize2, ShieldAlert } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

type IntegrityPolicy = { requireFullscreen?: boolean; detectTabSwitch?: boolean; detectWindowBlur?: boolean; detectFullscreenExit?: boolean; detectClipboard?: boolean; detectContextMenu?: boolean; detectShortcuts?: boolean };

function displayTime(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function TakeAssessment() {
  const [, params] = useRoute("/student/assessment/:assessmentId");
  const [, navigate] = useLocation();
  const assessmentId = Number(params?.assessmentId);
  const [accessCode, setAccessCode] = useState("");
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [time, setTime] = useState(0);
  const [completed, setCompleted] = useState<{ score: number; percentage: number; status: string } | null>(null);
  const start = trpc.attempts.start.useMutation();
  const assessment = trpc.attempts.questions.useQuery({ attemptId: attemptId ?? 0 }, { enabled: Boolean(attemptId) });
  const autosave = trpc.attempts.saveAnswer.useMutation();
  const submit = trpc.attempts.submit.useMutation();
  const violation = trpc.attempts.recordViolation.useMutation({ onSuccess: result => { if (result.data.autoSubmitted && result.data.result) setCompleted(result.data.result); } });
  const policy = (assessment.data?.antiCheat ?? {}) as IntegrityPolicy;
  const questionCount = assessment.data?.data.length ?? 0;

  useEffect(() => { if (assessment.data) setAnswers(assessment.data.savedAnswers); }, [assessment.data]);
  useEffect(() => {
    if (!assessment.data?.expiresAt || completed) return;
    const update = () => setTime(new Date(assessment.data!.expiresAt).getTime() - Date.now());
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [assessment.data?.expiresAt, completed]);
  useEffect(() => { if (time <= 0 && attemptId && assessment.data && !completed && !submit.isPending) void handleSubmit(); }, [time]);

  useEffect(() => {
    if (!attemptId || !assessment.data || completed) return;
    const report = (eventType: "TAB_HIDDEN" | "WINDOW_BLUR" | "FULLSCREEN_EXIT" | "COPY" | "PASTE" | "CUT" | "CONTEXT_MENU" | "SHORTCUT") => violation.mutate({ attemptId, eventType });
    const onVisibility = () => { if (document.hidden && policy.detectTabSwitch) report("TAB_HIDDEN"); };
    const onBlur = () => { if (policy.detectWindowBlur) report("WINDOW_BLUR"); };
    const onFullscreen = () => { if (policy.detectFullscreenExit && !document.fullscreenElement) report("FULLSCREEN_EXIT"); };
    const onClipboard = (event: ClipboardEvent) => { if (!policy.detectClipboard) return; event.preventDefault(); report(event.type === "copy" ? "COPY" : event.type === "paste" ? "PASTE" : "CUT"); };
    const onContext = (event: MouseEvent) => { if (policy.detectContextMenu) { event.preventDefault(); report("CONTEXT_MENU"); } };
    const onShortcut = (event: KeyboardEvent) => { if (policy.detectShortcuts && (event.ctrlKey || event.metaKey) && ["c", "v", "x", "p"].includes(event.key.toLowerCase())) { event.preventDefault(); report("SHORTCUT"); } };
    document.addEventListener("visibilitychange", onVisibility); window.addEventListener("blur", onBlur); document.addEventListener("fullscreenchange", onFullscreen); document.addEventListener("copy", onClipboard); document.addEventListener("paste", onClipboard); document.addEventListener("cut", onClipboard); document.addEventListener("contextmenu", onContext); document.addEventListener("keydown", onShortcut);
    if (policy.requireFullscreen && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => toast.warning("Fullscreen could not be entered. The integrity policy remains active."));
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("blur", onBlur); document.removeEventListener("fullscreenchange", onFullscreen); document.removeEventListener("copy", onClipboard); document.removeEventListener("paste", onClipboard); document.removeEventListener("cut", onClipboard); document.removeEventListener("contextmenu", onContext); document.removeEventListener("keydown", onShortcut); };
  }, [attemptId, assessment.data, completed, policy.detectClipboard, policy.detectContextMenu, policy.detectFullscreenExit, policy.detectShortcuts, policy.detectTabSwitch, policy.detectWindowBlur, policy.requireFullscreen]);

  const answerCount = useMemo(() => Object.keys(answers).length, [answers]);
  async function handleStart() {
    if (!Number.isInteger(assessmentId) || assessmentId < 1) { toast.error("This assessment link is invalid."); return; }
    try { const result = await start.mutateAsync({ assessmentId, accessCode: accessCode || undefined }); setAttemptId(result.data.attemptId ?? null); toast.success("Assessment started. The server controls the remaining time."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Assessment access was denied."); }
  }
  async function handleAnswer(questionId: number, selectedOptionId: string) {
    if (!attemptId) return;
    setAnswers(current => ({ ...current, [String(questionId)]: selectedOptionId }));
    try { await autosave.mutateAsync({ attemptId, questionId, selectedOptionId }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "The answer could not be saved."); }
  }
  async function handleSubmit() {
    if (!attemptId || completed) return;
    try { const result = await submit.mutateAsync({ attemptId }); setCompleted(result.data); if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Submission could not be completed."); }
  }

  if (completed) return <main className="blueprint-surface flex min-h-screen items-center justify-center p-6"><section className="blueprint-panel w-full max-w-xl p-8 text-center"><CheckCircle2 className="mx-auto size-12 text-emerald-300" /><p className="eyebrow mt-5">ASSESSMENT RECORDED</p><h1 className="mt-2 text-3xl font-semibold text-white">{completed.status === "AUTO_SUBMITTED" ? "Attempt automatically submitted" : "Assessment submitted"}</h1><div className="mt-7 grid grid-cols-2 gap-3"><div className="metric-card"><span>Score</span><strong>{completed.score}</strong></div><div className="metric-card"><span>Percentage</span><strong>{completed.percentage}%</strong></div></div><Button className="mt-7 bg-cyan-300 text-[#05205c] hover:bg-cyan-200" onClick={() => navigate("/student")}>View assessment history</Button></section></main>;
  if (!attemptId) return <main className="blueprint-surface flex min-h-screen items-center justify-center p-6"><section className="blueprint-panel w-full max-w-lg p-8"><p className="eyebrow">SECURE ASSESSMENT GATEWAY</p><h1 className="mt-2 text-3xl font-semibold text-white">Verify access</h1><p className="mt-3 text-sm leading-6 text-blue-100/75">Your account assignment, assessment window, account status, attempt count, and access code are checked by the server before an attempt can begin.</p><label className="mt-7 block text-sm font-medium text-blue-50">Access code <span className="text-blue-200/60">(if required)</span><Input value={accessCode} onChange={event => setAccessCode(event.target.value.toUpperCase())} className="mt-2 border-white/20 bg-slate-950/40 font-mono tracking-[0.16em] text-white" placeholder="MATH-7K29X" /></label><Button onClick={() => void handleStart()} disabled={start.isPending} className="mt-6 w-full bg-cyan-300 text-[#05205c] hover:bg-cyan-200">{start.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Maximize2 className="mr-2 size-4" />}Start secure assessment</Button></section></main>;
  if (assessment.isLoading) return <main className="blueprint-surface flex min-h-screen items-center justify-center text-blue-100"><Loader2 className="mr-3 size-5 animate-spin" />Loading server-authorized assessment…</main>;
  if (assessment.error) return <main className="blueprint-surface flex min-h-screen items-center justify-center p-6"><section className="blueprint-panel max-w-lg p-7"><AlertTriangle className="size-8 text-amber-300" /><h1 className="mt-4 text-xl font-semibold text-white">Assessment unavailable</h1><p className="mt-2 text-sm text-blue-100/70">{assessment.error.message}</p><Button className="mt-5" onClick={() => navigate("/student")}>Return to dashboard</Button></section></main>;
  return <main className="blueprint-surface min-h-screen p-4 sm:p-7"><header className="blueprint-panel sticky top-4 z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 p-4"><div><p className="eyebrow">LIVE ATTEMPT / {answerCount} OF {questionCount} ANSWERED</p><p className="mt-1 text-sm text-blue-100/70">Answers are saved directly to the secure assessment record.</p></div><div className={`rounded-lg border px-4 py-2 font-mono text-xl font-bold ${time < 60_000 ? "border-rose-300/60 text-rose-200" : "border-cyan-300/45 text-cyan-200"}`}><Clock3 className="mr-2 inline size-4" />{displayTime(time)}</div></header><section className="mx-auto mt-5 max-w-6xl space-y-4">{policy.requireFullscreen && <div className="flex items-center gap-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"><ShieldAlert className="size-5 text-amber-300" />Fullscreen is required by this assessment's integrity policy.</div>}{assessment.data?.data.map((question, index) => <article key={question.id} className="blueprint-panel p-6"><p className="eyebrow">QUESTION {String(index + 1).padStart(2, "0")} / {question.marks} MARKS</p><h2 className="mt-3 text-lg font-semibold leading-7 text-white">{question.questionText}</h2><div className="mt-5 grid gap-3">{question.options.map(option => <button key={option.id} onClick={() => void handleAnswer(question.id, option.id)} className={`option-choice text-left ${answers[String(question.id)] === option.id ? "option-choice-selected" : ""}`}><span className="option-token">{option.id}</span><span>{option.text}</span></button>)}</div></article>)}<div className="flex justify-end pb-6"><Button onClick={() => void handleSubmit()} disabled={submit.isPending} className="bg-cyan-300 text-[#05205c] hover:bg-cyan-200">{submit.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Submit for server scoring</Button></div></section></main>;
}
