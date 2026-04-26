import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getMobileUserFromRequest } from "@/lib/mobileSession";
import { isTwilioVerifyConfigured, startWhatsAppVerification } from "@/lib/twilioVerify";

const phonePattern = /^\+[1-9]\d{9,14}$/;

export async function POST(request: Request) {
  const session = await getMobileUserFromRequest(request);
  if (!session.user) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  if (!isTwilioVerifyConfigured()) {
    return NextResponse.json({ error: "Phone verification is not configured yet." }, { status: 503 });
  }

  let body: { phone?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = body.phone?.trim() ?? "";
  if (!phonePattern.test(phone)) {
    return NextResponse.json({ error: "Enter a valid phone number in international format." }, { status: 400 });
  }

  const { data: duplicateProfile, error: duplicateError } = await supabaseServer
    .from("users_profile")
    .select("id")
    .eq("phone", phone)
    .neq("id", session.user.id)
    .maybeSingle();

  if (duplicateError) {
    return NextResponse.json({ error: duplicateError.message }, { status: 500 });
  }

  if (duplicateProfile?.id) {
    return NextResponse.json({ error: `An account using this phone number ${phone} is already in place.` }, { status: 409 });
  }

  const { error: profileError } = await supabaseServer
    .from("users_profile")
    .update({
      phone,
      phone_verified: false,
      phone_verified_at: null,
      verification_rejection_reason: null,
    })
    .eq("id", session.user.id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  try {
    await startWhatsAppVerification(phone);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send WhatsApp verification code." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
