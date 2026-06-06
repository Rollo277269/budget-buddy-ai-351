
-- 1) Enum ruoli applicativi
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tabella user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Funzione security definer per verificare ruolo
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

-- Policies su user_roles
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
CREATE POLICY "Admins can read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4) Seed: tutti gli utenti esistenti diventano admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

-- 5) Trigger: nuovi utenti = viewer di default
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 6) Riscrivi RLS su tutte le tabelle dati
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
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Read for authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Write for admins" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "Read for authenticated" ON public.%I FOR SELECT TO authenticated USING (true)$p$, t);
    EXECUTE format($p$CREATE POLICY "Write for admins" ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())$p$, t);
  END LOOP;
END $$;

-- 7) Storage: viewer solo lettura, admin tutto, sui bucket privati dell'app
DROP POLICY IF EXISTS "Authenticated read private buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated insert private buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update private buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete private buckets" ON storage.objects;

CREATE POLICY "App buckets read for authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse'));

CREATE POLICY "App buckets insert for admins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse')
    AND public.is_admin()
  );

CREATE POLICY "App buckets update for admins" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse')
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse')
    AND public.is_admin()
  );

CREATE POLICY "App buckets delete for admins" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('fatture-xml','documenti-acquisto','documenti-commesse')
    AND public.is_admin()
  );
