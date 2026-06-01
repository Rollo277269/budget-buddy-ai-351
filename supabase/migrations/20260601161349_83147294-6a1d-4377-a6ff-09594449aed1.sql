ALTER TABLE public.documenti_acquisto
  ADD COLUMN IF NOT EXISTS tipo_documento text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_scadenza text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_documenti_acquisto_tipo_documento ON public.documenti_acquisto (tipo_documento);
CREATE INDEX IF NOT EXISTS idx_documenti_acquisto_data_scadenza ON public.documenti_acquisto (data_scadenza);