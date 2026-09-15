import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminLayout } from "@/components/AdminLayout";
import { GrowthAudienceStudio } from "@/components/GrowthAudienceStudio";
import { GrowthApprovalControls } from "@/components/GrowthApprovalControls";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

type AudienceRow = {
  id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  definition: { match?: string; conditions?: unknown[] } | null;
  lifecycle_state: string;
  approval_status: string;
  version: number;
  start_at: string | null;
  end_at: string | null;
  updated_at: string;
};

export default async function GrowthAudiencesPage() {
  const ui = await buildAdminUi(["marketing_admin"]);
  const { data } = ui.hasAccess
    ? await supabaseServer.from("growth_audiences").select("id, name, name_ar, description, definition, lifecycle_state, approval_status, version, start_at, end_at, updated_at").order("updated_at", { ascending: false })
    : { data: [] };
  const audiences = (data ?? []) as AudienceRow[];

  return (
    <AdminLayout title="Growth audiences" description="Build reusable customer groups without code." navItems={ui.navItems} meta={ui.meta}>
      {!ui.hasAccess ? <AdminAccessDenied /> : (
        <>
          <GrowthAudienceStudio />
          <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="saved-audiences-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Library</p>
                <h2 id="saved-audiences-title" className="mt-1 text-xl font-semibold text-neutral-950">Reusable audiences</h2>
              </div>
              <span className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-600">{audiences.length} saved</span>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {audiences.map((audience) => (
                <article key={audience.id} className="rounded-2xl border border-black/5 bg-neutral-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-neutral-950">{audience.name}</h3>{audience.name_ar ? <p dir="rtl" className="mt-0.5 text-right text-sm text-neutral-500">{audience.name_ar}</p> : null}</div>
                    <div className="flex gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${audience.lifecycle_state === "active" ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-700"}`}>{audience.lifecycle_state}</span><span className="rounded-full border border-black/10 px-2 py-1 text-[10px] font-semibold text-neutral-600">v{audience.version}</span></div>
                  </div>
                  {audience.description ? <p className="mt-3 text-sm text-neutral-600">{audience.description}</p> : null}
                  <p className="mt-3 text-xs text-neutral-500">{audience.definition?.conditions?.length ?? 0} conditions · Match {audience.definition?.match === "any" ? "any" : "all"}</p>
                  <p className="mt-1 text-xs text-neutral-400">Updated {new Date(audience.updated_at).toLocaleString()}</p>
                  <details className="mt-3 text-xs text-neutral-600"><summary className="cursor-pointer">Review audience conditions</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(audience.definition, null, 2)}</pre></details>
                  <GrowthApprovalControls entityType="audience" entityId={audience.id} expectedVersion={audience.version} status={audience.approval_status} canApprove={ui.roles.includes("super_admin")} />
                </article>
              ))}
              {!audiences.length ? <p className="rounded-2xl border border-dashed border-black/10 p-6 text-sm text-neutral-500 lg:col-span-2">No reusable audiences yet. Preview and save the first one above.</p> : null}
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
