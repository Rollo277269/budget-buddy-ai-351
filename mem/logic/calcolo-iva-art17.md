---
name: IVA Art.17 / Split — calcolo
description: Acquisti con imposta=0 NON generano IVA teorica. Vendite con imposta=0 ma righe[].imposta>0 sono Art.17 reverse charge: IVA letta dalle righe e contabilizzata come split (debito + credito neutri).
type: logic
---
**Acquisti**: usare solo `imposta` come da fattura. Nessun calcolo `imponibile * 0.22`, nessuna somma righe.

**Vendite Art.17 (reverse charge)**: invoice `imposta=0` ma `imponibile>0` con `righe[].imposta>0`. La somma di `righe[].imposta` rappresenta l'IVA teorica scorporata; va aggiunta sia a `ivaSplitDebito` sia a `ivaSplitCredito` (operazione neutra) e mostrata nella tabella "IVA Split Payment / Art.17 per cliente".

**Vendite split payment** (scissione pagamenti): rilevate via `isSplitPayment()`. L'imposta a livello fattura va in `ivaSplitDebito` (e mostrata nella stessa tabella).

Helper: `art17SalesIva(s)` in `src/pages/Iva.tsx`.
