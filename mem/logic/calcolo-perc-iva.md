---
name: Calcolo % IVA acquisti
description: Per le fatture acquisto la % IVA si calcola su (imponibile + cassa) per gestire correttamente i professionisti
type: logic
---
La colonna "% IVA" in Acquisti usa `imposta / (imponibile + cassa)` arrotondato.
Motivo: per i professionisti l'IVA 22% si applica alla base imponibile maggiorata della cassa previdenziale (es. 4%). Senza considerare la cassa, il rapporto darebbe ~23% invece di 22%.
