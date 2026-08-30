"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarClock, Check, CircleAlert, Filter, UserRound } from "lucide-react";
import {
  DEVELOPER_LEAD_STATUSES,
  type DeveloperCompanyMember,
  type DeveloperLeadStatus,
  type DeveloperSalesLead,
} from "@/lib/developerSalesOps";

type Filters = {
  status: string;
  assignee: string;
  project: string;
  age: string;
  q: string;
};

export function DeveloperLeadInbox({
  initialLeads,
  members,
  filters,
  canManage,
}: {
  initialLeads: DeveloperSalesLead[];
  members: DeveloperCompanyMember[];
  filters: Filters;
  canManage: boolean;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [now] = useState(() => Date.now());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);

  const updateLead = async (lead: DeveloperSalesLead, patch: { status?: string; assignedToAccountId?: string | null; nextFollowUpAt?: string | null }) => {
    setPendingId(lead.id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/developer/contacts/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to update the lead.");
      setLeads((current) => current.map((item) => item.id === lead.id ? {
        ...item,
        ...(patch.status ? { status: patch.status as DeveloperLeadStatus } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "assignedToAccountId") ? { assigned_to_account_id: patch.assignedToAccountId ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "nextFollowUpAt") ? { next_follow_up_at: patch.nextFollowUpAt ?? null } : {}),
      } : item));
      setFeedback({ type: "success", message: "Lead updated." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to update the lead." });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-black/5 bg-white">
      <div className="border-b border-black/5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#111211] text-white"><UserRound aria-hidden="true" size={18} /></div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Sales inbox</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#050505]">Every request has a next step</h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-500">Assign ownership, keep the follow-up promise visible, and move qualified demand through the same funnel.</p>
            </div>
          </div>
          <a href={buildExportHref(filters)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-800 hover:border-black/30 hover:bg-neutral-50">Export CSV <ArrowUpRight aria-hidden="true" size={14} /></a>
        </div>
        <form method="get" className="mt-5 grid gap-3 rounded-2xl bg-neutral-50 p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))_auto]">
          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2"><Filter aria-hidden="true" size={15} className="shrink-0 text-neutral-400" /><span className="sr-only">Search leads</span><input name="q" defaultValue={filters.q} placeholder="Search person, project, property" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400" /></label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500"><span>Status</span><select name="status" defaultValue={filters.status} className="min-h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium normal-case tracking-normal text-neutral-800"><option value="all">All statuses</option>{DEVELOPER_LEAD_STATUSES.map((status) => <option key={status} value={status}>{capitalize(status)}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500"><span>Owner</span><select name="assignee" defaultValue={filters.assignee} className="min-h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium normal-case tracking-normal text-neutral-800"><option value="all">Everyone</option><option value="unassigned">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email || "Teammate"}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500"><span>Attention</span><select name="age" defaultValue={filters.age} className="min-h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium normal-case tracking-normal text-neutral-800"><option value="all">All leads</option><option value="sla_overdue">SLA overdue</option><option value="follow_up_due">Follow-up due</option><option value="unassigned">Needs owner</option></select></label>
          <button type="submit" className="min-h-10 self-end rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800">Apply</button>
        </form>
        {feedback ? <p role={feedback.type === "error" ? "alert" : "status"} className={`mt-3 rounded-xl border px-3 py-2 text-xs ${feedback.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.message}</p> : null}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-black/5 bg-neutral-50 text-[10px] uppercase tracking-[0.16em] text-neutral-500"><tr><th className="px-6 py-3 font-semibold">Lead</th><th className="px-4 py-3 font-semibold">Stage</th><th className="px-4 py-3 font-semibold">Owner</th><th className="px-4 py-3 font-semibold">Next follow-up</th><th className="px-4 py-3 font-semibold">SLA</th><th className="px-6 py-3 text-right font-semibold">Open</th></tr></thead>
          <tbody>{leads.map((lead) => <LeadRow key={lead.id} lead={lead} members={members} canManage={canManage} pending={pendingId === lead.id} onUpdate={updateLead} now={now} />)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-black/5 md:hidden">{leads.map((lead) => <LeadCard key={lead.id} lead={lead} members={members} canManage={canManage} pending={pendingId === lead.id} onUpdate={updateLead} now={now} />)}</div>
      {!leads.length ? <div className="border-t border-black/5 px-5 py-10 text-center sm:px-6"><p className="text-sm font-semibold text-neutral-800">No leads match these filters.</p><p className="mt-1 text-sm text-neutral-500">New requests from the mobile app will appear here as soon as they arrive.</p></div> : null}
    </section>
  );
}

function LeadRow({ lead, members, canManage, pending, onUpdate, now }: { lead: DeveloperSalesLead; members: DeveloperCompanyMember[]; canManage: boolean; pending: boolean; onUpdate: (lead: DeveloperSalesLead, patch: { status?: string; assignedToAccountId?: string | null; nextFollowUpAt?: string | null }) => void; now: number }) {
  return <tr className="border-b border-black/5 last:border-0 align-top"><td className="px-6 py-4"><LeadIdentity lead={lead} /></td><td className="px-4 py-4"><StageSelect lead={lead} canManage={canManage} pending={pending} onUpdate={onUpdate} /></td><td className="px-4 py-4"><OwnerSelect lead={lead} members={members} canManage={canManage} pending={pending} onUpdate={onUpdate} /></td><td className="px-4 py-4"><FollowUpInput lead={lead} canManage={canManage} pending={pending} onUpdate={onUpdate} /></td><td className="px-4 py-4"><SlaBadge lead={lead} now={now} /></td><td className="px-6 py-4 text-right"><Link href={`/developer/contacts/${lead.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 underline-offset-4 hover:text-black hover:underline">Details <ArrowUpRight aria-hidden="true" size={13} /></Link></td></tr>;
}

function LeadCard({ lead, members, canManage, pending, onUpdate, now }: { lead: DeveloperSalesLead; members: DeveloperCompanyMember[]; canManage: boolean; pending: boolean; onUpdate: (lead: DeveloperSalesLead, patch: { status?: string; assignedToAccountId?: string | null; nextFollowUpAt?: string | null }) => void; now: number }) {
  return <article className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><LeadIdentity lead={lead} /><Link href={`/developer/contacts/${lead.id}`} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-neutral-700">Details</Link></div><div className="grid gap-3"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Stage</p><StageSelect lead={lead} canManage={canManage} pending={pending} onUpdate={onUpdate} /></div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Owner</p><OwnerSelect lead={lead} members={members} canManage={canManage} pending={pending} onUpdate={onUpdate} /></div><div className="flex items-center justify-between gap-3"><FollowUpInput lead={lead} canManage={canManage} pending={pending} onUpdate={onUpdate} /><SlaBadge lead={lead} now={now} /></div></div></article>;
}

function LeadIdentity({ lead }: { lead: DeveloperSalesLead }) {
  return <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 font-semibold text-[#050505]"><span className="truncate">{lead.requester_display_name}</span>{lead.duplicate_of_request_id ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800"><CircleAlert aria-hidden="true" size={11} /> Duplicate</span> : null}</p><p className="mt-1 truncate text-xs text-neutral-500">{lead.project_name_snapshot}{lead.property_name_snapshot ? ` · ${lead.property_name_snapshot}` : ""}</p><p className="mt-1 line-clamp-1 text-xs text-neutral-400">{lead.request_body}</p><p className="mt-1.5 text-[11px] text-neutral-400">{capitalize(lead.request_type)} · {formatDate(lead.created_at)}</p></div>;
}

function StageSelect({ lead, canManage, pending, onUpdate }: { lead: DeveloperSalesLead; canManage: boolean; pending: boolean; onUpdate: (lead: DeveloperSalesLead, patch: { status?: string }) => void }) {
  return canManage ? <select aria-label={`Stage for ${lead.requester_display_name}`} disabled={pending} value={lead.status} onChange={(event) => onUpdate(lead, { status: event.target.value })} className="min-h-9 rounded-xl border border-black/10 bg-white px-2.5 text-xs font-semibold text-neutral-800 disabled:opacity-50">{DEVELOPER_LEAD_STATUSES.map((status) => <option key={status} value={status}>{capitalize(status)}</option>)}</select> : <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">{capitalize(lead.status)}</span>;
}

function OwnerSelect({ lead, members, canManage, pending, onUpdate }: { lead: DeveloperSalesLead; members: DeveloperCompanyMember[]; canManage: boolean; pending: boolean; onUpdate: (lead: DeveloperSalesLead, patch: { assignedToAccountId?: string | null }) => void }) {
  if (!canManage) return <span className="text-xs text-neutral-600">{lead.assigned_to_account_id ? members.find((member) => member.id === lead.assigned_to_account_id)?.full_name || members.find((member) => member.id === lead.assigned_to_account_id)?.email || "Teammate" : "Unassigned"}</span>;
  return <select aria-label={`Owner for ${lead.requester_display_name}`} disabled={pending} value={lead.assigned_to_account_id ?? ""} onChange={(event) => onUpdate(lead, { assignedToAccountId: event.target.value || null })} className="min-h-9 max-w-[170px] rounded-xl border border-black/10 bg-white px-2.5 text-xs text-neutral-800 disabled:opacity-50"><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email || "Teammate"}</option>)}</select>;
}

function FollowUpInput({ lead, canManage, pending, onUpdate }: { lead: DeveloperSalesLead; canManage: boolean; pending: boolean; onUpdate: (lead: DeveloperSalesLead, patch: { nextFollowUpAt?: string | null }) => void }) {
  const value = lead.next_follow_up_at ? toDateTimeLocal(lead.next_follow_up_at) : "";
  return canManage ? <label className="flex items-center gap-1.5 text-xs text-neutral-600"><CalendarClock aria-hidden="true" size={14} className="shrink-0 text-neutral-400" /><span className="sr-only">Next follow-up</span><input aria-label={`Next follow-up for ${lead.requester_display_name}`} type="datetime-local" disabled={pending} defaultValue={value} onBlur={(event) => { const nextValue = event.target.value ? new Date(event.target.value).toISOString() : null; if (nextValue !== lead.next_follow_up_at) onUpdate(lead, { nextFollowUpAt: nextValue }); }} className="min-h-9 w-[170px] rounded-xl border border-black/10 bg-white px-2 text-xs disabled:opacity-50" /></label> : <span className="text-xs text-neutral-600">{lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "Not set"}</span>;
}

function SlaBadge({ lead, now }: { lead: DeveloperSalesLead; now: number }) {
  if (["won", "lost"].includes(lead.status)) return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-400"><Check aria-hidden="true" size={13} /> Closed</span>;
  if (!lead.sla_due_at) return <span className="text-[11px] text-neutral-400">SLA not set</span>;
  const overdue = new Date(lead.sla_due_at).getTime() < now;
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${overdue ? "text-rose-700" : "text-emerald-700"}`}><CalendarClock aria-hidden="true" size={13} /> {overdue ? "Overdue" : `Due ${formatDateTime(lead.sla_due_at)}`}</span>;
}

function buildExportHref(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.assignee && filters.assignee !== "all") params.set("assignee", filters.assignee);
  if (filters.project) params.set("project", filters.project);
  if (filters.age && filters.age !== "all") params.set("age", filters.age);
  if (filters.q) params.set("q", filters.q);
  return `/api/developer/contacts/export?${params.toString()}`;
}

function capitalize(value: string) { return value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ") : "—"; }
function formatDate(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "—"; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date) : "—"; }
function toDateTimeLocal(value: string) { const date = new Date(value); if (!Number.isFinite(date.getTime())) return ""; const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16); }
