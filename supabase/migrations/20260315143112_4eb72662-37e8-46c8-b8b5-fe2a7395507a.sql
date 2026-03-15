ALTER TABLE public.fatture_vendita ADD COLUMN suffisso text NOT NULL DEFAULT '';
ALTER TABLE public.fatture_vendita DROP CONSTRAINT fatture_vendita_anno_numero_tipo_key;
ALTER TABLE public.fatture_vendita ADD CONSTRAINT fatture_vendita_anno_numero_suffisso_tipo_key UNIQUE (anno, numero, suffisso, tipo);