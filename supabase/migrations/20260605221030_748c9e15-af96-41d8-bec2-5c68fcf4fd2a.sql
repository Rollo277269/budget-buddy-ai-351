
CREATE TABLE public.password_reset_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL CHECK (event IN ('requested','completed')),
  email text,
  user_id uuid,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.password_reset_audit TO anon, authenticated;
GRANT SELECT ON public.password_reset_audit TO authenticated;
GRANT ALL ON public.password_reset_audit TO service_role;

ALTER TABLE public.password_reset_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log reset events"
  ON public.password_reset_audit FOR INSERT
  TO anon, authenticated
  WITH CHECK (event IN ('requested','completed'));

CREATE POLICY "Authenticated can read audit"
  ON public.password_reset_audit FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_pwd_reset_audit_created_at ON public.password_reset_audit(created_at DESC);
CREATE INDEX idx_pwd_reset_audit_email ON public.password_reset_audit(email);
