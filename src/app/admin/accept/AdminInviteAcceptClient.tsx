"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { openPortalInviteSession } from "@/lib/portalInviteSession";

type AcceptState = "verifying" | "invalid" | "ready" | "submitting" | "done";

export function AdminInviteAcceptClient() {
  const router = useRouter();
  const verification = useRef<ReturnType<typeof openPortalInviteSession> | null>(null);
  const [invite, setInvite] = useState<Awaited<ReturnType<typeof openPortalInviteSession>>>(null);
  const [state, setState] = useState<AcceptState>("verifying");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    verification.current ??= openPortalInviteSession("admin");
    void verification.current.then((result) => {
      if (cancelled) return;
      if (!result) {
        setError("This invite is invalid or has expired. Ask a super admin for a new invitation.");
        setState("invalid");
        return;
      }
      const name = result.session.user.user_metadata?.full_name;
      setFullName(typeof name === "string" ? name : "");
      setInvite(result);
      setState("ready");
    }).catch(() => {
      if (cancelled) return;
      setError("We could not verify your invitation. Reload the link to try again.");
      setState("invalid");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function completeSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invite || state !== "ready") return;
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
    try {
      const { error: updateError } = await invite.supabase.auth.updateUser({
        password,
        data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
      });
      if (updateError) {
        setError(updateError.message);
        setState("ready");
        return;
      }
    } catch {
      setError("We could not update your password. Try again.");
      setState("ready");
      return;
    }
    await invite.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
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
        ) : state === "invalid" ? null : (
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
