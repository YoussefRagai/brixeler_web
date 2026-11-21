"use client";

import { FormEvent, useState } from "react";
import type { DeveloperRole } from "@/lib/developerRbac";
import type { DeveloperTeamMember } from "@/lib/developerTeam";
import { FeedbackBanner } from "@/components/FeedbackBanner";

const ROLE_OPTIONS: Array<{ value: DeveloperRole; label: string; description: string }> = [
  {
    value: "project_manager",
    label: "Project manager",
    description: "Projects, phases, and all project content",
  },
  {
    value: "sales_manager",
    label: "Sales manager",
    description: "Inventory updates and the contacts inbox",
  },
  {
    value: "developer_super_admin",
    label: "Developer super admin",
    description: "Company, team, projects, and inventory",
  },
];

type Props = {
  initialMembers: DeveloperTeamMember[];
  currentAccountId: string;
  initialLoadError?: string | null;
};

export function DeveloperTeamManager({ initialMembers, currentAccountId, initialLoadError = null }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<DeveloperRole>("project_manager");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function refreshMembers() {
    const response = await fetch("/api/developer/team", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { members?: DeveloperTeamMember[]; error?: string } | null;
    if (!response.ok || !Array.isArray(payload?.members)) {
      throw new Error(payload?.error ?? "Unable to refresh the developer team.");
    }
    setMembers(payload.members);
  }

  async function refreshAfterMutation(successMessage: string, refreshErrorMessage: string) {
    try {
      await refreshMembers();
      setFeedback({ kind: "success", text: successMessage });
    } catch {
      // The mutation already succeeded. Keep the form usable and tell the
      // operator to refresh rather than claiming that the write failed.
      setFeedback({ kind: "error", text: refreshErrorMessage });
    }
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("invite");
    setFeedback(null);
    try {
      const response = await fetch("/api/developer/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, role, requestId: crypto.randomUUID() }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to send the invitation.");
      setEmail("");
      setFullName("");
      setRole("project_manager");
      await refreshAfterMutation(payload?.message ?? "Invitation email submitted for delivery.", "Invitation submitted, but the team list could not refresh. Refresh to confirm before retrying.");
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Unable to send the invitation." });
    } finally {
      setPendingAction(null);
    }
  }

  async function updateRole(member: DeveloperTeamMember, nextRole: DeveloperRole) {
    if (!member.role || member.role === nextRole) return;
    setPendingAction(`role:${member.id}`);
    setFeedback(null);
    try {
      const response = await fetch("/api/developer/team/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: member.id, role: nextRole, requestId: crypto.randomUUID() }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to update the member role.");
      await refreshAfterMutation("Member role updated.", "Member role updated, but the team list could not refresh. Refresh to confirm the current role.");
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Unable to update the member role." });
    } finally {
      setPendingAction(null);
    }
  }

  async function resendInvite(member: DeveloperTeamMember) {
    setPendingAction(`resend:${member.id}`);
    setFeedback(null);
    try {
      const response = await fetch("/api/developer/team/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: member.id, requestId: crypto.randomUUID() }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to resend the invitation.");
      await refreshAfterMutation(payload?.message ?? "Invitation email submitted for delivery.", "Invitation resend submitted, but the team list could not refresh. Refresh to confirm before retrying.");
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Unable to resend the invitation." });
    } finally {
      setPendingAction(null);
    }
  }

  async function revokeMember(member: DeveloperTeamMember) {
    const reason = window.prompt(`Why are you revoking ${member.fullName || member.email || "this member"}?`, "Access no longer required")?.trim();
    if (!reason) return;
    setPendingAction(`revoke:${member.id}`);
    setFeedback(null);
    try {
      const response = await fetch("/api/developer/team/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: member.id, reason, requestId: crypto.randomUUID() }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string; sessionInvalidated?: boolean } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to revoke developer access.");
      await refreshAfterMutation(payload?.message ?? (payload?.sessionInvalidated ? "Developer access revoked. Existing dashboard sessions are no longer accepted." : "Developer access revoked."), "Developer access was revoked, but the team list could not refresh. Refresh to confirm the current access.");
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Unable to revoke developer access." });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-[#111211] px-5 py-6 text-white sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d6e87a]">Company access</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Build a focused developer team</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
          Invite colleagues into this company only. Roles are enforced on the server and in the database, so a member cannot widen their own access or switch tenants.
        </p>
      </section>

      <section aria-labelledby="invite-member-heading" className="rounded-3xl border border-black/5 bg-white p-5 sm:p-7">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Invite a colleague</p>
          <h2 id="invite-member-heading" className="mt-1 text-xl font-semibold tracking-tight">Add a member</h2>
        </div>
        <form onSubmit={submitInvite} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required maxLength={320} autoComplete="email" placeholder="colleague@company.com" className="rounded-2xl border border-black/10 bg-[#fafafa] px-4 py-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Name (optional)</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={200} autoComplete="name" placeholder="Colleague name" className="rounded-2xl border border-black/10 bg-[#fafafa] px-4 py-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as DeveloperRole)} className="rounded-2xl border border-black/10 bg-[#fafafa] px-4 py-3">
              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} — {option.description}</option>)}
            </select>
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={pendingAction !== null} className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50">
              {pendingAction === "invite" ? "Sending invite…" : "Send invite"}
            </button>
          </div>
        </form>
      </section>

      {pendingAction ? <p role="status" aria-live="polite" className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">{pendingAction.startsWith("invite") ? "Submitting invitation…" : pendingAction.startsWith("role") ? "Saving member role…" : pendingAction.startsWith("resend") ? "Submitting invitation resend…" : "Updating developer access…"}</p> : null}
      <FeedbackBanner message={feedback?.text} tone={feedback?.kind === "error" ? "error" : "success"} />
      <FeedbackBanner message={initialLoadError ? `${initialLoadError} Refresh to try again.` : null} tone="error" />

      <section aria-labelledby="team-members-heading" className="rounded-3xl border border-black/5 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Current access</p>
            <h2 id="team-members-heading" className="mt-1 text-xl font-semibold tracking-tight">Team members</h2>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-600">{members.length} member{members.length === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-6 divide-y divide-black/5">
          {members.map((member) => {
            const isSelf = member.id === currentAccountId;
            const roleOption = ROLE_OPTIONS.find((option) => option.value === member.role);
            const busy = pendingAction?.endsWith(`:${member.id}`) ?? false;
            return (
              <article key={member.id} className="grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#050505]">{member.fullName || "Unnamed member"}{isSelf ? <span className="ml-2 text-xs font-normal text-neutral-400">You</span> : null}</p>
                  <p className="truncate text-sm text-neutral-500">{member.email || "No email recorded"}</p>
                  <p className="mt-1 text-xs text-neutral-400">{member.status === "pending" ? "Invitation pending" : member.status === "active" ? "Active access" : member.status}</p>
                </div>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-semibold uppercase tracking-[0.16em] text-neutral-400">Role</span>
                  <select aria-label={`Role for ${member.email || "team member"}`} value={member.role ?? ""} disabled={isSelf || !member.role || busy} onChange={(event) => updateRole(member, event.target.value as DeveloperRole)} className="rounded-xl border border-black/10 bg-[#fafafa] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                    {member.role ? ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : <option value="">Needs review</option>}
                  </select>
                  {roleOption ? <span className="text-[11px] text-neutral-400">{roleOption.description}</span> : null}
                </label>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {member.status === "pending" ? <button type="button" disabled={pendingAction !== null} onClick={() => resendInvite(member)} className="rounded-full border border-black/10 px-3 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30 hover:text-black disabled:cursor-not-allowed disabled:opacity-50">{pendingAction === `resend:${member.id}` ? "Resending…" : "Resend"}</button> : null}
                  {!isSelf && member.status !== "revoked" ? <button type="button" disabled={pendingAction !== null} onClick={() => revokeMember(member)} className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-50">{pendingAction === `revoke:${member.id}` ? "Revoking…" : "Revoke"}</button> : null}
                </div>
              </article>
            );
          })}
          {!members.length ? <p className="py-5 text-sm text-neutral-500">No company members were found.</p> : null}
        </div>
      </section>
    </div>
  );
}
