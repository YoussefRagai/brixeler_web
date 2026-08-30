import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("Supabase environment variables are not set for storage uploads.");
}

type StorageSupabaseClient = SupabaseClient;

type DisabledQuery = {
  then(resolve: (value: { data: null; error: Error }) => void): void;
  catch(): DisabledQuery;
} & Record<string, () => DisabledQuery>;

const disabledError = new Error("Supabase is not configured.");

const disabledBuilder: DisabledQuery = new Proxy(
  {
    then(resolve) {
      resolve({ data: null, error: disabledError });
    },
    catch() {
      return disabledBuilder;
    },
  } as DisabledQuery,
  {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      return () => disabledBuilder;
    },
  },
);

const disabledClient = new Proxy({} as StorageSupabaseClient, {
  get(_target, prop) {
    if (prop === "storage") {
      return { from: () => disabledBuilder };
    }
    if (prop === "from" || prop === "rpc") {
      return () => disabledBuilder;
    }
    return () => disabledBuilder;
  },
}) as StorageSupabaseClient;

let cachedStorage: StorageSupabaseClient | null = null;

function createStorageClient(): StorageSupabaseClient {
  if (cachedStorage) return cachedStorage;
  if (!supabaseConfigured) return disabledClient;
  cachedStorage = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
  });
  return cachedStorage;
}

export const storageServer = supabaseConfigured
  ? new Proxy({} as StorageSupabaseClient, {
      get(_target, prop) {
        const client = createStorageClient();
        return Reflect.get(client, prop, client);
      },
    })
  : disabledClient;

export const STORAGE_BUCKETS = {
  verificationDocs: "verification-docs",
  developerLogos: "developer-logos",
  projectImages: "developer-project-images",
  projectBrochures: "developer-project-brochures",
  projectVoiceNotes: "developer-project-voice-notes",
  projectVideos: "developer-project-videos",
  projectUnitImages: "developer-project-unit-images",
  badgeIcons: "badge-icons",
  tierIcons: "tier-icons",
  giftIcons: "gift-icons",
} as const;

export function storageObjectPath(bucket: string, value: string | null | undefined) {
  if (!value) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = value.indexOf(marker);
  if (index >= 0) {
    return decodeURIComponent(value.slice(index + marker.length)).replace(/^\/+/, "") || null;
  }
  if (/^https?:\/\//i.test(value)) return null;
  return value.replace(/^\/+/, "") || null;
}

export async function removeUploadedStorageObjects(items: Array<{ bucket: string; url: string }>) {
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const path = storageObjectPath(item.bucket, item.url);
    if (!path) continue;
    grouped.set(item.bucket, [...(grouped.get(item.bucket) ?? []), path]);
  }
  const failures: Error[] = [];
  for (const [bucket, paths] of grouped) {
    const { error } = await storageServer.storage.from(bucket).remove(paths);
    if (error) failures.push(error);
  }
  return { error: failures[0] ?? null };
}

export async function createSignedStorageUrl(
  bucket: string,
  value: string | null | undefined,
  expiresIn = 300,
) {
  const path = storageObjectPath(bucket, value);
  if (!path) return null;
  const { data, error } = await storageServer.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    if (error) console.warn(`Failed to sign ${bucket} object`, error);
    return null;
  }
  return data.signedUrl;
}

const sanitizeFilename = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");

const uploadRules: Record<string, { maxBytes: number; mimeTypes: string[]; extensions?: string[] }> = {
  [STORAGE_BUCKETS.developerLogos]: { maxBytes: 5 * 1024 * 1024, mimeTypes: ["image/*"] },
  [STORAGE_BUCKETS.projectImages]: { maxBytes: 10 * 1024 * 1024, mimeTypes: ["image/*"] },
  [STORAGE_BUCKETS.projectUnitImages]: { maxBytes: 10 * 1024 * 1024, mimeTypes: ["image/*"] },
  [STORAGE_BUCKETS.projectBrochures]: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: ["application/pdf", "image/*", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    extensions: ["xlsx"],
  },
  [STORAGE_BUCKETS.projectVoiceNotes]: { maxBytes: 25 * 1024 * 1024, mimeTypes: ["audio/*"] },
  [STORAGE_BUCKETS.projectVideos]: { maxBytes: 100 * 1024 * 1024, mimeTypes: ["video/*"] },
  [STORAGE_BUCKETS.badgeIcons]: { maxBytes: 5 * 1024 * 1024, mimeTypes: ["image/*"] },
  [STORAGE_BUCKETS.tierIcons]: { maxBytes: 5 * 1024 * 1024, mimeTypes: ["image/*"] },
  [STORAGE_BUCKETS.giftIcons]: { maxBytes: 5 * 1024 * 1024, mimeTypes: ["image/*"] },
};

function isAllowedMimeType(file: File, rule: (typeof uploadRules)[string]) {
  const mimeType = file.type.toLowerCase();
  if (rule.mimeTypes.some((allowed) => allowed.endsWith("/*") ? mimeType.startsWith(allowed.slice(0, -1)) : mimeType === allowed)) {
    return true;
  }
  const extension = file.name.toLowerCase().split(".").pop();
  return Boolean(extension && rule.extensions?.includes(extension));
}

export async function uploadFileToBucket(params: {
  bucket: string;
  pathPrefix: string;
  file: File;
}) {
  const { bucket, pathPrefix, file } = params;
  const rule = uploadRules[bucket];
  if (!rule) throw new Error("Uploads are not enabled for this storage bucket.");
  if (
    pathPrefix.length > 400 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(pathPrefix) ||
    pathPrefix.includes("..") ||
    pathPrefix.includes("//")
  ) {
    throw new Error("Upload path is invalid.");
  }
  if (file.size <= 0 || file.size > rule.maxBytes) {
    throw new Error(`File is too large. Maximum allowed size is ${Math.floor(rule.maxBytes / (1024 * 1024))} MB.`);
  }
  if (!isAllowedMimeType(file, rule)) {
    throw new Error("File type is not allowed for this upload.");
  }
  const filename = sanitizeFilename(file.name || "upload");
  const path = `${pathPrefix}/${crypto.randomUUID()}-${filename}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const { data, error } = await storageServer.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "Upload failed");
  }
  const { data: publicData } = storageServer.storage.from(bucket).getPublicUrl(data.path);
  return publicData.publicUrl;
}

export function isFile(value: FormDataEntryValue | null): value is File {
  return !!value && typeof value !== "string" && value.size > 0;
}
