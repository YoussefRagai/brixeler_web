"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  className,
  pendingLabel = "Working…",
  ariaLabel,
}: {
  children: ReactNode;
  confirmMessage: string;
  className?: string;
  pendingLabel?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
