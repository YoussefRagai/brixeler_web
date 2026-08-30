"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type AcceptState = "verifying" | "ready" | "submitting" | "done";

function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase public environment is missing.");
  return createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: false } });
}

export function AdminInviteAcceptClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [state, setState] = useState<AcceptState>("verifying");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadInviteSession() {
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (!cancelled) {
            setError("This invite link is invalid or has expired. Ask a super admin to send a new invite.");
            setState("ready");
          }
          return;
        }
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        if (!cancelled) {
          setError("This invite link is invalid or has expired. Ask a super admin to send a new invite.");
          setState("ready");
        }
        return;
      }
      if (!cancelled) {
        setFullName((data.session.user.user_metadata?.full_name as string | undefined) ?? "");
        setState("ready");
      }
    }
    void loadInviteSession();
    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase]);

  async function completeSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setState("submitting");
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: fullName.trim() ? { full_name: fullName.trim(), portal: "admin" } : { portal: "admin" },
    });
    if (updateError) {
      setError(updateError.message);
      setState("ready");
      return;
    }
    await supabase.auth.signOut();
    setState("done");
    router.replace("/admin/login?message=Access+set+up.+Sign+in+with+your+new+password.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f8f8] px-4 text-[#050505]">
      <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 shadow-xl shadow-black/5">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Brixeler</p>
        <h1 className="mt-2 text-2xl font-semibold">Complete admin access</h1>
        <p className="mt-1 text-sm text-neutral-500">Set a password to finish your time-limited admin invitation.</p>
        {error ? <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
        {state === "verifying" ? (
          <p className="mt-6 rounded-2xl border border-black/10 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">Verifying your invite…</p>
        ) : state === "done" ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-800">Access set up. Redirecting to admin login…</p>
        ) : (
          <form onSubmit={completeSetup} className="mt-6 space-y-4">
            <label className="flex flex-col gap-2 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-400">Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" autoComplete="name" /></label>
            <label className="flex flex-col gap-2 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-400">Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" autoComplete="new-password" /></label>
            <label className="flex flex-col gap-2 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-400">Confirm password</span><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={8} required className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" autoComplete="new-password" /></label>
            <button disabled={state === "submitting"} className="w-full rounded-full bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{state === "submitting" ? "Saving…" : "Finish setup"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
