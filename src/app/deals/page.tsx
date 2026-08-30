import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { fetchSalesClaims, type DealDataMode } from "@/lib/adminDeals";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { DealsClaimsTable } from "@/components/DealsClaimsTable";
import { requireAdminRole } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_at: string | null;
  assigned_to: string | null;
  related_entity_id: string | null;
  is_demo: boolean;
};

const normalizeMode = (value?: string): DealDataMode => (value === "demo" ? "demo" : "live");
const TASK_OVERDUE_CUTOFF = Date.now();

function ModeSwitch({ mode }: { mode: DealDataMode }) {
  return (
    <div aria-label="Deal room data mode" className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Data</span>
      {(["live", "demo"] as const).map((option) => (
        <Link
          key={option}
          href={`/deals?mode=${option}`}
          aria-current={mode === option ? "page" : undefined}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            mode === option
              ? option === "demo"
                ? "border-amber-700 bg-amber-700 text-white"
                : "border-neutral-900 bg-neutral-900 text-white"
              : "border-black/15 bg-white text-neutral-700 hover:bg-black/5"
          }`}
        >
          {option === "demo" ? "Demo" : "Live"}
        </Link>
      ))}
    </div>
  );
}

const redirectWithMessage = (mode: DealDataMode, key: "success" | "error", message: string): never => {
  redirect(`/deals?mode=${mode}&${key}=${encodeURIComponent(message)}`);
};

export default async function DealsPage({ searchParams }: { searchParams?: Promise<{ mode?: string; success?: string; error?: string }> }) {
  const ui = await buildAdminUi(["deals_admin"]);
  const feedback = (await searchParams) ?? {};
  const mode = normalizeMode(feedback.mode);
  const salesClaims = ui.hasAccess ? await fetchSalesClaims(50, mode) : [];
  const taskQuery = supabaseServer
    .from("admin_tasks")
    .select("id, title, description, priority, status, due_at, assigned_to, related_entity_id, is_demo")
    .eq("related_entity_type", "deal_stage_entry")
    .eq("is_demo", mode === "demo")
    .order("created_at", { ascending: false })
    .limit(20);
  const { data: taskRows } = ui.hasAccess ? await taskQuery : { data: [] };
  const taskData = (taskRows ?? []) as TaskRow[];
  const isSuperAdmin = ui.roles.includes("super_admin");

  return (
    <AdminLayout
      title="Deal room"
      description="Review the mobile deal-stage pipeline from submission to payout with SLA tracking."
      actions={<ModeSwitch mode={mode} />}
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          {feedback.success ? <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{feedback.success}</div> : null}
          {feedback.error ? <div role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">{feedback.error}</div> : null}

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3" aria-label="Selected deal room data mode">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{mode === "demo" ? "Demo deal operations" : "Live deal operations"}</p>
              <p className="mt-1 text-sm text-neutral-600">{mode === "demo" ? "Demo claims and tasks are isolated from live work." : "Live claims and tasks only; demo work is excluded."}</p>
            </div>
            <ModeSwitch mode={mode} />
          </section>

          <details className="rounded-3xl border border-black/10 bg-white p-5 shadow-lg shadow-black/5">
            <summary className="cursor-pointer rounded-lg text-sm font-semibold text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">Create deal task</summary>
            <form action={createDealTaskAction} className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
              <input type="hidden" name="mode" value={mode} />
              {mode === "demo" ? <input name="demoBatch" required placeholder="Active demo batch key" className="rounded-2xl border border-black/15 bg-white px-4 py-3 text-neutral-900 placeholder:text-neutral-500" /> : null}
              <label className="sr-only" htmlFor="deal-task-title">Task title</label>
              <input id="deal-task-title" name="title" required maxLength={200} placeholder="Task title" className="rounded-2xl border border-black/15 bg-white px-4 py-3 text-neutral-900 placeholder:text-neutral-500" />
              <label className="sr-only" htmlFor="deal-task-priority">Priority</label>
              <select id="deal-task-priority" name="priority" defaultValue="normal" className="rounded-2xl border border-black/15 bg-white px-4 py-3 text-neutral-900">
                <option value="low">Low priority</option>
                <option value="normal">Normal priority</option>
                <option value="high">High priority</option>
                <option value="urgent">Urgent priority</option>
              </select>
              <label className="sr-only" htmlFor="deal-task-related">Related deal stage</label>
              <select id="deal-task-related" name="relatedEntityId" defaultValue="" className="rounded-2xl border border-black/15 bg-white px-4 py-3 text-neutral-900 md:col-span-2">
                <option value="">General deal operations</option>
                {salesClaims.map((claim) => <option key={claim.id} value={claim.id}>{claim.propertyName} · {claim.status}</option>)}
              </select>
              <label className="sr-only" htmlFor="deal-task-description">Task description</label>
              <textarea id="deal-task-description" name="description" maxLength={4000} placeholder="What needs to happen?" className="min-h-24 rounded-2xl border border-black/15 bg-white px-4 py-3 text-neutral-900 placeholder:text-neutral-500 md:col-span-2" />
              <label className="text-xs font-medium text-neutral-600" htmlFor="deal-task-due">Due date and time
                <input id="deal-task-due" name="dueAt" type="datetime-local" className="mt-1 block w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-neutral-900" />
              </label>
              <div className="flex items-end">
                <button type="submit" className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">Create task</button>
              </div>
            </form>
          </details>

          <section aria-label="Deal tasks" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {taskData.map((task) => {
              const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < TASK_OVERDUE_CUTOFF && !["done", "cancelled"].includes(task.status));
              return (
                <article key={task.id} className="rounded-2xl border border-black/10 bg-white p-4 shadow-lg shadow-black/5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold text-neutral-900">{task.title}</p>
                    {task.is_demo ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold tracking-wider text-amber-900">DEMO</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">{task.description || "No description"}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className={`text-xs font-medium uppercase tracking-wider ${overdue ? "text-rose-800" : "text-neutral-600"}`}>
                      {task.priority} · {task.status}{task.due_at ? ` · due ${new Date(task.due_at).toLocaleString()}` : ""}{overdue ? " · overdue" : ""}
                    </p>
                    {task.status !== "done" && task.status !== "cancelled" ? (
                      <form action={completeDealTaskAction}>
                        <input type="hidden" name="mode" value={mode} />
                        <input type="hidden" name="taskId" value={task.id} />
                        <button type="submit" className="rounded-full border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-900 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">Mark complete</button>
                      </form>
                    ) : <span className="text-xs font-medium text-neutral-500">Completed</span>}
                  </div>
                </article>
              );
            })}
            {!taskData.length ? <div className="rounded-2xl border border-dashed border-black/15 bg-white px-4 py-6 text-sm text-neutral-500">No {mode} deal tasks.</div> : null}
          </section>

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
  const mode = normalizeMode(formData.get("mode")?.toString());
  const title = formData.get("title")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() || null;
  const priority = formData.get("priority")?.toString() ?? "normal";
  const relatedEntityId = formData.get("relatedEntityId")?.toString().trim() || null;
  const dueRaw = formData.get("dueAt")?.toString().trim() || null;
  const dueAt = dueRaw ? new Date(dueRaw) : null;
  const demoBatch = mode === "demo" ? formData.get("demoBatch")?.toString().trim() || null : null;
  if (!title) redirectWithMessage(mode, "error", "Task title is required.");
  if (dueAt && Number.isNaN(dueAt.getTime())) redirectWithMessage(mode, "error", "Due date is invalid.");
  const { error } = await supabaseServer.rpc("create_admin_deal_task", {
    p_title: title,
    p_description: description,
    p_priority: priority,
    p_due_at: dueAt?.toISOString() ?? null,
    p_created_by: admin.adminId,
    p_assigned_to: admin.adminId,
    p_related_entity_id: relatedEntityId,
    p_is_demo: mode === "demo",
    p_demo_batch: demoBatch,
  });
  if (error) redirectWithMessage(mode, "error", error.message || "Unable to create task.");
  revalidatePath("/deals");
  redirectWithMessage(mode, "success", "Task created.");
}

async function completeDealTaskAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["deals_admin"]);
  if (!admin) redirect("/deals?error=Access%20denied.");
  const mode = normalizeMode(formData.get("mode")?.toString());
  const taskId = formData.get("taskId")?.toString().trim();
  if (!taskId) redirectWithMessage(mode, "error", "Task id is required.");
  const { error } = await supabaseServer.rpc("complete_admin_deal_task", {
    p_task_id: taskId,
    p_actor_id: admin.adminId,
  });
  if (error) redirectWithMessage(mode, "error", error.message || "Unable to complete task.");
  revalidatePath("/deals");
  redirectWithMessage(mode, "success", "Task completed.");
}
