import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STORAGE_BUCKETS, validateStorageUpload } from "../src/lib/storageServer.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("project media uploads enforce bucket-specific file limits and types", () => {
  assert.doesNotThrow(() => validateStorageUpload(STORAGE_BUCKETS.projectImages, { name: "cover.png", type: "image/png", size: 1024 }));
  assert.throws(() => validateStorageUpload(STORAGE_BUCKETS.projectImages, { name: "cover.png", type: "image/png", size: 11 * 1024 * 1024 }), /Maximum allowed size is 10 MB/);
  assert.throws(() => validateStorageUpload(STORAGE_BUCKETS.projectVideos, { name: "bad.txt", type: "text/plain", size: 1024 }), /File type is not allowed/);
  assert.doesNotThrow(() => validateStorageUpload(STORAGE_BUCKETS.projectVideos, { name: "launch.mp4", type: "video/mp4", size: 100 * 1024 * 1024 }));
});

test("signed uploads fail closed until Storage enforces byte and MIME limits", () => {
  const route = read("../src/app/api/developer/project-media/sign/route.ts");
  const migration = read("../supabase/migrations/20261109163240_project_media_bucket_limits.sql");
  assert.match(route, /requireDeveloperCapability\("manage_projects"\)/);
  assert.match(route, /bucketConfig\.file_size_limit > limit\.bytes/);
  assert.match(route, /bucketConfig\.allowed_mime_types\.length !== limit\.mimeTypes\.length/);
  assert.match(route, /createSignedUploadUrl\(path\)/);
  for (const bucket of Object.values(STORAGE_BUCKETS).filter((value) => value.startsWith("developer-project-"))) {
    if (bucket === STORAGE_BUCKETS.projectUnitImages) continue;
    assert.match(migration, new RegExp(bucket));
  }
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
