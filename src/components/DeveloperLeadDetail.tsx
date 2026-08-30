"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CalendarClock, Check, CircleAlert, Clock3, Mail, MessageSquarePlus, Phone, Send, UserRound } from "lucide-react";
import {
  DEVELOPER_LEAD_STATUSES,
  type DeveloperActivityEvent,
  type DeveloperCompanyMember,
  type DeveloperLeadNote,
  type DeveloperLeadStatus,
  type DeveloperSalesLead,
} from "@/lib/developerSalesOps";

export function DeveloperLeadDetail({
  initialLead,
  members,
  initialNotes,
  initialActivity,
  canManage,
}: {
  initialLead: DeveloperSalesLead;
  members: DeveloperCompanyMember[];
  initialNotes: DeveloperLeadNote[];
  initialActivity: DeveloperActivityEvent[];
  canManage: boolean;
}) {
  const [lead, setLead] = useState(initialLead);
  const [notes, setNotes] = useState(initialNotes);
  const [activity, setActivity] = useState(initialActivity);
  const [now] = useState(() => Date.now());
  const [noteBody, setNoteBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);

  async function saveLead(patch: { status?: DeveloperLeadStatus; assignedToAccountId?: string | null; nextFollowUpAt?: string | null; lostReason?: string | null }) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/developer/contacts/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to update this lead.");
      if (payload.lead) setLead(payload.lead as DeveloperSalesLead);
      else setLead((current) => ({ ...current, ...(patch.status ? { status: patch.status } : {}), ...(Object.prototype.hasOwnProperty.call(patch, "assignedToAccountId") ? { assigned_to_account_id: patch.assignedToAccountId ?? null } : {}), ...(Object.prototype.hasOwnProperty.call(patch, "nextFollowUpAt") ? { next_follow_up_at: patch.nextFollowUpAt ?? null } : {}) }));
      setFeedback({ type: "success", message: "Lead saved." });
      await refreshActivity();
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to update this lead." });
    } finally {
      setPending(false);
    }
  }

  async function refreshActivity() {
    try {
      const response = await fetch(`/api/developer/activity?lead=${encodeURIComponent(lead.id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.events)) setActivity(payload.events as DeveloperActivityEvent[]);
    } catch {
      // The mutation already succeeded; a stale activity panel is safer than
      // presenting an invented event.
    }
  }

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!noteBody.trim() || pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/developer/contacts/${lead.id}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: noteBody.trim(), mentionedAccountIds: mentions }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to save this note.");
      setNoteBody("");
      setMentions([]);
      const [notesResponse] = await Promise.all([fetch(`/api/developer/contacts/${lead.id}/notes`, { cache: "no-store" }), refreshActivity()]);
      const notesPayload = await notesResponse.json().catch(() => ({}));
      if (notesResponse.ok && Array.isArray(notesPayload.notes)) setNotes(notesPayload.notes as DeveloperLeadNote[]);
      setFeedback({ type: "success", message: "Internal note added." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to save this note." });
    } finally {
      setPending(false);
    }
  }

  const assignee = members.find((member) => member.id === lead.assigned_to_account_id);
  const slaOverdue = lead.sla_due_at && !["won", "lost"].includes(lead.status) && new Date(lead.sla_due_at).getTime() < now;

  return (
    <div className="space-y-5">
      <Link href="/developer/contacts" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-black"><ArrowLeft aria-hidden="true" size={16} /> Back to leads</Link>
      <section className="overflow-hidden rounded-3xl border border-black/5 bg-white">
        <div className="border-b border-black/5 bg-[#101110] p-5 text-white sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10"><UserRound aria-hidden="true" size={19} /></div><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Lead workspace</p><h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">{lead.requester_display_name}</h2><p className="mt-1 text-sm text-white/60">{lead.project_name_snapshot}{lead.property_name_snapshot ? ` · ${lead.property_name_snapshot}` : ""}</p></div></div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#d6e87a] px-3 py-1.5 text-xs font-semibold text-[#28300c]">{capitalize(lead.status)}</span>{lead.duplicate_of_request_id ? <Link href={`/developer/contacts/${lead.duplicate_of_request_id}`} className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-950"><CircleAlert aria-hidden="true" size={13} /> Duplicate</Link> : null}</div>
          </div>
          <p className="mt-5 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-white/75">{lead.request_body}</p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/60"><span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" size={13} /> Received {formatDateTime(lead.created_at)}</span><span className="inline-flex items-center gap-1.5"><CalendarClock aria-hidden="true" size={13} /> {slaOverdue ? "SLA overdue" : lead.sla_due_at ? `SLA due ${formatDateTime(lead.sla_due_at)}` : "SLA not set"}</span><span>{capitalize(lead.request_type)} request · {capitalize(lead.source)}</span></div>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] lg:p-7">
          <div className="space-y-6">
            {feedback ? <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm ${feedback.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.message}</p> : null}
            <section aria-labelledby="lead-next-step"><div className="flex items-center gap-2"><Check aria-hidden="true" size={17} className="text-[#718224]" /><h3 id="lead-next-step" className="text-sm font-semibold text-neutral-900">Next step</h3></div><div className="mt-3 grid gap-3 rounded-2xl border border-black/5 bg-neutral-50 p-4 sm:grid-cols-3"><label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500"><span>Stage</span>{canManage ? <select disabled={pending} value={lead.status} onChange={(event) => saveLead({ status: event.target.value as DeveloperLeadStatus })} className="min-h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium normal-case tracking-normal text-neutral-800">{DEVELOPER_LEAD_STATUSES.map((status) => <option key={status} value={status}>{capitalize(status)}</option>)}</select> : <span className="flex min-h-10 items-center rounded-xl border border-black/10 bg-white px-3 text-sm normal-case tracking-normal text-neutral-800">{capitalize(lead.status)}</span>}</label><label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500"><span>Owner</span>{canManage ? <select disabled={pending} value={lead.assigned_to_account_id ?? ""} onChange={(event) => saveLead({ assignedToAccountId: event.target.value || null, status: lead.status })} className="min-h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium normal-case tracking-normal text-neutral-800"><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email || "Teammate"}</option>)}</select> : <span className="flex min-h-10 items-center rounded-xl border border-black/10 bg-white px-3 text-sm normal-case tracking-normal text-neutral-800">{assignee?.full_name || assignee?.email || "Unassigned"}</span>}</label><label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500"><span>Follow-up</span>{canManage ? <input disabled={pending} type="datetime-local" value={lead.next_follow_up_at ? toDateTimeLocal(lead.next_follow_up_at) : ""} onChange={(event) => setLead((current) => ({ ...current, next_follow_up_at: event.target.value ? new Date(event.target.value).toISOString() : null }))} onBlur={() => saveLead({ status: lead.status, assignedToAccountId: lead.assigned_to_account_id, nextFollowUpAt: lead.next_follow_up_at })} className="min-h-10 rounded-xl border border-black/10 bg-white px-2 text-sm font-medium normal-case tracking-normal text-neutral-800" /> : <span className="flex min-h-10 items-center rounded-xl border border-black/10 bg-white px-3 text-sm normal-case tracking-normal text-neutral-800">{lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "Not set"}</span>}</label></div></section>

            <section aria-labelledby="lead-notes"><div className="flex items-center gap-2"><MessageSquarePlus aria-hidden="true" size={17} className="text-neutral-600" /><h3 id="lead-notes" className="text-sm font-semibold text-neutral-900">Team notes</h3></div>{canManage ? <form onSubmit={addNote} className="mt-3 rounded-2xl border border-black/10 p-4"><label className="sr-only" htmlFor="developer-lead-note">Add an internal note</label><textarea id="developer-lead-note" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} maxLength={10000} rows={3} placeholder="Capture context for the next teammate…" className="w-full resize-y rounded-xl border border-black/10 bg-neutral-50 p-3 text-sm outline-none focus:border-black/30" /><div className="mt-3 flex flex-wrap items-end justify-between gap-3"><label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500"><span>Mention teammates</span><select multiple value={mentions} onChange={(event) => setMentions(Array.from(event.target.selectedOptions).map((option) => option.value))} className="min-h-10 rounded-xl border border-black/10 bg-white px-2 py-2 text-xs font-medium normal-case tracking-normal text-neutral-800">{members.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email || "Teammate"}</option>)}</select></label><button type="submit" disabled={!noteBody.trim() || pending} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Send aria-hidden="true" size={14} /> Add note</button></div></form> : <p className="mt-3 rounded-2xl border border-black/5 bg-neutral-50 px-4 py-3 text-xs text-neutral-500">You have view access to this lead. Sales managers can add internal notes and mentions.</p>}{notes.length ? <div className="mt-3 space-y-3">{notes.map((note) => <article key={note.id} className="rounded-2xl border border-black/5 bg-neutral-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-neutral-800">{note.author_name}</p><time className="text-[11px] text-neutral-400" dateTime={note.created_at}>{formatDateTime(note.created_at)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{note.body}</p>{note.mentioned_account_ids.length ? <p className="mt-2 text-[11px] text-neutral-500">Mentioned {note.mentioned_account_ids.length} teammate{note.mentioned_account_ids.length === 1 ? "" : "s"}</p> : null}</article>)}</div> : <p className="mt-3 text-sm text-neutral-500">No internal notes yet.</p>}</section>
          </div>

          <aside className="space-y-5"><section className="rounded-2xl border border-black/5 bg-neutral-50 p-4"><h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Contact details</h3><div className="mt-3 space-y-3 text-sm">{lead.requester_email ? <a href={`mailto:${lead.requester_email}`} className="flex items-center gap-2 text-neutral-700 hover:text-black hover:underline"><Mail aria-hidden="true" size={15} /> <span className="truncate">{lead.requester_email}</span></a> : null}{lead.requester_phone ? <a href={`tel:${lead.requester_phone}`} className="flex items-center gap-2 text-neutral-700 hover:text-black hover:underline"><Phone aria-hidden="true" size={15} /> {lead.requester_phone}</a> : null}<p className="flex items-center gap-2 text-xs text-neutral-500"><UserRound aria-hidden="true" size={15} /> {lead.requester_total_deals} previous deal{lead.requester_total_deals === 1 ? "" : "s"}</p></div></section><section className="rounded-2xl border border-black/5 bg-white p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900"><Clock3 aria-hidden="true" size={16} /> Activity</h3>{activity.length ? <ol className="mt-3 space-y-4">{activity.map((event) => <li key={event.id} className="relative border-l border-black/10 pl-4"><span className="absolute -left-1.5 top-1 size-2.5 rounded-full bg-[#a6b950]" aria-hidden="true" /><p className="text-xs leading-5 text-neutral-700">{event.summary}</p><p className="mt-1 text-[11px] text-neutral-400">{event.actor_name} · {formatDateTime(event.created_at)}</p></li>)}</ol> : <p className="mt-3 text-xs leading-5 text-neutral-500">Activity will appear here as the lead moves through the funnel.</p>}</section></aside>
        </div>
      </section>
    </div>
  );
}

function capitalize(value: string) { return value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ") : "—"; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date) : "—"; }
function toDateTimeLocal(value: string) { const date = new Date(value); if (!Number.isFinite(date.getTime())) return ""; const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16); }
