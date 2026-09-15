"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, ChevronDown, Clipboard, Clock3, MessageSquareText, PackageCheck, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";

export type GiftClaimStatus = "pending" | "approved" | "fulfilled" | "rejected" | "cancelled";

export type GiftClaimEntry = {
  id: string;
  giftId?: string | null;
  status: GiftClaimStatus;
  notes?: string | null;
  claimedAt?: string | null;
  updatedAt?: string | null;
  agent: {
    id?: string | null;
    name: string;
    phone?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    verificationStatus?: string | null;
    accountStatus?: string | null;
    totalDeals?: number | null;
    tier?: string | null;
  };
  gift: {
    title: string;
    titleAr?: string | null;
    description?: string | null;
    iconUrl?: string | null;
    type?: string | null;
    value?: string | null;
    vendor?: string | null;
    fulfillmentOwner?: string | null;
    redemptionMethod?: string | null;
    terms?: string | null;
  };
  eligibility?: {
    status?: string | null;
    eligibleAt?: string | null;
    updatedAt?: string | null;
  } | null;
  evidence?: string[];
  conflicts?: string[];
  fulfillment?: {
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    method?: string | null;
    owner?: string | null;
    vendor?: string | null;
    reference?: string | null;
    dueAt?: string | null;
  } | null;
  history?: Array<{ status: string; at?: string | null; note?: string | null }>;
};

const statuses: Array<{ value: GiftClaimStatus; label: string }> = [
  { value: "pending", label: "Needs review" },
  { value: "approved", label: "Ready to fulfil" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const statusTone: Record<GiftClaimStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-sky-200 bg-sky-50 text-sky-800",
  fulfilled: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  cancelled: "border-neutral-300 bg-neutral-100 text-neutral-600",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function formatDate(value?: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : dateFormatter.format(date);
}

function ageHours(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 3_600_000) : 0;
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "AG";
}

function slaFor(claim: GiftClaimEntry): { label: string; tone: string } {
  if (claim.status === "fulfilled" || claim.status === "rejected" || claim.status === "cancelled") return { label: "Closed", tone: "border-neutral-200 bg-neutral-50 text-neutral-500" };
  if (claim.fulfillment?.dueAt) {
    const dueAt = new Date(claim.fulfillment.dueAt).getTime();
    if (Number.isFinite(dueAt)) {
      const remainingHours = (dueAt - Date.now()) / 3_600_000;
      if (remainingHours <= 0) return { label: "At risk · overdue", tone: "border-rose-200 bg-rose-50 text-rose-800" };
      if (remainingHours <= 24) return { label: "Due soon · 24h", tone: "border-amber-200 bg-amber-50 text-amber-800" };
      return { label: "Within SLA", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    }
  }
  const hours = ageHours(claim.claimedAt);
  if (hours >= 48) return { label: "At risk · 48h+", tone: "border-rose-200 bg-rose-50 text-rose-800" };
  if (hours >= 24) return { label: "Due soon · 24h", tone: "border-amber-200 bg-amber-50 text-amber-800" };
  return { label: "Within SLA", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
}

export function GiftClaimsWorkspace({ claims, initialStatus = "pending", dataWarning }: { claims: GiftClaimEntry[]; initialStatus?: GiftClaimStatus; dataWarning?: string | null }) {
  const router = useRouter();
  const [activeStatus, setActiveStatus] = useState<GiftClaimStatus>(initialStatus);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(claims.map((claim) => [claim.id, claim.notes ?? ""])));
  const [references, setReferences] = useState<Record<string, string>>(() => Object.fromEntries(claims.map((claim) => [claim.id, claim.fulfillment?.reference ?? ""])));
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  useEffect(() => {
    setNotes((current) => Object.fromEntries(claims.map((claim) => [claim.id, current[claim.id] ?? claim.notes ?? ""])));
    setReferences((current) => Object.fromEntries(claims.map((claim) => [claim.id, current[claim.id] ?? claim.fulfillment?.reference ?? ""])));
  }, [claims]);

  useEffect(() => {
    setSelected([]);
  }, [activeStatus]);

  const statusCounts = useMemo(() => Object.fromEntries(statuses.map((status) => [status.value, claims.filter((claim) => claim.status === status.value).length])) as Record<GiftClaimStatus, number>, [claims]);
  const visibleClaims = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return claims.filter((claim) => {
      if (claim.status !== activeStatus) return false;
      if (!query) return true;
      return [claim.agent.name, claim.agent.phone, claim.gift.title, claim.gift.vendor, claim.id].filter(Boolean).join(" ").toLocaleLowerCase().includes(query);
    });
  }, [activeStatus, claims, search]);
  const atRiskCount = claims.filter((claim) => (claim.status === "pending" || claim.status === "approved") && slaFor(claim).label.startsWith("At risk")).length;
  const allVisibleSelected = visibleClaims.length > 0 && visibleClaims.every((claim) => selected.includes(claim.id));
  const bulkTarget = activeStatus === "pending" ? "approved" : activeStatus === "approved" ? "fulfilled" : null;

  const updateClaim = async (claim: GiftClaimEntry, nextStatus: GiftClaimStatus, silent = false) => {
    const formData = new FormData();
    formData.set("claim_id", claim.id);
    formData.set("status", nextStatus);
    formData.set("notes", notes[claim.id] ?? claim.notes ?? "");
    formData.set("fulfillment_reference", references[claim.id] ?? claim.fulfillment?.reference ?? "");
    const response = await fetch("/api/admin/gifts/claims/update", { method: "POST", body: formData, credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || "The claim could not be updated.");
    }
    if (!silent) {
      setNotice(`${claim.agent.name}'s claim is now ${nextStatus}.`);
      setError(null);
    }
  };

  const requestStatus = async (claim: GiftClaimEntry, nextStatus: GiftClaimStatus) => {
    const actionLabel = nextStatus === "fulfilled" ? "mark this claim fulfilled" : nextStatus === "approved" ? "approve this claim" : "reject this claim";
    if (nextStatus === "fulfilled" && !confirmed[claim.id]) {
      setExpanded((current) => current.includes(claim.id) ? current : [...current, claim.id]);
      setError("Verify the contact or vendor details in the claim before marking it fulfilled.");
      return;
    }
    if (!window.confirm(`Confirm: ${actionLabel} for ${claim.agent.name} · ${claim.gift.title}?`)) return;
    setBusyId(claim.id);
    setNotice(null);
    setError(null);
    try {
      await updateClaim(claim, nextStatus);
      startTransition(() => router.refresh());
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "The claim could not be updated.");
    } finally {
      setBusyId(null);
    }
  };

  const saveNote = async (claim: GiftClaimEntry) => {
    setBusyId(claim.id);
    setNotice(null);
    setError(null);
    try {
      await updateClaim(claim, claim.status);
      setNotice(`Note saved for ${claim.agent.name}.`);
      startTransition(() => router.refresh());
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "The note could not be saved.");
    } finally {
      setBusyId(null);
    }
  };

  const runBulk = async () => {
    if (!bulkTarget || !selected.length) return;
    if (!window.confirm(`Confirm: ${bulkTarget === "approved" ? "approve" : "mark fulfilled for"} ${selected.length} selected claim${selected.length === 1 ? "" : "s"}?`)) return;
    setBusyId("bulk");
    setNotice(null);
    setError(null);
    try {
      for (const claimId of selected) {
        const claim = claims.find((item) => item.id === claimId);
        if (claim) await updateClaim(claim, bulkTarget, true);
      }
      setSelected([]);
      setNotice(`${selected.length} claim${selected.length === 1 ? "" : "s"} updated.`);
      startTransition(() => router.refresh());
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Some claims could not be updated.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleAll = () => setSelected((current) => allVisibleSelected ? current.filter((id) => !visibleClaims.some((claim) => claim.id === id)) : Array.from(new Set([...current, ...visibleClaims.map((claim) => claim.id)])));
  const toggleExpanded = (id: string) => setExpanded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <section className="space-y-5" aria-labelledby="claims-workspace-title">
      {dataWarning ? <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{dataWarning}</p> : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-black/10 bg-white px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Needs review</p><p className="mt-2 text-2xl font-semibold text-[#111]">{statusCounts.pending ?? 0}</p><p className="mt-1 text-xs text-neutral-500">new claims</p></div>
        <div className="rounded-2xl border border-black/10 bg-white px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Ready to fulfil</p><p className="mt-2 text-2xl font-semibold text-[#111]">{statusCounts.approved ?? 0}</p><p className="mt-1 text-xs text-neutral-500">approved claims</p></div>
        <div className={`rounded-2xl border px-4 py-4 ${atRiskCount ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}><p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${atRiskCount ? "text-rose-700" : "text-emerald-700"}`}>SLA watch</p><p className={`mt-2 text-2xl font-semibold ${atRiskCount ? "text-rose-950" : "text-emerald-950"}`}>{atRiskCount}</p><p className={`mt-1 text-xs ${atRiskCount ? "text-rose-800" : "text-emerald-800"}`}>{atRiskCount ? "at risk" : "nothing overdue"}</p></div>
        <div className="rounded-2xl border border-black/10 bg-white px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Fulfilled</p><p className="mt-2 text-2xl font-semibold text-[#111]">{statusCounts.fulfilled ?? 0}</p><p className="mt-1 text-xs text-neutral-500">closed claims</p></div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white shadow-[0_16px_44px_rgba(0,0,0,0.05)]">
        <div className="border-b border-black/5 px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500"><PackageCheck aria-hidden="true" size={14} />Fulfilment queue</div><h2 id="claims-workspace-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#111]">Make every approval deliberate</h2><p className="mt-1 text-sm leading-6 text-neutral-500">Identity, eligibility evidence, contact details, and history stay together for each handoff.</p></div><span className="rounded-full border border-black/10 bg-[#faf9f6] px-3 py-1.5 text-xs font-semibold text-neutral-600">{claims.length} total claims</span></div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"><label className="block text-xs font-semibold text-neutral-700" htmlFor="gift-claims-search">Search by agent, reward, vendor, or claim reference<span className="relative block"><Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-3.5 text-neutral-400" /><input id="gift-claims-search" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 pl-10 text-sm text-[#111] outline-none placeholder:text-neutral-400 focus:border-black focus:ring-2 focus:ring-black/10" placeholder="e.g. Maya, summer retreat" /></span></label>{selected.length ? <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-[#faf9f6] px-3 py-2"><span className="text-xs font-semibold text-neutral-700">{selected.length} selected</span>{bulkTarget ? <button type="button" onClick={runBulk} disabled={busyId === "bulk"} className="min-h-9 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busyId === "bulk" ? "Updating…" : bulkTarget === "approved" ? "Approve selected" : "Fulfil selected"}</button> : null}<button type="button" onClick={() => setSelected([])} className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-white text-neutral-600 hover:border-black/30" aria-label="Clear selected claims"><X aria-hidden="true" size={15} /></button></div> : <p className="text-xs text-neutral-500 lg:text-right">Select rows for safe bulk readiness.</p>}</div>
        </div>

        <div className="overflow-x-auto border-b border-black/5 px-5 py-4 sm:px-7"><div role="tablist" aria-label="Claim status" className="flex min-w-max gap-2">{statuses.map((status) => { const active = status.value === activeStatus; return <button key={status.value} type="button" role="tab" aria-selected={active} onClick={() => setActiveStatus(status.value)} className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${active ? "border-black bg-black text-white" : "border-black/10 bg-white text-neutral-700 hover:border-black/30"}`}>{status.label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-500"}`}>{statusCounts[status.value] ?? 0}</span></button>; })}</div></div>

        {notice ? <p role="status" aria-live="polite" className="mx-5 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:mx-7">{notice}</p> : null}
        {error ? <p role="alert" className="mx-5 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-7">{error}</p> : null}

        <div role="tabpanel" aria-label={`${statuses.find((status) => status.value === activeStatus)?.label ?? "Claim"} claims`} className="p-5 sm:p-7">
          {visibleClaims.length ? <div className="space-y-3"><div className="flex items-center gap-3 px-1 text-xs text-neutral-500"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all visible claims" className="h-4 w-4 rounded border-black/20 accent-black" /><span>{search ? `${visibleClaims.length} matching` : `${visibleClaims.length} in this queue`}</span>{isRefreshing ? <span className="ml-auto">Refreshing…</span> : null}</div>{visibleClaims.map((claim) => { const isExpanded = expanded.includes(claim.id); const isSelected = selected.includes(claim.id); const sla = slaFor(claim); return <article key={claim.id} className={`overflow-hidden rounded-2xl border bg-white transition-colors ${isSelected ? "border-black" : "border-black/10"}`}><div className="flex flex-wrap items-start gap-3 p-4 sm:items-center sm:px-5"><input type="checkbox" checked={isSelected} onChange={() => setSelected((current) => current.includes(claim.id) ? current.filter((id) => id !== claim.id) : [...current, claim.id])} aria-label={`Select ${claim.agent.name}'s ${claim.gift.title} claim`} className="mt-1 h-4 w-4 rounded border-black/20 accent-black sm:mt-0" /><div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#111] text-xs font-semibold text-white">{claim.agent.avatarUrl ? <img src={claim.agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(claim.agent.name)}</div><div className="min-w-[160px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[#111]">{claim.agent.name}</p>{claim.agent.verificationStatus === "verified" ? <span title="Verified agent" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"><Check aria-hidden="true" size={11} />Verified</span> : null}</div><p className="mt-1 text-xs text-neutral-500">{claim.gift.title}{claim.gift.titleAr ? ` · ${claim.gift.titleAr}` : ""}</p><p className="mt-1 text-[11px] text-neutral-400">Claimed {formatDate(claim.claimedAt)}</p></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone[claim.status]}`}>{statuses.find((status) => status.value === claim.status)?.label ?? claim.status}</span><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${sla.tone}`}><Clock3 aria-hidden="true" size={11} />{sla.label}</span></div><div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto"><button type="button" onClick={() => toggleExpanded(claim.id)} aria-expanded={isExpanded} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-black/30">{isExpanded ? "Hide details" : "View details"}<ChevronDown aria-hidden="true" size={14} className={isExpanded ? "rotate-180" : ""} /></button>{claim.status === "pending" ? <><button type="button" onClick={() => requestStatus(claim, "approved")} disabled={busyId === claim.id} className="min-h-9 rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50" aria-label={`Approve claim for ${claim.agent.name}`}>Approve</button><button type="button" onClick={() => requestStatus(claim, "rejected")} disabled={busyId === claim.id} className="min-h-9 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-rose-300 hover:text-rose-700" aria-label={`Reject claim for ${claim.agent.name}`}>Reject</button></> : null}{claim.status === "approved" ? <button type="button" onClick={() => requestStatus(claim, "fulfilled")} disabled={busyId === claim.id} className="min-h-9 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50" aria-label={`Mark claim for ${claim.agent.name} fulfilled`}>Mark fulfilled</button> : null}</div></div>{isExpanded ? <div className="border-t border-black/5 bg-[#faf9f6] p-4 sm:p-5"><div className="grid gap-4 lg:grid-cols-3"><section className="rounded-2xl border border-black/10 bg-white p-4" aria-labelledby={`claim-evidence-${claim.id}`}><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500"><ShieldCheck aria-hidden="true" size={14} />Evidence</div><h4 id={`claim-evidence-${claim.id}`} className="mt-2 text-sm font-semibold text-[#111]">Why this claim is eligible</h4><ul className="mt-3 space-y-2 text-xs leading-5 text-neutral-600">{(claim.evidence?.length ? claim.evidence : [claim.eligibility?.status ? `Eligibility record: ${claim.eligibility.status}.` : "Eligibility record is attached to this claim.", claim.agent.verificationStatus === "verified" ? "Agent verification is complete." : "Agent verification status is visible to reviewers.", "Duplicate and exclusivity checks are reviewed before approval."]).map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><Check aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-emerald-600" />{item}</li>)}</ul>{claim.conflicts?.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><div className="flex gap-2"><AlertTriangle aria-hidden="true" size={14} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Conflict needs review</p>{claim.conflicts.map((conflict, index) => <p key={`${conflict}-${index}`} className="mt-1">{conflict}</p>)}</div></div></div> : null}</section><section className="rounded-2xl border border-black/10 bg-white p-4" aria-labelledby={`claim-contact-${claim.id}`}><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500"><UserRound aria-hidden="true" size={14} />Contact</div><h4 id={`claim-contact-${claim.id}`} className="mt-2 text-sm font-semibold text-[#111]">Fulfilment details</h4><div className="mt-3 space-y-2 text-xs text-neutral-600"><p>{claim.agent.phone ? <a href={`tel:${claim.agent.phone}`} className="font-semibold text-[#111] hover:underline">{claim.agent.phone}</a> : "Phone not supplied"}{claim.agent.email ? <span className="block mt-1">{claim.agent.email}</span> : null}</p><p>{claim.fulfillment?.method || claim.gift.redemptionMethod || "Manual confirmation"}{claim.fulfillment?.owner || claim.gift.fulfillmentOwner ? <span className="block mt-1">Owner: {claim.fulfillment?.owner || claim.gift.fulfillmentOwner}</span> : null}</p><p>{claim.fulfillment?.vendor || claim.gift.vendor || "Vendor to confirm"}{claim.gift.value ? <span className="block mt-1">Value: {claim.gift.value}</span> : null}</p></div>{claim.agent.phone ? <button type="button" onClick={async () => { try { await navigator.clipboard?.writeText(claim.agent.phone ?? ""); setNotice("Contact copied."); } catch { setNotice("Contact is ready to copy from the phone link."); } }} className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-black/30"><Clipboard aria-hidden="true" size={14} />Copy phone</button> : null}</section><section className="rounded-2xl border border-black/10 bg-white p-4" aria-labelledby={`claim-history-${claim.id}`}><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500"><Clock3 aria-hidden="true" size={14} />History</div><h4 id={`claim-history-${claim.id}`} className="mt-2 text-sm font-semibold text-[#111]">Claim timeline</h4><div className="mt-3 space-y-2 text-xs text-neutral-600">{(claim.history?.length ? claim.history : [{ status: claim.status, at: claim.claimedAt, note: claim.notes }]).map((item, index) => <div key={`${item.status}-${item.at}-${index}`} className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#111]" /><div><p className="font-semibold capitalize text-[#111]">{item.status.replaceAll("_", " ")}</p><p className="text-neutral-500">{formatDate(item.at)}{item.note ? ` · ${item.note}` : ""}</p></div></div>)}</div></section></div><div className="mt-4 rounded-2xl border border-black/10 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><label className="min-w-0 flex-1 text-xs font-semibold text-neutral-700" htmlFor={`claim-note-${claim.id}`}><span className="inline-flex items-center gap-1.5"><MessageSquareText aria-hidden="true" size={14} />Internal fulfilment note</span><textarea id={`claim-note-${claim.id}`} value={notes[claim.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [claim.id]: event.target.value }))} rows={2} className="mt-1.5 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm font-normal text-[#111] outline-none placeholder:text-neutral-400 focus:border-black focus:ring-2 focus:ring-black/10" placeholder="Record vendor confirmation, delivery reference, or next step." /></label><button type="button" onClick={() => saveNote(claim)} disabled={busyId === claim.id} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30 disabled:opacity-50"><MessageSquareText aria-hidden="true" size={14} />{busyId === claim.id ? "Saving…" : "Save note"}</button></div>{claim.status === "approved" ? <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-neutral-600"><input type="checkbox" checked={Boolean(confirmed[claim.id])} onChange={(event) => setConfirmed((current) => ({ ...current, [claim.id]: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-black/20 accent-black" />I verified the contact or vendor details before fulfilment.</label> : null}</div></div> : null}</article>; })}</div> : <div className="rounded-2xl border border-dashed border-black/15 bg-[#faf9f6] px-4 py-12 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-500"><Search aria-hidden="true" size={18} /></div><h3 className="mt-3 text-sm font-semibold text-[#111]">No matching claims</h3><p className="mt-1 text-xs text-neutral-500">Try another status or search term.</p></div>}
        </div>
      </div>
    </section>
  );
}
