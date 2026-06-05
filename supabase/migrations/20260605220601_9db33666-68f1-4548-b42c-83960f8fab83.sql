
-- =========================================================
-- Lock down all public tables: authenticated-only access
-- =========================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'bank_movements','bank_reconciliations','categorie_centri','centri_cr',
    'centro_assignments','commessa_links','conti_correnti','documenti_acquisto',
    'fatture_acquisto','fatture_vendita','fatture_xml','naming_rules',
    'rate_finanziamento','rubrica'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow public access on %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public access" ON public.%I', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY "Authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)$p$, t);
  END LOOP;
END $$;

-- web_vitals: allow anonymous INSERT (browser telemetry), authenticated read
DROP POLICY IF EXISTS "Allow public access on web_vitals" ON public.web_vitals;
REVOKE ALL ON public.web_vitals FROM anon;
GRANT INSERT ON public.web_vitals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_vitals TO authenticated;
GRANT ALL ON public.web_vitals TO service_role;
ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert vitals" ON public.web_vitals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can read vitals" ON public.web_vitals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage vitals" ON public.web_vitals FOR DELETE TO authenticated USING (true);

-- =========================================================
-- Storage buckets: authenticated-only
-- =========================================================
DO $$
DECLARE
  b text;
  buckets text[] := ARRAY['fatture-xml','documenti-acquisto','documenti-commesse'];
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public access %s select" ON storage.objects', b);
    EXECUTE format('DROP POLICY IF EXISTS "Public access %s insert" ON storage.objects', b);
    EXECUTE format('DROP POLICY IF EXISTS "Public access %s update" ON storage.objects', b);
    EXECUTE format('DROP POLICY IF EXISTS "Public access %s delete" ON storage.objects', b);
    EXECUTE format('DROP POLICY IF EXISTS "Anon read %s" ON storage.objects', b);
    EXECUTE format('DROP POLICY IF EXISTS "Anon write %s" ON storage.objects', b);
  END LOOP;
END $$;

-- Drop any other anon-permissive policies referencing these buckets
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND ('anon' = ANY(roles) OR roles = '{public}')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated read private buckets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse'));

CREATE POLICY "Authenticated insert private buckets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse'));

CREATE POLICY "Authenticated update private buckets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse'))
  WITH CHECK (bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse'));

CREATE POLICY "Authenticated delete private buckets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse'));
