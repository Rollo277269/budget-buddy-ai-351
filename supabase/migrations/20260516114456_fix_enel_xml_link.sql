-- Riallinea l'XML ENEL del 12/05/2026 alla nuova fattura 2026-166 appena creata
UPDATE public.fatture_xml
SET invoice_key = '2026-166'
WHERE id = '166724b4-0cce-473f-9699-93e4f7d46d98';
