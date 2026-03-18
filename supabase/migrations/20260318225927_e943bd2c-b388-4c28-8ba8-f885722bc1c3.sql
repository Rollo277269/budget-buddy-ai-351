
CREATE TABLE public.rubrica (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  denominazione TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'cliente',
  partita_iva TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  indirizzo TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rubrica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access on rubrica"
  ON public.rubrica
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
