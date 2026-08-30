"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminRole } from "@/lib/adminRoles";
import { ADMIN_ROLE_LABELS } from "@/lib/adminRoles";

type DeveloperOption = { id: string; name: string | null };

type Props = {
  adminId: string;
  roles: AdminRole[];
  developerIds: string[] | null;
  developers: DeveloperOption[];
  status: "active" | "suspended";
};

export function AdminRoleEditor({ adminId, roles, developerIds, developers, status: initialStatus }: Props) {
  const router = useRouter();
  const [savedRoles, setSavedRoles] = useState<AdminRole[]>(roles ?? []);
  const [currentRoles, setCurrentRoles] = useState<AdminRole[]>(roles ?? []);
  const [savedDevelopers, setSavedDevelopers] = useState<string[]>(developerIds ?? []);
  const [currentDevelopers, setCurrentDevelopers] = useState<string[]>(developerIds ?? []);
  const [savedStatus, setSavedStatus] = useState<"active" | "suspended">(initialStatus);
  const [currentStatus, setCurrentStatus] = useState<"active" | "suspended">(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const developerOptions = useMemo(() => developers ?? [], [developers]);

  const rolesEqual = (left: AdminRole[], right: AdminRole[]) =>
    left.length === right.length && left.every((role, index) => role === right[index]);
  const valuesEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);
  const hasChanges =
    !rolesEqual(savedRoles, currentRoles) ||
    !valuesEqual(savedDevelopers, currentDevelopers) ||
    savedStatus !== currentStatus;

  const updateAdmin = () => {
    if (!hasChanges || reason.trim().length < 3) return;
    const nextRoles = [...currentRoles];
    const nextDevelopers = [...currentDevelopers];
    const nextStatus = currentStatus;
    setSaveState("saving");
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admins/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminId,
            roles: nextRoles,
            developerIds: nextDevelopers,
            status: nextStatus,
            reason: reason.trim(),
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(payload.error ?? "Update failed");
        setSavedRoles(nextRoles);
        setSavedDevelopers(nextDevelopers);
        setSavedStatus(nextStatus);
        setSaveState("saved");
        setReason("");
        router.refresh();
        setTimeout(() => setSaveState("idle"), 1500);
      } catch (error) {
        // Keep the server-confirmed state when a request fails; this prevents a
        // checkbox or status control from appearing saved when it was rejected.
        setCurrentRoles(savedRoles);
        setCurrentDevelopers(savedDevelopers);
        setCurrentStatus(savedStatus);
        setErrorMessage(error instanceof Error ? error.message : "Update failed");
        setSaveState("error");
      }
    });
  };

  const toggleRole = (role: AdminRole) => {
    const next = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    setCurrentRoles(next);
    setSaveState("idle");
    setErrorMessage(null);
  };

  const toggleDeveloper = (developerId: string) => {
    const next = currentDevelopers.includes(developerId)
      ? currentDevelopers.filter((id) => id !== developerId)
      : [...currentDevelopers, developerId];
    setCurrentDevelopers(next);
    setSaveState("idle");
    setErrorMessage(null);
  };

  const isDevelopersAdmin = currentRoles.includes("developers_admin") || currentRoles.includes("super_admin");

  return (
    <div className="space-y-3 text-xs text-slate-300">
      <div className="flex flex-wrap gap-2">
        {Object.entries(ADMIN_ROLE_LABELS).map(([role, label]) => (
          <label key={role} className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={currentRoles.includes(role as AdminRole)}
              onChange={() => toggleRole(role as AdminRole)}
              disabled={isPending}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {isDevelopersAdmin ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Scoped developers</p>
          <p className="text-xs text-slate-400">Leave empty to allow all developers.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {developerOptions.map((dev) => (
              <label key={dev.id} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={currentDevelopers.includes(dev.id)}
                  onChange={() => toggleDeveloper(dev.id)}
                  disabled={isPending}
                />
                <span>{dev.name ?? dev.id}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {currentStatus !== savedStatus ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Access will be {currentStatus === "suspended" ? "suspended" : "reactivated"} after you save.
        </div>
      ) : null}
      {hasChanges ? (
        <div className="rounded-2xl border border-black/10 bg-white/[0.04] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">Review changes</p>
          <p className="mt-2 text-xs text-slate-400">
            {rolesEqual(savedRoles, currentRoles) ? "Roles unchanged" : `Roles: ${savedRoles.map((role) => ADMIN_ROLE_LABELS[role]).join(", ") || "none"} → ${currentRoles.map((role) => ADMIN_ROLE_LABELS[role]).join(", ") || "none"}`}
          </p>
          {!valuesEqual(savedDevelopers, currentDevelopers) ? (
            <p className="mt-1 text-xs text-slate-400">Developer scope: {currentDevelopers.length ? `${currentDevelopers.length} selected` : "all developers"}</p>
          ) : null}
          <label className="mt-3 block text-xs text-slate-400">
            Reason for this access change
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Explain why this access is changing"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-600"
              disabled={isPending}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={updateAdmin}
              disabled={isPending || reason.trim().length < 3}
              className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentRoles(savedRoles);
                setCurrentDevelopers(savedDevelopers);
                setCurrentStatus(savedStatus);
                setReason("");
                setErrorMessage(null);
                setSaveState("idle");
              }}
              disabled={isPending}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCurrentStatus(currentStatus === "active" ? "suspended" : "active");
            setSaveState("idle");
            setErrorMessage(null);
          }}
          disabled={isPending}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${currentStatus === "active" ? "border-rose-300/40 text-rose-200" : "border-emerald-300/40 text-emerald-200"} disabled:opacity-50`}
        >
          {currentStatus === "active" ? "Suspend access" : "Reactivate access"}
        </button>
        <span role="status" aria-live="polite" className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "Saved"}
          {saveState === "error" && (errorMessage ?? "Error saving")}
          {saveState === "idle" && !hasChanges && "No pending changes"}
        </span>
      </div>
    </div>
  );
}
