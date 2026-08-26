import "server-only";
import { isFile, STORAGE_BUCKETS, uploadFileToBucket } from "./storageServer";

function validatedOptionalUrl(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${label} must be a valid http(s) URL.`);
  }
}

export async function resolveDeveloperListingMedia(formData: FormData, developerId: string, listingKey: string) {
  const suppliedPhotos = (formData.get("photoUrls")?.toString() ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => validatedOptionalUrl(value, "Each photo")!);
  const photoFiles = formData.getAll("photoFiles").filter(isFile);
  if (photoFiles.length > 12) throw new Error("Upload no more than 12 photos at once.");
  const uploadedPhotos = await Promise.all(photoFiles.map((file) => uploadFileToBucket({
    bucket: STORAGE_BUCKETS.projectUnitImages,
    pathPrefix: `${developerId}/listings/${listingKey}/photos`,
    file,
  })));

  const brochureFile = formData.get("brochureFile");
  const videoFile = formData.get("videoFile");
  const brochureUrl = isFile(brochureFile)
    ? await uploadFileToBucket({ bucket: STORAGE_BUCKETS.projectBrochures, pathPrefix: `${developerId}/listings/${listingKey}/brochure`, file: brochureFile })
    : validatedOptionalUrl(formData.get("brochureUrl")?.toString() ?? "", "Brochure URL");
  const videoUrl = isFile(videoFile)
    ? await uploadFileToBucket({ bucket: STORAGE_BUCKETS.projectVideos, pathPrefix: `${developerId}/listings/${listingKey}/video`, file: videoFile })
    : validatedOptionalUrl(formData.get("videoUrl")?.toString() ?? "", "Video URL");

  return { photoUrls: [...suppliedPhotos, ...uploadedPhotos], brochureUrl, videoUrl };
}
