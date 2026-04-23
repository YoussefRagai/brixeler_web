import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

const macros = ["Verification docs matched", "Commission payout scheduled", "Forward to compliance"];

type SupportTicketStatus = "new" | "in_progress" | "waiting_agent" | "resolved" | "closed";
type SupportTicketPriority = "normal" | "high" | "urgent";

type TicketRecord = {
  id: string;
  subject: string;
  category: string | null;
  status: SupportTicketStatus | null;
  priority: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  agent:
    | {
        display_name: string | null;
        phone: string | null;
      }
    | {
        display_name: string | null;
        phone: string | null;
      }[]
    | null;
};

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  agent: string;
  waiting: string;
  preview: string;
};

const statusColumns: { key: SupportTicketStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_agent", label: "Waiting agent" },
  { key: "resolved", label: "Resolved" },
];

function formatRelativeTime(timestamp?: string | null) {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function getSupportTickets(): Promise<Ticket[]> {
  try {
    const { data, error } = await supabaseServer
      .from("support_tickets")
      .select(
        `
        id,
        subject,
        category,
        status,
        priority,
        last_message_at,
        last_message_preview,
        agent:agent_id (
          display_name,
          phone
        )
      `,
      )
      .order("last_message_at", { ascending: false })
      .limit(30);

    if (error || !data) return [];

    return (data as TicketRecord[]).map((ticket) => {
      const normalizedPriority: SupportTicketPriority =
        ticket.priority === "urgent" ? "urgent" : ticket.priority === "high" ? "high" : "normal";
      return {
        id: ticket.id,
        subject: ticket.subject,
        category: ticket.category ?? "general",
        status: ticket.status ?? "new",
        priority: normalizedPriority,
        agent: Array.isArray(ticket.agent)
          ? ticket.agent[0]?.display_name ?? "Unassigned"
          : ticket.agent?.display_name ?? "Unassigned",
        waiting: formatRelativeTime(ticket.last_message_at),
        preview: ticket.last_message_preview ?? "Awaiting first response.",
      };
    });
  } catch {
    return [];
  }
}

export default async function SupportPage() {
  const ui = await buildAdminUi(["user_support_admin"]);
  const tickets = await getSupportTickets();
  const ticketsByStatus = statusColumns.reduce<Record<SupportTicketStatus, Ticket[]>>(
    (acc, column) => ({
      ...acc,
      [column.key]: tickets.filter((ticket) => ticket.status === column.key),
    }),
    { new: [], in_progress: [], waiting_agent: [], resolved: [], closed: [] },
  );

  return (
    <AdminLayout
      title="Support cockpit"
      description="Assist agents, unblock deals, and keep SLAs under 1 hour."
      actions={
        <button className="rounded-full border border-black/10 px-5 py-2 text-sm text-neutral-700 hover:bg-black/5">
          New macro
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statusColumns.map((column) => (
          <article key={column.key} className="rounded-3xl border border-black/5 bg-white p-5 shadow-lg shadow-black/5">
            <header className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">{column.label}</p>
              <span className="rounded-full border border-black/10 px-3 py-1 text-sm text-neutral-600">
                {ticketsByStatus[column.key].length}
              </span>
            </header>
            <div className="mt-4 space-y-3 text-sm text-neutral-700">
              {ticketsByStatus[column.key].length === 0 && (
                <p className="rounded-2xl border border-dashed border-black/10 bg-black/[0.02] px-4 py-6 text-center text-sm text-neutral-500">
                  No tickets in this lane
                </p>
              )}
              {ticketsByStatus[column.key].map((ticket) => (
                <div key={ticket.id} className="rounded-2xl border border-black/5 bg-black/[0.02] p-3">
                  <p className="font-semibold text-[#050505]">{ticket.subject}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {ticket.agent} · {ticket.waiting}
                  </p>
                  <p className="mt-2 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs text-rose-700 capitalize">
                    {ticket.priority} priority
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-500">{ticket.preview}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

          <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Macros</p>
          <p className="mt-2 text-sm text-neutral-600">One-tap responses for frequent support flows.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {macros.map((macro) => (
              <span key={macro} className="rounded-full border border-black/10 bg-[#f8f8f8] px-3 py-1 text-sm text-neutral-700">
                {macro}
              </span>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Ticket detail</p>
          <div className="mt-4 space-y-2 text-sm text-neutral-700">
            <p>Select a ticket to respond.</p>
            <textarea
              placeholder="Write a clear response and next steps for the agent."
              className="mt-2 min-h-[120px] w-full rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3 text-[#050505] placeholder:text-neutral-400"
            />
            <button className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white">Send response</button>
          </div>
        </article>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
