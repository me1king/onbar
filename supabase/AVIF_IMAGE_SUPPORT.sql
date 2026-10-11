-- Allow AVIF files for new website image uploads while retaining existing formats.
BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/avif')
WHERE id IN ('onlinebar-assets', 'waitlist-site-images', 'waitlist-site-rewards')
  AND allowed_mime_types IS NOT NULL
  AND NOT ('image/avif' = ANY (allowed_mime_types));

COMMIT;
