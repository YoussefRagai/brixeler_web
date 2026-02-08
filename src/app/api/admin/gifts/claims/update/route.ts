import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const admin = await requireAdminContext();
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const claimId = formData.get("claim_id")?.toString();
  const status = formData.get("status")?.toString();
  const notes = formData.get("notes")?.toString() || null;

  if (!claimId || !status) {
    return NextResponse.json({ error: "Missing claim id or status" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("gift_claims")
    .update({ status, notes, updated_at: new Date().toISOString() })
    .eq("id", claimId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "gifts.claim.update",
    resourceType: "gift_claims",
    resourceId: claimId,
    metadata: { status },
  });

  return NextResponse.redirect(new URL("/gifts/claims", request.url));
}
