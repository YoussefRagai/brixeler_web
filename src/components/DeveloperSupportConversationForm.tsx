"use client";

import { useActionState, useState } from "react";
import type { SupportConversationActionState } from "./DeveloperSupportConversation";

type ConversationAction = (formData: FormData) => Promise<SupportConversationActionState>;

export function DeveloperSupportConversationForm({
  action,
  ticketId,
  developerId,
  audience,
  initiallyRead,
}: {
  action: ConversationAction;
  ticketId: string;
  developerId: string;
  audience: "admin" | "developer";
  initiallyRead: boolean;
}) {
  const [message, setMessage] = useState("");
  const [read, setRead] = useState(initiallyRead);
  const [state, formAction, pending] = useActionState(
    async (_previousState: SupportConversationActionState, formData: FormData) => {
      const nextState = await action(formData);
      if (nextState.status === "success") {
        const operation = formData.get("operation");
        if (operation === "reply") setMessage("");
        if (operation === "read") setRead(true);
      }
      return nextState;
    },
    { status: "idle" } satisfies SupportConversationActionState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="developerId" value={developerId} />
      <input type="hidden" name="audience" value={audience} />
      <textarea
        name="message"
        aria-label="Reply"
        maxLength={20000}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        disabled={pending}
        className="min-h-28 w-full rounded-xl border p-3 disabled:cursor-not-allowed disabled:opacity-60"
        placeholder="Write a reply"
      />
      {state.message ? <p role={state.status === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-xl border px-3 py-2 text-sm ${state.status === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{state.message}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button name="operation" value="reply" disabled={pending || !message.trim()} className="rounded-full bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Sending…" : "Send reply"}
        </button>
        <button name="operation" value="read" disabled={pending || read} className="rounded-full border px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Saving…" : read ? "Already read" : "Mark read"}
        </button>
      </div>
    </form>
  );
}
