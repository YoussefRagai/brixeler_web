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

const fallbackTickets: Ticket[] = [
  {
    id: "mock-1922",
    subject: "Commission payout delay",
    agent: "Sara Amin",
    status: "new",
    priority: "high",
    waiting: "17m ago",
    category: "payout",
    preview: "Finance team reviewing IBAN confirmation.",
  },
  {
    id: "mock-1921",
    subject: "Verification docs expired",
    agent: "Karim Fouad",
    status: "in_progress",
    priority: "normal",
    waiting: "1h ago",
    category: "verification",
    preview: "Agent uploaded new scans — awaiting reviewer.",
  },
  {
    id: "mock-1920",
    subject: "OCR mismatch on contract",
    agent: "Youssef Hassan",
    status: "waiting_agent",
    priority: "urgent",
    waiting: "3h ago",
    category: "deal",
    preview: "Need unredacted PDF for developer validation.",
  },
];

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

    if (error || !data) {
      console.warn("Support ticket query failed", error);
      return fallbackTickets;
    }

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
  } catch (error) {
    console.warn("Unexpected error loading support tickets", error);
    return fallbackTickets;
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
        <button className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10">
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
          <article key={column.key} className="rounded-3xl border border-white/5 bg-white/5 p-4">
            <header className="flex items-center justify-between">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">{column.label}</p>
              <span className="text-xs text-slate-400">{ticketsByStatus[column.key].length} tickets</span>
            </header>
            <div className="mt-4 space-y-3 text-sm text-slate-200">
              {ticketsByStatus[column.key].length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-center text-xs text-white/50">
                  No tickets in this lane
                </p>
              )}
              {ticketsByStatus[column.key].map((ticket) => (
                <div key={ticket.id} className="rounded-2xl border border-white/5 bg-black/20 p-3">
                  <p className="font-medium text-white">{ticket.subject}</p>
                  <p className="text-xs text-slate-400">
                    {ticket.agent} · {ticket.waiting}
                  </p>
                  <p className="text-xs text-rose-200 capitalize">{ticket.priority} priority</p>
                  <p className="mt-2 line-clamp-2 text-xs text-white/60">{ticket.preview}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

          <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Macros</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {macros.map((macro) => (
              <span key={macro} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80">
                {macro}
              </span>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Ticket detail</p>
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <p>Select a ticket to respond.</p>
            <textarea className="mt-2 min-h-[120px] w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" />
            <button className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950">Send response</button>
          </div>
        </article>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
