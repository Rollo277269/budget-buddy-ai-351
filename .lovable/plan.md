## Obiettivo
Aggiungere una sezione **Polizze** che raccoglie tutti i documenti PDF di tipo polizza (sia costi di gara CO* sia costi di commessa) già caricati come `documenti_acquisto`, ne legge la scadenza tramite AI e la mostra in un calendario con promemoria a 10 giorni.

## Modifiche

### 1. Database (migrazione)
Aggiunta a `documenti_acquisto` di due colonne opzionali:
- `tipo_documento text` — etichetta AI (es. "Polizza", "Bollo", "ANAC", "Fattura", "Ricevuta")
- `data_scadenza text` — data scadenza polizza in formato `YYYY-MM-DD` (null se non rilevante / non trovata)

Nessun GRANT/RLS extra: tabella già pubblica.

### 2. AI: estrazione tipo + scadenza
Aggiornate entrambe le edge function:
- `parse-documento-acquisto` (upload da Acquisti > Ricevute)
- `parse-spesa-commessa` (upload da dettaglio commessa)

Il tool schema espone due nuovi campi:
- `tipo_documento`: enum guidato (`"Polizza" | "Bollo" | "ANAC" | "Fattura" | "Ricevuta" | "Nota Spese" | "Altro"`)
- `data_scadenza`: data di scadenza della polizza in `DD/MM/YYYY`, vuota se il documento non è una polizza o se la scadenza non è leggibile

Prompt aggiornato: per le polizze cercare diciture "Scadenza", "Valida fino al", "Data scadenza", "Fine copertura".

Hook `useDocumentiAcquisto` e `DocumentoAiReviewDialog` propagano e permettono di rivedere i due nuovi campi prima del salvataggio.

`CommessaExpenseUpload` salva i nuovi campi nell'insert su `documenti_acquisto`.

### 3. Nuova pagina `/polizze`
Voce sidebar **"Polizze"** (icona `ShieldCheck`) inserita tra Scadenzario e Acquisti.

Layout `src/pages/Polizze.tsx` a due pannelli:

**A. Elenco polizze** (tabella ultra-compatta nello stile del progetto)
- Filtro: tutte le `documenti_acquisto` con `tipo_documento = 'Polizza'` **oppure** con `descrizione`/`ai_summary` che contengono "polizz" (fallback per docs vecchi).
- Suddivise visivamente per categoria centro:
  - **Costi di gara** — `centro_costo` con prefisso `CO`
  - **Costi di commessa** — gli altri centri costo associati a una commessa (qualunque `cig` non vuoto)
  - **Altre** — senza centro/CIG
- Colonne: Fornitore, Descrizione, CIG (cliccabile → CommessaDetailSheet), Centro, Data documento, **Scadenza**, Giorni residui (badge: rosso scaduta, ambra ≤10 giorni, verde >10), Importo, Azioni (apri PDF, "Estrai scadenza con AI" per documenti polizza senza `data_scadenza`).
- Editing inline della `data_scadenza` (date picker shadcn) per correzioni manuali.

**B. Calendario scadenze**
- Componente `Calendar` di shadcn (mode="single") con `modifiers` per evidenziare i giorni con scadenza polizza:
  - `expired` (rosso), `imminent` (ambra, ≤10gg), `future` (azzurro).
- Sotto al calendario: lista delle scadenze nei prossimi 60 giorni ordinate per data, con countdown "tra N giorni" / "scaduta da N giorni".
- Banner in testa alla pagina con conteggio delle polizze **in scadenza entro 10 giorni** e **scadute**.

### 4. Bottone "Estrai scadenza"
Per polizze già caricate prima di questa modifica (senza `data_scadenza`), un bottone per riga scarica il `parsed_text` già salvato in DB e chiama una nuova edge function leggera `extract-polizza-scadenza` (solo `data_scadenza` + `tipo_documento`) per popolare i campi senza re-caricare il file.

### 5. Memoria
Aggiunta voce in `mem://index.md`: `[Polizze](mem://features/polizze) — Elenco polizze (costi gara + commessa) con calendario scadenze e promemoria 10gg`.

## Note tecniche
- Le date in ingresso (`DD/MM/YYYY`) sono normalizzate a ISO `YYYY-MM-DD` prima dell'insert per ordinamento corretto.
- Il calendario riusa stessi token semantici (`destructive`, `warning`/`amber`, `primary`) già usati nello Scadenzario.
- Nessuna modifica al flusso CIG/commessa esistente: le polizze restano `documenti_acquisto` standard e continuano a comparire in Acquisti > Ricevute e nelle commesse linkate.
