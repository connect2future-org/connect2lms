import { BookOpenCheck, Building2, ClipboardCheck, GraduationCap, LogOut, ShieldCheck, UsersRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const roleConfig = {
  SUPER_ADMIN: { title: "Platform command", label: "SUPER ADMIN", icon: ShieldCheck, home: "/super-admin", links: [{ label: "Institution registry", href: "/super-admin", icon: Building2 }] },
  ADMIN: { title: "School command", label: "SCHOOL ADMIN", icon: Building2, home: "/admin", links: [{ label: "Faculty registry", href: "/admin", icon: UsersRound }] },
  TEACHER: { title: "Assessment studio", label: "TEACHER", icon: BookOpenCheck, home: "/teacher", links: [{ label: "Command center", href: "/teacher", icon: BookOpenCheck }, { label: "Roster import", href: "/teacher/import", icon: UsersRound }] },
  STUDENT: { title: "Assessment console", label: "STUDENT", icon: GraduationCap, home: "/student", links: [{ label: "My assessments", href: "/student", icon: ClipboardCheck }] },
} as const;

export function BlueprintShell({ role, children }: { role: keyof typeof roleConfig; children: React.ReactNode }) {
  const [, navigate] = useLocation(); const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => { try { sessionStorage.removeItem("lms-credential-session"); sessionStorage.removeItem("manus-cookie"); localStorage.removeItem("manus-runtime-user-info"); } catch {} utils.auth.me.setData(undefined, null); toast.success("Signed out."); navigate("/"); } });
  const config = roleConfig[role]; const Icon = config.icon;
  if (auth.isLoading) return <main className="blueprint-surface flex min-h-screen items-center justify-center text-blue-100">Loading authenticated workspace…</main>;
  if (!auth.data) return <main className="blueprint-surface flex min-h-screen items-center justify-center p-6"><div className="blueprint-panel max-w-md p-7"><p className="eyebrow">SESSION REQUIRED</p><h1 className="mt-2 text-2xl font-semibold text-white">Sign in to access this workspace.</h1><Link href="/" className="mt-5 inline-flex rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-bold text-[#05205c]">Return to sign in</Link></div></main>;
  if (auth.data.role !== role) return <main className="blueprint-surface flex min-h-screen items-center justify-center p-6"><div className="blueprint-panel max-w-md p-7"><p className="eyebrow">ACCESS BOUNDARY</p><h1 className="mt-2 text-2xl font-semibold text-white">This workspace is not assigned to your role.</h1><Link href={roleConfig[auth.data.role].home} className="mt-5 inline-flex rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-bold text-[#05205c]">Open assigned workspace</Link></div></main>;
  return <main className="blueprint-surface min-h-screen"><div className="relative mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[260px_1fr]"><aside className="border-b border-white/15 bg-[#03143c]/90 p-5 backdrop-blur lg:border-b-0 lg:border-r"><Link href={config.home} className="flex items-center gap-3"><div className="grid size-10 place-items-center border border-cyan-300/50 bg-cyan-300/10"><Icon className="size-5 text-cyan-300" /></div><div><p className="text-sm font-bold tracking-tight text-white">NORTHSTAR</p><p className="eyebrow mt-0.5">{config.label}</p></div></Link><nav className="mt-9 flex gap-2 overflow-auto lg:flex-col">{config.links.map(link => { const LinkIcon = link.icon; return <Link key={link.href} href={link.href} className="inline-flex shrink-0 items-center gap-3 border border-transparent px-3 py-2.5 text-sm font-medium text-blue-100/75 transition hover:border-cyan-300/25 hover:bg-cyan-300/8 hover:text-white"><LinkIcon className="size-4 text-cyan-300" />{link.label}</Link>; })}</nav><div className="mt-8 border-t border-white/10 pt-5 lg:mt-20"><p className="text-sm font-semibold text-white">{auth.data.name}</p><p className="mt-1 text-xs text-blue-100/60">{auth.data.email}</p><button onClick={() => logout.mutate()} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-blue-100/70 hover:text-cyan-200"><LogOut className="size-3.5" />Sign out securely</button></div></aside><div className="p-4 sm:p-7">{children}</div></div></main>;
}
