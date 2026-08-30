import "server-only";
import { isFile, removeUploadedStorageObjects, STORAGE_BUCKETS, uploadFileToBucket } from "./storageServer";

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
  const uploadedObjects: Array<{ bucket: string; url: string }> = [];
  const uploadTracked = async (bucket: string, pathPrefix: string, file: File) => {
    const url = await uploadFileToBucket({ bucket, pathPrefix, file });
    uploadedObjects.push({ bucket, url });
    return url;
  };
  try {
    const uploadedPhotos: string[] = [];
    for (const file of photoFiles) {
      uploadedPhotos.push(await uploadTracked(STORAGE_BUCKETS.projectUnitImages, `${developerId}/listings/${listingKey}/photos`, file));
    }
    const brochureFile = formData.get("brochureFile");
    const videoFile = formData.get("videoFile");
    const brochureUrl = isFile(brochureFile)
      ? await uploadTracked(STORAGE_BUCKETS.projectBrochures, `${developerId}/listings/${listingKey}/brochure`, brochureFile)
      : validatedOptionalUrl(formData.get("brochureUrl")?.toString() ?? "", "Brochure URL");
    const videoUrl = isFile(videoFile)
      ? await uploadTracked(STORAGE_BUCKETS.projectVideos, `${developerId}/listings/${listingKey}/video`, videoFile)
      : validatedOptionalUrl(formData.get("videoUrl")?.toString() ?? "", "Video URL");

    return { photoUrls: [...suppliedPhotos, ...uploadedPhotos], brochureUrl, videoUrl, uploadedObjects };
  } catch (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    throw error;
  }
}
