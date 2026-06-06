
-- ============================================================
-- Allow viewers to insert/update data tables (no delete).
-- Pattern per table:
--   DROP "Write for admins" (FOR ALL)
--   CREATE separate INSERT, UPDATE for authenticated
--   CREATE DELETE for admins only
-- ============================================================

DO $$
DECLARE
  t text;
  data_tables text[] := ARRAY[
    'bank_movements','bank_reconciliations','centro_assignments',
    'commessa_links','documenti_acquisto','fatture_acquisto',
    'fatture_vendita','fatture_xml','rate_finanziamento','rubrica'
  ];
BEGIN
  FOREACH t IN ARRAY data_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Write for admins" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Insert for authenticated" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Update for authenticated" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Delete for admins" ON public.%I FOR DELETE TO authenticated USING (is_admin())', t);
  END LOOP;
END $$;

-- ============================================================
-- Storage: allow authenticated to insert/update objects in
-- the three app buckets. Delete stays admin-only.
-- ============================================================
DROP POLICY IF EXISTS "App buckets insert for admins" ON storage.objects;
DROP POLICY IF EXISTS "App buckets update for admins" ON storage.objects;

CREATE POLICY "App buckets insert for authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = ANY (ARRAY['fatture-xml','documenti-acquisto','documenti-commesse']));

CREATE POLICY "App buckets update for authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = ANY (ARRAY['fatture-xml','documenti-acquisto','documenti-commesse']))
  WITH CHECK (bucket_id = ANY (ARRAY['fatture-xml','documenti-acquisto','documenti-commesse']));
