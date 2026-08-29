import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { ContentPublisher } from "@/components/ContentPublisher";
import { GrowthVersionHistory } from "@/components/GrowthVersionHistory";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

type ContentRow = {
  id: string;
  content_type: string;
  content_key: string;
  label: string;
  label_ar: string | null;
  body: string | null;
  body_ar: string | null;
  audience_id: string | null;
  is_active: boolean;
  lifecycle_state: string;
  start_at: string | null;
  end_at: string | null;
  version: number;
  metadata: Record<string, unknown> | null;
  published_at: string | null;
  is_demo: boolean;
};

export default async function ContentPage({ searchParams }: { searchParams?: Promise<{ success?: string; error?: string; q?: string; type?: string; status?: string; edit?: string }> }) {
  const ui = await buildAdminUi(["marketing_admin"]);
  const feedback = (await searchParams) ?? {};
  const search = feedback.q?.trim().toLowerCase() ?? "";
  const contentTypeFilter = feedback.type ?? "all";
  const statusFilter = feedback.status ?? "all";
  const [{ data }, { data: savedAudiences }] = ui.hasAccess
    ? await Promise.all([
        supabaseServer.from("dashboard_content").select("id, content_type, content_key, label, label_ar, body, body_ar, audience_id, is_active, lifecycle_state, start_at, end_at, version, metadata, published_at, is_demo").order("content_type").order("sort_order"),
        supabaseServer.from("growth_audiences").select("id, name").eq("lifecycle_state", "active").order("name"),
      ])
    : [{ data: [] }, { data: [] }];
  const rows = ((data ?? []) as ContentRow[]).filter((row) => {
    const matchesSearch = !search || [row.label, row.content_key, row.body ?? ""].some((value) => value.toLowerCase().includes(search));
    const matchesType = contentTypeFilter === "all" || row.content_type === contentTypeFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "live" ? row.lifecycle_state === "active" : row.lifecycle_state !== "active");
    return matchesSearch && matchesType && matchesStatus;
  });
  const editingContent = ((data ?? []) as ContentRow[]).find((row) => row.id === feedback.edit && row.lifecycle_state !== "archived") ?? null;

  return (
    <AdminLayout title="Content management" description="Publish shared amenities, FAQs, and mobile announcements from one source." navItems={ui.navItems} meta={ui.meta}>
      {!ui.hasAccess ? <AdminAccessDenied /> : (
        <>
          {feedback.success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback.success}</div> : null}
          {feedback.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{feedback.error}</div> : null}
          <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-black/5 bg-neutral-50 p-4" role="search">
            <label className="min-w-56 flex-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Search content
              <input name="q" defaultValue={feedback.q} placeholder="Label, key, or body…" className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900" type="search" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Type
              <select name="type" defaultValue={contentTypeFilter} className="mt-1 min-h-11 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900">
                <option value="all">All types</option><option value="amenity">Amenities</option><option value="faq">FAQs</option><option value="mobile_announcement">Mobile announcements</option>
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Status
              <select name="status" defaultValue={statusFilter} className="mt-1 min-h-11 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900">
                <option value="all">All statuses</option><option value="live">Published</option><option value="draft">Hidden</option>
              </select>
            </label>
            <button type="submit" className="min-h-11 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800">Filter</button>
            <a href="/content" className="min-h-11 rounded-full border border-black/10 px-4 py-2 text-sm leading-7 text-neutral-700 hover:border-black/30 hover:text-black">Clear</a>
          </form>
          <ContentPublisher action={saveContentAction} audiences={savedAudiences ?? []} initial={editingContent ? { id: editingContent.id, type: editingContent.content_type, key: editingContent.content_key, label: editingContent.label, labelAr: editingContent.label_ar, body: editingContent.body, bodyAr: editingContent.body_ar, audienceId: editingContent.audience_id, placement: typeof editingContent.metadata?.placement === "string" ? editingContent.metadata.placement : null, startAt: editingContent.start_at } : null} />

          <section className="grid gap-4 lg:grid-cols-2">
            {rows.map((row) => (
              <article key={row.id} className="rounded-3xl border border-black/5 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs uppercase tracking-[0.25em] text-neutral-500">{row.content_type.replaceAll("_", " ")}</p><h3 className="mt-1 font-semibold">{row.label}</h3><p className="text-sm text-neutral-500">{row.label_ar || "No Arabic label"}</p></div>
                  <div className="flex flex-wrap justify-end gap-2">{row.is_demo ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-800">DEMO</span> : null}<span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${row.lifecycle_state === "active" ? "bg-emerald-100 text-emerald-800" : row.lifecycle_state === "scheduled" ? "bg-blue-100 text-blue-800" : "bg-neutral-100 text-neutral-600"}`}>{row.lifecycle_state.toUpperCase()}</span><span className="rounded-full border border-black/10 px-2 py-1 text-[10px] font-semibold text-neutral-600">v{row.version}</span></div>
                </div>
                {row.body ? <p className="mt-3 text-sm text-neutral-600">{row.body}</p> : null}
                {row.body_ar ? <p dir="rtl" className="mt-2 text-right text-sm text-neutral-500">{row.body_ar}</p> : null}
                {row.start_at ? <p className="mt-3 text-xs text-neutral-500">Starts {new Date(row.start_at).toLocaleString()}</p> : null}
                <div className="mt-4 flex gap-2">
                  <GrowthVersionHistory entityType="dashboard_content" entityId={row.id} currentVersion={row.version} />
                  {row.lifecycle_state !== "archived" ? <a href={`/content?edit=${row.id}#content-publisher`} className="rounded-full border border-black/10 px-3 py-1.5 text-xs">Edit</a> : null}
                  {row.lifecycle_state !== "archived" ? <form action={toggleContentAction}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="active" value={row.lifecycle_state === "active" ? "false" : "true"}/><button className="rounded-full border border-black/10 px-3 py-1.5 text-xs" type="submit">{row.lifecycle_state === "active" ? "Pause" : "Publish"}</button></form> : null}
                  <form action={archiveContentAction}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="archive" value={row.lifecycle_state === "archived" ? "false" : "true"}/><button className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-700" type="submit">{row.lifecycle_state === "archived" ? "Restore draft" : "Archive"}</button></form>
                </div>
              </article>
            ))}
            {!rows.length ? <p className="rounded-3xl border border-dashed border-black/10 bg-white p-8 text-sm text-neutral-500 lg:col-span-2">No content items match these filters.</p> : null}
          </section>
        </>
      )}
    </AdminLayout>
  );
}
async function saveContentAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin) redirect("/content?error=Access%20denied.");
  const contentType = formData.get("contentType")?.toString() ?? "amenity";
  const contentKey = formData.get("contentKey")?.toString().trim().toLowerCase() ?? "";
  const label = formData.get("label")?.toString().trim() ?? "";
  const labelAr = formData.get("labelAr")?.toString().trim() || null;
  const body = formData.get("body")?.toString().trim() || null;
  const bodyAr = formData.get("bodyAr")?.toString().trim() || null;
  const placement = formData.get("placement")?.toString() ?? "automatic";
  const audienceId = formData.get("audienceId")?.toString().trim() || null;
  const contentId = formData.get("contentId")?.toString().trim() || null;
  const intent = formData.get("intent")?.toString() === "draft" ? "draft" : "publish";
  const scheduledRaw = formData.get("scheduledFor")?.toString().trim() || null;
  const startAt = scheduledRaw ? new Date(scheduledRaw) : null;
  if (!/^[a-z0-9-]+$/.test(contentKey) || !label) redirect("/content?error=Use%20a%20stable%20lowercase%20key%20and%20label.");
  if (!['amenity', 'faq', 'mobile_announcement'].includes(contentType) || (startAt && Number.isNaN(startAt.getTime()))) redirect("/content?error=Check%20the%20content%20fields.");
  if (contentId && !/^[0-9a-f-]{36}$/i.test(contentId)) redirect("/content?error=Invalid%20content%20item.");
  if (audienceId) {
    if (!/^[0-9a-f-]{36}$/i.test(audienceId)) redirect("/content?error=Invalid%20audience.");
    const { data: audience } = await supabaseServer.from("growth_audiences").select("id").eq("id", audienceId).eq("lifecycle_state", "active").maybeSingle();
    if (!audience) redirect("/content?error=The%20selected%20audience%20is%20not%20active.");
  }
  const scheduled = intent === "publish" && startAt && startAt.getTime() > Date.now();
  const lifecycleState = intent === "draft" ? "draft" : scheduled ? "scheduled" : "active";
  const now = new Date().toISOString();
  const record = { content_type: contentType, content_key: contentKey, label, label_ar: labelAr, body, body_ar: bodyAr, audience_id: audienceId, is_active: lifecycleState === "active" || lifecycleState === "scheduled", lifecycle_state: lifecycleState, start_at: startAt?.toISOString() ?? (lifecycleState === "active" ? now : null), published_at: lifecycleState === "active" ? now : null, updated_by: admin.adminId, published_by: lifecycleState === "active" ? admin.adminId : null, metadata: { placement }, is_demo: false };
  if (contentId) {
    const { data: editable } = await supabaseServer.from("dashboard_content").select("id, lifecycle_state").eq("id", contentId).maybeSingle();
    if (!editable || editable.lifecycle_state === "archived") redirect("/content?error=This%20content%20item%20cannot%20be%20edited.");
  }
  const { data, error } = contentId
    ? await supabaseServer.from("dashboard_content").update(record).eq("id", contentId).select("id").single()
    : await supabaseServer.from("dashboard_content").upsert(record, { onConflict: "content_type,content_key" }).select("id").single();
  if (error) redirect(`/content?error=${encodeURIComponent(error.message)}`);
  await logAdminActivity({ adminId: admin.adminId, action: contentId ? "content_updated" : lifecycleState === "draft" ? "content_draft_saved" : lifecycleState === "scheduled" ? "content_scheduled" : "content_published", resourceType: "dashboard_content", resourceId: data?.id, metadata: { lifecycleState, placement } });
  revalidatePath("/content");
  redirect(`/content?success=${encodeURIComponent(lifecycleState === "draft" ? "Draft saved." : lifecycleState === "scheduled" ? "Content scheduled." : "Content published.")}`);
}

async function toggleContentAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin) redirect("/content?error=Access%20denied.");
  const id = formData.get("id")?.toString();
  const active = formData.get("active") === "true";
  if (!id) return;
  const { error } = await supabaseServer.from("dashboard_content").update({ is_active: active, lifecycle_state: active ? "active" : "paused", published_at: active ? new Date().toISOString() : null, updated_by: admin.adminId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) redirect(`/content?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/content");
}

async function archiveContentAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin) redirect("/content?error=Access%20denied.");
  const id = formData.get("id")?.toString();
  const archive = formData.get("archive") === "true";
  if (!id) return;
  const { error } = await supabaseServer.from("dashboard_content").update({ is_active: false, lifecycle_state: archive ? "archived" : "draft", archived_at: archive ? new Date().toISOString() : null, updated_by: admin.adminId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) redirect(`/content?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/content");
}
