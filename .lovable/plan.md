
## Piano: Allineare i nomi nella sidebar ai titoli delle pagine

### Differenze trovate

| Route | Sidebar (attuale) | Titolo pagina (header) |
|---|---|---|
| `/` | Cruscotto | Offerte |
| `/lista-commesse` | Commesse | Lista Commesse |
| `/schede-contabili` | Schede Contabili | *(nessun titolo definito, fallback "Offerte")* |
| `/bilancio` | Bilancio | *(nessun titolo definito, fallback "Offerte")* |
| `/offerte` | Offerte | *(nessun titolo definito, fallback "Offerte")* |

### Modifiche

1. **`src/components/AppSidebar.tsx`** — Aggiornare i titoli nella sidebar:
   - "Cruscotto" → "Offerte"
   - "Commesse" → "Lista Commesse"

2. **`src/components/AppLayout.tsx`** — Aggiungere le voci mancanti in `pageTitles` per coerenza:
   - `/schede-contabili` → "Schede Contabili"
   - `/bilancio` → "Bilancio"
   - `/offerte` → "Offerte"
