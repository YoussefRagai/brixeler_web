-- Signed browser uploads must be constrained by Storage itself. The signer
-- validates metadata, but a client holding a signed URL controls the bytes.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/*']::text[]
where id = 'developer-project-images';

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/pdf',
      'image/*',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
where id = 'developer-project-brochures';

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array['audio/*']::text[]
where id = 'developer-project-voice-notes';

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array['video/*']::text[]
where id = 'developer-project-videos';
