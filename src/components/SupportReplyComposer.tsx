"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export function SupportReplyComposer({
  ticketId,
  macros,
  action,
}: {
  ticketId: string;
  macros: { id: string; title: string; message: string; is_demo: boolean }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [message, setMessage] = useState("");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="flex flex-wrap gap-2">
        {macros.map((macro) => (
          <button key={macro.id} type="button" onClick={() => setMessage(macro.message)} className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 text-xs">
            {macro.title}{macro.is_demo ? " · Demo" : ""}
          </button>
        ))}
      </div>
      <textarea name="message" value={message} onChange={(event) => setMessage(event.target.value)} required maxLength={4000} placeholder="Write a clear response and next steps for the agent." className="min-h-32 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" />
      <SendButton />
    </form>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit">{pending ? "Sending…" : "Send reply"}</button>;
}

