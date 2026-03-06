/**
 * Formatta un numero come valuta EUR con separatore migliaia e 2 decimali.
 * Es: 1234567.8 → "€ 1.234.567,80"
 */
export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Formatta un numero con separatore migliaia e 2 decimali (senza simbolo valuta).
 * Es: 1234567.8 → "1.234.567,80"
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
