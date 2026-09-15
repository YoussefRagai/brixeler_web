import Link from "next/link";
import { AdminDeveloperSupportQueue } from "@/components/AdminDeveloperSupportQueue";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { SupportReplyComposer } from "@/components/SupportReplyComposer";
import { SupportMacroManager } from "@/components/SupportMacroManager";
import { buildAdminUi } from "@/lib/adminUi";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { canAccessSupportCategory, macroCategoriesForRoles, supportCategoryScope, SUPPORT_CATEGORIES } from "@/lib/supportAccess";

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
  unread_for_admin: boolean;
  unread_for_agent: boolean;
  updated_at: string;
  revision: number;
  is_demo: boolean;
  agent: { display_name: string | null; phone: string | null } | { display_name: string | null; phone: string | null }[] | null;
};
type Message = { id: string; author_type: string; message: string; created_at: string };
type Macro = { id: string; title: string; message: string; category: string | null; is_active: boolean; revision: number; updated_at: string; is_demo: boolean };
type SupportEvent = { id: string; event_type: string; actor_id: string; from_status: string | null; to_status: string | null; from_owner: string | null; to_owner: string | null; created_at: string };
const lanes = ["new", "in_progress", "waiting_agent", "resolved"] as const;
const allStatuses = [...lanes, "closed"] as const;

function cleanSearch(value: string) {
  return value.replace(/[%,()]/g, "").slice(0, 80);
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams?: Promise<{ developerTicket?: string; ticket?: string; success?: string; error?: string; q?: string; status?: string; closed?: string; unread?: string; owner?: string; priority?: string; page?: string }>;
}) {
  const ui = await buildAdminUi(["user_support_admin", "developers_admin"]);
  const params = (await searchParams) ?? {};
  const pageSize = 24;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const showClosed = params.closed === "1" || params.status === "closed";
  const categoryScope = supportCategoryScope(ui.roles);
  let ticketQuery = supabaseServer
    .from("support_tickets")
    .select("id, agent_id, subject, category, status, priority, last_message_at, last_message_preview, assigned_to, unread_for_admin, unread_for_agent, updated_at, revision, is_demo, agent:agent_id(display_name, phone)", { count: "exact" })
    .order("last_message_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  let macroQuery = supabaseServer.from("support_macros").select("id, title, message, category, is_active, revision, updated_at, is_demo").order("updated_at", { ascending: false });
  if (categoryScope !== null) {
    ticketQuery = ticketQuery.in("category", categoryScope);
    macroQuery = macroQuery.in("category", categoryScope);
  }
  if (showClosed) ticketQuery = ticketQuery.eq("status", "closed");
  else if (params.status && allStatuses.includes(params.status as (typeof allStatuses)[number])) ticketQuery = ticketQuery.eq("status", params.status);
  else ticketQuery = ticketQuery.neq("status", "closed");
  const search = cleanSearch(params.q?.trim() ?? "");
  if (search) ticketQuery = ticketQuery.or(`subject.ilike.%${search}%,description.ilike.%${search}%,last_message_preview.ilike.%${search}%`);
  if (params.unread === "1") ticketQuery = ticketQuery.eq("unread_for_admin", true);
  if (params.priority && ["normal", "high", "urgent"].includes(params.priority)) ticketQuery = ticketQuery.eq("priority", params.priority);
  if (params.owner === "mine") ticketQuery = ticketQuery.eq("assigned_to", ui.context.adminId);
  if (params.owner === "unassigned") ticketQuery = ticketQuery.is("assigned_to", null);
  const [{ data: ticketData, count: ticketCount }, { data: macroData }] = ui.hasAccess
    ? await Promise.all([ticketQuery, macroQuery])
    : [{ data: [], count: 0 }, { data: [] }];
  const tickets = (ticketData ?? []) as Ticket[];
  const activeTicket = tickets.find((ticket) => ticket.id === params.ticket) ?? tickets[0] ?? null;
  const { data: messageData } = activeTicket
    ? await supabaseServer.from("support_ticket_messages").select("id, author_type, message, created_at").eq("ticket_id", activeTicket.id).order("created_at")
    : { data: [] };
  const { data: eventData } = activeTicket
    ? await supabaseServer.from("support_ticket_events").select("id, event_type, actor_id, from_status, to_status, from_owner, to_owner, created_at").eq("ticket_id", activeTicket.id).order("created_at", { ascending: false }).limit(20)
    : { data: [] };
  const messages = (messageData ?? []) as Message[];
  const events = (eventData ?? []) as SupportEvent[];
  const macros = (macroData ?? []) as Macro[];
  const activeMacros = macros.filter((macro) => macro.is_active);
  const totalTickets = ticketCount ?? 0;
  const hasNext = page * pageSize < totalTickets;
  // This is a server-render snapshot used only for SLA and relative-time labels.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  return (
    <AdminLayout title="Support cockpit" description="Own the full agent conversation, assignment, status, and SLA loop." navItems={ui.navItems} meta={ui.meta}>
      {!ui.hasAccess ? <AdminAccessDenied /> : (
        <>
          <AdminDeveloperSupportQueue selectedId={params.developerTicket} />
          {params.success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{params.success}</div> : null}
          {params.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{params.error}</div> : null}

          <form method="get" className="mb-5 grid gap-3 rounded-2xl border border-black/5 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            {params.ticket ? <input type="hidden" name="ticket" value={params.ticket} /> : null}
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 lg:col-span-2">Search tickets<input name="q" defaultValue={params.q} placeholder="Subject, description, or message" className="mt-2 min-h-11 w-full rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm normal-case tracking-normal text-neutral-900" /></label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Priority<select name="priority" defaultValue={params.priority ?? ""} className="mt-2 min-h-11 w-full rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm normal-case tracking-normal text-neutral-900"><option value="">All</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option></select></label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Owner<select name="owner" defaultValue={params.owner ?? ""} className="mt-2 min-h-11 w-full rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm normal-case tracking-normal text-neutral-900"><option value="">All owners</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
            <div className="flex flex-wrap items-center gap-2 lg:col-span-5"><label className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-xs text-neutral-700"><input type="checkbox" name="unread" value="1" defaultChecked={params.unread === "1"} className="h-4 w-4 accent-black" />Unread only</label><label className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-xs text-neutral-700"><input type="checkbox" name="closed" value="1" defaultChecked={showClosed} className="h-4 w-4 accent-black" />Closed</label><button type="submit" className="min-h-10 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white">Apply filters</button><span className="ml-auto text-xs text-neutral-500">{totalTickets} ticket{totalTickets === 1 ? "" : "s"} · page {page}</span></div>
          </form>
          <section className={`grid gap-4 ${showClosed ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
            {(showClosed ? [...lanes, "closed" as const] : lanes).map((lane) => {
              const laneTickets = tickets.filter((ticket) => ticket.status === lane);
              return (
                <article key={lane} className="rounded-3xl border border-black/5 bg-white p-4">
                  <header className="flex items-center justify-between"><p className="text-xs uppercase tracking-[0.22em] text-neutral-500">{lane.replaceAll("_", " ")}</p><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs">{laneTickets.length}</span></header>
                  <div className="mt-3 space-y-2">
                    {laneTickets.map((ticket) => (
                      <Link key={ticket.id} href={supportPageHref(params, 1, ticket.id)} aria-current={activeTicket?.id === ticket.id ? "page" : undefined} className={`block rounded-2xl border p-3 transition ${activeTicket?.id === ticket.id ? "border-black bg-black text-white" : "border-black/5 bg-neutral-50 hover:border-black/20"}`}>
                        <div className="flex items-start justify-between gap-2"><p className={`text-sm font-semibold ${activeTicket?.id === ticket.id ? "!text-white" : "text-neutral-900"}`}>{ticket.subject}</p><div className="flex items-center gap-1">{ticket.unread_for_admin ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${activeTicket?.id === ticket.id ? "bg-white/20 text-white" : "bg-rose-100 text-rose-800"}`}>Unread</span> : null}{ticket.is_demo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">DEMO</span> : null}</div></div>
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
                      <form action={assignTicketAction}><input type="hidden" name="ticketId" value={activeTicket.id}/><input type="hidden" name="expectedUpdatedAt" value={activeTicket.updated_at}/><button className="min-h-10 rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-800" type="submit">{activeTicket.assigned_to === ui.context.adminId ? "Assigned to you" : "Assign to me"}</button></form>
                      <form action={markTicketReadAction}><input type="hidden" name="ticketId" value={activeTicket.id}/><input type="hidden" name="expectedUpdatedAt" value={activeTicket.updated_at}/><button className="min-h-10 rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-800" type="submit">Mark read</button></form>
                      <form action={updateTicketStatusAction} className="flex flex-wrap gap-1"><input type="hidden" name="ticketId" value={activeTicket.id}/><input type="hidden" name="expectedUpdatedAt" value={activeTicket.updated_at}/><select aria-label="Ticket status" name="status" defaultValue={activeTicket.status} className="min-h-10 rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-800">{lanes.map((lane) => <option key={lane} value={lane}>{lane.replaceAll("_", " ")}</option>)}<option value="closed">closed</option></select><input name="reason" aria-label="Status reason" placeholder="Reason if closing" className="min-h-10 min-w-28 rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-800"/><button className="min-h-10 rounded-full bg-black px-3 py-1.5 text-xs text-white" type="submit">Update</button></form>
                    </div>
                  </div>
                  <div className="my-5 max-h-[440px] space-y-3 overflow-y-auto pr-2">
                    {messages.map((message) => <div key={message.id} className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${message.author_type === "admin" ? "ml-auto bg-black text-white" : "bg-neutral-100 text-neutral-800"}`}><p>{message.message}</p><p className={`mt-1 text-[10px] ${message.author_type === "admin" ? "text-white/45" : "text-neutral-400"}`}>{message.author_type} · {new Date(message.created_at).toLocaleString()}</p></div>)}
                    {!messages.length ? <p className="py-8 text-center text-sm text-neutral-500">No messages yet.</p> : null}
                  </div>
                  <details className="mb-5 rounded-2xl border border-black/5 bg-neutral-50 p-3 text-xs text-neutral-600">
                    <summary className="cursor-pointer font-semibold text-neutral-800">Assignment and status history ({events.length})</summary>
                    <ol className="mt-3 space-y-2">
                      {events.map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 border-t border-black/5 pt-2"><span>{event.event_type.replaceAll("_", " ")}{event.from_status || event.to_status ? ` · ${event.from_status ?? "—"} → ${event.to_status ?? "—"}` : ""}</span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></li>)}
                      {!events.length ? <li>No assignment or status events yet.</li> : null}
                    </ol>
                  </details>
                  <SupportReplyComposer ticketId={activeTicket.id} expectedUpdatedAt={activeTicket.updated_at} ticketCategory={activeTicket.category} macros={activeMacros} action={replyToTicketAction} />
                </>
              ) : <p className="py-16 text-center text-neutral-500">No support tickets yet.</p>}
            </article>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-black/5 bg-white p-5"><p className="text-xs uppercase tracking-[0.25em] text-neutral-500">SLA</p><p className="mt-2 text-3xl font-semibold">{tickets.filter((ticket) => ticket.status !== "resolved" && renderedAt - new Date(ticket.last_message_at).getTime() > 3600000).length}</p><p className="text-sm text-neutral-500">open tickets waiting over one hour</p></section>
              <section className="rounded-3xl border border-black/5 bg-white p-5"><p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Create macro</p><form action={createMacroAction} className="mt-4 space-y-3"><input name="title" required maxLength={200} placeholder="Macro title" className="min-h-11 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm"/><label className="block text-xs text-neutral-500">Category<select name="category" required defaultValue={activeTicket?.category && canAccessSupportCategory(ui.roles, activeTicket.category) ? activeTicket.category : macroCategoriesForRoles(ui.roles)[0]} className="mt-1 min-h-11 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm text-neutral-900">{macroCategoriesForRoles(ui.roles).map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label><textarea name="message" required maxLength={20000} placeholder="Reusable reply" className="min-h-28 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm"/><button className="min-h-10 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white" type="submit">Save macro</button></form></section>
              <SupportMacroManager macros={macros} categories={macroCategoriesForRoles(ui.roles)} updateAction={updateMacroAction} toggleAction={toggleMacroAction} />
            </aside>
          </section>
          <div className="mt-5 flex items-center justify-end gap-2 text-xs text-neutral-500">{page > 1 ? <Link href={supportPageHref(params, page - 1)} className="rounded-full border border-black/10 px-3 py-1.5 text-neutral-700">Previous</Link> : null}{hasNext ? <Link href={supportPageHref(params, page + 1)} className="rounded-full border border-black/10 px-3 py-1.5 text-neutral-700">Next</Link> : null}</div>
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

function supportPageHref(params: { q?: string; closed?: string; unread?: string; owner?: string; priority?: string; status?: string }, page: number, ticket?: string) {
  const query = new URLSearchParams();
  for (const key of ["q", "closed", "unread", "owner", "priority", "status"] as const) {
    if (params[key]) query.set(key, params[key]!);
  }
  if (ticket) query.set("ticket", ticket);
  query.set("page", String(page));
  return `/support?${query.toString()}`;
}

async function replyToTicketAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const ticketId = formData.get("ticketId")?.toString();
  const message = formData.get("message")?.toString().trim() ?? "";
  const expectedUpdatedAt = formData.get("expectedUpdatedAt")?.toString() || null;
  if (!ticketId || !message) redirect("/support?error=Write%20a%20reply.");
  const { error } = await supabaseServer.rpc("admin_reply_to_support_ticket", {
    p_ticket_id: ticketId,
    p_admin_id: admin.adminId,
    p_message: message,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) redirect(`/support?ticket=${ticketId}&error=${encodeURIComponent(error.message)}`);
  await logAdminActivity({ adminId: admin.adminId, action: "support_ticket_replied", resourceType: "support_ticket", resourceId: ticketId });
  revalidatePath("/support");
  redirect(`/support?ticket=${ticketId}&success=Reply%20sent.`);
}

async function updateTicketStatusAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const ticketId = formData.get("ticketId")?.toString();
  const status = formData.get("status")?.toString();
  const expectedUpdatedAt = formData.get("expectedUpdatedAt")?.toString() || null;
  const reason = formData.get("reason")?.toString().trim() || null;
  if (!ticketId || !status || !["new", "in_progress", "waiting_agent", "resolved", "closed"].includes(status)) redirect("/support?error=Invalid%20status.");
  const { error } = await supabaseServer.rpc("admin_update_support_ticket_status", {
    p_ticket_id: ticketId,
    p_admin_id: admin.adminId,
    p_status: status,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: reason,
  });
  if (error) redirect(`/support?ticket=${ticketId}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/support");
  redirect(`/support?ticket=${ticketId}&success=Status%20updated.`);
}

async function assignTicketAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const ticketId = formData.get("ticketId")?.toString();
  const expectedUpdatedAt = formData.get("expectedUpdatedAt")?.toString() || null;
  if (!ticketId) return;
  const { error } = await supabaseServer.rpc("admin_claim_support_ticket", {
    p_ticket_id: ticketId,
    p_admin_id: admin.adminId,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) redirect(`/support?ticket=${ticketId}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/support");
  redirect(`/support?ticket=${ticketId}`);
}

async function markTicketReadAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const ticketId = formData.get("ticketId")?.toString();
  const expectedUpdatedAt = formData.get("expectedUpdatedAt")?.toString() || null;
  if (!ticketId) return;
  const { error } = await supabaseServer.rpc("admin_mark_support_ticket_read", {
    p_ticket_id: ticketId,
    p_admin_id: admin.adminId,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) redirect(`/support?ticket=${ticketId}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/support");
  redirect(`/support?ticket=${ticketId}`);
}

async function createMacroAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const title = formData.get("title")?.toString().trim() ?? "";
  const message = formData.get("message")?.toString().trim() ?? "";
  const category = formData.get("category")?.toString().trim() ?? "";
  if (!title || !message || !SUPPORT_CATEGORIES.includes(category as (typeof SUPPORT_CATEGORIES)[number]) || !canAccessSupportCategory(admin.roles, category)) {
    redirect("/support?error=Valid%20macro%20category%20and%20content%20are%20required.");
  }
  const { error } = await supabaseServer.rpc("admin_create_support_macro", { p_admin_id: admin.adminId, p_title: title, p_message: message, p_category: category });
  if (error) redirect(`/support?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/support");
  redirect("/support?success=Macro%20saved.");
}

async function updateMacroAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const macroId = formData.get("macroId")?.toString().trim();
  const title = formData.get("title")?.toString().trim() ?? "";
  const message = formData.get("message")?.toString().trim() ?? "";
  const category = formData.get("category")?.toString().trim() ?? "";
  const reason = formData.get("reason")?.toString().trim() ?? "";
  const expectedRevision = Number(formData.get("expectedRevision")?.toString());
  if (!macroId || !title || !message || !reason || reason.length < 3 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !SUPPORT_CATEGORIES.includes(category as (typeof SUPPORT_CATEGORIES)[number]) || !canAccessSupportCategory(admin.roles, category)) {
    redirect("/support?error=Valid%20macro%20content%2C%20category%2C%20revision%2C%20and%20reason%20are%20required.");
  }
  const { error } = await supabaseServer.rpc("admin_update_support_macro", {
    p_macro_id: macroId,
    p_admin_id: admin.adminId,
    p_title: title,
    p_message: message,
    p_category: category,
    p_expected_revision: expectedRevision,
    p_reason: reason,
  });
  if (error) redirect(`/support?error=${encodeURIComponent(error.message)}`);
  await logAdminActivity({ adminId: admin.adminId, action: "support_macro.updated", resourceType: "support_macro", resourceId: macroId, metadata: { revision: expectedRevision + 1, category } });
  revalidatePath("/support");
  redirect("/support?success=Macro%20version%20saved.");
}

async function toggleMacroAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) redirect("/support?error=Access%20denied.");
  const macroId = formData.get("macroId")?.toString().trim();
  const reason = formData.get("reason")?.toString().trim() ?? "";
  const activeValue = formData.get("active")?.toString();
  const expectedRevision = Number(formData.get("expectedRevision")?.toString());
  const active = activeValue === "true" ? true : activeValue === "false" ? false : null;
  if (!macroId || active === null || !reason || reason.length < 3 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    redirect("/support?error=Macro%20status%20change%20requires%20a%20valid%20revision%20and%20reason.");
  }
  const { error } = await supabaseServer.rpc("admin_set_support_macro_active", {
    p_macro_id: macroId,
    p_admin_id: admin.adminId,
    p_active: active,
    p_expected_revision: expectedRevision,
    p_reason: reason,
  });
  if (error) redirect(`/support?error=${encodeURIComponent(error.message)}`);
  await logAdminActivity({ adminId: admin.adminId, action: active ? "support_macro.activated" : "support_macro.deactivated", resourceType: "support_macro", resourceId: macroId, metadata: { revision: expectedRevision + 1, reason } });
  revalidatePath("/support");
  redirect(`/support?success=${encodeURIComponent(active ? "Macro activated." : "Macro deactivated.")}`);
}
