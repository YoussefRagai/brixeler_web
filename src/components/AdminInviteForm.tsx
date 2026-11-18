"use client";

import { useActionState, useId, useState } from "react";
import { ADMIN_ROLES, ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/adminRoles";

export type AdminInviteActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type AdminInviteFormProps = {
  developers: { id: string; name: string | null }[];
  action: (state: AdminInviteActionState, formData: FormData) => Promise<AdminInviteActionState>;
};

const initialState: AdminInviteActionState = { status: "idle", message: "" };
const inputClass = "mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white";
const optionClass = "flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2";

function changeSelection<Item>(selected: Item[], item: Item, checked: boolean) {
  return checked ? [...selected, item] : selected.filter((value) => value !== item);
}

export function AdminInviteForm({ developers, action }: AdminInviteFormProps) {
  const emailId = useId();
  const nameId = useId();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [developerIds, setDeveloperIds] = useState<string[]>([]);
  const [state, submitAction, pending] = useActionState(async (previousState: AdminInviteActionState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.status === "success") {
      setEmail("");
      setDisplayName("");
      setRoles([]);
      setDeveloperIds([]);
    }
    return result;
  }, initialState);

  return (
    <form action={submitAction} className="mt-4 space-y-4 text-sm text-slate-300">
      <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100">
        Use the recipient&apos;s working mailbox. The email contains a time-limited link to finish setup.
      </p>
      <fieldset disabled={pending} className="space-y-4">
        <div>
          <label htmlFor={emailId} className="text-xs text-slate-500">Email</label>
          <input id={emailId} name="email" type="email" required maxLength={320} autoComplete="email"
            value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@brixeler.com" className={inputClass} />
        </div>
        <div>
          <label htmlFor={nameId} className="text-xs text-slate-500">Display name</label>
          <input id={nameId} name="displayName" maxLength={200} autoComplete="name"
            value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Admin name" className={inputClass} />
        </div>
        <fieldset>
          <legend className="text-xs text-slate-500">Assign roles</legend>
          <div className="mt-2 grid gap-2 text-xs text-slate-300">
            {ADMIN_ROLES.map((role) => (
              <label key={role} className={optionClass}>
                <input type="checkbox" name="roles" value={role} checked={roles.includes(role)}
                  onChange={(event) => setRoles(changeSelection(roles, role, event.target.checked))} className="h-4 w-4" />
                <span>{ADMIN_ROLE_LABELS[role]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs text-slate-500">Developer company assignments</legend>
          <div className="mt-2 grid gap-2 text-xs text-slate-300">
            {developers.map((developer) => (
              <label key={developer.id} className={optionClass}>
                <input type="checkbox" name="developerIds" value={developer.id} checked={developerIds.includes(developer.id)}
                  onChange={(event) => setDeveloperIds(changeSelection(developerIds, developer.id, event.target.checked))} className="h-4 w-4" />
                <span>{developer.name ?? developer.id}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Developers admins can access the selected companies. Super admins can access every company.
          </p>
        </fieldset>
      </fieldset>
      {state.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{state.message}</p>
      ) : state.status === "success" ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">{state.message}</p>
      ) : null}
      <button type="submit" disabled={pending} className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-60">
        {pending ? "Submitting…" : "Send invite"}
      </button>
    </form>
  );
}
