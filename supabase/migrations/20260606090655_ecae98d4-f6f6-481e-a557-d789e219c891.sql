CREATE TABLE public.ui_text_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ui_text_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ui_text_overrides TO authenticated;
GRANT ALL ON public.ui_text_overrides TO service_role;

ALTER TABLE public.ui_text_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read overrides" ON public.ui_text_overrides FOR SELECT USING (true);
CREATE POLICY "Admins manage overrides" ON public.ui_text_overrides FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.touch_ui_text_overrides() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_touch_ui_text_overrides BEFORE UPDATE ON public.ui_text_overrides
FOR EACH ROW EXECUTE FUNCTION public.touch_ui_text_overrides();