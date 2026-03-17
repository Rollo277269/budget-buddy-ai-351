/**
 * Parses Italian payment terms (scadenza) like:
 * - "Vista fattura" → 0 days
 * - "30 gg Data Fattura" → [30]
 * - "30 gg Fine Mese" → [30] (end of month)
 * - "30-60-90 gg Fine Mese" → [30, 60, 90]
 * - "30-60-90-120-150 gg Data Fattura" → [30, 60, 90, 120, 150]
 * 
 * Returns calculated due dates from the invoice date.
 */

function parseDate(d: string): Date | null {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  const serial = parseFloat(d);
  if (!isNaN(serial) && serial > 30000) {
    return new Date((serial - 25569) * 86400 * 1000);
  }
  return null;
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export interface PaymentInstallment {
  days: number;
  dueDate: Date;
  label: string; // e.g. "Rata 1 di 3"
}

export interface ParsedPaymentTerms {
  installments: PaymentInstallment[];
  lastDueDate: Date;
  /** Total days from invoice date to last installment */
  totalDays: number;
  isFineMese: boolean;
}

/**
 * Parse a scadenza string and compute due dates relative to the invoice date.
 * Returns null if the scadenza cannot be parsed.
 */
export function parsePaymentTerms(
  scadenza: string,
  dataFattura: string
): ParsedPaymentTerms | null {
  if (!scadenza || !dataFattura) return null;

  const invoiceDate = parseDate(dataFattura);
  if (!invoiceDate) return null;

  const s = scadenza.trim().toLowerCase();

  // "Vista fattura" = immediate
  if (s.includes("vista")) {
    return {
      installments: [{ days: 0, dueDate: invoiceDate, label: "Vista fattura" }],
      lastDueDate: invoiceDate,
      totalDays: 0,
      isFineMese: false,
    };
  }

  const isFineMese = s.includes("fine mese");

  // Extract day numbers: "30-60-90 gg" → [30, 60, 90]
  // Also handles "120 gg" → [120]
  const daysMatch = s.match(/^([\d]+(?:-[\d]+)*)\s*gg/);
  if (!daysMatch) return null;

  const dayValues = daysMatch[1].split("-").map(Number).filter((n) => !isNaN(n) && n >= 0);
  if (dayValues.length === 0) return null;

  const installments: PaymentInstallment[] = dayValues.map((days, i) => {
    let dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + days);

    if (isFineMese) {
      dueDate = endOfMonth(dueDate);
    }

    const label = dayValues.length === 1
      ? `${days} gg`
      : `Rata ${i + 1} di ${dayValues.length} (${days} gg)`;

    return { days, dueDate, label };
  });

  const lastDue = installments[installments.length - 1];

  return {
    installments,
    lastDueDate: lastDue.dueDate,
    totalDays: Math.round(
      (lastDue.dueDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24)
    ),
    isFineMese,
  };
}

/**
 * Format a Date as dd/mm/yyyy
 */
export function formatDateIT(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Get the last due date as a string for a given scadenza+data combination.
 * Returns null if unparseable.
 */
export function getLastDueDateString(scadenza: string, dataFattura: string): string | null {
  const parsed = parsePaymentTerms(scadenza, dataFattura);
  if (!parsed) return null;
  return formatDateIT(parsed.lastDueDate);
}

/**
 * Get all installment due dates as formatted strings.
 */
export function getAllDueDatesFormatted(scadenza: string, dataFattura: string): string[] {
  const parsed = parsePaymentTerms(scadenza, dataFattura);
  if (!parsed) return [];
  return parsed.installments.map((inst) => formatDateIT(inst.dueDate));
}
