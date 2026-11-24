import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STORAGE_BUCKETS, STORAGE_UPLOAD_RULES, validateStorageUpload } from "../src/lib/storageServer.ts";
import { DEFAULT_UPLOAD_MAX_BYTES, DEVELOPER_MEDIA_FIELD_MAX_BYTES, formatUploadSize } from "../src/lib/storageUploadRules.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("project media uploads enforce bucket-specific file limits and types", () => {
  assert.doesNotThrow(() => validateStorageUpload(STORAGE_BUCKETS.projectImages, { name: "cover.png", type: "image/png", size: 1024 }));
  assert.throws(() => validateStorageUpload(STORAGE_BUCKETS.projectImages, { name: "cover.png", type: "image/png", size: 11 * 1024 * 1024 }), /Maximum allowed size is 10 MiB/);
  assert.equal(STORAGE_UPLOAD_RULES[STORAGE_BUCKETS.projectBrochures].maxBytes, 50 * 1024 * 1024);
  assert.equal(STORAGE_UPLOAD_RULES[STORAGE_BUCKETS.projectVoiceNotes].maxBytes, 50 * 1024 * 1024);
  assert.doesNotThrow(() => validateStorageUpload(STORAGE_BUCKETS.projectBrochures, { name: "brochure.pdf", type: "application/pdf", size: 50 * 1024 * 1024 }));
  assert.throws(() => validateStorageUpload(STORAGE_BUCKETS.projectBrochures, { name: "brochure.pdf", type: "application/pdf", size: 50 * 1024 * 1024 + 1 }), /Maximum allowed size is 50 MiB/);
  assert.doesNotThrow(() => validateStorageUpload(STORAGE_BUCKETS.projectVoiceNotes, { name: "note.m4a", type: "audio/mp4", size: 50 * 1024 * 1024 }));
  assert.throws(() => validateStorageUpload(STORAGE_BUCKETS.projectVideos, { name: "bad.txt", type: "text/plain", size: 1024 }), /File type is not allowed/);
  assert.doesNotThrow(() => validateStorageUpload(STORAGE_BUCKETS.projectVideos, { name: "launch.mp4", type: "video/mp4", size: 100 * 1024 * 1024 }));
  assert.throws(() => validateStorageUpload(STORAGE_BUCKETS.projectVideos, { name: "launch.mp4", type: "video/mp4", size: 100 * 1024 * 1024 + 1 }), /Maximum allowed size is 100 MiB/);
});

test("signed uploads require bounded Storage limits and exact MIME allowlists", () => {
  const route = read("../src/app/api/developer/project-media/sign/route.ts");
  const migration = read("../supabase/migrations/20261109163240_project_media_bucket_limits.sql");
  assert.match(route, /requireDeveloperCapability\("manage_projects"\)/);
  assert.match(route, /getStorageUploadRule\(bucket\)/);
  assert.match(route, /!bucketConfig\.file_size_limit \|\| bucketConfig\.file_size_limit > limit\.maxBytes/);
  assert.match(route, /bucketConfig\.allowed_mime_types\.length !== limit\.mimeTypes\.length/);
  assert.match(route, /createSignedUploadUrl\(path\)/);
  for (const bucket of Object.values(STORAGE_BUCKETS).filter((value) => value.startsWith("developer-project-"))) {
    if (bucket === STORAGE_BUCKETS.projectUnitImages) continue;
    assert.match(migration, new RegExp(bucket));
  }
});

test("the additive bucket migration raises only general media limits", () => {
  const migration = read("../supabase/migrations/20261124215507_increase_developer_media_bucket_limits.sql");
  assert.match(migration, /developer-project-brochures/);
  assert.match(migration, /developer-project-voice-notes/);
  assert.match(migration, /file_size_limit\s*=\s*52428800/);
  assert.doesNotMatch(migration, /developer-project-images/);
  assert.doesNotMatch(migration, /developer-project-videos/);
});

test("project forms upload media separately and preserve draft creation", () => {
  const field = read("../src/components/DeveloperMediaField.tsx");
  const wizard = read("../src/components/ProjectWizard.tsx");
  const projects = read("../src/app/developer/projects/page.tsx");
  assert.match(field, /uploadToSignedUrl\(/);
  assert.match(field, /inputRef\.current\.value = ""/);
  assert.match(wizard, /Create draft now/);
  assert.match(wizard, /data-media-uploading/);
  assert.match(projects, /missing\.length === 1 && missing\[0\] === "Hero media"\s*\? 95/);
});

test("browser media preflight shares the server limits and clear MiB copy", () => {
  const field = read("../src/components/DeveloperMediaField.tsx");
  assert.equal(DEFAULT_UPLOAD_MAX_BYTES, 50 * 1024 * 1024);
  assert.equal(DEVELOPER_MEDIA_FIELD_MAX_BYTES.project_brochure, DEFAULT_UPLOAD_MAX_BYTES);
  assert.equal(DEVELOPER_MEDIA_FIELD_MAX_BYTES.voice_notes, DEFAULT_UPLOAD_MAX_BYTES);
  assert.equal(DEVELOPER_MEDIA_FIELD_MAX_BYTES.project_videos, 100 * 1024 * 1024);
  assert.equal(formatUploadSize(DEFAULT_UPLOAD_MAX_BYTES), "50 MiB");
  assert.match(field, /file\.size > maxFileBytes/);
  assert.match(field, /Maximum allowed size is \$\{formatUploadSize\(maxFileBytes\)\}/);
});
