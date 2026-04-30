ALTER TABLE public.bank_movements DROP COLUMN IF EXISTS source_file;
ALTER TABLE public.fatture_acquisto DROP COLUMN IF EXISTS source_file;
ALTER TABLE public.fatture_vendita DROP COLUMN IF EXISTS source_file;