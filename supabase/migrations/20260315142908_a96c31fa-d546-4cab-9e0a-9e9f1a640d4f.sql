ALTER TABLE public.fatture_vendita DROP CONSTRAINT fatture_vendita_anno_numero_key;
ALTER TABLE public.fatture_vendita ADD CONSTRAINT fatture_vendita_anno_numero_tipo_key UNIQUE (anno, numero, tipo);