---
name: Preferenza XML su PDF
description: Per le fatture (acquisto/vendita) l'XML è la fonte autoritativa rispetto al PDF, eccetto le fatture-spese (documenti_acquisto extra)
type: preference
---
Quando una fattura è disponibile sia come XML (FatturaPA) sia come PDF, i dati dell'XML sono la fonte autoritativa (importo, data, numero documento, CIG, righe).

Eccezione: per le "fatture spese" / documenti_acquisto extra (non fiscali) il PDF resta la fonte primaria.

**Why:** L'XML SDI contiene dati strutturati e ufficiali; il parsing PDF via AI può sbagliare importi (es. confonde premio con somma assicurata).

**How to apply:**
- L'auto-create da XML deve creare nuova fattura_acquisto se non c'è match esatto (per importo) con riga esistente.
- `findPurchaseMatch` deve richiedere obbligatoriamente match di importo (già implementato): name+numero+anno SENZA amount NON è sufficiente per associare.
- Se un PDF è già stato importato ma poi arriva l'XML con dati diversi, l'XML deve prevalere — l'utente va avvisato del conflitto.