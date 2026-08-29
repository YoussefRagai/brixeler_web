"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type VersionRow = {
  id: string;
  version: number;
  created_at?: string;
  createdAt?: string;
  changed_by?: string | null;
  reason?: string | null;
};

export function GrowthVersionHistory({ entityType, entityId, currentVersion }: { entityType: string; entityId: string; currentVersion: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen || versions) return;
    setMessage(null);
    const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
    const response = await fetch(`/api/admin/growth/versions?${params}`);
    const body = await response.json().catch(() => null) as { versions?: VersionRow[]; error?: string } | null;
    if (!response.ok) {
      setMessage(body?.error ?? "Version history could not be loaded.");
      return;
    }
    setVersions(body?.versions ?? []);
  };

  const restore = async (version: number) => {
    if (!window.confirm(`Restore version ${version}? The current state will be saved first.`)) return;
    setMessage(null);
    const response = await fetch("/api/admin/growth/versions/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, version }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setMessage(body?.error ?? "This version could not be restored.");
      return;
    }
    setMessage(`Version ${version} restored.`);
    setVersions(null);
    startTransition(() => router.refresh());
  };

  return (
    <div className="relative">
      <button type="button" onClick={load} aria-expanded={open} className="text-xs text-neutral-600 underline-offset-2 hover:underline">History</button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-black/10 bg-white p-3 text-left shadow-xl">
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Version history</p><span className="text-xs text-neutral-400">Current v{currentVersion}</span></div>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {versions?.map((version) => (
              <div key={version.id} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-2">
                <div><p className="text-xs font-semibold text-neutral-900">Version {version.version}</p><p className="text-[10px] text-neutral-500">{version.created_at || version.createdAt ? new Date(version.created_at ?? version.createdAt ?? "").toLocaleString() : "Time unavailable"}</p></div>
                <button type="button" disabled={pending || version.version === currentVersion} onClick={() => restore(version.version)} className="rounded-full border border-black/10 px-2 py-1 text-[10px] font-semibold disabled:opacity-40">Restore</button>
              </div>
            ))}
            {versions && !versions.length ? <p className="text-xs text-neutral-500">No earlier versions yet.</p> : null}
            {!versions && !message ? <p className="text-xs text-neutral-500">Loading…</p> : null}
          </div>
          {message ? <p aria-live="polite" className="mt-2 text-xs text-neutral-600">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
