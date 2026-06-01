## Problema

Nel pannello di dettaglio fattura (`InvoiceDetailSheet`, aperto cliccando una riga in Vendite/Acquisti) non vengono mostrate le righe della fattura né c'è modo di assegnare il centro di costo/ricavo. Nelle tabelle principali invece le righe sono espandibili e ogni riga ha già il suo `CentroCell`.

## Soluzione

Estendere `src/components/InvoiceDetailSheet.tsx` aggiungendo due blocchi, senza toccare la logica delle pagine:

### 1. Sezione "Righe fattura"
Tabella compatta (stesso stile delle righe espanse in Vendite/Acquisti) con colonne:
- N° riga
- Descrizione
- Imponibile
- IVA (azzerata se l'header ha `imposta = 0`, coerente con la logica esistente)
- Totale
- CIG (fallback su CIG header)
- Centro Ricavo (per vendite) / Centro Costo (per acquisti) tramite `<CentroCell>`

Chiave assegnazione per riga: `${anno}-${numero}-${idx}` (vendite) e `${anno}-${numero}-${idx}` (acquisti), identica a quella già usata nelle tabelle principali — così le assegnazioni fatte dal pannello sono coerenti e visibili anche nella tabella.

Per le vendite si usa `getIssuedInvoiceRows()` per filtrare le righe come già fa la pagina. Se la fattura ha una sola riga, mostriamo comunque la tabella (con quella riga) per consentire l'assegnazione del centro.

### 2. Centro a livello header
Se la fattura non ha righe multiple significative, mostriamo un `<CentroCell>` anche nella sezione "Dettagli" con chiave `${anno}-${numero}` — è la chiave già usata dalla tabella quando non ci sono righe espanse.

### Wiring

Dentro `InvoiceDetailSheet`:
- `const { centri } = useCentriData();`
- `const ricavoMap = useCentroMap("ricavo", "vendite");`
- `const costoMap = useCentroMap("costo", "acquisti");`
- Scegliere mappa/tipo in base alla prop `type`.

Nessuna modifica a hooks, DB o pagine: i dati righe sono già in `invoice.righe` e le mappe centro sono cache-aware, quindi si aggiornano automaticamente in tutta l'app.

## File toccati

- `src/components/InvoiceDetailSheet.tsx` — unica modifica.
