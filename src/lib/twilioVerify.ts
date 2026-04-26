const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID ?? "";

function assertTwilioVerifyConfig() {
  if (!accountSid || !authToken || !verifyServiceSid) {
    throw new Error("Twilio Verify is not configured.");
  }
}

async function twilioRequest(path: string, body: URLSearchParams) {
  assertTwilioVerifyConfig();

  const response = await fetch(`https://verify.twilio.com/v2/Services/${verifyServiceSid}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Twilio Verify request failed.";
    throw new Error(message);
  }

  return payload;
}

export async function startWhatsAppVerification(phone: string) {
  return twilioRequest("/Verifications", new URLSearchParams({ To: phone, Channel: "whatsapp" }));
}

export async function checkWhatsAppVerification(phone: string, code: string) {
  return twilioRequest("/VerificationCheck", new URLSearchParams({ To: phone, Code: code }));
}

export function isTwilioVerifyConfigured() {
  return Boolean(accountSid && authToken && verifyServiceSid);
}
