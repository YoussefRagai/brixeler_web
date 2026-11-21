"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useId, useRef } from "react";

type FeedbackTone = "error" | "success";

type Props = {
  message: string | null | undefined;
  tone: FeedbackTone;
  /** Redirect feedback should be brought into the user's reading order. */
  autoFocus?: boolean;
  compact?: boolean;
};

export function FeedbackBanner({ message, tone, autoFocus = false, compact = false }: Props) {
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const bannerId = `workspace-feedback-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!message || !autoFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const banner = bannerRef.current;
      if (!banner) return;
      banner.focus({ preventScroll: true });
      const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      banner.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, message]);

  if (!message) return null;
  const isError = tone === "error";
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div
      ref={bannerRef}
      id={bannerId}
      tabIndex={-1}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      className={`flex items-start gap-3 border ${compact ? "rounded-2xl px-3 py-2.5 text-xs" : "rounded-3xl px-4 py-3 text-sm"} ${
        isError
          ? "border-rose-300 bg-rose-50 text-rose-900"
          : "border-emerald-300 bg-emerald-50 text-emerald-900"
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60`}
    >
      <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={compact ? 16 : 18} />
      <p className="font-medium leading-5">{message}</p>
    </div>
  );
}
