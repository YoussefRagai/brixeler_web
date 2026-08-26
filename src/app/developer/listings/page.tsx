import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ArrowUpRight, Building2, Plus, ShieldCheck, UserRound } from "lucide-react";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { currentDeveloperImpersonation, requireDeveloperSession } from "@/lib/developerAuth";
import {
  deleteListing,
  fetchDeveloperProjects,
  fetchDeveloperResales,
  requestListingRenewal,
  toggleListingVisibility,
  type DeveloperListing,
} from "@/lib/developerQueries";

type ResaleView = "agent" | "developer";

export default async function DeveloperListingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string; view?: string }>;
}) {
  const session = await requireDeveloperSession();
  const feedback = (await searchParams) ?? {};
  const activeView: ResaleView = feedback.view === "developer" ? "developer" : "agent";
  const [listings, projects, impersonation] = await Promise.all([
    fetchDeveloperResales(session.developerId),
    fetchDeveloperProjects(session.developerId),
    currentDeveloperImpersonation(),
  ]);
  const agentListings = listings.filter((listing) => Boolean(listing.listed_by_agent_id));
  const developerListings = listings.filter((listing) => !listing.listed_by_agent_id);
  const visibleListings = activeView === "agent" ? agentListings : developerListings;
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <DeveloperLayout
      title="Resales"
      description="Review agent resale activity and manage inventory created by your team."
      impersonation={impersonation}
    >
      {feedback.success ? <Feedback tone="success">{feedback.success}</Feedback> : null}
      {feedback.error ? <Feedback tone="error">{feedback.error}</Feedback> : null}

      <section className="overflow-hidden rounded-3xl border border-black/5 bg-white">
        <div className="flex flex-col gap-5 border-b border-black/5 p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-black p-3 text-white"><Building2 aria-hidden="true" size={20} /></div>
            <div>
              <h2 className="text-lg font-semibold text-[#050505]">Resale workspace</h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-500">
                Agent submissions are view-only. Inventory added by your team stays fully manageable here.
              </p>
            </div>
          </div>
          <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white transition hover:bg-neutral-800" href="/developer/listings/new?saleType=resale">
            <Plus aria-hidden="true" size={17} /> Add developer resale
          </Link>
        </div>

        <nav aria-label="Resale source" className="flex gap-1 overflow-x-auto border-b border-black/5 bg-neutral-50/70 p-2">
          <SourceTab active={activeView === "agent"} count={agentListings.length} href="/developer/listings?view=agent" icon={<UserRound aria-hidden="true" size={16} />} label="Agent submissions" />
          <SourceTab active={activeView === "developer"} count={developerListings.length} href="/developer/listings?view=developer" icon={<Building2 aria-hidden="true" size={16} />} label="Developer inventory" />
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-6">
          <div>
            <p className="text-sm font-semibold text-neutral-900">{activeView === "agent" ? "Listed by app users" : "Created by your team"}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {activeView === "agent" ? "These units remain owned and managed by the agent who submitted them." : "Edit visibility, renew, or remove these listings at any time."}
            </p>
          </div>
          {activeView === "agent" ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck aria-hidden="true" size={14} /> Read-only</span> : null}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-y border-black/5 bg-neutral-50 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              <tr><th className="px-6 py-3 font-medium">Unit</th><th className="px-4 py-3 font-medium">Price</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Inquiries</th><th className="px-6 py-3 text-right font-medium">{activeView === "agent" ? "Source" : "Actions"}</th></tr>
            </thead>
            <tbody>
              {visibleListings.map((listing) => <ListingRow key={listing.id} listing={listing} projectName={listing.project_id ? projectNames.get(listing.project_id) : undefined} readOnly={activeView === "agent"} />)}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-black/5 md:hidden">
          {visibleListings.map((listing) => <ListingCard key={listing.id} listing={listing} projectName={listing.project_id ? projectNames.get(listing.project_id) : undefined} readOnly={activeView === "agent"} />)}
        </div>

        {!visibleListings.length ? (
          <div className="border-t border-black/5 px-6 py-14 text-center">
            <p className="text-sm font-semibold text-neutral-800">{activeView === "agent" ? "No agent resale submissions yet" : "No developer resale inventory yet"}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">{activeView === "agent" ? "Units listed by app users under your projects will appear here automatically." : "Add a resale unit and connect it to one of your projects."}</p>
            {activeView === "developer" ? <Link className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-black" href="/developer/listings/new?saleType=resale">Create your first resale <ArrowUpRight aria-hidden="true" size={16} /></Link> : null}
          </div>
        ) : null}
      </section>
    </DeveloperLayout>
  );
}

function SourceTab({ active, count, href, icon, label }: { active: boolean; count: number; href: string; icon: React.ReactNode; label: string }) {
  return <Link aria-current={active ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${active ? "bg-white text-black shadow-sm ring-1 ring-black/5" : "text-neutral-500 hover:text-black"}`} href={href}>{icon}{label}<span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-black text-white" : "bg-black/5 text-neutral-600"}`}>{count}</span></Link>;
}

function ListingRow({ listing, projectName, readOnly }: { listing: DeveloperListing; projectName?: string; readOnly: boolean }) {
  return <tr className="border-b border-black/5 last:border-0"><td className="px-6 py-4"><div className="flex items-center gap-2 font-semibold text-[#050505]">{listing.name}{listing.is_demo ? <DemoBadge /> : null}</div><p className="mt-1 text-xs text-neutral-500">{projectName ?? "No linked project"} · Updated {formatDate(listing.updated_at)}</p></td><td className="px-4 py-4 font-medium text-neutral-800">EGP {listing.price.toLocaleString()}</td><td className="px-4 py-4"><StatusBadge listing={listing} /></td><td className="px-4 py-4 text-neutral-600">{listing.inquiries}</td><td className="px-6 py-4">{readOnly ? <div className="text-right text-xs font-medium text-neutral-500">App agent</div> : <ListingActions listing={listing} />}</td></tr>;
}

function ListingCard({ listing, projectName, readOnly }: { listing: DeveloperListing; projectName?: string; readOnly: boolean }) {
  return <article className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold text-[#050505]">{listing.name}{listing.is_demo ? <DemoBadge /> : null}</div><p className="mt-1 text-xs text-neutral-500">{projectName ?? "No linked project"}</p></div><StatusBadge listing={listing} /></div><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs text-neutral-500">Price</p><p className="font-semibold">EGP {listing.price.toLocaleString()}</p></div><div className="text-right"><p className="text-xs text-neutral-500">Inquiries</p><p className="font-semibold">{listing.inquiries}</p></div></div><div className="mt-4 border-t border-black/5 pt-4">{readOnly ? <p className="text-xs font-medium text-neutral-500">View-only · submitted by an app agent</p> : <ListingActions listing={listing} />}</div></article>;
}

function ListingActions({ listing }: { listing: DeveloperListing }) {
  return <div className="flex flex-wrap justify-end gap-2"><Link className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold hover:border-black/30" href={`/developer/listings/${listing.id}`}>Edit</Link><form action={toggleVisibilityAction}><input type="hidden" name="listingId" value={listing.id} /><input type="hidden" name="visibility" value={listing.visibility === "public" ? "hidden" : "public"} /><button className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold hover:border-black/30" type="submit">{listing.visibility === "public" ? "Hide" : "Show"}</button></form>{listing.status === "approved" && listing.renewal_status !== "awaiting_admin" && listing.renewal_status !== "active" ? <form action={requestRenewalAction}><input type="hidden" name="listingId" value={listing.id} /><button className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold hover:border-black/30" type="submit">Renew</button></form> : null}<form action={deleteListingAction}><input type="hidden" name="listingId" value={listing.id} /><ConfirmSubmitButton className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50" confirmMessage="Delete this listing permanently? This cannot be undone." pendingLabel="Deleting…">Delete</ConfirmSubmitButton></form></div>;
}

function StatusBadge({ listing }: { listing: DeveloperListing }) {
  const label = listing.renewal_status === "awaiting_admin" ? "Renewal pending" : listing.visibility === "hidden" ? "Hidden" : listing.status;
  const tone = label === "approved" ? "bg-emerald-50 text-emerald-700" : label === "Hidden" ? "bg-neutral-100 text-neutral-600" : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tone}`}>{label}</span>;
}

function DemoBadge() { return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">Demo</span>; }
function Feedback({ children, tone }: { children: React.ReactNode; tone: "success" | "error" }) { return <div className={`rounded-2xl border px-4 py-3 text-sm ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{children}</div>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value)) : "—"; }

async function toggleVisibilityAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const listingId = formData.get("listingId")?.toString();
  const visibility = formData.get("visibility")?.toString() ?? "public";
  if (!listingId) return;
  const { error } = await toggleListingVisibility(session.developerId, listingId, visibility);
  revalidatePath("/developer/listings");
  if (error) redirect(`/developer/listings?view=developer&error=${encodeURIComponent(error.message)}`);
  redirect(`/developer/listings?view=developer&success=${encodeURIComponent(visibility === "hidden" ? "Listing hidden from the mobile catalog." : "Listing restored to the mobile catalog.")}`);
}

async function deleteListingAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const listingId = formData.get("listingId")?.toString();
  if (!listingId) return;
  const { error } = await deleteListing(session.developerId, listingId);
  revalidatePath("/developer/listings");
  if (error) redirect(`/developer/listings?view=developer&error=${encodeURIComponent(error.message)}`);
  redirect("/developer/listings?view=developer&success=Listing%20deleted.");
}

async function requestRenewalAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const listingId = formData.get("listingId")?.toString();
  if (!listingId) return;
  try { await requestListingRenewal(listingId, session.userId, session.developerId); }
  catch (error) { redirect(`/developer/listings?view=developer&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to request renewal.")}`); }
  revalidatePath("/developer/listings");
  redirect("/developer/listings?view=developer&success=Renewal%20request%20submitted.");
}
