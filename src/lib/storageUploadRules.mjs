export const BYTES_PER_MEBIBYTE = 1024 * 1024;
export const DEFAULT_UPLOAD_MAX_BYTES = 50 * BYTES_PER_MEBIBYTE;

/** @typedef {{ maxBytes: number, mimeTypes: readonly string[], extensions?: readonly string[] }} StorageUploadRule */

// Keep these rules free of server-only imports so the browser upload field can
// show the same per-file limits before it asks the server for a signed URL.
export const STORAGE_UPLOAD_RULES = {
  "developer-logos": { maxBytes: 5 * BYTES_PER_MEBIBYTE, mimeTypes: ["image/*"] },
  "developer-project-images": { maxBytes: 10 * BYTES_PER_MEBIBYTE, mimeTypes: ["image/*"] },
  "developer-project-unit-images": { maxBytes: 10 * BYTES_PER_MEBIBYTE, mimeTypes: ["image/*"] },
  "developer-project-brochures": {
    maxBytes: DEFAULT_UPLOAD_MAX_BYTES,
    mimeTypes: ["application/pdf", "image/*", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    extensions: ["xlsx"],
  },
  "developer-project-voice-notes": { maxBytes: DEFAULT_UPLOAD_MAX_BYTES, mimeTypes: ["audio/*"] },
  "developer-project-videos": { maxBytes: 100 * BYTES_PER_MEBIBYTE, mimeTypes: ["video/*"] },
  "badge-icons": { maxBytes: 5 * BYTES_PER_MEBIBYTE, mimeTypes: ["image/*"] },
  "tier-icons": { maxBytes: 5 * BYTES_PER_MEBIBYTE, mimeTypes: ["image/*"] },
  "gift-icons": { maxBytes: 5 * BYTES_PER_MEBIBYTE, mimeTypes: ["image/*"] },
};

export const DEVELOPER_MEDIA_FIELD_MAX_BYTES = {
  logo_file: STORAGE_UPLOAD_RULES["developer-logos"].maxBytes,
  project_logo: STORAGE_UPLOAD_RULES["developer-project-images"].maxBytes,
  project_images: STORAGE_UPLOAD_RULES["developer-project-images"].maxBytes,
  project_brochure: STORAGE_UPLOAD_RULES["developer-project-brochures"].maxBytes,
  project_masterplan: STORAGE_UPLOAD_RULES["developer-project-brochures"].maxBytes,
  project_inventory: STORAGE_UPLOAD_RULES["developer-project-brochures"].maxBytes,
  voice_notes: STORAGE_UPLOAD_RULES["developer-project-voice-notes"].maxBytes,
  project_videos: STORAGE_UPLOAD_RULES["developer-project-videos"].maxBytes,
  phaseHeroImage: STORAGE_UPLOAD_RULES["developer-project-images"].maxBytes,
  phaseMasterplan: STORAGE_UPLOAD_RULES["developer-project-brochures"].maxBytes,
  photoFiles: STORAGE_UPLOAD_RULES["developer-project-unit-images"].maxBytes,
  brochureFile: STORAGE_UPLOAD_RULES["developer-project-brochures"].maxBytes,
  videoFile: STORAGE_UPLOAD_RULES["developer-project-videos"].maxBytes,
  unitHeroImage: STORAGE_UPLOAD_RULES["developer-project-unit-images"].maxBytes,
};

/** @returns {StorageUploadRule | null} */
export function getStorageUploadRule(bucket) {
  return STORAGE_UPLOAD_RULES[bucket] ?? null;
}

export function maxBytesForDeveloperMediaField(field) {
  return DEVELOPER_MEDIA_FIELD_MAX_BYTES[field] ?? DEFAULT_UPLOAD_MAX_BYTES;
}

export function formatUploadSize(bytes) {
  const mebibytes = bytes / BYTES_PER_MEBIBYTE;
  return Number.isInteger(mebibytes) ? `${mebibytes} MiB` : `${mebibytes.toFixed(1)} MiB`;
}
