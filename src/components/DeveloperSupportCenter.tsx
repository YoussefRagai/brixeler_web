"use client";

import { useState } from "react";
import { BookOpen, CircleHelp, LifeBuoy, Send } from "lucide-react";
import type { DeveloperSupportTicket } from "@/lib/developerSalesOps";

const categories = ["account", "inventory", "sales", "integrations", "billing", "technical", "other"] as const;

export function DeveloperSupportCenter({ initialTickets }: { initialTickets: DeveloperSupportTicket[] }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/developer/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, category, priority, description }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to open a support request.");
      setFeedback({ type: "success", message: "Support request opened. The Brixeler team will reply in this workspace." });
      setSubject(""); setDescription(""); setPriority("normal"); setCategory("other");
      if (payload.ticketId) setTickets((current) => [{ id: String(payload.ticketId), developer_id: "", created_by_account_id: "", subject, category, priority, description, status: "open", assigned_to_account_id: null, last_message_preview: description.slice(0, 240), last_message_at: new Date().toISOString(), resolved_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...current]);
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to open a support request." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)]">
      <section className="overflow-hidden rounded-3xl border border-black/5 bg-white"><div className="flex items-start gap-3 border-b border-black/5 p-5 sm:p-6"><div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#111211] text-white"><LifeBuoy aria-hidden="true" size={18} /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Help desk</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-neutral-900">Open a support request</h2><p className="mt-1 text-sm text-neutral-500">Keep the question and context in one place so your team can pick it up.</p></div></div><form onSubmit={submit} className="space-y-4 p-5 sm:p-6"><label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700"><span>Subject</span><input required maxLength={300} value={subject} onChange={(event) => setSubject(event.target.value)} className="min-h-11 rounded-xl border border-black/10 bg-neutral-50 px-3 text-sm font-normal outline-none focus:border-black/30" placeholder="What do you need help with?" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 rounded-xl border border-black/10 bg-neutral-50 px-3 text-sm font-normal"><option value="other">Other</option>{categories.filter((value) => value !== "other").map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}</select></label><label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)} className="min-h-11 rounded-xl border border-black/10 bg-neutral-50 px-3 text-sm font-normal"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div><label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700"><span>Details</span><textarea required maxLength={20000} rows={7} value={description} onChange={(event) => setDescription(event.target.value)} className="resize-y rounded-xl border border-black/10 bg-neutral-50 p-3 text-sm font-normal outline-none focus:border-black/30" placeholder="Include the project, lead, or integration context that will help us investigate." /></label>{feedback ? <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-xs ${feedback.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.message}</p> : null}<button type="submit" disabled={pending || !subject.trim() || !description.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Send aria-hidden="true" size={15} /> {pending ? "Opening…" : "Open request"}</button></form></section>

      <div className="space-y-5"><section className="rounded-3xl border border-black/5 bg-white p-5 sm:p-6"><div className="flex items-start gap-3"><BookOpen aria-hidden="true" size={18} className="mt-0.5 text-neutral-600" /><div><h2 className="text-sm font-semibold text-neutral-900">Quick help</h2><div className="mt-3 space-y-3 text-sm leading-6 text-neutral-600"><p><strong className="text-neutral-900">Lead stages:</strong> use the stage that reflects the buyer&apos;s current commitment, not the last touch.</p><p><strong className="text-neutral-900">SLA:</strong> keep a follow-up time on every open lead so the attention queue stays useful.</p><p><strong className="text-neutral-900">Integrations:</strong> dry runs record mappings and conflicts without calling an external provider.</p></div></div></div></section><section className="rounded-3xl border border-black/5 bg-[#f1f5d9] p-5 sm:p-6"><div className="flex items-start gap-3"><CircleHelp aria-hidden="true" size={18} className="mt-0.5 text-[#4c5d11]" /><div><h2 className="text-sm font-semibold text-[#28300c]">Need urgent help?</h2><p className="mt-2 text-sm leading-6 text-[#4c5d11]">Mark a request urgent and include the affected lead or listing ID. This creates a durable support record for the team.</p></div></div></section></div>

      <section className="overflow-hidden rounded-3xl border border-black/5 bg-white lg:col-span-2"><div className="border-b border-black/5 p-5 sm:p-6"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Your requests</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-neutral-900">Support history</h2></div>{tickets.length ? <div className="divide-y divide-black/5">{tickets.map((ticket) => <article key={ticket.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6"><div className="min-w-0"><p className="font-semibold text-neutral-900">{ticket.subject}</p><p className="mt-1 line-clamp-2 text-sm text-neutral-600">{ticket.last_message_preview || ticket.description}</p><p className="mt-1.5 text-[11px] text-neutral-400">{capitalize(ticket.category)} · {capitalize(ticket.status)} · Updated {formatDate(ticket.updated_at)}</p></div><span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${ticket.priority === "urgent" ? "bg-rose-50 text-rose-700" : ticket.priority === "high" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-600"}`}>{capitalize(ticket.priority)}</span></article>)}</div> : <p className="px-5 py-8 text-sm text-neutral-500 sm:px-6">No support requests yet.</p>}</section>
    </div>
  );
}

function capitalize(value: string) { return value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ") : "—"; }
function formatDate(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "—"; }
