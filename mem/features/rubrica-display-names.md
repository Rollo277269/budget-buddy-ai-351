---
name: Rubrica come fonte di verità per le denominazioni
description: Cliente/fornitore/cedente in fatture e documenti vengono normalizzati alla denominazione presente in Rubrica
type: feature
---
Al caricamento dei dati (`useInvoiceData`, `useDocumentiAcquisto`, `useXmlInvoices`) i campi `cliente`, `fornitore`, `cedente_denominazione`, `cessionario_denominazione` vengono sostituiti con la denominazione esatta presente in Rubrica.

Matching: prima per Partita IVA (quando disponibile), poi fallback per nome normalizzato (case-insensitive, spazi compressi). Se nessun match, viene preservato il nome originale.

Helper: `buildRubricaResolver(contatti)` (non-React) e hook `useRubricaName()` in `src/hooks/useRubricaName.ts`. Utilizzano `loadRubrica()` esportata da `src/hooks/useRubrica.ts`.

Conseguenze: tutte le tabelle, grafici, filtri e dettagli mostrano la denominazione "ufficiale" della Rubrica senza dover toccare le singole UI. La cache va invalidata (refresh anno o reload) per riflettere le modifiche fatte in Rubrica.