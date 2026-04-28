---
name: Importo da Pagare Professionisti
description: Per fornitori con ritenute il bonifico bancario riguarda imponibile+cassa-ritenute, non il totale lordo
type: feature
---
Quando una fattura di acquisto ha `ritenute > 0` (tipicamente professionisti), l'importo del bonifico bancario corrisponde a `imponibile + cassa - ritenute` (importo "da pagare"), non al totale lordo della fattura.

**Applicato in:**
- `src/hooks/useBankData.ts` → `scoreMatch` confronta il movimento sia con `totale` sia con `daPagare`, prendendo il diff minore.
- `src/pages/Banche.tsx` → `selectedTotal` somma `daPagare` per gli acquisti con ritenute; la picker di riconciliazione mostra l'importo da pagare con etichetta "lordo X" sotto, quando ritenute > 0.

Per i costi commessa (CommessaDetailSheet) si continua a usare `imponibile + cassa` come da regola "Calcolo Costi Professionisti" — quello rappresenta il costo, non l'esborso.
