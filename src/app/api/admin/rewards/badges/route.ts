import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";
import { uploadFileToBucket, isFile, STORAGE_BUCKETS } from "@/lib/storageServer";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const admin = await requireAdminContext();
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const formData = await request.formData();
  const name = formData.get("name")?.toString().trim();
  const nameAr = formData.get("name_ar")?.toString().trim() || null;
  const description = formData.get("description")?.toString().trim() || null;
  const badgeType = formData.get("badge_type")?.toString() || "special";
  const expiresInDaysRaw = formData.get("expires_in_days")?.toString();
  const expiresInDays = expiresInDaysRaw ? Number(expiresInDaysRaw) : null;
  const iconFile = formData.get("icon");

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }
  if (!isFile(iconFile)) {
    return NextResponse.json({ error: "Icon is required" }, { status: 400 });
  }

  const iconUrl = await uploadFileToBucket({
    bucket: STORAGE_BUCKETS.badgeIcons,
    pathPrefix: "badges",
    file: iconFile,
  });

  const { data, error } = await supabaseServer
    .from("badges")
    .insert({
      name,
      name_ar: nameAr,
      description,
      icon_url: iconUrl,
      badge_type: badgeType,
      unlock_criteria: { type: "rule" },
      expires_in_days: Number.isFinite(expiresInDays as number) ? expiresInDays : null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "rewards.badge.create",
    resourceType: "badges",
    resourceId: data?.id ?? null,
    metadata: { name },
  });

  return NextResponse.redirect(new URL("/rewards", request.url));
}
