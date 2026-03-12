ALTER TABLE public.fatture_xml ADD COLUMN tipo text NOT NULL DEFAULT 'vendita';

-- Update existing records to vendita (they were all from vendite)
UPDATE public.fatture_xml SET tipo = 'vendita' WHERE tipo = 'vendita';