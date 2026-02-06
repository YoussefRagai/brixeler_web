import Link from "next/link";
import { revalidatePath } from "next/cache";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { fetchDeveloperResales, toggleListingVisibility, deleteListing, requestListingRenewal } from "@/lib/developerQueries";

export default async function DeveloperListingsPage() {
  const session = await requireDeveloperSession();
  const listings = await fetchDeveloperResales(session.developerId);

  return (
    <DeveloperLayout
      title="Resales"
      description="Monitor resale inventory submitted by agents across your projects."
    >
      <div className="overflow-hidden rounded-3xl border border-black/5 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-[0.3em] text-neutral-500">
            <tr>
              <th className="px-4 py-3">Listing</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Visibility</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Renewal</th>
              <th className="px-4 py-3">Inquiries</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => (
              <tr key={listing.id} className="border-t border-black/5">
                <td className="px-4 py-3">
                  <div className="font-semibold text-[#050505]">{listing.name}</div>
                  <div className="text-xs text-neutral-500">Updated {listing.updated_at ? new Date(listing.updated_at).toLocaleString() : '—'}</div>
                </td>
                <td className="px-4 py-3">EGP {listing.price.toLocaleString()}</td>
                <td className="px-4 py-3 capitalize">{listing.status}</td>
                <td className="px-4 py-3 capitalize">{listing.visibility}</td>
                <td className="px-4 py-3">
                  {listing.expires_at ? new Date(listing.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD"}
                </td>
                <td className="px-4 py-3">
                  {listing.renewal_status === "awaiting_admin" ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      Pending admin
                    </span>
                  ) : listing.status !== "approved" ? (
                    <span className="text-xs text-neutral-400">Awaiting approval</span>
                  ) : listing.renewal_status === "active" ? (
                    <span className="text-xs text-neutral-500">Active</span>
                  ) : (
                    <form action={requestRenewalAction}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <button className="rounded-full border border-black/10 px-3 py-1 text-xs" type="submit">
                        Request renewal
                      </button>
                    </form>
                  )}
                </td>
                <td className="px-4 py-3">{listing.inquiries}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link className="rounded-full border border-black/10 px-3 py-1 text-xs" href={`/developer/listings/${listing.id}`}>Edit</Link>
                    <form action={toggleVisibilityAction}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <input type="hidden" name="visibility" value={listing.visibility === 'public' ? 'hidden' : 'public'} />
                      <button className="rounded-full border border-black/10 px-3 py-1 text-xs" type="submit">
                        {listing.visibility === 'public' ? 'Hide' : 'Unhide'}
                      </button>
                    </form>
                    <form action={deleteListingAction}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <button className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-600" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {!listings.length && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-neutral-500" colSpan={6}>
                  No resale units yet. New resales submitted by agents will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DeveloperLayout>
  );
}

async function toggleVisibilityAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const listingId = formData.get("listingId")?.toString();
  const visibility = formData.get("visibility")?.toString() ?? "public";
  if (!listingId) return;
  await toggleListingVisibility(session.developerId, listingId, visibility);
  revalidatePath("/developer/listings");
}

async function deleteListingAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const listingId = formData.get("listingId")?.toString();
  if (!listingId) return;
  await deleteListing(session.developerId, listingId);
  revalidatePath("/developer/listings");
}

async function requestRenewalAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const listingId = formData.get("listingId")?.toString();
  if (!listingId) return;
  await requestListingRenewal(listingId, session.userId);
  revalidatePath("/developer/listings");
}
