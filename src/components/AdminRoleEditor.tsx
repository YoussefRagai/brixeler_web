"use client";

import { useMemo, useState, useTransition } from "react";
import type { AdminRole } from "@/lib/adminRoles";
import { ADMIN_ROLE_LABELS } from "@/lib/adminRoles";

type DeveloperOption = { id: string; name: string | null };

type Props = {
  adminId: string;
  roles: AdminRole[];
  developerIds: string[] | null;
  developers: DeveloperOption[];
};

export function AdminRoleEditor({ adminId, roles, developerIds, developers }: Props) {
  const [currentRoles, setCurrentRoles] = useState<AdminRole[]>(roles ?? []);
  const [currentDevelopers, setCurrentDevelopers] = useState<string[]>(developerIds ?? []);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const developerOptions = useMemo(() => developers ?? [], [developers]);

  const updateAdmin = (nextRoles: AdminRole[], nextDevelopers: string[]) => {
    setStatus("saving");
    startTransition(async () => {
      try {
        const res = await fetch("/api/admins/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminId,
            roles: nextRoles,
            developerIds: nextDevelopers,
          }),
        });
        if (!res.ok) throw new Error("Update failed");
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1000);
      } catch {
        setStatus("error");
      }
    });
  };

  const toggleRole = (role: AdminRole) => {
    const next = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    setCurrentRoles(next);
    updateAdmin(next, currentDevelopers);
  };

  const toggleDeveloper = (developerId: string) => {
    const next = currentDevelopers.includes(developerId)
      ? currentDevelopers.filter((id) => id !== developerId)
      : [...currentDevelopers, developerId];
    setCurrentDevelopers(next);
    updateAdmin(currentRoles, next);
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
      <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
        {status === "saving" && "Saving..."}
        {status === "saved" && "Saved"}
        {status === "error" && "Error saving"}
      </div>
    </div>
  );
}
