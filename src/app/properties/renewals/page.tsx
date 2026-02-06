import { revalidatePath } from "next/cache";
import { AdminLayout } from "@/components/AdminLayout";
import { fetchPropertyRenewalRequests, reviewRenewalRequest, type PropertyRenewalRequest } from "@/lib/developerQueries";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PropertyRenewalsPage() {
  const pendingRequests = await fetchPropertyRenewalRequests("pending");

  return (
    <AdminLayout
      title="Listing renewals"
      description="Review agent and developer renewal requests—only approved listings remain visible for 90 days."
    >
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Pending workflow
            </p>
            <p className="text-lg text-white">Renewal approvals</p>
          </div>
          <p className="text-xs text-slate-400">
            Showing {pendingRequests.length} request{pendingRequests.length === 1 ? "" : "s"}
          </p>
        </header>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-xs uppercase tracking-[0.2em] text-slate-400">
            <thead className="bg-white/5">
              <tr>
                <th className="px-4 py-3">Listing</th>
                <th className="px-4 py-3">Requested by</th>
                <th className="px-4 py-3">Requested at</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-[13px] tracking-normal text-slate-200">
              {pendingRequests.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                    No renewal requests awaiting review.
                  </td>
                </tr>
              )}
              {pendingRequests.map((request) => (
                <RenewalRow key={request.id} request={request} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}

function RenewalRow({ request }: { request: PropertyRenewalRequest }) {
  const propertyName = request.property?.property_name ?? "Listing";
  const developerRelation = request.property?.developers;
  let developerName: string | undefined;
  if (Array.isArray(developerRelation)) {
    developerName = developerRelation[0]?.name ?? undefined;
  } else if (developerRelation && typeof developerRelation === "object") {
    developerName = developerRelation.name ?? undefined;
  }
  const expiresAt = request.property?.expires_at;

  return (
    <tr className="border-t border-white/5">
      <td className="px-4 py-4">
        <div className="font-semibold text-white">{propertyName}</div>
        {developerName && <div className="text-xs text-slate-500">{developerName}</div>}
      </td>
      <td className="px-4 py-4 capitalize">{request.requested_by_role}</td>
      <td className="px-4 py-4">{formatDate(request.requested_at)}</td>
      <td className="px-4 py-4">{formatDate(expiresAt)}</td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-2">
          <form action={approveRenewalAction}>
            <input type="hidden" name="requestId" value={request.id} />
            <button className="rounded-full border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-200" type="submit">
              Approve
            </button>
          </form>
          <form action={rejectRenewalAction}>
            <input type="hidden" name="requestId" value={request.id} />
            <button className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-200" type="submit">
              Reject
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

async function approveRenewalAction(formData: FormData) {
  "use server";
  const requestId = formData.get("requestId")?.toString();
  if (!requestId) return;
  await reviewRenewalRequest(requestId, true, null, "Approved via admin console");
  revalidatePath("/properties/renewals");
}

async function rejectRenewalAction(formData: FormData) {
  "use server";
  const requestId = formData.get("requestId")?.toString();
  if (!requestId) return;
  await reviewRenewalRequest(requestId, false, null, "Rejected via admin console");
  revalidatePath("/properties/renewals");
}
