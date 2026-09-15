const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
const apiKeySid = process.env.TWILIO_API_KEY_SID ?? "";
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET ?? "";
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID ?? "";

export class TwilioVerifyError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly status: number,
  ) {
    super(message);
    this.name = "TwilioVerifyError";
  }
}

function credentials() {
  if (apiKeySid && apiKeySecret) return { username: apiKeySid, password: apiKeySecret };
  if (accountSid && authToken) return { username: accountSid, password: authToken };
  return null;
}

function assertTwilioVerifyConfig() {
  if (!credentials() || !verifyServiceSid) {
    throw new Error("Twilio Verify is not configured.");
  }
}

function publicErrorMessage(code: number | null) {
  if (code === 63008) return "WhatsApp verification is not connected to an approved sender yet.";
  if (code === 63018) return "WhatsApp verification has reached its current messaging limit. Try again later.";
  if (code === 60200) return "Enter a valid phone number in international format.";
  if (code === 60203) return "Too many verification attempts. Please try again later.";
  return "WhatsApp verification is temporarily unavailable. Please try again.";
}

async function twilioRequest(path: string, body: URLSearchParams) {
  assertTwilioVerifyConfig();
  const auth = credentials();
  if (!auth) throw new Error("Twilio Verify is not configured.");

  const response = await fetch(`https://verify.twilio.com/v2/Services/${verifyServiceSid}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      payload && typeof payload === "object" && "code" in payload && typeof payload.code === "number"
        ? payload.code
        : null;
    throw new TwilioVerifyError(publicErrorMessage(code), code, response.status);
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
  return Boolean(credentials() && verifyServiceSid);
}
