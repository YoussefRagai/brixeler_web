const TRUSTED_MEDIA_HOSTS = new Set([
  "admin.brixeler.com",
  "images.unsplash.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
]);

/** Apply the same pasted-media boundary to spreadsheet imports on the server. */
export function inventoryImportMediaErrors(rows: Array<Record<string, unknown>>) {
  return rows.flatMap((row, index) => {
    const photos = Array.isArray(row.photos) ? row.photos : typeof row.photos === "string" ? row.photos.split("|").filter((value) => value.trim()) : [];
    const urls = [...photos, ...[row.floor_plan_url, row.video_tour_url].filter((value) => value != null && value !== "")];
    return urls.some((value) => typeof value !== "string" || !normalizeExternalMediaUrl(value))
      ? [{ row: index + 2, errors: ["Media URLs must use HTTPS and an approved media host."] }]
      : [];
  });
}

function isPublicHostname(host: string) {
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
  return !["localhost", "local", "internal", "lan", "home", "test", "invalid"].some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function configuredSupabaseHost() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || !isPublicHostname(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/** Accept only credential-free HTTPS media URLs on exact, approved hosts. */
export function normalizeExternalMediaUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw || raw.length > 2048) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!isPublicHostname(host)) return null;
    if (!TRUSTED_MEDIA_HOSTS.has(host) && host !== configuredSupabaseHost()) return null;
    url.hostname = host;
    return url.toString();
  } catch {
    return null;
  }
}
