---
name: polizze
description: Sezione Polizze con calendario scadenze e promemoria 10gg per polizze costi di gara e di commessa
type: feature
---
- Pagina `/polizze` (sidebar "Polizze", icona ShieldCheck) raccoglie tutti i `documenti_acquisto` di tipo Polizza (campo `tipo_documento='Polizza'` o fallback regex su descrizione/ai_summary/file_name: `polizz|fideiussor|cauzion`).
- Categorie: **gara** (centro CO*), **commessa** (centro o CIG non vuoto), **altre**.
- DB: `documenti_acquisto` ha `tipo_documento text` e `data_scadenza text` (ISO YYYY-MM-DD). Indici su entrambi.
- Estrazione AI: `parse-documento-acquisto` e `parse-spesa-commessa` restituiscono anche tipo_documento+data_scadenza. Per documenti pre-esistenti senza scadenza: edge function `extract-polizza-scadenza` che riusa `parsed_text` salvato in DB.
- UI: tabella ultra-compatta + calendario shadcn con modifiers expired/imminent/future, banner riassuntivo con conteggi, lista prossime scadenze 60gg, editing inline `data_scadenza` via popover Calendar.
- Threshold promemoria: REMINDER_DAYS=10 (rosso=scaduto, ambra ≤10gg, secondary >10gg).
