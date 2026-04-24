"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type AcceptState = "verifying" | "ready" | "submitting" | "done";

function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public environment is missing.");
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
    },
  });
}

export function AcceptInviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const developerNameHint = searchParams.get("developerName") ?? "your developer";
  const errorHint = searchParams.get("error_description") ?? searchParams.get("error");
  const [state, setState] = useState<AcceptState>("verifying");
  const [error, setError] = useState<string | null>(errorHint ? decodeURIComponent(errorHint) : null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const supabase = useMemo(() => createBrowserSupabase(), []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (errorHint) {
        setState("ready");
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (!cancelled) {
            setError(exchangeError.message);
            setState("ready");
          }
          return;
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        if (!cancelled) {
          setError("This invite link is invalid or has expired. Ask the Brixeler team to send a new invite.");
          setState("ready");
        }
        return;
      }

      if (!cancelled) {
        setAccessToken(data.session.access_token);
        setFullName((data.session.user.user_metadata?.full_name as string | undefined) ?? "");
        setState("ready");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [errorHint, searchParams, supabase]);

  const completeSetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!accessToken) {
      setError("Your invite session is not ready yet.");
      return;
    }

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
      data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
    });

    if (updateError) {
      setError(updateError.message);
      setState("ready");
      return;
    }

    const response = await fetch("/api/developer/activate-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, fullName: fullName.trim() || null }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to activate your developer access.");
      setState("ready");
      return;
    }

    await supabase.auth.signOut();
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
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {state === "verifying" ? (
        <div className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-6 text-sm text-neutral-500">
          Verifying your invite…
        </div>
      ) : (
        <form onSubmit={completeSetup} className="space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Full name</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              placeholder="Your name"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Create password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
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
              required
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              placeholder="••••••••"
            />
          </label>
          <button
            disabled={state === "submitting" || state === "done"}
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
