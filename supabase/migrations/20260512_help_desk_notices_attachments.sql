-- Add image_urls and link_url columns to help_desk_notices
ALTER TABLE public.help_desk_notices
  ADD COLUMN IF NOT EXISTS image_urls text[],
  ADD COLUMN IF NOT EXISTS link_url text;

-- Create the helpdesk-notice-images storage bucket if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('helpdesk-notice-images', 'helpdesk-notice-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for helpdesk-notice-images bucket.
-- Mirrors the policy shape used by the public notice-images bucket:
-- public read access; authenticated users (service role for admin uploads) may write.

DROP POLICY IF EXISTS "helpdesk_notice_images_public_read"
  ON storage.objects;
CREATE POLICY "helpdesk_notice_images_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'helpdesk-notice-images');

DROP POLICY IF EXISTS "helpdesk_notice_images_authenticated_insert"
  ON storage.objects;
CREATE POLICY "helpdesk_notice_images_authenticated_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'helpdesk-notice-images');

DROP POLICY IF EXISTS "helpdesk_notice_images_authenticated_update"
  ON storage.objects;
CREATE POLICY "helpdesk_notice_images_authenticated_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'helpdesk-notice-images')
  WITH CHECK (bucket_id = 'helpdesk-notice-images');

DROP POLICY IF EXISTS "helpdesk_notice_images_authenticated_delete"
  ON storage.objects;
CREATE POLICY "helpdesk_notice_images_authenticated_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'helpdesk-notice-images');
