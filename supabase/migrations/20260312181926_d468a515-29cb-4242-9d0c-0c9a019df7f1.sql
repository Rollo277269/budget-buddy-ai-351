
CREATE TABLE public.documenti_acquisto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  descrizione TEXT,
  importo NUMERIC,
  data_documento TEXT,
  fornitore TEXT,
  centro_costo TEXT,
  parsed_text TEXT,
  ai_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.documenti_acquisto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access on documenti_acquisto"
  ON public.documenti_acquisto
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('documenti-acquisto', 'documenti-acquisto', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public upload documenti-acquisto"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'documenti-acquisto');

CREATE POLICY "Allow public read documenti-acquisto"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'documenti-acquisto');

CREATE POLICY "Allow public delete documenti-acquisto"
  ON storage.objects
  FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'documenti-acquisto');
