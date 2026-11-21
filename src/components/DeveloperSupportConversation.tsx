import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { requireAdminRole } from "@/lib/adminAuth";
import { canAccessScopedDeveloper, developerSupportScope } from "@/lib/adminRoles";
import { supabaseServer } from "@/lib/supabaseServer";
import { FeedbackBanner } from "@/components/FeedbackBanner";
import { DeveloperSupportConversationForm } from "./DeveloperSupportConversationForm";

export type SupportConversationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function DeveloperSupportConversation({ developerId, ticketId, admin = false }: { developerId: string; ticketId: string; admin?: boolean }) {
  if (admin) {
    const actor = await requireAdminRole(["user_support_admin", "developers_admin"]);
    if (!actor || !canAccessScopedDeveloper(developerSupportScope(actor.roles, actor.developerIds), developerId)) return null;
  } else {
    const actor = await requireDeveloperSession();
    if (actor.developerId !== developerId) return null;
  }
  const { data: ticket, error } = await supabaseServer.from("developer_support_tickets").select("id,subject,status,unread_for_admin,unread_for_developer").eq("id", ticketId).eq("developer_id", developerId).maybeSingle();
  if (error) throw error;
  if (!ticket) {
    const backHref = admin ? "/support" : "/developer/support";
    return <div className="space-y-3"><FeedbackBanner message="Support request not found." tone="error" /><Link href={backHref} className="font-semibold underline underline-offset-4">Return to support</Link>.</div>;
  }
  const { data: messages, error: messageError } = await supabaseServer.from("developer_support_messages").select("id,author_type,body,created_at").eq("ticket_id", ticketId).eq("developer_id", developerId).order("created_at");
  if (messageError) throw messageError;
  return <section className="space-y-4 rounded-3xl border border-black/10 bg-white p-6">
    <Link href={admin ? "/support" : "/developer/support"} className="inline-flex items-center text-sm font-semibold text-neutral-600 underline-offset-4 hover:text-black hover:underline">← Back to support</Link>
    <div>
      <h2 className="text-lg font-semibold">{ticket.subject}</h2><p className="text-xs">Developer request · {ticket.status.replaceAll("_", " ")}</p>
    </div>
    {(messages ?? []).map(message => <article key={message.id} className="rounded-xl bg-neutral-50 p-3"><p className="whitespace-pre-wrap text-sm">{message.body}</p><p className="mt-2 text-xs text-neutral-500">{message.author_type} · {new Date(message.created_at).toLocaleString()}</p></article>)}
    <DeveloperSupportConversationForm
      action={conversationAction}
      ticketId={ticketId}
      developerId={developerId}
      audience={admin ? "admin" : "developer"}
      initiallyRead={admin ? !ticket.unread_for_admin : !ticket.unread_for_developer}
    />
  </section>;
}

async function conversationAction(form: FormData): Promise<SupportConversationActionState> {
  "use server";
  const ticketId = String(form.get("ticketId") ?? "");
  const isAdmin = form.get("audience") === "admin";
  const operation = form.get("operation");
  if (operation !== "reply" && operation !== "read") {
    return { status: "error", message: "Choose a valid support action and try again." };
  }
  let developerId: string; let actorId: string;
  if (isAdmin) {
    const actor = await requireAdminRole(["user_support_admin", "developers_admin"]);
    developerId = String(form.get("developerId") ?? "");
    if (!actor || !canAccessScopedDeveloper(developerSupportScope(actor.roles, actor.developerIds), developerId)) throw new Error("Support access denied.");
    actorId = actor.adminId;
  } else {
    const actor = await requireDeveloperSession();
    developerId = actor.developerId; actorId = actor.accountId;
  }
  let error: { message?: string } | null = null;
  try {
    ({ error } = await supabaseServer.rpc("developer_support_conversation_action", { p_ticket_id: ticketId, p_developer_id: developerId, p_actor_id: actorId, p_is_admin: isAdmin, p_action: operation, p_body: String(form.get("message") ?? "") }));
  } catch (rpcError) {
    console.warn("Developer support conversation action failed", rpcError);
    return { status: "error", message: "Unable to save support action. Your request was not completed; please retry." };
  }
  if (error) return { status: "error", message: "Unable to save support action. Your request was not completed; please retry." };
  revalidatePath("/support"); revalidatePath("/developer/support");
  if (operation === "reply") redirect(isAdmin ? `/support?developerTicket=${encodeURIComponent(ticketId)}` : `/developer/support/${encodeURIComponent(ticketId)}`);
  return { status: "success", message: "Marked as read." };
}
