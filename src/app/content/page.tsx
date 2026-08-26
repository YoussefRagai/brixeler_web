import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
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
  is_active: boolean;
  published_at: string | null;
  is_demo: boolean;
};

export default async function ContentPage({ searchParams }: { searchParams?: Promise<{ success?: string; error?: string }> }) {
  const ui = await buildAdminUi(["marketing_admin"]);
  const feedback = (await searchParams) ?? {};
  const { data } = ui.hasAccess
    ? await supabaseServer.from("dashboard_content").select("id, content_type, content_key, label, label_ar, body, is_active, published_at, is_demo").order("content_type").order("sort_order")
    : { data: [] };
  const rows = (data ?? []) as ContentRow[];

  return (
    <AdminLayout title="Content management" description="Publish shared amenities, FAQs, and mobile announcements from one source." navItems={ui.navItems} meta={ui.meta}>
      {!ui.hasAccess ? <AdminAccessDenied /> : (
        <>
          {feedback.success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback.success}</div> : null}
          {feedback.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{feedback.error}</div> : null}
          <section className="rounded-3xl border border-black/5 bg-white p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Publish content</p>
            <form action={saveContentAction} className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="text-sm"><span className="text-xs uppercase tracking-wider text-neutral-500">Type</span><select name="contentType" className="mt-1 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3"><option value="amenity">Amenity</option><option value="faq">FAQ</option><option value="mobile_announcement">Mobile announcement</option></select></label>
              <label className="text-sm"><span className="text-xs uppercase tracking-wider text-neutral-500">Stable key</span><input name="contentKey" required pattern="[a-z0-9-]+" className="mt-1 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" placeholder="clubhouse" /></label>
              <label className="text-sm"><span className="text-xs uppercase tracking-wider text-neutral-500">English label</span><input name="label" required className="mt-1 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" /></label>
              <label className="text-sm"><span className="text-xs uppercase tracking-wider text-neutral-500">Arabic label</span><input name="labelAr" dir="rtl" className="mt-1 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" /></label>
              <label className="text-sm lg:col-span-2"><span className="text-xs uppercase tracking-wider text-neutral-500">Body</span><textarea name="body" className="mt-1 min-h-24 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" /></label>
              <button className="w-fit rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white" type="submit">Publish content</button>
            </form>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {rows.map((row) => (
              <article key={row.id} className="rounded-3xl border border-black/5 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs uppercase tracking-[0.25em] text-neutral-500">{row.content_type.replaceAll("_", " ")}</p><h3 className="mt-1 font-semibold">{row.label}</h3><p className="text-sm text-neutral-500">{row.label_ar || "No Arabic label"}</p></div>
                  <div className="flex gap-2">{row.is_demo ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-800">DEMO</span> : null}<span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${row.is_active ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"}`}>{row.is_active ? "LIVE" : "HIDDEN"}</span></div>
                </div>
                {row.body ? <p className="mt-3 text-sm text-neutral-600">{row.body}</p> : null}
                <div className="mt-4 flex gap-2">
                  <form action={toggleContentAction}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="active" value={row.is_active ? "false" : "true"}/><button className="rounded-full border border-black/10 px-3 py-1.5 text-xs" type="submit">{row.is_active ? "Hide" : "Publish"}</button></form>
                  <form action={deleteContentAction}><input type="hidden" name="id" value={row.id}/><ConfirmSubmitButton confirmMessage="Delete this content item?" className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">Delete</ConfirmSubmitButton></form>
                </div>
              </article>
            ))}
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
  if (!/^[a-z0-9-]+$/.test(contentKey) || !label) redirect("/content?error=Use%20a%20stable%20lowercase%20key%20and%20label.");
  const { data, error } = await supabaseServer.from("dashboard_content").upsert({ content_type: contentType, content_key: contentKey, label, label_ar: labelAr, body, is_active: true, published_at: new Date().toISOString(), updated_by: admin.adminId, is_demo: false }, { onConflict: "content_type,content_key" }).select("id").single();
  if (error) redirect(`/content?error=${encodeURIComponent(error.message)}`);
  await logAdminActivity({ adminId: admin.adminId, action: "content_published", resourceType: "dashboard_content", resourceId: data?.id });
  revalidatePath("/content");
  redirect("/content?success=Content%20published.");
}

async function toggleContentAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin) redirect("/content?error=Access%20denied.");
  const id = formData.get("id")?.toString();
  const active = formData.get("active") === "true";
  if (!id) return;
  const { error } = await supabaseServer.from("dashboard_content").update({ is_active: active, published_at: active ? new Date().toISOString() : null, updated_by: admin.adminId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) redirect(`/content?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/content");
}

async function deleteContentAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin) redirect("/content?error=Access%20denied.");
  const id = formData.get("id")?.toString();
  if (!id) return;
  const { error } = await supabaseServer.from("dashboard_content").delete().eq("id", id);
  if (error) redirect(`/content?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/content");
}
