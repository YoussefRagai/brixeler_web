import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";

const VALID_STATUSES = ["Under Review", "Accepted - Processing", "Paid"] as const;

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasAdminRole(admin.roles, ["deals_admin"])) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const params = await context.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing sales claim id." }, { status: 400 });
  }
  let body: {
    status?: string;
    paymentReference?: string;
    paymentProofUrl?: string;
    paymentAmount?: number | string;
    paymentAmountConfirmed?: boolean;
  };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    (body.paymentReference != null && typeof body.paymentReference !== "string")
    || (body.paymentProofUrl != null && typeof body.paymentProofUrl !== "string")
    || (body.paymentAmount != null && typeof body.paymentAmount !== "string" && typeof body.paymentAmount !== "number")
    || (body.paymentAmountConfirmed != null && typeof body.paymentAmountConfirmed !== "boolean")
  ) {
    return NextResponse.json({ error: "Invalid payment evidence fields." }, { status: 400 });
  }
  const status = body.status;
  if (!status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json(
      { error: "Invalid status. Allowed values: Under Review, Accepted - Processing, Paid." },
      { status: 400 },
    );
  }
  const paymentReference = body.paymentReference?.trim() || null;
  const paymentProofUrl = body.paymentProofUrl?.trim() || null;
  const paymentAmount = body.paymentAmount === "" || body.paymentAmount == null ? null : Number(body.paymentAmount);
  if (paymentReference && paymentReference.length > 200) {
    return NextResponse.json({ error: "Payment reference is too long." }, { status: 400 });
  }
  if (paymentProofUrl && (paymentProofUrl.length > 2048 || /[\u0000-\u001f]/.test(paymentProofUrl))) {
    return NextResponse.json({ error: "Payment proof reference is invalid." }, { status: 400 });
  }
  if (paymentAmount != null && (!Number.isFinite(paymentAmount) || paymentAmount <= 0)) {
    return NextResponse.json({ error: "Payment amount must be greater than zero." }, { status: 400 });
  }

  const hasPaymentEvidence = Boolean(paymentReference || paymentProofUrl || paymentAmount != null || body.paymentAmountConfirmed);
  if (hasPaymentEvidence && status !== "Accepted - Processing") {
    return NextResponse.json({ error: "Payment evidence can only be recorded while awaiting payment." }, { status: 400 });
  }
  const { data, error } = hasPaymentEvidence
    ? await supabaseServer.rpc("record_sales_claim_payment", {
        p_entry_id: id,
        p_actor_id: admin.adminId,
        p_payment_reference: paymentReference,
        p_payment_proof_url: paymentProofUrl,
        p_payment_amount: paymentAmount,
        p_payment_amount_confirmed: Boolean(body.paymentAmountConfirmed),
      })
    : status === "Paid"
      ? await supabaseServer.rpc("approve_sales_claim_payment", {
          p_entry_id: id,
          p_actor_id: admin.adminId,
        })
      : await supabaseServer.rpc("transition_sales_claim", {
          p_entry_id: id,
          p_next_status: status,
          p_actor_id: admin.adminId,
        });
  if (error) {
    console.error("Failed to update sales claim status", error);
    const message = error.message ?? "Unable to update sales claim status.";
    const conflict = /cannot move|must be|required|independent|already recorded|not found|only .* can/i.test(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 500 });
  }
  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ success: true, status: result?.status ?? status });
}
