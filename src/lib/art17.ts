import type { SaleInvoice } from "@/hooks/useInvoiceData";

/**
 * IVA teorica di una vendita in reverse charge / Art.17.
 * Riconosciuta quando l'imposta a livello fattura è 0 ma le righe contengono
 * un importo IVA scorporato. Restituisce la somma di righe[].imposta in valore assoluto.
 */
export function art17SalesIva(s: SaleInvoice): number {
  if ((s.imposta || 0) !== 0) return 0;
  if (!s.imponibile || s.imponibile <= 0) return 0;
  if (!Array.isArray(s.righe) || s.righe.length === 0) return 0;
  return s.righe.reduce((sum, r: any) => sum + Math.abs(Number(r?.imposta) || 0), 0);
}