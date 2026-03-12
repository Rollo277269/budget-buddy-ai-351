

## Piano: Filtrare righe saldo iniziale/finale e migliorare parsing PDF estratti conto

### Problema
Quando si carica un estratto conto PDF, vengono importate anche righe non pertinenti (saldo iniziale, saldo finale, intestazioni, footer) che non sono movimenti bancari reali.

### Modifiche

**File: `src/hooks/useBankData.ts`**

1. **Nella funzione `parseBank`** — aggiungere un filtro che esclude le righe il cui campo descrizione contiene pattern tipici di saldo iniziale/finale:
   - "saldo iniziale", "saldo finale", "saldo al", "saldo contabile", "saldo disponibile", "totale movimenti", "saldo precedente", "riporto"
   
2. **Nella funzione `parseBank`** — aggiungere un controllo che la riga contenga una data valida nella colonna data (formato `DD/MM/YYYY` o serial Excel). Le righe senza data valida nella prima colonna vengono escluse, poiché i movimenti bancari hanno sempre una data operazione.

3. **Nella funzione `parsePdfToRows`** — filtrare preventivamente le righe che sono chiaramente header/footer di pagina ripetuti (es. righe con solo "Pagina X di Y", nome banca ripetuto, IBAN).

### Dettagli tecnici

Dopo la riga 194 (`if (importo === 0 && !desc) continue;`), aggiungere:

```typescript
// Skip saldo iniziale/finale and summary rows
const descLower = desc.toLowerCase();
const saldoPatterns = ["saldo iniziale", "saldo finale", "saldo al ", "saldo contabile", 
  "saldo disponibile", "totale movimenti", "saldo precedente", "riporto", "saldo liquido"];
if (saldoPatterns.some(p => descLower.includes(p))) continue;

// Skip rows without a valid date (non-movement rows from PDF)
const dataVal = r[cols.data >= 0 ? cols.data : 0];
const dateStr = parseDate(dataVal);
if (!dateStr || !/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) continue;
```

