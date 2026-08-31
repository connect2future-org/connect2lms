import { useState } from "react";
import { Building2, Copy, Loader2, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { BlueprintShell } from "@/components/BlueprintShell";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { trpc } from "@/lib/trpc";

const blankForm = { name: "", institutionType: "School", contactEmail: "", adminName: "", adminEmail: "", adminUsername: "", temporaryPassword: "" };
const normalizeUsername = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export default function SuperAdminDashboard() {
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [issued, setIssued] = useState<{ institution: string; code: string; adminUsername: string; temporaryPassword?: string } | null>(null);
  const ownerReady = auth.data?.role === "SUPER_ADMIN";
  const dashboard = trpc.platform.dashboard.useQuery(undefined, { enabled: ownerReady });
  const schools = trpc.platform.schools.list.useQuery(search ? { search } : undefined, { enabled: ownerReady });
  const passwordValid = form.temporaryPassword.length >= 12;
  const usernameValid = /^[a-zA-Z0-9._-]{3,80}$/.test(form.adminUsername);
  const removeSchool = trpc.platform.schools.remove.useMutation({ onSuccess: result => { toast.success(result.message); void utils.platform.dashboard.invalidate(); void utils.platform.schools.list.invalidate(); }, onError: error => toast.error(error.message) });
  const create = trpc.platform.schools.create.useMutation({
    onSuccess: result => { setIssued({ institution: result.data.school.name, code: result.data.school.code, adminUsername: result.data.admin?.username ?? form.adminUsername, temporaryPassword: form.temporaryPassword }); toast.success("Institution provisioned. Record the issued code below."); setShowForm(false); setForm(blankForm); void utils.platform.dashboard.invalidate(); void utils.platform.schools.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const metrics = (dashboard.data?.data as { metrics?: Record<string, number> } | undefined)?.metrics ?? {};
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!usernameValid) { toast.error("Administrator usernames need 3–80 letters, numbers, dots, underscores, or hyphens."); return; } if (!passwordValid) { toast.error("The initial Administrator password must contain at least 12 characters."); return; } create.mutate({ name: form.name, institutionType: form.institutionType, contactEmail: form.contactEmail || undefined, admin: { name: form.adminName, email: form.adminEmail, username: form.adminUsername, temporaryPassword: form.temporaryPassword } }); };
  const copyInstitutionCode = async (code: string) => { try { await navigator.clipboard.writeText(code); toast.success(`Institution login code ${code} copied.`); } catch { toast.error("Could not copy the code. Select and copy it manually."); } };
  const field = (key: Exclude<keyof typeof form, "temporaryPassword" | "adminUsername">, label: string) => <label key={key} className="text-xs font-semibold text-blue-100/75">{label}<Input required value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} className="mt-1.5 border-white/20 bg-slate-950/40 text-white" /></label>;

  return <BlueprintShell role="SUPER_ADMIN"><header className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="eyebrow">PLATFORM / MULTI-TENANT CONTROL</p><h1 className="mt-2 text-3xl font-semibold text-white">Institution registry</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/70">Provision schools with isolated administrative boundaries and inspect platform-wide activity without trusting client-supplied tenant context.</p></div><Button onClick={() => setShowForm(value => !value)} className="bg-cyan-300 text-[#05205c] hover:bg-cyan-200"><Plus className="mr-2 size-4" />Provision school</Button></header>
    {showForm && <form onSubmit={handleSubmit} className="blueprint-panel mt-6 grid gap-3 p-5 md:grid-cols-2"><div className="md:col-span-2"><p className="eyebrow">NEW INSTITUTION / ADMIN BOOTSTRAP</p><p className="mt-2 text-sm text-blue-100/70">All fields are required except the institution contact email. The initial Administrator password must have at least 12 characters.</p></div>{field("name", "Institution name")}{field("institutionType", "Institution type")}{field("contactEmail", "Contact email")}{field("adminName", "Administrator name")}{field("adminEmail", "Administrator email")}<label className="text-xs font-semibold text-blue-100/75">Administrator username<Input required minLength={3} maxLength={80} pattern="[a-zA-Z0-9._-]+" value={form.adminUsername} onChange={event => setForm(current => ({ ...current, adminUsername: normalizeUsername(event.target.value) }))} aria-describedby="administrator-username-requirement" className="mt-1.5 border-white/20 bg-slate-950/40 text-white" /></label><p id="administrator-username-requirement" className={`self-end text-xs ${usernameValid ? "text-emerald-300" : "text-amber-200"}`}>{usernameValid ? `Issued as ${form.adminUsername}` : "Use 3–80 letters, numbers, dots, underscores, or hyphens. Spaces become hyphens."}</p><label className="text-xs font-semibold text-blue-100/75">Administrator temporary password<PasswordInput required minLength={12} value={form.temporaryPassword} onChange={event => setForm(current => ({ ...current, temporaryPassword: event.target.value }))} aria-describedby="temporary-password-requirement" className="mt-1.5 border-white/20 bg-slate-950/40 text-white" /></label><p id="temporary-password-requirement" className={`self-end text-xs ${passwordValid ? "text-emerald-300" : "text-amber-200"}`}>{form.temporaryPassword.length}/12 characters — {passwordValid ? "password length accepted" : "at least 12 characters required"}</p><div className="md:col-span-2"><Button disabled={create.isPending || !passwordValid || !usernameValid} className="bg-cyan-300 text-[#05205c] hover:bg-cyan-200">{create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Create isolated school</Button></div></form>}
    <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="metric-card">
        <ShieldCheck className="size-5 text-cyan-300" />
        <span>Schools</span>
        <strong>{metrics.schools ?? 0}</strong>
      </div>
      <div className="metric-card">
        <ShieldCheck className="size-5 text-cyan-300" />
        <span>All identities</span>
        <strong>{metrics.users ?? 0}</strong>
        <span className="mt-1 block text-[11px] font-normal text-blue-100/70">
          Super Admins: {metrics.superAdmins ?? 0} | Admins: {metrics.admins ?? 0} | Teachers: {metrics.teachers ?? 0} | Students: {metrics.students ?? 0}
        </span>
      </div>
      <div className="metric-card">
        <ShieldCheck className="size-5 text-cyan-300" />
        <span>Assessments</span>
        <strong>{metrics.assessments ?? 0}</strong>
      </div>
      <div className="metric-card">
        <ShieldCheck className="size-5 text-cyan-300" />
        <span>Assignments</span>
        <strong>{metrics.assignments ?? 0}</strong>
      </div>
    </section>
    <section className="blueprint-panel mt-5 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="eyebrow">TENANT REGISTRY</p><h2 className="mt-1 text-xl font-semibold text-white">Provisioned institutions</h2><p className="mt-1 text-xs text-blue-100/65">Share the institution login code with each account you issue for that school or college.</p></div><label className="relative"><Search className="absolute left-3 top-3 size-4 text-cyan-300" /><Input value={search} onChange={event => setSearch(event.target.value)} className="border-white/20 bg-slate-950/40 pl-9 text-white" placeholder="Search name or login code" /></label></div>{schools.isLoading ? <p className="empty-state">Loading institutional boundaries…</p> : schools.data?.data.length ? <div className="mt-5 overflow-auto"><table className="technical-table"><thead><tr><th>Institution</th><th>Institution login code</th><th>Admin Username</th><th><span className="flex items-center gap-1">Admin Password<button type="button" onClick={() => setShowPasswords(v => !v)} className="ml-1 text-[10px] text-cyan-300 hover:text-cyan-100 underline">{showPasswords ? "Hide" : "Show"}</button></span></th><th>Type</th><th>Status</th><th>Provisioned</th><th>Operations</th></tr></thead><tbody>{schools.data.data.map((school: any) => <tr key={school.id}><td className="font-semibold text-white">{school.name}</td><td><div className="flex items-center gap-2"><code className="font-mono text-cyan-200">{school.code}</code><Button type="button" variant="ghost" size="icon" onClick={() => void copyInstitutionCode(school.code)} aria-label={`Copy institution login code for ${school.name}`} title="Copy institution login code" className="size-7 text-cyan-200 hover:bg-cyan-300/10 hover:text-cyan-100"><Copy className="size-3.5" /></Button></div></td><td className="font-mono text-xs text-cyan-300">{school.adminUsername || "—"}</td><td className="font-mono text-xs"><span className={school.initialPassword ? "text-emerald-300 font-semibold" : "text-blue-100/50"}>{school.initialPassword ? (showPasswords ? school.initialPassword : "••••••••••••") : "—"}</span></td><td>{school.institutionType}</td><td><span className="technical-chip">{school.status}</span></td><td>{new Date(school.createdAt).toLocaleDateString()}</td><td><button type="button" onClick={() => { if (window.confirm(`Delete ${school.name}? All institution accounts and data will be permanently deleted.`)) removeSchool.mutate({ schoolId: school.id }); }} className="technical-chip inline-flex items-center gap-1 text-rose-200 hover:border-rose-300"><Trash2 className="size-3" />Delete</button></td></tr>)}</tbody></table></div> : <p className="empty-state">No institutions match the current filter.</p>}</section><ActivityLogPanel />
  </BlueprintShell>;
}
