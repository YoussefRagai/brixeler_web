import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";
import { PropertyApprovalQueue, type PropertyApprovalEntry } from "@/components/PropertyApprovalQueue";
import { requireAdminRole } from "@/lib/adminAuth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type PropertyQueueRow = {
  id: string;
  property_name: string | null;
  unit_area: number | null;
  price: number | null;
  approval_status: string | null;
  rejection_reason: string | null;
  listed_by_agent_id: string | null;
  created_at: string | null;
  description: string | null;
  photos: string[] | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string | null;
  amenities: string[] | null;
  is_demo: boolean | null;
};

async function loadPropertyQueue(): Promise<PropertyApprovalEntry[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const { data: properties } = await supabaseServer
    .from("properties")
    .select(
      "id, property_name, unit_area, price, approval_status, rejection_reason, listed_by_agent_id, created_at, description, photos, bedrooms, bathrooms, property_type, amenities, is_demo",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const agentIds = Array.from(
    new Set((properties ?? []).map((property) => property.listed_by_agent_id).filter(Boolean)),
  ) as string[];
  const { data: agents } = agentIds.length
    ? await supabaseServer.from("users_profile").select("id, display_name").in("id", agentIds)
    : { data: [] };
  const agentMap = new Map((agents ?? []).map((agent) => [agent.id, agent.display_name ?? "Agent"]));

  return ((properties ?? []) as PropertyQueueRow[]).map((property) => ({
    id: property.id,
    name: property.property_name,
    area: `${property.unit_area ?? "—"} m²`,
    price: property.price ? `${property.price}` : "—",
    status: property.approval_status ?? "pending",
    rejectionReason: property.rejection_reason ?? null,
    submittedBy: property.listed_by_agent_id ? agentMap.get(property.listed_by_agent_id) ?? "Agent" : "—",
    submittedAt: property.created_at ? new Date(property.created_at).toLocaleString() : "—",
    description: property.description ?? null,
    photos: property.photos ?? [],
    bedrooms: property.bedrooms ?? null,
    bathrooms: property.bathrooms ?? null,
    unitArea: property.unit_area ?? null,
    propertyType: property.property_type ?? null,
    amenities: property.amenities ?? [],
    isDemo: Boolean(property.is_demo),
  })) as PropertyApprovalEntry[];
}

export default async function PropertiesPage({ searchParams }: { searchParams?: Promise<{ success?: string; error?: string }> }) {
  const ui = await buildAdminUi(["listing_admin"]);
  const feedback = (await searchParams) ?? {};
  const queue = await loadPropertyQueue();
  return (
    <AdminLayout
      title="Property operations"
      description="Moderate listings, monitor inquiry velocity, and spotlight launches."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          {feedback.success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback.success}</div> : null}
          {feedback.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{feedback.error}</div> : null}
          <details className="rounded-3xl border border-black/5 bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold">Bulk import listings</summary>
            <p className="mt-2 text-xs text-neutral-500">CSV columns: property_name, price, unit_area, property_type, description, photos. Separate three or more photo URLs with |. Imported rows enter the approval queue.</p>
            <form action={bulkImportPropertiesAction} className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm"><span className="block text-xs uppercase tracking-wider text-neutral-500">CSV file</span><input name="file" type="file" accept=".csv,text/csv" required className="mt-1 rounded-2xl border border-black/10 px-4 py-2"/></label>
              <label className="flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm"><input name="isDemo" type="checkbox" value="true"/> Mark this import as demo data</label>
              <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white" type="submit">Import CSV</button>
            </form>
          </details>
          <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/5">
            <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">
              Approval queue
            </p>
            <p className="text-lg text-neutral-700">
              Developer + agent submitted listings
            </p>
          </div>
          <div />
        </header>
        <PropertyApprovalQueue entries={queue} />
          </section>
        </>
      )}
    </AdminLayout>
  );
}

async function bulkImportPropertiesAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["listing_admin"]);
  if (!admin) redirect("/properties?error=Access%20denied.");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) redirect("/properties?error=Choose%20a%20CSV%20file.");
  const isDemo = formData.get("isDemo") === "true";
  const demoBatch = isDemo ? `property-import-${new Date().toISOString().slice(0, 10)}` : null;
  if (demoBatch) {
    await supabaseServer.from("demo_data_batches").upsert({ batch_key: demoBatch, label: "Property CSV import", created_by: admin.adminId, notes: file.name });
  }
  const rows = parseCsv(await file.text());
  if (!rows.length) redirect("/properties?error=The%20CSV%20contains%20no%20data%20rows.");
  const allowedTypes = new Set(["apartment", "villa", "twinhouse", "townhouse", "duplex", "penthouse", "chalet", "studio", "cabin", "office", "clinic", "retail", "serviced_studio", "branded_apartment", "branded_villa", "luxury_apartment", "ultra_luxury_apartment", "ultra_luxury_villa", "one_story_villa", "pharmacy", "serviced_apartment", "loft"]);
  const payload = rows.map((row, index) => {
    const photos = (row.photos ?? "").split("|").map((value) => value.trim()).filter(Boolean);
    const propertyType = (row.property_type ?? "").trim();
    const price = Number(row.price);
    const unitArea = Number(row.unit_area);
    if (!row.property_name || !allowedTypes.has(propertyType) || price <= 0 || unitArea <= 0 || photos.length < 3) {
      redirect(`/properties?error=${encodeURIComponent(`Row ${index + 2} is invalid. Check name, price, area, property type, and three photos.`)}`);
    }
    return {
      property_name: row.property_name.trim(),
      price,
      unit_area: unitArea,
      property_type: propertyType,
      sale_type: "developer_sale",
      description: row.description?.trim() || "Imported by the property operations team.",
      photos,
      cover_photo_url: photos[0],
      approval_status: "pending",
      is_active: true,
      is_demo: isDemo,
      demo_batch: demoBatch,
      amenities: [],
    };
  });
  const { error } = await supabaseServer.from("properties").insert(payload);
  if (error) redirect(`/properties?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/properties");
  redirect(`/properties?success=${encodeURIComponent(`${payload.length} listings imported for review.`)}`);
}

function parseCsv(text: string) {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some((value) => value.trim())) lines.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) lines.push(row);
  const headers = (lines.shift() ?? []).map((value) => value.trim().toLowerCase());
  return lines.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
