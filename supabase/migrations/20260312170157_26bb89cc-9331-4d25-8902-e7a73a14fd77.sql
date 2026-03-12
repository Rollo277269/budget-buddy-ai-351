
-- Storage bucket for XML invoice files
INSERT INTO storage.buckets (id, name, public) VALUES ('fatture-xml', 'fatture-xml', false);

-- Allow anyone to upload/read (no auth in this app)
CREATE POLICY "Allow public upload" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'fatture-xml');
CREATE POLICY "Allow public select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'fatture-xml');
CREATE POLICY "Allow public delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'fatture-xml');

-- Table to track XML uploads and their invoice associations
CREATE TABLE public.fatture_xml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  anno INTEGER,
  numero INTEGER,
  invoice_key TEXT,
  cedente_denominazione TEXT,
  cessionario_denominazione TEXT,
  data_fattura TEXT,
  importo_totale NUMERIC,
  parsed_data JSONB DEFAULT '{}'::jsonb,
  matched BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fatture_xml ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access" ON public.fatture_xml FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
