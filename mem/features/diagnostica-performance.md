---
name: diagnostica-performance
description: Pagina /diagnostica con Core Web Vitals (LCP/FCP/TTFB/INP/CLS) raccolti via web-vitals e persistiti su tabella web_vitals
type: feature
---
- Logger in `src/lib/webVitalsLogger.ts` registra metriche su tabella `web_vitals` (insert anon).
- Avvio differito via requestIdleCallback in AppLayout per non rallentare il first paint.
- Pagina `/diagnostica` mostra: KPI p75 + media per metrica, tabella media per pagina (color-coded good/needs-improvement/poor con soglie web.dev), ultime 30 misurazioni.
- Soglie: LCP 2500/4000ms, FCP 1800/3000, TTFB 800/1800, INP 200/500, CLS 0.1/0.25.
- Voce sidebar "Diagnostica" (icona Activity), titolo header "Diagnostica Performance".
- Pulsante "Svuota" cancella tutte le metriche raccolte (richiede conferma).