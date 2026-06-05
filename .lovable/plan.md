## Obiettivo
Aggiungere una sezione **Soci** che mostri, per ogni soggetto in Rubrica con `tipo='socio'`, gli aggregati economici dell'anno selezionato.

## Navigazione
- Nuova route `/soci` in `src/App.tsx` (lazy import).
- Voce **Soci** in `src/components/AppSidebar.tsx` (icona `Users2`), posizionata accanto a Rubrica, con prefetch.

## Pagina `src/pages/Soci.tsx`
Layout standard come le altre pagine (header dinamico già globale, contenuto compatto):

- **Toolbar**: selettore Anno (riusa pattern già presente in Bilancio/IVA).
- **Tabella** ultra-compatta (text-xs, h-8, px-2 py-1) ordinata per denominazione:

| Socio | Vendite (crediti) | Acquisti (debiti) | IVA T1 | IVA T2 | IVA T3 | IVA T4 | IVA totale |
|---|---|---|---|---|---|---|---|

- Riga **Totale** sticky in fondo.
- Click sulla denominazione → apre `SchedaSoggettoSheet` esistente.
- Formato valuta italiano via `formatCurrency`.

## Logica di calcolo (inline nella pagina, niente nuovi hook)
Sorgenti già disponibili: `useRubrica`, `useInvoiceData` (allSales, allPurchases).

Per ogni socio (match per `denominazione` case-insensitive, fallback su `partita_iva`):

- **Vendite (crediti)** = somma `totale` di `fatture_vendita` dove `cliente` = socio e `anno` = anno scelto.
- **Acquisti (debiti)** = somma `totale` di `fatture_acquisto` dove `fornitore` = socio e `anno` = anno scelto.
- **IVA reverse trimestrale (T1..T4)** = somma `imposta` delle `fatture_acquisto` dello stesso socio, raggruppate per trimestre della `data` fattura (mese 1-3, 4-6, 7-9, 10-12).
- **IVA totale** = somma dei 4 trimestri.

Le note di credito (TD04, importi negativi) sono già normalizzate nei dati: vengono semplicemente sommate algebricamente.

## Out of scope
- Nessuna nuova tabella DB, nessuna migrazione.
- Nessuna modifica alla logica di import Rubrica (i soci sono già auto-etichettati).
- Nessun cambiamento ad altre pagine.

## File toccati
- **Nuovo**: `src/pages/Soci.tsx`
- **Edit**: `src/App.tsx`, `src/components/AppSidebar.tsx`
