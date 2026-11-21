"use client";

import { useActionState, useState } from "react";
import type { SupportConversationActionState } from "./DeveloperSupportConversation";
import { FeedbackBanner } from "@/components/FeedbackBanner";

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
      <FeedbackBanner message={state.message} tone={state.status === "error" ? "error" : "success"} />
      {pending ? <p role="status" aria-live="polite" className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">{audience === "admin" ? "Saving support response…" : "Sending support response…"}</p> : null}
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
