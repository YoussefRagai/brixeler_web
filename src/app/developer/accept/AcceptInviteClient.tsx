"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { openPortalInviteSession } from "@/lib/portalInviteSession";

type AcceptState = "verifying" | "invalid" | "ready" | "submitting" | "done";

export function AcceptInviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const developerNameHint = searchParams.get("developerName") ?? "your developer";
  const verification = useRef<ReturnType<typeof openPortalInviteSession> | null>(null);
  const [state, setState] = useState<AcceptState>("verifying");
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [invite, setInvite] = useState<Awaited<ReturnType<typeof openPortalInviteSession>>>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const activationRequestId = useId();

  useEffect(() => {
    let cancelled = false;
    verification.current ??= openPortalInviteSession("developer");
    void verification.current.then((result) => {
      if (cancelled) return;
      if (!result) {
        setError("This invite is invalid or has expired. Ask the Brixeler team for a new invitation.");
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

  const completeSetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invite || state !== "ready") return;
    setError(null);

    if (!passwordSaved && password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    if (!passwordSaved && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setState("submitting");

    try {
      if (!passwordSaved) {
        const { error: updateError } = await invite.supabase.auth.updateUser({
          password,
          data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
        });
        if (updateError && updateError.code !== "same_password") {
          setError(updateError.message);
          setState("ready");
          return;
        }
        setPasswordSaved(true);
        setPassword("");
        setConfirmPassword("");
      }

      const response = await fetch("/api/developer/activate-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: invite.session.access_token,
          fullName: fullName.trim() || null,
          activationRequestId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Unable to activate your developer access.");
        setState("ready");
        return;
      }
    } catch {
      setError("We could not finish setting up your access. Try again.");
      setState("ready");
      return;
    }

    await invite.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    setState("done");
    router.replace("/developer/login?message=Access+set+up.+Sign+in+with+your+new+password.");
  };

  return (
    <div className="w-full max-w-lg space-y-6 rounded-3xl border border-black/10 bg-white p-8 shadow-xl shadow-black/5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Developer Console</p>
        <h1 className="text-2xl font-semibold text-[#050505]">Complete your access</h1>
        <p className="text-sm text-neutral-500">
          You were invited to work on the developer dashboard for {developerNameHint}. Set your password to finish
          the signup process.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {state === "verifying" ? (
        <div className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-6 text-sm text-neutral-500">
          Verifying your invite…
        </div>
      ) : state === "done" ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Access set up. Redirecting to developer login…</p>
      ) : state === "invalid" ? null : (
        <form onSubmit={completeSetup} className="space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Full name</span>
            <input
              value={fullName}
              maxLength={200}
              disabled={passwordSaved || state === "submitting"}
              onChange={(event) => setFullName(event.target.value)}
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              placeholder="Your name"
            />
          </label>
          {!passwordSaved ? <><label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Create password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              placeholder="••••••••"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Confirm password</span>
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              placeholder="••••••••"
            />
          </label></> : null}
          <button
            disabled={state === "submitting"}
            className="w-full rounded-full bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            type="submit"
          >
            {state === "submitting" ? "Saving access…" : "Finish setup"}
          </button>
        </form>
      )}
    </div>
  );
}
