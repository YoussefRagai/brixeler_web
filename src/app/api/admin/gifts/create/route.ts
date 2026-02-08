import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";
import { uploadFileToBucket, isFile, STORAGE_BUCKETS } from "@/lib/storageServer";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";

function toStringArray(value: FormDataEntryValue | null): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  return [];
}

export async function POST(request: Request) {
  const admin = await requireAdminContext();
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const title = formData.get("title")?.toString().trim();
  const titleAr = formData.get("title_ar")?.toString().trim() || null;
  const description = formData.get("description")?.toString().trim() || null;
  const iconFile = formData.get("icon");
  const tierIds = formData.getAll("tier_ids").flatMap(toStringArray);
  const exclusivityMode = formData.get("exclusivity_mode")?.toString() || "none";
  const maxConcurrentRaw = formData.get("max_concurrent_claims")?.toString();
  const maxConcurrent = maxConcurrentRaw ? Number(maxConcurrentRaw) : null;

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  if (!isFile(iconFile)) {
    return NextResponse.json({ error: "Icon is required" }, { status: 400 });
  }

  const iconUrl = await uploadFileToBucket({
    bucket: STORAGE_BUCKETS.giftIcons,
    pathPrefix: "gifts",
    file: iconFile,
  });

  const { data, error } = await supabaseServer
    .from("gifts")
    .insert({
      title,
      title_ar: titleAr,
      description,
      icon_url: iconUrl,
      tier_ids: tierIds.length ? tierIds : [],
      exclusivity_mode: exclusivityMode,
      max_concurrent_claims: Number.isFinite(maxConcurrent as number) ? maxConcurrent : null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "gifts.create",
    resourceType: "gifts",
    resourceId: data?.id ?? null,
    metadata: { title },
  });

  return NextResponse.redirect(new URL("/gifts", request.url));
}
