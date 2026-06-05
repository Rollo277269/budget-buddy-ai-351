---
name: Bilancio previsionale (Budget)
description: Pagina /budget con CE riclassificato a margine di contribuzione + cash flow rolling 12 mesi
type: feature
---
- Route: `/budget`, voce sidebar "Budget" tra Bilancio e IVA
- Schema misto: CE riclassificato gestionale (OIC 11) + cash flow metodo diretto (OIC 10)
- Orizzonte: rolling 12 mesi a partire dal mese corrente (modificabile)
- Fonti dati:
  - Ricavi commesse aperte: CSSR `commessa_data` − già fatturato (per CIG), distribuito linearmente fino a `data_scadenza_contratto`
  - Altri ricavi/costi struttura: media mensile storica (parametro anni 1-5)
  - Costi diretti: % parametrica sui ricavi commesse (markup)
  - Cash flow: scadenzario vendite/acquisti aperti + rate finanziamento + polizze + saldo iniziale da bank_movements
- Assunzioni salvate in localStorage chiave `budget-assumptions-v1` (anni storico, inflazione%, % costi diretti, mese start, override per cella)
- File: `src/lib/budgetEngine.ts`, `src/hooks/useBudgetData.ts`, `src/pages/Budget.tsx`, `src/components/budget/*`
- Riferimento normativo: D.Lgs. 14/2019 art. 3 (Codice della Crisi - budget di tesoreria 12 mesi)