ALTER TABLE public.fatture_acquisto 
  ADD COLUMN cassa numeric NOT NULL DEFAULT 0,
  ADD COLUMN ritenute numeric NOT NULL DEFAULT 0;