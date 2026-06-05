## Obiettivo

Aggiungere una pagina dedicata **"Budget"** che presenta un **bilancio annuale previsionale rolling 12 mesi**, costruito secondo uno schema misto:

- **Conto Economico riclassificato a margine di contribuzione** (gestionale, OIC 11/ESMA-friendly, distingue costi fissi/variabili) per la dimensione economica
- **Prospetto di cash flow mensile** (ispirato a OIC 10 — metodo diretto) per la dimensione finanziaria/di tesoreria

L'output non sostituisce il bilancio civilistico ma lo affianca come strumento di **controllo di gestione e pianificazione finanziaria**, in linea con la prassi consigliata da CNDCEC e Codice della Crisi (D.Lgs. 14/2019, art. 3) che impone alle imprese assetti adeguati per rilevare tempestivamente la crisi anche tramite **budget di tesoreria a 12 mesi**.

## Schema di rappresentazione

### 1. Conto Economico previsionale riclassificato (mensile, 12 colonne + Totale)

```text
                                M-0   M+1   ...   M+11   TOT 12m
RICAVI
  Ricavi da commesse aperte      ...
  Altri ricavi (storico)         ...
  ─────────────────────────────────────
  A. Totale ricavi               ...
COSTI VARIABILI / DIRETTI
  Costi diretti commessa         ...
  Sub-appalti                    ...
  ─────────────────────────────────────
  B. Margine di contribuzione    ...   (% sui ricavi)
COSTI FISSI / STRUTTURA
  Personale                      ...
  Utenze, locazioni              ...
  Servizi professionali          ...
  Polizze (quote)                ...
  ─────────────────────────────────────
  C. EBITDA                      ...
  Ammortamenti / interessi finanz. ...
  ─────────────────────────────────────
  D. Risultato ante imposte      ...
```

### 2. Cash Flow previsionale (mensile)

```text
                                M-0   M+1   ...   M+11
Saldo iniziale liquidità         ...
(+) Incassi da clienti           ...   (scadenzario vendite)
(−) Pagamenti fornitori          ...   (scadenzario acquisti)
(−) Rate finanziamenti           ...
(+) Rate crediti fiscali         ...
(−) Polizze                      ...
(−) Stipendi / IVA / imposte     ...   (stima da storico)
─────────────────────────────────────
= Saldo finale liquidità         ...
```

## Fonti dati (incrociate)

| Voce previsionale | Fonte primaria | Logica |
|---|---|---|
| Ricavi da commesse aperte | CSSR `commessa_data` + `fatture_vendita` | Importo residuo commessa = importo contrattuale − già fatturato; distribuito linearmente sui mesi residui (data odierna → data scadenza contratto). |
| Altri ricavi | `fatture_vendita` storico ultimi 3 anni | Media mensile per centro di ricavo escludendo commesse CIG. |
| Costi diretti commessa | `fatture_acquisto` con CIG associato + media storica | Stimati come % sui ricavi residui di commessa (markup medio rilevato). |
| Costi struttura | `fatture_acquisto` storico per centro di costo (escl. CIG) | Media mensile ultimi N anni, stagionalizzata se rilevante. |
| Incassi attesi | `fatture_vendita` aperte + commesse aperte | Da `scadenza` (o data fattura) e stato non riconciliato. |
| Pagamenti attesi | `fatture_acquisto` aperte | Idem dal lato passivo. |
| Rate finanziamenti | `rate_finanziamento` pagata=false su conti tipo `finanziamento` | Importo rata su `data_scadenza`. |
| Rate crediti fiscali | `rate_finanziamento` su conti tipo `crediti_fiscali` | Come sopra ma a segno positivo. |
| Polizze | `documenti_acquisto` tipo Polizza | Premio sulla `data_scadenza`. |
| Liquidità iniziale | `bank_movements` ultimo saldo per conto | Saldo aggregato corrente. |

## UI/UX

Nuova voce sidebar **"Budget"** (icona `TrendingUp`) tra "Bilancio" e "IVA".

Pagina con 3 sezioni in tab:

1. **Conto Economico previsionale** — tabella ultra-compatta 13 colonne (M-0…M+11 + Totale 12m), righe espandibili per drill-down (es. dettaglio commesse che generano la riga "Ricavi da commesse"), confronto con consuntivo stesso periodo anno precedente.
2. **Cash Flow previsionale** — tabella + grafico a barre stacked (in/out) con linea del saldo cumulato. ReferenceLine a 0 e segnalazione mesi con saldo previsto negativo (alert tesoreria).
3. **Parametri & assunzioni** — pannello con sliders/input modificabili: anni storico (1-5), % markup medio sui ricavi di commessa, modalità distribuzione ricavi commessa (lineare / a curva S / personalizzata), inflazione costi struttura (+%), override manuale per singole voci salvati in tabella `budget_assumptions`.

Toolbar: selettore mese di partenza (default = corrente), pulsante "Ricalcola", export PDF/Excel del prospetto.

## Dettagli tecnici

### File da creare
- `src/pages/Budget.tsx` — pagina principale con i 3 tab
- `src/components/budget/ContoEconomicoPrevisionale.tsx`
- `src/components/budget/CashFlowPrevisionale.tsx`
- `src/components/budget/BudgetAssumptionsPanel.tsx`
- `src/hooks/useBudgetData.ts` — aggrega dati da `useInvoiceData`, `useCssrCommesse`, `useRateFinanziamento`, `useBankData`, `useDocumentiAcquisto` e produce le righe del CE e del cash flow rolling 12 mesi
- `src/lib/budgetEngine.ts` — funzioni pure: `buildRollingMonths`, `forecastCommessaRevenue`, `forecastHistoricalAverages`, `buildCashFlowSchedule`, `applyAssumptions`

### Modifiche
- `src/App.tsx` — route `/budget`
- `src/components/AppSidebar.tsx` — voce menu + prefetch

### Nuova tabella DB
`budget_assumptions` — salva override e parametri (anno_orizzonte, markup %, inflazione %, override per voce/mese in JSON). RLS authenticated full access, in linea con le altre tabelle.

### Calcoli chiave (in `budgetEngine.ts`)
- **Mesi rolling**: `Array.from({length:12}, (_,i) => addMonths(start, i))`
- **Residuo commessa**: `importo_contrattuale − Σ fatture_vendita(cig).imponibile`. Distribuzione lineare sui mesi tra `today` e `min(data_scadenza_contratto, M+11)`.
- **Media storica per voce**: per ogni centro di costo, calcola `Σ fatture ultimi N anni / (N × 12)`; applica fattore inflazione.
- **Cash flow**: usa date di scadenza già parsate da `paymentTerms.ts`; somma per mese; aggiungi saldo iniziale cumulativo.

### Coerenza con il progetto
- Tabelle ultra-compatte (text-xs, h-8) come da memoria progetto
- Format `it-IT` per valute
- `ReferenceLine` a 0 sui grafici
- Paginazione `.range()` se servono query >1000 righe
- Dati cachati via React Query, ricaricati on-demand

## Cosa NON include questa iterazione
- Bilancio civilistico ex art. 2425 c.c. (lasciato a integrazione futura se richiesto, perché richiede mappature contabili formali non presenti oggi).
- Scenari multipli (best/worst case) — proponibili in seconda fase.
- Previsione IVA periodica dettagliata (rinviata, già presente sezione IVA).
