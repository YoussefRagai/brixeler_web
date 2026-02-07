"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";

export type VerificationCard = {
  id: string;
  name: string;
  submitted: string;
  docs: string[];
  status: string;
  priority: string;
  notes: string;
};

type Props = {
  queue: VerificationCard[];
};

type SwipeDirection = "left" | "right" | null;

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(url.split("?")[0] || "");
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

export function VerificationCarousel({ queue }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<SwipeDirection>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRequestChange, setShowRequestChange] = useState(false);
  const [reason, setReason] = useState("");
  const [activeDocIndex, setActiveDocIndex] = useState(0);

  const current = queue[activeIndex];
  const next = queue[activeIndex + 1];

  const docs = useMemo(() => current?.docs ?? [], [current]);

  const advanceCard = (dir: SwipeDirection) => {
    setDirection(dir);
    setTimeout(() => {
      setDirection(null);
      setShowRequestChange(false);
      setReason("");
      setActiveDocIndex(0);
      setActiveIndex((prev) => Math.min(prev + 1, queue.length));
    }, 350);
  };

  const goPrev = () => {
    if (activeIndex === 0) return;
    setDirection("left");
    setTimeout(() => {
      setDirection(null);
      setShowRequestChange(false);
      setReason("");
      setActiveDocIndex(0);
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    }, 200);
  };

  const goNext = () => {
    if (!current || activeIndex >= queue.length - 1) return;
    setDirection("right");
    setTimeout(() => {
      setDirection(null);
      setShowRequestChange(false);
      setReason("");
      setActiveDocIndex(0);
      setActiveIndex((prev) => Math.min(prev + 1, queue.length - 1));
    }, 200);
  };

  const approve = async () => {
    if (!current || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/admin/verification/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: current.id }),
      });
      advanceCard("right");
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestChange = async () => {
    if (!current || isSubmitting) return;
    if (!reason.trim()) {
      setShowRequestChange(true);
      return;
    }
    setIsSubmitting(true);
    try {
      await fetch("/api/admin/verification/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: current.id, reason: reason.trim() }),
      });
      advanceCard("left");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!current) {
    return (
      <div className="rounded-3xl border border-white/5 bg-white/5 p-10 text-center text-sm text-slate-300">
        All verification requests are processed.
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Pending agents</p>
          <p className="text-lg text-slate-300">{queue.length - activeIndex} submissions awaiting action</p>
        </div>
        <div className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300">
          Card {activeIndex + 1} of {queue.length}
        </div>
      </div>

      <div className="relative mx-auto h-[520px] w-full max-w-3xl">
        {next ? (
          <div className="absolute inset-0 translate-y-3 scale-[0.96] rounded-[36px] border border-white/5 bg-black/20 shadow-xl shadow-black/30" />
        ) : null}
        <div
          className={clsx(
            "absolute inset-0 rounded-[36px] border border-white/10 bg-[#0f1115] p-6 text-slate-100 shadow-2xl shadow-black/40 transition-all duration-300",
            direction === "right" && "translate-x-24 -rotate-3 opacity-0",
            direction === "left" && "-translate-x-24 rotate-3 opacity-0",
          )}
        >
          <header className="flex items-start justify-between gap-4 text-white">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Verification</p>
              <p className="text-2xl font-semibold !text-white">{current.name}</p>
              <p className="text-xs text-slate-400">Submitted {current.submitted}</p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
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
                  isImageUrl(docs[activeDocIndex]) ? (
                    <img
                      src={docs[activeDocIndex]}
                      alt={normalizeDocLabel(docs[activeDocIndex])}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <iframe
                      src={docs[activeDocIndex]}
                      title={normalizeDocLabel(docs[activeDocIndex])}
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
                      key={doc}
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

            {showRequestChange ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <label className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Change request message
                </label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  placeholder="ID should be uploaded in a better quality"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={goPrev}
          disabled={activeIndex === 0}
          className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-3 text-white shadow-lg shadow-black/40 disabled:opacity-40"
        >
          ←
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={activeIndex >= queue.length - 1}
          className="absolute right-0 top-1/2 translate-x-full -translate-y-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-3 text-white shadow-lg shadow-black/40 disabled:opacity-40"
        >
          →
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setShowRequestChange((prev) => !prev)}
            className="flex-1 rounded-full border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-slate-100"
          >
            Request change
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={approve}
            className="flex-1 rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-300"
          >
            Approve
          </button>
          {showRequestChange ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={requestChange}
              className="flex-1 rounded-full border border-rose-200/40 bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-rose-50"
            >
              Send change request
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
