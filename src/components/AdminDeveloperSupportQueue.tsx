import Link from "next/link";
import { requireAdminRole } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { DeveloperSupportConversation } from "./DeveloperSupportConversation";

export async function AdminDeveloperSupportQueue({ selectedId }: { selectedId?: string }) {
  const admin = await requireAdminRole(["user_support_admin", "developers_admin"]);
  if (!admin) return null;
  let query = supabaseServer.from("developer_support_tickets").select("id,developer_id,subject,status,unread_for_admin,developer:developer_id(name)").order("updated_at", { ascending: false });
  if (!admin.roles.includes("super_admin") && admin.developerIds !== null) query = query.in("developer_id", admin.developerIds);
  const { data, error } = await query;
  if (error) throw error;
  const selected = data?.find(ticket => ticket.id === selectedId);
  return <section className="my-5 space-y-4 rounded-3xl border border-black/10 bg-white p-5"><h2 className="text-lg font-semibold">Developer support</h2><p className="text-xs text-neutral-500">Company requests · agent requests are in the queue below</p>
    <div className="grid gap-2 sm:grid-cols-2">{data?.map(ticket => <Link className="rounded-xl border p-3 text-sm" key={ticket.id} href={`/support?developerTicket=${ticket.id}`}><strong>{ticket.subject}</strong> {ticket.unread_for_admin ? "· Unread" : ""}<p>{(Array.isArray(ticket.developer) ? ticket.developer[0]?.name : (ticket.developer as { name?: string } | null)?.name) ?? ticket.developer_id} · {ticket.status}</p></Link>)}</div>
    {!data?.length ? <p className="text-sm">No developer requests.</p> : null}
    {selected ? <DeveloperSupportConversation admin developerId={selected.developer_id} ticketId={selected.id} /> : null}
  </section>;
}
