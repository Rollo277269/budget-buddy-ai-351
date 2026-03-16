ALTER TABLE public.bank_reconciliations 
  ADD COLUMN documento_id uuid REFERENCES public.documenti_acquisto(id) ON DELETE CASCADE,
  ALTER COLUMN invoice_anno DROP NOT NULL,
  ALTER COLUMN invoice_numero DROP NOT NULL,
  ALTER COLUMN invoice_type DROP NOT NULL;

-- Allow either invoice-based or document-based reconciliation
ALTER TABLE public.bank_reconciliations 
  ADD CONSTRAINT reconciliation_type_check 
  CHECK (
    (documento_id IS NOT NULL) OR 
    (invoice_type IS NOT NULL AND invoice_anno IS NOT NULL AND invoice_numero IS NOT NULL)
  );