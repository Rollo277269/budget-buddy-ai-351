---
name: IVA — nessun calcolo teorico
description: Le fatture con imposta=0 NON devono mai generare IVA teorica (no 22% su imponibile, no somma righe). Attenersi solo agli importi caricati.
type: logic
---
Le fatture (vendita o acquisto) con `imposta=0` e `imponibile>0` sono operazioni in reverse charge / split / non soggette già correttamente fatturate senza IVA. Il consorzio NON deve auto-applicare IVA teorica perché ribalta a sua volta in reverse charge al cliente finale.

Regola: in tutta la pagina IVA usare esclusivamente `imposta` come stoccato in DB. Nessuna colonna "IVA Art.17", nessun calcolo `imponibile * 0.22`, nessuna somma `righe[].imposta` per fatture con imposta=0.
