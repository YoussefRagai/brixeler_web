"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";

export type VerificationCard = {
  id: string;
  name: string;
  phone: string;
  submittedAt: string | null;
  submitted: string;
  docs: string[];
  status: string;
  priority: string;
  notes: string;
  accountStatus: string;
  lifecycleState: string;
  reviewVersion: number;
  ageHours: number;
  reviewable: boolean;
};

type Props = {
  queue: VerificationCard[];
  isSearch: boolean;
};

type SwipeDirection = "left" | "right" | null;

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(url.split("?")[0] || "");
}

function isDocumentUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function normalizeDocLabel(url: string) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "Document");
  } catch {
    const parts = url.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "Document");
  }
}

export function VerificationCarousel({ queue, isSearch }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<SwipeDirection>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRequestChange, setShowRequestChange] = useState(false);
  const [reason, setReason] = useState("");
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const busy = isSubmitting || isRefreshing || Boolean(direction);

  const index = Math.min(activeIndex, Math.max(0, queue.length - 1));
  const current = queue[index];
  const next = queue[index + 1];
  const docs = current?.docs ?? [];
  const activeDoc = docs[activeDocIndex] ?? docs[0];
  const activeDocIsUrl = activeDoc ? isDocumentUrl(activeDoc) : false;

  const clearReviewForm = () => {
    setShowRequestChange(false);
    setReason("");
    setActiveDocIndex(0);
  };

  const goPrev = () => {
    if (index === 0 || busy) return;
    setDirection("left");
    setTimeout(() => {
      setDirection(null);
      clearReviewForm();
      setActiveIndex(index - 1);
    }, 200);
  };

  const goNext = () => {
    if (!next || busy) return;
    setDirection("right");
    setTimeout(() => {
      setDirection(null);
      clearReviewForm();
      setActiveIndex(index + 1);
    }, 200);
  };

  const approve = async () => {
    if (!current || busy || !current.reviewable || !docs.length) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setActionMessage(null);
    try {
      const response = await fetch("/api/admin/verification/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: current.id, reviewVersion: current.reviewVersion }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to approve this verification request.");
      }
      clearReviewForm();
      setActiveIndex(index);
      setActionMessage("Verification approved.");
      startRefresh(() => router.refresh());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to approve this verification request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestChange = async () => {
    if (!current || busy || !current.reviewable || reason.trim().length < 3) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setActionMessage(null);
    try {
      const response = await fetch("/api/admin/verification/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: current.id, reason: reason.trim(), reviewVersion: current.reviewVersion }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to request changes for this verification.");
      }
      clearReviewForm();
      if (next) setActiveIndex(index + 1);
      setActionMessage("Change request sent.");
      startRefresh(() => router.refresh());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to request changes for this verification.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!current) {
    return (
      <div className="space-y-4">
        {errorMessage ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{errorMessage}</div> : null}
        {actionMessage ? <div aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{actionMessage}</div> : null}
        <div className="rounded-3xl border border-dashed border-black/10 bg-neutral-50 p-10 text-center text-sm text-neutral-600">
          {isSearch ? "No verification requests match this search." : "No pending verification requests on this page."}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {errorMessage ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{errorMessage}</div> : null}
      {actionMessage ? <div aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{actionMessage}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Pending agents</p>
          <p className="text-lg text-slate-300">{queue.length} pending on this page</p>
        </div>
        <div className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300">
          Card {index + 1} of {queue.length}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label="Verification queue position" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index + 1}>
        <div className="h-full rounded-full bg-black transition-[width] duration-300" style={{ width: `${((index + 1) / queue.length) * 100}%` }} />
      </div>

      <div className="relative mx-auto h-[520px] w-full max-w-3xl">
        {next ? (
          <div className="absolute inset-0 translate-y-3 scale-[0.96] rounded-[36px] border border-white/5 bg-black/20 shadow-xl shadow-black/30" />
        ) : null}
        <div
          role="group"
          aria-label={`Verification request for ${current.name}`}
          className={clsx(
            "absolute inset-0 overflow-y-auto rounded-[36px] border border-white/10 bg-[#0f1115] p-4 text-slate-100 shadow-2xl shadow-black/40 transition-all duration-300 sm:p-6",
            direction === "right" && "translate-x-24 -rotate-3 opacity-0",
            direction === "left" && "-translate-x-24 rotate-3 opacity-0",
          )}
        >
          <header className="flex items-start justify-between gap-4 text-white">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Verification</p>
              <p className="text-2xl font-semibold !text-white">{current.name}</p>
              <p className="text-xs text-slate-400">Submitted {current.submitted} · {current.ageHours < 1 ? "less than 1h old" : `${Math.floor(current.ageHours)}h old`}</p>
              <p className="mt-1 text-xs text-slate-400">{current.phone}</p>
            </div>
            <span className={clsx("rounded-full border px-3 py-1 text-xs", current.reviewable ? "border-white/10 text-slate-300" : "border-amber-300/40 text-amber-200")}>
              {current.priority} priority
            </span>
          </header>

          <div className="mt-6 grid gap-4">
            <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Attachments</p>
                <p className="text-xs text-slate-400">{docs.length || 0} files</p>
              </div>
              <div className="mt-4 flex h-64 items-center justify-center overflow-hidden rounded-2xl bg-black/50">
                {docs.length ? (
                  !activeDocIsUrl ? (
                    <div className="px-4 text-center text-sm text-slate-300">
                      <p className="font-medium text-white">Attachment label only</p>
                      <p className="mt-2 break-words">{activeDoc}</p>
                    </div>
                  ) : isImageUrl(activeDoc) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeDoc}
                      alt={normalizeDocLabel(activeDoc)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <iframe
                      src={activeDoc}
                      title={normalizeDocLabel(activeDoc)}
                      className="h-full w-full"
                    />
                  )
                ) : (
                  <p className="text-sm text-slate-300">No documents uploaded.</p>
                )}
              </div>
              {docs.length > 1 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {docs.map((doc, idx) => (
                    <button
                      key={`${doc}-${idx}`}
                      type="button"
                      onClick={() => setActiveDocIndex(idx)}
                      className={clsx(
                        "rounded-full border px-3 py-1 text-xs",
                        idx === activeDocIndex
                          ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                          : "border-white/10 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {normalizeDocLabel(doc)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {!current.reviewable ? <div role="alert" className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">This profile is {current.accountStatus} and cannot be reviewed. Restore the account first.</div> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0 || busy}
          aria-label="Previous verification request"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-3 text-white shadow-lg shadow-black/40 disabled:opacity-40 sm:left-0 sm:-translate-x-full"
        >
          ←
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!next || busy}
          aria-label="Next verification request"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-3 text-white shadow-lg shadow-black/40 disabled:opacity-40 sm:right-0 sm:translate-x-full"
        >
          →
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={busy || !current.reviewable}
            aria-expanded={showRequestChange}
            aria-controls="verification-change-request"
            onClick={() => setShowRequestChange((prev) => !prev)}
            className="flex-1 rounded-full border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-slate-100"
          >
            {showRequestChange ? "Cancel change request" : "Request change"}
          </button>
          <button
            type="button"
            disabled={busy || !current.reviewable || !docs.length || showRequestChange}
            onClick={approve}
            className="flex-1 rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-300"
          >
            Approve
          </button>
        </div>
        {!docs.length && current.reviewable ? <p className="mt-2 text-sm text-neutral-600">At least one readable document is required for approval.</p> : null}
        {showRequestChange && current.reviewable ? (
          <form id="verification-change-request" className="mt-3 rounded-2xl border border-black/10 bg-neutral-50 p-4" onSubmit={(event) => { event.preventDefault(); void requestChange(); }}>
            <label htmlFor="verification-change-reason" className="text-sm font-semibold text-neutral-900">Change request message</label>
            <textarea
              id="verification-change-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              minLength={3}
              maxLength={2000}
              required
              placeholder="Describe what the agent needs to upload again"
              className="mt-2 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-neutral-900"
            />
            <button
              type="submit"
              disabled={busy || reason.trim().length < 3}
              className="mt-2 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send change request
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
