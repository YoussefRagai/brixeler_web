"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Check, CircleAlert, Inbox, MailOpen } from "lucide-react";

export type DeveloperNotification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  action_url?: string | null;
};

export type NotificationActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type MarkNotificationReadAction = (
  previousState: NotificationActionState,
  formData: FormData,
) => Promise<NotificationActionState>;

const initialState: NotificationActionState = { status: "idle", message: "" };

export function DeveloperNotificationInbox({
  notifications,
  loadError,
  action,
}: {
  notifications: DeveloperNotification[];
  loadError?: boolean;
  action: MarkNotificationReadAction;
}) {
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <article className="dashboard-panel overflow-hidden rounded-3xl border border-black/5 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#111211] text-white">
            <Inbox aria-hidden="true" size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Inbox</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#050505]">Signals that need your attention</h2>
            <p className="mt-1 text-sm text-neutral-500">Workflow updates and agent requests, newest first.</p>
          </div>
        </div>
        <span className="rounded-full bg-[#111211] px-2.5 py-1 text-[11px] font-semibold text-white">
          {unreadCount} unread
        </span>
      </div>

      {loadError ? (
        <div role="alert" className="flex items-start gap-3 border-b border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-800 sm:px-6">
          <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          <p>We couldn&apos;t load the latest inbox updates. Refresh to try again.</p>
        </div>
      ) : null}

      <div className="divide-y divide-black/5">
        {notifications.map((notification) => (
          <NotificationRow key={notification.id} notification={notification} action={action} />
        ))}
        {!notifications.length && !loadError ? (
          <div className="flex items-center gap-3 px-5 py-7 text-sm text-neutral-500 sm:px-6">
            <MailOpen aria-hidden="true" size={17} />
            No notifications yet. New agent activity will appear here.
          </div>
        ) : null}
      </div>
    </article>
  );
}

function NotificationRow({
  notification,
  action,
}: {
  notification: DeveloperNotification;
  action: MarkNotificationReadAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isRead = notification.is_read || state.status === "success";

  return (
    <div className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 ${isRead ? "bg-white" : "bg-[#fbfcf2]"}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${isRead ? "bg-neutral-200" : "bg-[#93a43d]"}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#050505]">{notification.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-600">{notification.message}</p>
          <time dateTime={notification.created_at} className="mt-1.5 block text-[11px] text-neutral-400">
            {formatNotificationDate(notification.created_at)}
          </time>
          {state.status === "error" ? (
            <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-700">
              <CircleAlert aria-hidden="true" size={13} />
              {state.message}
            </p>
          ) : null}
          {notification.action_url ? <Link href={notification.action_url} className="mt-2 inline-flex text-xs font-semibold text-neutral-700 underline-offset-4 hover:text-black hover:underline">Open related item</Link> : null}
        </div>
      </div>
      {isRead ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-neutral-400 sm:mt-1">
          <Check aria-hidden="true" size={13} />
          Read
        </span>
      ) : (
        <form action={formAction} className="shrink-0 self-start sm:mt-0.5">
          <input type="hidden" name="notificationId" value={notification.id} />
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="min-h-9 rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-semibold text-neutral-800 transition hover:border-black/30 hover:bg-white disabled:cursor-wait disabled:opacity-50"
          >
            {pending ? "Updating…" : "Mark read"}
          </button>
        </form>
      )}
    </div>
  );
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}
