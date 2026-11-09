import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { STORAGE_BUCKETS, storageServer, validateStorageUpload } from "@/lib/storageServer";

const fieldBuckets: Record<string, string> = {
  project_logo: STORAGE_BUCKETS.projectImages,
  project_images: STORAGE_BUCKETS.projectImages,
  project_brochure: STORAGE_BUCKETS.projectBrochures,
  project_masterplan: STORAGE_BUCKETS.projectBrochures,
  project_inventory: STORAGE_BUCKETS.projectBrochures,
  voice_notes: STORAGE_BUCKETS.projectVoiceNotes,
  project_videos: STORAGE_BUCKETS.projectVideos,
  phaseHeroImage: STORAGE_BUCKETS.projectImages,
  phaseMasterplan: STORAGE_BUCKETS.projectBrochures,
};
const bucketLimits: Record<string, { bytes: number; mimeTypes: string[] }> = {
  [STORAGE_BUCKETS.projectImages]: { bytes: 10 * 1024 * 1024, mimeTypes: ["image/*"] },
  [STORAGE_BUCKETS.projectBrochures]: { bytes: 25 * 1024 * 1024, mimeTypes: ["application/pdf", "image/*", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] },
  [STORAGE_BUCKETS.projectVoiceNotes]: { bytes: 25 * 1024 * 1024, mimeTypes: ["audio/*"] },
  [STORAGE_BUCKETS.projectVideos]: { bytes: 100 * 1024 * 1024, mimeTypes: ["video/*"] },
};

export async function POST(request: Request) {
  try {
    const session = await requireDeveloperCapability("manage_projects");
    const body = await request.json() as Record<string, unknown>;
    const field = typeof body.field === "string" ? body.field : "";
    const bucket = fieldBuckets[field];
    const name = typeof body.name === "string" ? body.name : "";
    const type = typeof body.type === "string" ? body.type : "";
    const size = typeof body.size === "number" ? body.size : 0;
    if (!bucket || !name || name.length > 200 || !Number.isSafeInteger(size)) {
      return NextResponse.json({ error: "Invalid media upload." }, { status: 400 });
    }
    try {
      validateStorageUpload(bucket, { name, type, size });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid file." }, { status: 400 });
    }
    // A signed token lets the browser choose the actual bytes. Refuse to sign
    // until the bucket itself enforces the same limits as the metadata check.
    const { data: bucketConfig, error: bucketError } = await storageServer.storage.getBucket(bucket);
    const limit = bucketLimits[bucket];
    if (bucketError || !bucketConfig || !limit ||
      !bucketConfig.file_size_limit || bucketConfig.file_size_limit > limit.bytes ||
      !bucketConfig.allowed_mime_types ||
      bucketConfig.allowed_mime_types.length !== limit.mimeTypes.length ||
      !limit.mimeTypes.every((mimeType) => bucketConfig.allowed_mime_types?.includes(mimeType))) {
      return NextResponse.json({ error: "Secure media uploads are being prepared. Paste a hosted URL for now." }, { status: 503 });
    }
    const path = `developers/${session.developerId}/project-media/${crypto.randomUUID()}-${name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const { data, error } = await storageServer.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: "Could not prepare the upload. Try again." }, { status: 502 });
    const publicUrl = storageServer.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ bucket, path, token: data.token, publicUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) return NextResponse.json({ error: "Project access required." }, { status: 403 });
    return NextResponse.json({ error: "Sign in and try again." }, { status: 401 });
  }
}
