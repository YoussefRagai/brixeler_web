"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  className,
  pendingLabel = "Working…",
}: {
  children: ReactNode;
  confirmMessage: string;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
