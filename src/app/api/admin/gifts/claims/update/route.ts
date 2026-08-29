import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";
import { parseClaimFormValue, parseClaimUpdate, growthErrorMessage } from "@/lib/growthContracts";

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const parsed = parseClaimUpdate({
    claimId: parseClaimFormValue(formData.get("claim_id")),
    status: parseClaimFormValue(formData.get("status")),
    notes: parseClaimFormValue(formData.get("notes")),
    ownerId: parseClaimFormValue(formData.get("fulfillment_owner_id")),
    dueAt: parseClaimFormValue(formData.get("fulfillment_due_at")),
    reference: parseClaimFormValue(formData.get("fulfillment_reference")),
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await supabaseServer.rpc("update_gift_claim_fulfillment", {
    p_claim_id: parsed.value.claim_id,
    p_status: parsed.value.status,
    p_admin_id: admin.adminId,
    p_notes: parsed.value.notes,
    p_fulfillment_owner_id: parsed.value.fulfillment_owner_id,
    p_fulfillment_due_at: parsed.value.fulfillment_due_at,
    p_fulfillment_reference: parsed.value.fulfillment_reference,
    p_fulfillment_metadata: {},
  });

  if (error) {
    return NextResponse.json({ error: growthErrorMessage(error, "Unable to update gift claim") }, { status: 409 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "gifts.claim.update",
    resourceType: "gift_claims",
    resourceId: parsed.value.claim_id,
    metadata: { status: parsed.value.status },
  });

  return NextResponse.redirect(new URL("/gifts/claims", request.url));
}
