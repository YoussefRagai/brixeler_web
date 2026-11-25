-- Keep Storage enforcement aligned with the shared 200 MiB developer-media
-- contract. Existing MIME allowlists are intentionally preserved.
update storage.buckets
set file_size_limit = 209715200
where id in (
  'developer-logos',
  'developer-project-images',
  'developer-project-unit-images',
  'developer-project-brochures',
  'developer-project-voice-notes',
  'developer-project-videos'
);
