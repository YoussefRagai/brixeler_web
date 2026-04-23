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
  const level = Number(formData.get("level")?.toString() ?? "");
  const description = formData.get("description")?.toString().trim() || null;
  const benefitType = formData.get("benefitType")?.toString().trim() || "none";
  const benefitValueRaw = formData.get("benefitValue")?.toString().trim() ?? "";
  const benefitDescription = formData.get("benefitDescription")?.toString().trim() || null;
  const iconFile = formData.get("icon");

  if (!name || Number.isNaN(level)) {
    return NextResponse.json({ error: "Missing name or level" }, { status: 400 });
  }
  if (!isFile(iconFile)) {
    return NextResponse.json({ error: "Icon is required" }, { status: 400 });
  }

  const iconUrl = await uploadFileToBucket({
    bucket: STORAGE_BUCKETS.tierIcons,
    pathPrefix: "tiers",
    file: iconFile,
  });
  const benefitValue = benefitValueRaw.length ? Number(benefitValueRaw) : null;

  const { data, error } = await supabaseServer
    .from("tiers")
    .insert({
      name,
      level,
      icon_url: iconUrl,
      description,
      benefit_type: benefitType,
      benefit_value: Number.isFinite(benefitValue ?? NaN) ? benefitValue : null,
      benefit_description: benefitDescription,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "rewards.tier.create",
    resourceType: "tiers",
    resourceId: data?.id ?? null,
    metadata: { name, level, benefitType, benefitValue, benefitDescription },
  });

  return NextResponse.redirect(new URL("/rewards", request.url));
}
