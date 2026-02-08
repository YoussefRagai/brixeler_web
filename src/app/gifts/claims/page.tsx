import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminLayout } from "@/components/AdminLayout";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

const statusTabs = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

type ClaimRow = {
  id: string;
  status: string | null;
  notes: string | null;
  claimed_at: string | null;
  agent_id: string;
  gifts: { title: string; title_ar?: string | null } | null;
  users_profile: { display_name: string | null; phone?: string | null } | null;
};

export default async function GiftClaimsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const ui = await buildAdminUi(["marketing_admin"]);
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const activeStatus = typeof params?.status === "string" ? params.status : "pending";

  const { data: claims } = await supabaseServer
    .from("gift_claims")
    .select("id, status, notes, claimed_at, agent_id, gifts(title, title_ar), users_profile(display_name, phone)")
    .eq("status", activeStatus)
    .order("claimed_at", { ascending: false });

  return (
    <AdminLayout
      title="Gift Claims"
      description="Review and approve gift redemptions."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="space-y-6">
          <div className="rounded-3xl border border-black/5 bg-white px-6 py-4 shadow-xl shadow-black/5">
            <div className="flex flex-wrap gap-2">
              {statusTabs.map((tab) => (
                <a
                  key={tab.value}
                  href={`/gifts/claims?status=${tab.value}`}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    activeStatus === tab.value
                      ? "bg-black text-white"
                      : "border border-black/10 bg-white text-neutral-500"
                  }`}
                >
                  {tab.label}
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {(claims ?? []).map((claim) => (
              <div
                key={claim.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-black/5 bg-white px-6 py-4 shadow-lg shadow-black/5"
              >
                <div>
                  <p className="text-sm font-semibold text-[#050505]">
                    {claim.users_profile?.display_name ?? claim.agent_id}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {claim.gifts?.title ?? "Gift"}
                    {claim.gifts?.title_ar ? ` · ${claim.gifts.title_ar}` : ""}
                  </p>
                  <p className="text-[11px] text-neutral-400">{claim.claimed_at}</p>
                  {claim.notes ? <p className="mt-1 text-xs text-neutral-500">Notes: {claim.notes}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activeStatus === "pending" ? (
                    <>
                      <form action="/api/admin/gifts/claims/update" method="post">
                        <input type="hidden" name="claim_id" value={claim.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">
                          Approve
                        </button>
                      </form>
                      <form action="/api/admin/gifts/claims/update" method="post">
                        <input type="hidden" name="claim_id" value={claim.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-600">
                          Reject
                        </button>
                      </form>
                    </>
                  ) : null}
                  {activeStatus === "approved" ? (
                    <form action="/api/admin/gifts/claims/update" method="post">
                      <input type="hidden" name="claim_id" value={claim.id} />
                      <input type="hidden" name="status" value="fulfilled" />
                      <button className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white">
                        Mark fulfilled
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
            {!claims?.length && (
              <div className="rounded-3xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-sm text-neutral-400">
                No claims in this queue.
              </div>
            )}
          </div>
        </section>
      )}
    </AdminLayout>
  );
}
