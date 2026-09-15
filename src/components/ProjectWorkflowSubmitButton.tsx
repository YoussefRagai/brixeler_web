"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function ProjectWorkflowSubmitButton({ children, disabled = false, primary = false, pendingLabel = "Saving…" }: { children: ReactNode; disabled?: boolean; primary?: boolean; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} aria-disabled={disabled || pending} className={`min-h-10 rounded-full border px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "border-black bg-black text-white" : "border-black/10 text-neutral-700"}`}>{pending ? pendingLabel : children}</button>;
}
