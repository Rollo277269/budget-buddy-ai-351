---
name: Inline EditableText (admin)
description: Componente EditableText e tabella ui_text_overrides per editing inline dei testi statici riservato agli admin
type: feature
---
Sistema di editing inline visivo per testi statici della UI.

- Tabella: `ui_text_overrides (key UNIQUE, value)` con RLS lettura pubblica e scrittura `is_admin()`.
- Provider globale: `<TextOverridesProvider>` in `src/App.tsx` carica tutti gli override all'avvio.
- Componente: `<EditableText textKey="..." as="h2">Default</EditableText>` da `src/components/EditableText.tsx`.
  - Admin: doppio clic → input inline; Enter/blur salva (upsert), Esc annulla. Toast feedback.
  - Non-admin: rendering statico del testo (override o default).
- `StatCard` accetta prop `editKey` che genera chiavi `statcard.<editKey>.title` / `.subtitle`.
- Applicato attualmente al Cruscotto (`src/pages/Index.tsx`): titoli sezione + StatCard.
- Per estendere ad altre pagine: avvolgere i testi statici in `<EditableText textKey="pagina.elemento">…</EditableText>` con chiavi stabili.