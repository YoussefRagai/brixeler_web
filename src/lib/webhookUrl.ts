import { isIP } from "node:net";

const PRIVATE_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
  ".test",
  ".invalid",
  ".example",
] as const;

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("::ffff:") ||
    /(^|:)ffff:/.test(normalized)
  );
}

/**
 * Validate an endpoint at configuration time. Delivery workers must resolve
 * and validate the host again immediately before connecting so DNS rebinding
 * cannot turn an initially public hostname into a private destination.
 */
export function isSafeWebhookEndpointUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return false;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return false;

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || PRIVATE_HOST_SUFFIXES.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix))) return false;

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return !isPrivateIpv4(hostname);
  if (ipVersion === 6) return !isPrivateIpv6(hostname);
  return true;
}
