import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const twilioSource = readFileSync(new URL("../src/lib/twilioVerify.ts", import.meta.url), "utf8");
const startSource = readFileSync(
  new URL("../src/app/api/mobile/phone-verification/start/route.ts", import.meta.url),
  "utf8",
);
const verifySource = readFileSync(
  new URL("../src/app/api/mobile/phone-verification/verify/route.ts", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL("../supabase/migrations/20260830120000_require_new_phone_verification.sql", import.meta.url),
  "utf8",
);

test("WhatsApp OTP uses Twilio Verify v2 with server-only credentials", () => {
  assert.match(twilioSource, /https:\/\/verify\.twilio\.com\/v2\/Services/);
  assert.match(twilioSource, /Channel: "whatsapp"/);
  assert.match(twilioSource, /TWILIO_API_KEY_SID/);
  assert.match(twilioSource, /TWILIO_API_KEY_SECRET/);
  assert.match(twilioSource, /TWILIO_ACCOUNT_SID/);
  assert.match(twilioSource, /TWILIO_AUTH_TOKEN/);
  assert.match(twilioSource, /TWILIO_VERIFY_SERVICE_SID/);
});

test("phone verification endpoints require a mobile bearer session and fail closed", () => {
  for (const source of [startSource, verifySource]) {
    assert.match(source, /getMobileUserFromRequest\(request\)/);
    assert.match(source, /isTwilioVerifyConfigured\(\)/);
  }
  assert.match(startSource, /consume_phone_verification_attempt/);
  assert.match(startSource, /\.neq\("id", session\.user\.id\)/);
  assert.match(verifySource, /status !== "approved"/);
  assert.match(verifySource, /phone_verified: true/);
});

test("new profiles default to unverified without changing existing users", () => {
  assert.match(migrationSource, /alter column phone_verified set default false/i);
  assert.doesNotMatch(migrationSource, /update\s+public\.users_profile/i);
});

test("provider errors expose actionable states without returning Twilio payloads", () => {
  assert.match(twilioSource, /code === 63008/);
  assert.match(twilioSource, /code === 63018/);
  assert.match(twilioSource, /TwilioVerifyError/);
  assert.doesNotMatch(startSource, /payload\.message/);
  assert.doesNotMatch(verifySource, /payload\.message/);
});
