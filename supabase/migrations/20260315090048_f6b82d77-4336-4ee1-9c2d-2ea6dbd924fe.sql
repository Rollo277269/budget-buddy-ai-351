
-- Fatture vendita (header-level, righe as JSONB)
CREATE TABLE public.fatture_vendita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT '',
  anno integer NOT NULL,
  numero integer NOT NULL,
  data text NOT NULL DEFAULT '',
  cliente text NOT NULL DEFAULT '',
  partita_iva text NOT NULL DEFAULT '',
  totale numeric NOT NULL DEFAULT 0,
  imponibile numeric NOT NULL DEFAULT 0,
  imposta numeric NOT NULL DEFAULT 0,
  descrizione text NOT NULL DEFAULT '',
  cig text NOT NULL DEFAULT '',
  cup text NOT NULL DEFAULT '',
  stato text NOT NULL DEFAULT '',
  scadenza text NOT NULL DEFAULT '',
  pagamento text NOT NULL DEFAULT '',
  righe jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_file text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(anno, numero)
);

ALTER TABLE public.fatture_vendita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on fatture_vendita" ON public.fatture_vendita FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Fatture acquisto
CREATE TABLE public.fatture_acquisto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT '',
  anno integer NOT NULL,
  numero integer NOT NULL,
  data text NOT NULL DEFAULT '',
  fornitore text NOT NULL DEFAULT '',
  partita_iva text NOT NULL DEFAULT '',
  totale numeric NOT NULL DEFAULT 0,
  imponibile numeric NOT NULL DEFAULT 0,
  imposta numeric NOT NULL DEFAULT 0,
  descrizione text NOT NULL DEFAULT '',
  cig text NOT NULL DEFAULT '',
  cup text NOT NULL DEFAULT '',
  stato text NOT NULL DEFAULT '',
  scadenza text NOT NULL DEFAULT '',
  pagamento text NOT NULL DEFAULT '',
  source_file text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(anno, numero)
);

ALTER TABLE public.fatture_acquisto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on fatture_acquisto" ON public.fatture_acquisto FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Commessa manual links
CREATE TABLE public.commessa_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_key text NOT NULL,
  invoice_type text NOT NULL,
  cig text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_key, invoice_type, cig)
);

ALTER TABLE public.commessa_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on commessa_links" ON public.commessa_links FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
