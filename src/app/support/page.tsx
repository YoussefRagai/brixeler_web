import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { SupportReplyComposer } from "@/components/SupportReplyComposer";
import { buildAdminUi } from "@/lib/adminUi";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";

type Ticket = {
  id: string;
  agent_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  last_message_at: string;
  last_message_preview: string | null;
  assigned_to: string | null;
  is_demo: boolean;
  agent: { display_name: string | null; phone: string | null } | { display_name: string | null; phone: string | null }[] | null;
};
type Message = { id: string; author_type: string; message: string; created_at: string };
type Macro = { id: string; title: string; message: string; is_demo: boolean };
const lanes = ["new", "in_progress", "waiting_agent", "resolved"] as const;

export default async function SupportPage({
  searchParams,
}: {
  searchParams?: Promise<{ ticket?: string; success?: string; error?: string }>;
}) {
  const ui = await buildAdminUi(["user_support_admin", "developers_admin"]);
  const params = (await searchParams) ?? {};
  const [{ data: ticketData }, { data: macroData }] = ui.hasAccess
    ? await Promise.all([
        supabaseServer.from("support_tickets").select("id, agent_id, subject, category, status, priority, last_message_at, last_message_preview, assigned_to, is_demo, agent:agent_id(display_name, phone)").order("last_message_at", { ascending: false }).limit(100),
        supabaseServer.from("support_macros").select("id, title, message, is_demo").eq("is_active", true).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const tickets = (ticketData ?? []) as Ticket[];
  const activeTicket = tickets.find((ticket) => ticket.id === params.ticket) ?? tickets[0] ?? null;
  const { data: messageData } = activeTicket
    ? await supabaseServer.from("support_ticket_messages").select("id, author_type, message, created_at").eq("ticket_id", activeTicket.id).order("created_at")
    : { data: [] };
  const messages = (messageData ?? []) as Message[];
  const macros = (macroData ?? []) as Macro[];
  // This is a server-render snapshot used only for SLA and relative-time labels.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  return (
    <AdminLayout title="Support cockpit" description="Own the full agent conversation, assignment, status, and SLA loop." navItems={ui.navItems} meta={ui.meta}>
      {!ui.hasAccess ? <AdminAccessDenied /> : (
        <>
          {params.success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{params.success}</div> : null}
          {params.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{params.error}</div> : null}

          <section className="grid gap-4 xl:grid-cols-4">
            {lanes.map((lane) => {
              const laneTickets = tickets.filter((ticket) => ticket.status === lane);
              return (
                <article key={lane} className="rounded-3xl border border-black/5 bg-white p-4">
                  <header className="flex items-center justify-between"><p className="text-xs uppercase tracking-[0.22em] text-neutral-500">{lane.replaceAll("_", " ")}</p><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs">{laneTickets.length}</span></header>
                  <div className="mt-3 space-y-2">
                    {laneTickets.map((ticket) => (
                      <Link key={ticket.id} href={`/support?ticket=${ticket.id}`} className={`block rounded-2xl border p-3 transition ${activeTicket?.id === ticket.id ? "border-black bg-black text-white" : "border-black/5 bg-neutral-50 hover:border-black/20"}`}>
                        <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{ticket.subject}</p>{ticket.is_demo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">DEMO</span> : null}</div>
                        <p className={`mt-1 text-xs ${activeTicket?.id === ticket.id ? "text-white/60" : "text-neutral-500"}`}>{agentName(ticket.agent)} · {relativeTime(ticket.last_message_at, renderedAt)}</p>
                        <p className={`mt-2 line-clamp-2 text-xs ${activeTicket?.id === ticket.id ? "text-white/70" : "text-neutral-500"}`}>{ticket.last_message_preview || "Awaiting first message"}</p>
                      </Link>
                    ))}
                    {!laneTickets.length ? <p className="rounded-2xl border border-dashed border-black/10 p-5 text-center text-xs text-neutral-400">Empty</p> : null}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <article className="rounded-3xl border border-black/5 bg-white p-6">
              {activeTicket ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 pb-4">
                    <div><p className="text-xs uppercase tracking-[0.25em] text-neutral-500">{activeTicket.category}</p><h2 className="mt-1 text-xl font-semibold">{activeTicket.subject}</h2><p className="text-sm text-neutral-500">{agentName(activeTicket.agent)}</p></div>
                    <div className="flex gap-2">
                      <form action={assignTicketAction}><input type="hidden" name="ticketId" value={activeTicket.id}/><button className="rounded-full border border-black/10 px-3 py-1.5 text-xs" type="submit">{activeTicket.assigned_to === ui.context.adminId ? "Assigned to you" : "Assign to me"}</button></form>
                      <form action={updateTicketStatusAction} className="flex gap-1"><input type="hidden" name="ticketId" value={activeTicket.id}/><select name="status" defaultValue={activeTicket.status} className="rounded-full border border-black/10 px-3 py-1.5 text-xs">{lanes.map((lane) => <option key={lane} value={lane}>{lane.replaceAll("_", " ")}</option>)}<option value="closed">closed</option></select><button className="rounded-full bg-black px-3 py-1.5 text-xs text-white" type="submit">Update</button></form>
                    </div>
                  </div>
                  <div className="my-5 max-h-[440px] space-y-3 overflow-y-auto pr-2">
                    {messages.map((message) => <div key={message.id} className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${message.author_type === "admin" ? "ml-auto bg-black text-white" : "bg-neutral-100 text-neutral-800"}`}><p>{message.message}</p><p className={`mt-1 text-[10px] ${message.author_type === "admin" ? "text-white/45" : "text-neutral-400"}`}>{message.author_type} · {new Date(message.created_at).toLocaleString()}</p></div>)}
                    {!messages.length ? <p className="py-8 text-center text-sm text-neutral-500">No messages yet.</p> : null}
                  </div>
                  <SupportReplyComposer ticketId={activeTicket.id} macros={macros} action={replyToTicketAction} />
                </>
              ) : <p className="py-16 text-center text-neutral-500">No support tickets yet.</p>}
            </article>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-black/5 bg-white p-5"><p className="text-xs uppercase tracking-[0.25em] text-neutral-500">SLA</p><p className="mt-2 text-3xl font-semibold">{tickets.filter((ticket) => ticket.status !== "resolved" && renderedAt - new Date(ticket.last_message_at).getTime() > 3600000).length}</p><p className="text-sm text-neutral-500">open tickets waiting over one hour</p></section>
              <section className="rounded-3xl border border-black/5 bg-white p-5"><p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Create macro</p><form action={createMacroAction} className="mt-4 space-y-3"><input name="title" required placeholder="Macro title" className="w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm"/><textarea name="message" required placeholder="Reusable reply" className="min-h-28 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm"/><button className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white" type="submit">Save macro</button></form></section>
            </aside>
          </section>
        </>
      )}
    </AdminLayout>
  );
}

function agentName(agent: Ticket["agent"]) {
  return Array.isArray(agent) ? agent[0]?.display_name ?? "Agent" : agent?.display_name ?? "Agent";
}
function relativeTime(value: string, now: number) {
  const minutes = Math.max(1, Math.floor((now - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}

async function replyToTicketAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const ticketId = formData.get("ticketId")?.toString();
  const message = formData.get("message")?.toString().trim() ?? "";
  if (!ticketId || !message) redirect("/support?error=Write%20a%20reply.");
  const { data: ticket } = await supabaseServer.from("support_tickets").select("agent_id, first_response_at").eq("id", ticketId).single();
  if (!ticket) redirect("/support?error=Ticket%20not%20found.");
  const { error } = await supabaseServer.from("support_ticket_messages").insert({ ticket_id: ticketId, author_type: "admin", author_id: admin.adminId, message });
  if (error) redirect(`/support?ticket=${ticketId}&error=${encodeURIComponent(error.message)}`);
  await Promise.all([
    supabaseServer.from("support_tickets").update({ status: "waiting_agent", assigned_to: admin.adminId, first_response_at: ticket.first_response_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ticketId),
    supabaseServer.from("notifications").insert({ agent_id: ticket.agent_id, type: "admin_message", title: "Support replied", message: message.slice(0, 240), related_entity_type: "support_ticket", related_entity_id: ticketId, action_url: "/support" }),
    logAdminActivity({ adminId: admin.adminId, action: "support_ticket_replied", resourceType: "support_ticket", resourceId: ticketId }),
  ]);
  revalidatePath("/support");
  redirect(`/support?ticket=${ticketId}&success=Reply%20sent.`);
}

async function updateTicketStatusAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const ticketId = formData.get("ticketId")?.toString();
  const status = formData.get("status")?.toString();
  if (!ticketId || !status || !["new", "in_progress", "waiting_agent", "resolved", "closed"].includes(status)) return;
  const { error } = await supabaseServer.from("support_tickets").update({ status, resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) redirect(`/support?ticket=${ticketId}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/support");
}

async function assignTicketAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const ticketId = formData.get("ticketId")?.toString();
  if (!ticketId) return;
  await supabaseServer.from("support_tickets").update({ assigned_to: admin.adminId, status: "in_progress", updated_at: new Date().toISOString() }).eq("id", ticketId);
  revalidatePath("/support");
  redirect(`/support?ticket=${ticketId}`);
}

async function createMacroAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const title = formData.get("title")?.toString().trim() ?? "";
  const message = formData.get("message")?.toString().trim() ?? "";
  if (!title || !message) return;
  const { error } = await supabaseServer.from("support_macros").insert({ title, message, created_by: admin.adminId, is_demo: false });
  if (error) redirect(`/support?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/support");
  redirect("/support?success=Macro%20saved.");
}
