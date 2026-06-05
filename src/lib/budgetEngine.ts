/**
 * Budget engine - pure functions to build a rolling 12-month financial forecast.
 *
 * Schema: CE riclassificato a margine di contribuzione + cash flow mensile.
 * Riferimenti: OIC 10 (cash flow), OIC 11 (postulati), Codice della Crisi
 * D.Lgs. 14/2019 art. 3 (assetti adeguati / budget di tesoreria).
 */

import type { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import type { CssrCommessa } from "@/hooks/useCssrCommesse";
import type { RataFinanziamento } from "@/hooks/useRateFinanziamento";
import type { ContoCorrente } from "@/hooks/useContiCorrenti";
import type { DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";

export interface BudgetMonth {
  /** YYYY-MM */
  key: string;
  /** First day of month */
  date: Date;
  /** Short label es. "Gen 26" */
  label: string;
  year: number;
  month: number; // 1-12
}

export interface BudgetAssumptions {
  /** Anni di storico da usare per la media (1-5) */
  historyYears: number;
  /** Inflazione applicata ai costi struttura (%) */
  inflationPct: number;
  /** Markup medio applicato ai ricavi commessa per stimare costi diretti (%) */
  directCostPct: number;
  /** Mese di partenza ISO (YYYY-MM); default = corrente */
  startMonth?: string;
  /** Override manuali: { rowKey: { monthKey: value } } */
  overrides: Record<string, Record<string, number>>;
}

export const DEFAULT_ASSUMPTIONS: BudgetAssumptions = {
  historyYears: 2,
  inflationPct: 2,
  directCostPct: 65,
  overrides: {},
};

export interface BudgetRow {
  key: string;
  label: string;
  /** classification — drives styling */
  kind: "section" | "line" | "subtotal" | "total";
  /** Sign: 1 = revenue/in, -1 = cost/out, 0 = subtotal */
  sign: 1 | -1 | 0;
  /** Cell values by monthKey */
  values: Record<string, number>;
  /** Tooltip / source description */
  source?: string;
}

// ─────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────

const MESI_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return out;
}

export function buildRollingMonths(start: Date = new Date(), n = 12): BudgetMonth[] {
  const base = new Date(start.getFullYear(), start.getMonth(), 1);
  return Array.from({ length: n }, (_, i) => {
    const d = addMonths(base, i);
    return {
      key: monthKey(d),
      date: d,
      label: `${MESI_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    };
  });
}

/** Parse Italian dd/mm/yyyy or ISO yyyy-mm-dd date */
export function parseDateItOrIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  const it = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (it) return new Date(parseInt(it[3]), parseInt(it[2]) - 1, parseInt(it[1]));
  return null;
}

function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function emptyValues(months: BudgetMonth[]): Record<string, number> {
  return months.reduce<Record<string, number>>((acc, m) => { acc[m.key] = 0; return acc; }, {});
}

function isPaid(stato: string): boolean {
  const s = String(stato || "").toLowerCase();
  return s.includes("pagat") || s.includes("incassat") || s.includes("riconcil");
}

// ─────────────────────────────────────────────────────────────
// Forecast: open contracts (commesse aperte)
// ─────────────────────────────────────────────────────────────

/**
 * Per ogni commessa CSSR ancora aperta, calcola l'importo residuo
 * (importo contrattuale − già fatturato sul CIG) e lo distribuisce
 * linearmente sui mesi tra oggi e data_scadenza_contratto.
 */
export function forecastCommesseRevenue(
  commesse: CssrCommessa[],
  sales: SaleInvoice[],
  months: BudgetMonth[],
): { total: Record<string, number>; perCommessa: Array<{ cig: string; oggetto: string; residuo: number; values: Record<string, number> }> } {
  const total = emptyValues(months);
  const perCommessa: Array<{ cig: string; oggetto: string; residuo: number; values: Record<string, number> }> = [];

  const fatturatoByCig = new Map<string, number>();
  sales.forEach((s) => {
    if (!s.cig) return;
    fatturatoByCig.set(s.cig, (fatturatoByCig.get(s.cig) || 0) + (s.imponibile || 0));
  });

  const firstKey = months[0].key;
  const lastKey = months[months.length - 1].key;
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));

  commesse.forEach((c) => {
    const cig = c.cig || c.cig_derivato;
    if (!cig) return;
    const stato = String(c.stato || "").toLowerCase();
    if (stato.includes("chius") || stato.includes("collaud") || stato.includes("annull")) return;

    const importo = parseNum(c.importo_contrattuale);
    if (importo <= 0) return;
    const fatturato = fatturatoByCig.get(cig) || 0;
    const residuo = Math.max(0, importo - fatturato);
    if (residuo <= 0) return;

    const scad = parseDateItOrIso(c.data_scadenza_contratto);
    const endKey = scad ? monthKey(scad) : lastKey;
    const startIdx = 0;
    const endIdx = Math.min(
      months.length - 1,
      monthIndex.get(endKey) ?? (endKey > lastKey ? months.length - 1 : -1),
    );
    if (endIdx < startIdx) return;
    void firstKey;

    const span = endIdx - startIdx + 1;
    const perMonth = residuo / span;
    const values = emptyValues(months);
    for (let i = startIdx; i <= endIdx; i++) {
      values[months[i].key] = perMonth;
      total[months[i].key] += perMonth;
    }
    perCommessa.push({
      cig,
      oggetto: c.oggetto_lavori || c.committente || cig,
      residuo,
      values,
    });
  });

  return { total, perCommessa };
}

// ─────────────────────────────────────────────────────────────
// Forecast: historical averages (altri ricavi, costi struttura)
// ─────────────────────────────────────────────────────────────

/**
 * Media mensile dei movimenti storici di una collezione di fatture,
 * applicando il fattore inflazione e ripetendola su tutti i mesi della finestra.
 */
export function historicalMonthlyAverage(
  amounts: Array<{ data: string; amount: number }>,
  historyYears: number,
  inflationPct: number,
): number {
  if (amounts.length === 0) return 0;
  const now = new Date();
  const cutoff = new Date(now.getFullYear() - historyYears, now.getMonth(), 1);
  const filtered = amounts.filter((a) => {
    const d = parseDateItOrIso(a.data);
    return d ? d >= cutoff : false;
  });
  if (filtered.length === 0) return 0;
  const total = filtered.reduce((s, a) => s + a.amount, 0);
  const months = historyYears * 12;
  const avg = total / months;
  return avg * (1 + inflationPct / 100);
}

export function distributeFlat(value: number, months: BudgetMonth[]): Record<string, number> {
  const v = emptyValues(months);
  months.forEach((m) => { v[m.key] = value; });
  return v;
}

// ─────────────────────────────────────────────────────────────
// Cash flow: schedule from open invoices + installments + polizze
// ─────────────────────────────────────────────────────────────

function bucketByDueDate(
  items: Array<{ data: string; scadenza: string; amount: number }>,
  months: BudgetMonth[],
): Record<string, number> {
  const v = emptyValues(months);
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  items.forEach((it) => {
    const d = parseDateItOrIso(it.scadenza) || parseDateItOrIso(it.data);
    if (!d) return;
    const k = monthKey(d);
    if (monthIndex.has(k)) v[k] += it.amount;
  });
  return v;
}

export function buildCashFlowSchedule(
  sales: SaleInvoice[],
  purchases: PurchaseInvoice[],
  rate: RataFinanziamento[],
  conti: ContoCorrente[],
  polizze: DocumentoAcquisto[],
  months: BudgetMonth[],
  initialBalance: number,
) {
  // Open sales (incassi attesi)
  const incassiAttesi = bucketByDueDate(
    sales.filter((s) => !isPaid(s.stato)).map((s) => ({ data: s.data, scadenza: s.scadenza, amount: s.totale })),
    months,
  );

  // Open purchases (pagamenti attesi)
  const pagamentiAttesi = bucketByDueDate(
    purchases.filter((p) => !isPaid(p.stato)).map((p) => ({ data: p.data, scadenza: p.scadenza, amount: p.totale })),
    months,
  );

  // Rate finanziamento - separare per tipo conto
  const contoById = new Map(conti.map((c) => [c.id, c]));
  const rateFinanz = emptyValues(months);
  const rateCredFiscali = emptyValues(months);
  const monthIndexCF = new Map(months.map((m, i) => [m.key, i]));
  rate.filter((r) => !r.pagata).forEach((r) => {
    const d = parseDateItOrIso(r.data_scadenza);
    if (!d) return;
    const k = monthKey(d);
    if (!monthIndexCF.has(k)) return;
    const conto = contoById.get(r.conto_id);
    if (conto?.tipo === "crediti_fiscali") rateCredFiscali[k] += r.importo_rata;
    else rateFinanz[k] += r.importo_rata;
  });

  // Polizze (uscite alla data scadenza)
  const polizzeOut = emptyValues(months);
  polizze.forEach((p) => {
    const d = parseDateItOrIso(p.data_scadenza || null);
    if (!d) return;
    const k = monthKey(d);
    if (monthIndexCF.has(k)) polizzeOut[k] += Number(p.importo || 0);
  });

  // Saldo finale cumulato
  const saldoFinale = emptyValues(months);
  let running = initialBalance;
  months.forEach((m) => {
    const net =
      (incassiAttesi[m.key] || 0) -
      (pagamentiAttesi[m.key] || 0) -
      (rateFinanz[m.key] || 0) +
      (rateCredFiscali[m.key] || 0) -
      (polizzeOut[m.key] || 0);
    running += net;
    saldoFinale[m.key] = running;
  });

  return {
    incassiAttesi,
    pagamentiAttesi,
    rateFinanz,
    rateCredFiscali,
    polizzeOut,
    saldoFinale,
    initialBalance,
  };
}

// ─────────────────────────────────────────────────────────────
// Apply manual overrides
// ─────────────────────────────────────────────────────────────

export function applyOverrides(
  rows: BudgetRow[],
  overrides: BudgetAssumptions["overrides"],
): BudgetRow[] {
  return rows.map((r) => {
    const ov = overrides[r.key];
    if (!ov) return r;
    const values = { ...r.values };
    Object.keys(ov).forEach((mk) => {
      if (mk in values) values[mk] = ov[mk];
    });
    return { ...r, values };
  });
}

/** Sums values across all months */
export function rowTotal(row: BudgetRow): number {
  return Object.values(row.values).reduce((s, v) => s + v, 0);
}

/** Adds two value rows element-wise into a new record */
export function addValues(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  Object.keys(b).forEach((k) => { out[k] = (out[k] || 0) + b[k]; });
  return out;
}

/** Subtracts: a - b */
export function subValues(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  Object.keys(b).forEach((k) => { out[k] = (out[k] || 0) - b[k]; });
  return out;
}

/** Scale values by a factor */
export function scaleValues(a: Record<string, number>, factor: number): Record<string, number> {
  const out: Record<string, number> = {};
  Object.keys(a).forEach((k) => { out[k] = a[k] * factor; });
  return out;
}