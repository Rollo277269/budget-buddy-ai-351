

## Associazione manuale XML non associati con suggerimenti

### Obiettivo
Quando un XML non è associato automaticamente, permettere all'utente di associarlo manualmente a una fattura esistente, mostrando suggerimenti plausibili basati su criteri di somiglianza (importo, data, cliente/fornitore).

### Approccio

**1. Funzione di scoring dei suggerimenti** (in `useXmlInvoices.ts` o utility separata)
- Per ogni XML non associato, confrontare con le fatture non ancora associate a un XML
- Criteri di scoring:
  - **Importo totale** simile (±5%) → peso alto
  - **Data fattura** vicina (±30 giorni) → peso medio
  - **Nome cliente/fornitore** contenuto nella denominazione cedente/cessionario (fuzzy match semplice) → peso alto
  - **Anno** corrispondente → peso base
- Restituire top 5 suggerimenti ordinati per score

**2. UI nell'`XmlInvoiceSheet`** — Nuova sezione per XML non associati
- Se `record.matched === false`, mostrare una sezione "Associa a fattura" con:
  - Lista dei suggerimenti con score/motivazione (es. "Importo simile", "Stesso cliente")
  - Ogni suggerimento cliccabile → chiama `manualMatch`
  - Combobox di ricerca per associazione libera (numero/anno) come fallback

**3. Passare dati necessari al componente**
- `XmlInvoiceSheet` riceverà la lista fatture e la callback `onManualMatch`
- Il calcolo dei suggerimenti avviene lato client confrontando i metadati XML con le fatture

### File da modificare
- `src/components/XmlInvoiceSheet.tsx` — aggiungere sezione suggerimenti + combobox
- `src/pages/Vendite.tsx` — passare `sales`, `manualMatch`, `xmlMap` al sheet
- `src/pages/Acquisti.tsx` — stessa modifica

