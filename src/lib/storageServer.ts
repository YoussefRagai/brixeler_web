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

const sanitizeFilename = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");

export async function uploadFileToBucket(params: {
  bucket: string;
  pathPrefix: string;
  file: File;
}) {
  const { bucket, pathPrefix, file } = params;
  const filename = sanitizeFilename(file.name || "upload");
  const path = `${pathPrefix}/${Date.now()}-${filename}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const { data, error } = await storageServer.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || undefined,
    upsert: true,
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
