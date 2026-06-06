---
name: Ruoli utenti
description: Modello di permessi a 2 ruoli (admin/viewer) per app, DB e Storage
type: feature
---
Ruoli: `admin` e `viewer` su tabella `public.user_roles`. Funzione SECURITY DEFINER `is_admin()`.

**Database (RLS sulle tabelle public):**
- Tabelle dati (fatture_vendita, fatture_acquisto, fatture_xml, bank_movements, bank_reconciliations, documenti_acquisto, centro_assignments, commessa_links, rate_finanziamento, rubrica): SELECT + INSERT + UPDATE per `authenticated`; DELETE solo se `is_admin()`.
- Tabelle di configurazione (conti_correnti, centri_cr, categorie_centri, naming_rules, user_roles): tutte le scritture solo admin.

**Storage** (bucket `fatture-xml`, `documenti-acquisto`, `documenti-commesse`): SELECT/INSERT/UPDATE per authenticated, DELETE solo admin.

**Frontend:**
- `useUserRole()` espone `isAdmin`, `isViewer`, `canEdit` (=admin||viewer), `canDelete` (=admin).
- `<AdminOnly>` (e attributo CSS `data-admin-only` su body[data-role="viewer"]) usati SOLO per nascondere azioni distruttive o admin-only (delete riga, "Elimina selezionate", "Rimuovi doppioni", invito utenti, gestione conti/centri).
- Upload, classificazione AI, riassociazione XML/CIG, edit inline restano visibili ai viewer.
- `<AdminRoute>` blocca `/strumenti` e `/diagnostica` per i viewer.
- Badge header "Permessi limitati" per i viewer.