
ALTER TABLE public.rubrica 
  ADD COLUMN sede_legale JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN sede_operativa JSONB NOT NULL DEFAULT '{}'::jsonb;
