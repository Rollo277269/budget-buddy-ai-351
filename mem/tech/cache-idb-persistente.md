---
name: Cache IndexedDB persistente
description: Stale-while-revalidate cache via IDB per centri/categorie/fatture, hydrate al boot
type: feature
---
- Wrapper in `src/lib/idbCache.ts` (DB `fastcache`, store `kv`, envelope con `CACHE_VERSION`).
- Chiavi in `CACHE_KEYS`: `centri`, `categorie`, `sales`, `purchases`.
- `hydrateInvoicesFromIdb()` e `hydrateCentriFromIdb()` chiamati in `AppLayout` PRIMA di `schedulePrefetch()`.
- Stale-while-revalidate: `useInvoiceData` mostra subito i dati IDB e in background rifetcha dal DB se `cacheNeedsRevalidation`.
- Bump `CACHE_VERSION` quando cambia lo shape dei dati per invalidare tutto.
- UI: Diagnostica mostra timestamp ultimo aggiornamento per chiave + pulsante "Svuota cache locale".
