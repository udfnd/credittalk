-- Allow service_role to SELECT/INSERT/DELETE banned_phones (used by edge functions).
DROP POLICY IF EXISTS "service_role full access on banned_phones" ON public.banned_phones;
CREATE POLICY "service_role full access on banned_phones"
  ON public.banned_phones
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
