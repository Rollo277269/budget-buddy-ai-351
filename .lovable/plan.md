

## Piano: Spostare Scadenzario come pagina autonoma nella sidebar

### Cosa cambia

1. **Nuova pagina `src/pages/Scadenzario.tsx`** — Estrae il componente `ScadenzarioTab` da Strumenti in una pagina dedicata, con tutti i tipi e le colonne necessarie (`ScadenzaRow`, `scadenzaCols`, `parseDate`, `ScadenzarioTab`).

2. **`src/pages/Strumenti.tsx`** — Rimuove la tab "Scadenzario" (righe 758-899 circa) e riduce la griglia tabs da 4 a 3 colonne (`grid-cols-3`).

3. **`src/components/AppSidebar.tsx`** — Aggiunge la voce "Scadenzario" con icona `CalendarClock` subito dopo "Dashboard" (posizione 2 nell'array).

4. **`src/App.tsx`** — Aggiunge la route `/scadenzario` con il nuovo componente.

5. **`src/components/AppLayout.tsx`** — Aggiunge `"/scadenzario": "Scadenzario"` alla mappa `pageTitles`.

### Struttura sidebar risultante
```text
Dashboard
Scadenzario    ← NUOVO
Vendite
Acquisti
Banche
Commesse
Analisi per Commessa
Strumenti
```

