
-- Conti Correnti
CREATE TABLE public.conti_correnti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'conto_corrente',
  banca text NOT NULL,
  iban text NOT NULL,
  intestatario text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conti_correnti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on conti_correnti" ON public.conti_correnti FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Centri CR
CREATE TABLE public.centri_cr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  codice text NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  parole_chiave_matching text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  categoria_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.centri_cr ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on centri_cr" ON public.centri_cr FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Categorie Centri
CREATE TABLE public.categorie_centri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  codice text NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.categorie_centri ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on categorie_centri" ON public.categorie_centri FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Naming Rules
CREATE TABLE public.naming_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  pattern text NOT NULL,
  esempio text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.naming_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on naming_rules" ON public.naming_rules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Bank Movements
CREATE TABLE public.bank_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL DEFAULT '',
  source_file text NOT NULL DEFAULT '',
  data text NOT NULL DEFAULT '',
  data_valuta text NOT NULL DEFAULT '',
  causale text NOT NULL DEFAULT '',
  descrizione text NOT NULL DEFAULT '',
  importo numeric NOT NULL DEFAULT 0,
  saldo numeric NOT NULL DEFAULT 0,
  cig text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on bank_movements" ON public.bank_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Reconciliations
CREATE TABLE public.bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid REFERENCES public.bank_movements(id) ON DELETE CASCADE NOT NULL,
  invoice_type text NOT NULL,
  invoice_anno integer NOT NULL,
  invoice_numero integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on bank_reconciliations" ON public.bank_reconciliations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Centro Assignments (maps invoice keys to centro codes)
CREATE TABLE public.centro_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_key text NOT NULL,
  tipo text NOT NULL,
  context text NOT NULL,
  centro_codice text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_key, tipo, context)
);
ALTER TABLE public.centro_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access on centro_assignments" ON public.centro_assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
