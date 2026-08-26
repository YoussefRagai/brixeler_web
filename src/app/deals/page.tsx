import { AdminLayout } from "@/components/AdminLayout";
import { fetchSalesClaims } from "@/lib/adminDeals";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { DealsClaimsTable } from "@/components/DealsClaimsTable";
import { requireAdminRole } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function DealsPage({ searchParams }: { searchParams?: Promise<{ success?: string; error?: string }> }) {
  const ui = await buildAdminUi(["deals_admin"]);
  const feedback = (await searchParams) ?? {};
  const salesClaims = await fetchSalesClaims();
  const { data: taskData } = ui.hasAccess
    ? await supabaseServer.from("admin_tasks").select("id, title, description, priority, status, due_at, is_demo").eq("related_entity_type", "deal").order("created_at", { ascending: false }).limit(10)
    : { data: [] };
  const isSuperAdmin = ui.roles.includes("super_admin");
  return (
    <AdminLayout
      title="Deal room"
      description="Realtime snapshot from submission to payout with SLA tracking."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          {feedback.success ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{feedback.success}</div> : null}
          {feedback.error ? <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{feedback.error}</div> : null}
          <details className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <summary className="cursor-pointer text-sm font-semibold text-white">Create admin task</summary>
            <form action={createDealTaskAction} className="mt-4 grid gap-3 md:grid-cols-2">
              <input name="title" required placeholder="Task title" className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white"/>
              <select name="priority" className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
              <textarea name="description" placeholder="What needs to happen?" className="min-h-24 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white md:col-span-2"/>
              <input name="dueAt" type="datetime-local" className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white"/>
              <button type="submit" className="w-fit rounded-full bg-emerald-300 px-5 py-2 text-sm font-semibold text-emerald-950">Create task</button>
            </form>
          </details>
          {(taskData ?? []).length ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(taskData ?? []).map((task) => <article key={task.id} className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex justify-between gap-3"><p className="font-semibold text-white">{task.title}</p>{task.is_demo ? <span className="text-[9px] text-amber-300">DEMO</span> : null}</div><p className="mt-1 text-sm text-slate-400">{task.description || "No description"}</p><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs uppercase tracking-wider text-slate-500">{task.priority} · {task.status}{task.due_at ? ` · due ${new Date(task.due_at).toLocaleString()}` : ""}</p>{task.status !== "done" ? <form action={completeDealTaskAction}><input type="hidden" name="taskId" value={task.id}/><button type="submit" className="rounded-full border border-emerald-300/30 px-3 py-1 text-[10px] font-semibold text-emerald-200">Mark complete</button></form> : null}</div></article>)}</section> : null}
          <DealsClaimsTable claims={salesClaims} isSuperAdmin={isSuperAdmin} />
        </>
      )}
    </AdminLayout>
  );
}

async function createDealTaskAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["deals_admin"]);
  if (!admin) redirect("/deals?error=Access%20denied.");
  const title = formData.get("title")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() || null;
  const priority = formData.get("priority")?.toString() ?? "normal";
  const dueRaw = formData.get("dueAt")?.toString();
  if (!title) redirect("/deals?error=Task%20title%20is%20required.");
  const { error } = await supabaseServer.from("admin_tasks").insert({ title, description, priority, due_at: dueRaw ? new Date(dueRaw).toISOString() : null, related_entity_type: "deal", created_by: admin.adminId, assigned_to: admin.adminId });
  if (error) redirect(`/deals?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/deals");
  redirect("/deals?success=Task%20created.");
}

async function completeDealTaskAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["deals_admin"]);
  if (!admin) redirect("/deals?error=Access%20denied.");
  const taskId = formData.get("taskId")?.toString();
  if (!taskId) return;
  const { error } = await supabaseServer.from("admin_tasks").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", taskId);
  if (error) redirect(`/deals?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/deals");
  redirect("/deals?success=Task%20completed.");
}
