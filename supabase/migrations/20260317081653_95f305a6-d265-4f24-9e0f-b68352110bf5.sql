
-- Table for amortization plan installments
CREATE TABLE public.rate_finanziamento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conto_id UUID NOT NULL,
  numero_rata INTEGER NOT NULL,
  data_scadenza TEXT NOT NULL,
  importo_rata NUMERIC NOT NULL DEFAULT 0,
  importo_capitale NUMERIC NOT NULL DEFAULT 0,
  importo_interessi NUMERIC NOT NULL DEFAULT 0,
  debito_residuo NUMERIC NOT NULL DEFAULT 0,
  pagata BOOLEAN NOT NULL DEFAULT false,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rate_finanziamento ENABLE ROW LEVEL SECURITY;

-- Public access policy (matching other tables in this project)
CREATE POLICY "Allow public access on rate_finanziamento"
ON public.rate_finanziamento
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Index for fast lookups by account
CREATE INDEX idx_rate_finanziamento_conto ON public.rate_finanziamento(conto_id);
