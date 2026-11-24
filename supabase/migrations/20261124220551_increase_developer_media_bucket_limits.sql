-- Keep the already-applied MIME allowlists and raise only the general
-- developer document/audio buckets to the shared 50 MiB application limit.
update storage.buckets
set file_size_limit = 52428800
where id in ('developer-project-brochures', 'developer-project-voice-notes');
