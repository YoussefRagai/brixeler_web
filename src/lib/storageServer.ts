import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("Supabase environment variables are not set for storage uploads.");
}

let cachedStorage: SupabaseClient | null = null;

function createStorageClient() {
  if (cachedStorage) return cachedStorage;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabaseUrl is required.");
  }
  cachedStorage = createClient<any>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedStorage;
}

export const storageServer = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = createStorageClient();
    return client[prop as keyof typeof client];
  },
});

export const STORAGE_BUCKETS = {
  developerLogos: "developer-logos",
  projectImages: "developer-project-images",
  projectBrochures: "developer-project-brochures",
  projectVoiceNotes: "developer-project-voice-notes",
  projectVideos: "developer-project-videos",
  projectUnitImages: "developer-project-unit-images",
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
  return !!value && typeof value !== "string";
}
