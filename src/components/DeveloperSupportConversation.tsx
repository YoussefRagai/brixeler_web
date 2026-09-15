import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { requireAdminRole, type AdminContext } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

function tenantAllowed(admin: AdminContext, developerId: string) {
  return admin.roles.includes("super_admin") || admin.developerIds === null || admin.developerIds.includes(developerId);
}

export async function DeveloperSupportConversation({ developerId, ticketId, admin = false }: { developerId: string; ticketId: string; admin?: boolean }) {
  if (admin) {
    const actor = await requireAdminRole(["user_support_admin", "developers_admin"]);
    if (!actor || !tenantAllowed(actor, developerId)) return null;
  } else {
    const actor = await requireDeveloperSession();
    if (actor.developerId !== developerId) return null;
  }
  const { data: ticket, error } = await supabaseServer.from("developer_support_tickets").select("id,subject,status,unread_for_admin,unread_for_developer").eq("id", ticketId).eq("developer_id", developerId).maybeSingle();
  if (error) throw error;
  if (!ticket) return <p>Support request not found.</p>;
  const { data: messages, error: messageError } = await supabaseServer.from("developer_support_messages").select("id,author_type,body,created_at").eq("ticket_id", ticketId).eq("developer_id", developerId).order("created_at");
  if (messageError) throw messageError;
  return <section className="space-y-4 rounded-3xl border border-black/10 bg-white p-6">
    <h2 className="text-lg font-semibold">{ticket.subject}</h2><p className="text-xs">Developer request · {ticket.status.replaceAll("_", " ")}</p>
    {(messages ?? []).map(message => <article key={message.id} className="rounded-xl bg-neutral-50 p-3"><p className="whitespace-pre-wrap text-sm">{message.body}</p><p className="mt-2 text-xs text-neutral-500">{message.author_type} · {new Date(message.created_at).toLocaleString()}</p></article>)}
    <form action={conversationAction} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} /><input type="hidden" name="developerId" value={developerId} /><input type="hidden" name="audience" value={admin ? "admin" : "developer"} />
      <textarea name="message" aria-label="Reply" maxLength={20000} className="min-h-28 w-full rounded-xl border p-3" placeholder="Write a reply" />
      <button name="operation" value="reply" className="rounded-full bg-black px-4 py-2 text-white">Send reply</button>
      <button name="operation" value="read" className="ml-3 rounded-full border px-4 py-2">Mark read</button>
    </form>
  </section>;
}

async function conversationAction(form: FormData) {
  "use server";
  const ticketId = String(form.get("ticketId") ?? "");
  const isAdmin = form.get("audience") === "admin";
  let developerId: string; let actorId: string;
  if (isAdmin) {
    const actor = await requireAdminRole(["user_support_admin", "developers_admin"]);
    developerId = String(form.get("developerId") ?? "");
    if (!actor || !tenantAllowed(actor, developerId)) throw new Error("Support access denied.");
    actorId = actor.adminId;
  } else {
    const actor = await requireDeveloperSession();
    developerId = actor.developerId; actorId = actor.accountId;
  }
  const { error } = await supabaseServer.rpc("developer_support_conversation_action", { p_ticket_id: ticketId, p_developer_id: developerId, p_actor_id: actorId, p_is_admin: isAdmin, p_action: String(form.get("operation")), p_body: String(form.get("message") ?? "") });
  if (error) throw new Error("Unable to save support action. Your request was not completed; please retry.");
  revalidatePath("/support"); revalidatePath("/developer/support");
  redirect(isAdmin ? `/support?developerTicket=${encodeURIComponent(ticketId)}` : `/developer/support/${encodeURIComponent(ticketId)}`);
}
