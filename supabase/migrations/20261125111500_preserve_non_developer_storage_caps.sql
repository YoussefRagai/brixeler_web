-- Preserve the former 50 MiB effective cap for existing buckets whose
-- file_size_limit was NULL while the project-wide Storage cap was 50 MiB.
update storage.buckets
set file_size_limit = 52428800
where file_size_limit is null;
