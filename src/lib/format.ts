/**
 * Aggiunge il separatore delle migliaia (punto) alla parte intera di un numero.
 * Intl con locale it-IT non lo fa per numeri < 10.000, quindi usiamo un approccio manuale.
 */
function addThousandsSeparator(intPart: string): string {
  // Handle negative numbers
  const isNeg = intPart.startsWith("-");
  const digits = isNeg ? intPart.slice(1) : intPart;
  const result = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return isNeg ? `-${result}` : result;
}

/**
 * Formatta un numero come valuta EUR con separatore migliaia e 2 decimali.
 * Es: 1234567.8 → "1.234.567,80 €"  |  3520.23 → "3.520,23 €"
 */
export function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const formatted = `${addThousandsSeparator(intPart)},${decPart} €`;
  return n < 0 ? `-${formatted}` : formatted;
}

/**
 * Formatta un numero con separatore migliaia e 2 decimali (senza simbolo valuta).
 * Es: 1234567.8 → "1.234.567,80"
 */
export function formatNumber(n: number): string {
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const formatted = `${addThousandsSeparator(intPart)},${decPart}`;
  return n < 0 ? `-${formatted}` : formatted;
}
