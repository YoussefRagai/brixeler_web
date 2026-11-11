import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeExternalMediaUrl } from "../src/lib/externalMediaUrl.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("inventory template keeps its public URL on the developer host", () => {
  const proxy = read("../src/proxy.ts");
  const page = read("../src/app/developer/projects/page.tsx");
  const template = new URL("../public/templates/developer-project-import.xlsx", import.meta.url);
  assert.ok(readFileSync(template).length > 0);
  assert.match(proxy, /pathname !== "\/templates\/developer-project-import\.xlsx"/);
  assert.match(page, /INVENTORY_TEMPLATE_PATH = "\/templates\/developer-project-import\.xlsx"/);
});

test("pasted media URLs require credential-free HTTPS on approved exact hosts", () => {
  assert.equal(normalizeExternalMediaUrl(" https://images.unsplash.com/photo.jpg "), "https://images.unsplash.com/photo.jpg");
  assert.equal(normalizeExternalMediaUrl("https://admin.brixeler.com/media/logo.png"), "https://admin.brixeler.com/media/logo.png");
  for (const value of [
    "https://youtube.com/watch?v=abc",
    "https://www.youtube.com/watch?v=abc",
    "https://youtu.be/abc",
    "https://vimeo.com/123456",
    "https://player.vimeo.com/video/123456",
  ]) assert.equal(normalizeExternalMediaUrl(value), value);

  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://brixeler-project.supabase.co";
  try {
    assert.equal(
      normalizeExternalMediaUrl("https://brixeler-project.supabase.co/storage/v1/object/public/project-images/photo.jpg"),
      "https://brixeler-project.supabase.co/storage/v1/object/public/project-images/photo.jpg",
    );
    assert.equal(normalizeExternalMediaUrl("https://other-project.supabase.co/storage/v1/object/public/project-images/photo.jpg"), null);
  } finally {
    if (previousSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
  }

  for (const value of [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "http://cdn.example.com/photo.jpg",
    "https://user:pass@cdn.example.com/photo.jpg",
    "https://localhost/media",
    "https://127.0.0.1/media",
    "https://[::1]/media",
    "https://192.168.1.2/media",
    "https://127.0.0.1.nip.io/media",
    "https://localtest.me/media",
    "https://media.internal/photo.jpg",
    "https://media.example.com:8443/photo.jpg",
    "https://images.unsplash.com.evil.test/photo.jpg",
    "https://cdn.example.com/photo.jpg",
    `https://cdn.example.com/${"x".repeat(2048)}`,
  ]) assert.equal(normalizeExternalMediaUrl(value), null, value);
});

test("developer project, profile and listing writes share the validator", () => {
  for (const path of [
    "../src/app/developer/projects/page.tsx",
    "../src/app/developer/profile/page.tsx",
    "../src/lib/developerListingMedia.ts",
    "../src/lib/developerQueries.ts",
  ]) assert.match(read(path), /normalizeExternalMediaUrl/, path);
});
