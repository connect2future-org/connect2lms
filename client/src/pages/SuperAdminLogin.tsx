import { useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export default function SuperAdminLogin() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.ownerLogin.useMutation({
    onSuccess: async result => {
      try {
        sessionStorage.setItem("lms-credential-session", "1");
        sessionStorage.removeItem("manus-cookie");
        localStorage.removeItem("manus-runtime-user-info");
      } catch {}
      utils.auth.me.setData(undefined, result.data.user);
      await utils.auth.me.invalidate();
      toast.success("Super Admin owner session established.");
      navigate("/super-admin");
    },
    onError: error => toast.error(error.message),
  });

  return <main className="blueprint-surface flex min-h-screen items-center justify-center p-4 sm:p-8"><section className="blueprint-panel w-full max-w-lg p-6 sm:p-8"><Link href="/" className="eyebrow text-cyan-200 hover:text-white">← RETURN TO NORTHSTAR</Link><div className="mt-7 flex items-center gap-3"><ShieldCheck className="size-7 text-cyan-300" /><div><p className="eyebrow">OWNER-ONLY CONTROL</p><h1 className="mt-1 text-3xl font-semibold text-white">Super Admin sign in</h1></div></div><p className="mt-3 text-sm leading-6 text-blue-100/70">Use the dedicated platform-owner email and password. Institution Admin, Teacher, and Student accounts cannot use this entry point.</p><form onSubmit={event => { event.preventDefault(); login.mutate({ email, password }); }} className="mt-7 grid gap-4"><label className="text-sm font-medium text-blue-50">Owner email<Input required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 border-white/20 bg-slate-950/40 text-white" placeholder="owner@your-domain.example" /></label><label className="text-sm font-medium text-blue-50">Owner password<Input required minLength={8} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 border-white/20 bg-slate-950/40 text-white" /></label><Button disabled={login.isPending} className="w-full bg-cyan-300 text-[#05205c] hover:bg-cyan-200">{login.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Open Super Admin registry<ArrowRight className="ml-2 size-4" /></Button></form><p className="mt-6 text-xs leading-5 text-blue-100/55">Owner credentials are managed securely outside the client bundle. Use at least 8 characters. Never share the password in chat or with institution users.</p></section></main>;
}
