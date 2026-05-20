ALTER TABLE public.fatture_acquisto
  ADD COLUMN IF NOT EXISTS righe jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill righe dalle linee dell'XML associato per le fatture passive
UPDATE public.fatture_acquisto fa
SET righe = COALESCE(fx.parsed_data->'linee', '[]'::jsonb)
FROM public.fatture_xml fx
WHERE fx.tipo = 'acquisto'
  AND fx.matched = true
  AND fx.anno = fa.anno
  AND fx.numero = fa.numero
  AND (fa.righe = '[]'::jsonb OR jsonb_array_length(fa.righe) = 0)
  AND jsonb_typeof(fx.parsed_data->'linee') = 'array'
  AND jsonb_array_length(fx.parsed_data->'linee') > 0;