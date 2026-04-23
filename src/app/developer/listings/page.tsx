import Link from "next/link";
import { revalidatePath } from "next/cache";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { requireDeveloperSession } from "@/lib/developerAuth";
import {
  fetchDeveloperProjects,
  fetchDeveloperResales,
  toggleListingVisibility,
  deleteListing,
  requestListingRenewal,
} from "@/lib/developerQueries";

export default async function DeveloperListingsPage() {
  const session = await requireDeveloperSession();
  const [listings, projects] = await Promise.all([
    fetchDeveloperResales(session.developerId),
    fetchDeveloperProjects(session.developerId),
  ]);
  const listingsByProject = new Map<string, number>();
  listings.forEach((listing) => {
    if (!listing.project_id) return;
    listingsByProject.set(listing.project_id, (listingsByProject.get(listing.project_id) ?? 0) + 1);
  });
  const unlinkedCount = listings.filter((listing) => !listing.project_id).length;

  return (
    <DeveloperLayout
      title="Resales"
      description="Add resale units to an existing project or spin up a new linked project for resale inventory."
    >
      <section className="rounded-3xl border border-black/5 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Resale workflow</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#050505]">Create resale inventory the right way</h2>
            <p className="mt-2 max-w-2xl text-sm text-neutral-500">
              Resale units should be attached to one of your existing projects whenever possible. If the project does
              not exist yet, create it inline while submitting the resale unit.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white"
              href="/developer/listings/new?saleType=resale"
            >
              Add resale
            </Link>
            <Link
              className="rounded-full border border-black/10 px-5 py-2 text-sm font-semibold text-neutral-700 hover:border-black/30 hover:text-black"
              href="/developer/listings/new?saleType=resale&createProject=1"
            >
              Add resale to a new project
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Project shortcuts</p>
            <p className="text-base text-neutral-700">Jump straight into adding resale units to your launches</p>
          </div>
        </header>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <article key={project.id} className="rounded-3xl border border-black/5 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#050505]">{project.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">{project.location ?? "Location not set"}</p>
                </div>
                <span className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600">
                  {listingsByProject.get(project.id) ?? 0} resale
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-neutral-500">
                {project.description ?? "No project description yet."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white"
                  href={`/developer/listings/new?saleType=resale&project=${project.id}`}
                >
                  Add resale to this project
                </Link>
                <Link
                  className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30 hover:text-black"
                  href={`/developer/projects?project=${project.id}`}
                >
                  View project
                </Link>
              </div>
            </article>
          ))}
          <article className="rounded-3xl border border-dashed border-black/10 bg-white p-5">
            <p className="text-sm font-semibold text-[#050505]">Need a new project first?</p>
            <p className="mt-2 text-sm text-neutral-500">
              If the resale belongs to a project that is not in your dashboard yet, create the project inline during
              resale submission.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white"
                href="/developer/listings/new?saleType=resale&createProject=1"
              >
                Create new project + resale
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Total resales" value={String(listings.length)} />
        <SummaryCard label="Linked to projects" value={String(listings.filter((listing) => listing.project_id).length)} />
        <SummaryCard label="Unlinked resales" value={String(unlinkedCount)} />
      </section>

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
                  <div className="text-xs text-neutral-500">
                    {listing.project_id
                      ? `Linked project · ${projects.find((project) => project.id === listing.project_id)?.name ?? "Unknown project"}`
                      : "No linked project"}
                  </div>
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
                <td className="px-4 py-6 text-center text-sm text-neutral-500" colSpan={8}>
                  No resale units yet. Use the actions above to add a resale to an existing project or create a new linked project.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DeveloperLayout>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-3xl border border-black/5 bg-white p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[#050505]">{value}</p>
    </article>
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
