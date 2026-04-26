import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getMobileUserFromRequest } from "@/lib/mobileSession";
import { checkWhatsAppVerification, isTwilioVerifyConfigured } from "@/lib/twilioVerify";

const phonePattern = /^\+[1-9]\d{9,14}$/;
const codePattern = /^\d{4,10}$/;

export async function POST(request: Request) {
  const session = await getMobileUserFromRequest(request);
  if (!session.user) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  if (!isTwilioVerifyConfigured()) {
    return NextResponse.json({ error: "Phone verification is not configured yet." }, { status: 503 });
  }

  let body: { phone?: string; code?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = body.phone?.trim() ?? "";
  const code = body.code?.trim() ?? "";

  if (!phonePattern.test(phone)) {
    return NextResponse.json({ error: "Enter a valid phone number in international format." }, { status: 400 });
  }

  if (!codePattern.test(code)) {
    return NextResponse.json({ error: "Enter a valid verification code." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from("users_profile")
    .select("id, phone")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError || !profile?.id) {
    return NextResponse.json({ error: profileError?.message ?? "Profile not found." }, { status: 404 });
  }

  if ((profile.phone ?? "").trim() !== phone) {
    return NextResponse.json({ error: "Your phone number has changed. Start a new verification request." }, { status: 409 });
  }

  let verification: unknown;
  try {
    verification = await checkWhatsAppVerification(phone, code);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify WhatsApp code." },
      { status: 502 },
    );
  }

  const status =
    verification && typeof verification === "object" && "status" in verification ? String((verification as { status?: string }).status ?? "") : "";

  if (status !== "approved") {
    return NextResponse.json({ error: "Incorrect or expired verification code." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseServer
    .from("users_profile")
    .update({
      phone_verified: true,
      phone_verified_at: now,
      verification_rejection_reason: null,
    })
    .eq("id", session.user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, phoneVerified: true });
}
