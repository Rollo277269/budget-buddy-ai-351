

# Piano: Intestazione con logo, piè di pagina con numero pagina e timestamp nel PDF

## Cosa fare

### 1. Aggiungere un logo placeholder nell'intestazione PDF
- Modificare il blocco `.pdf-header` in `CommessaDetailSheet.tsx` per includere un'immagine logo (SVG inline o placeholder) allineata a sinistra, con titolo e metadati a destra.
- Il logo sarà un placeholder professionale (icona aziendale stilizzata) che l'utente potrà sostituire con il proprio.

### 2. Aggiungere piè di pagina con numero pagina e timestamp
- Utilizzare le regole CSS `@page` con `@bottom-center` / `@bottom-right` per il numero pagina tramite `counter(page)` e `counter(pages)`.
- Poiché il supporto `@page` margin boxes è limitato nei browser, l'approccio più affidabile è aggiungere un elemento `.pdf-footer` con `position: fixed; bottom: 0` che viene ripetuto su ogni pagina stampata.
- Il footer conterrà: a sinistra il nome dell'azienda, al centro il timestamp di esportazione, a destra "Pagina X di Y" (con CSS `counter(page)`).

### 3. File da modificare

**`src/components/CommessaDetailSheet.tsx`**
- Ristrutturare `.pdf-header` con layout a 2 colonne: logo SVG a sinistra + titolo/meta a destra
- Aggiungere un `<div className="pdf-footer">` alla fine del `.pdf-report` con timestamp e testo pagina

**`src/index.css`**
- Stili per `.pdf-header` con layout flex logo + testo
- Stili per `.pdf-footer` con `position: fixed; bottom: 0` per ripetersi su ogni pagina
- Aggiungere `padding-bottom` al body per evitare sovrapposizione contenuto/footer
- Usare CSS `content: counter(page)` per numerazione automatica

### Note tecniche
- `position: fixed` in `@media print` fa apparire l'elemento su ogni pagina stampata (supportato da Chrome/Edge/Safari)
- Per "Pagina X di Y": `counter(page)` funziona, `counter(pages)` ha supporto limitato — useremo solo `counter(page)` oppure il timestamp come riferimento
- Il logo sarà un SVG inline semplice che l'utente potrà personalizzare

