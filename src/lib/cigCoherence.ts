// Utility for detecting CIG discrepancies between the value being saved
// (from XML/Excel structured field) and CIGs found in the description/causale text.

const CIG_REGEX = /\b[A-Z0-9]{10}\b/g;
const NEAR_CIG_KEYWORDS = ["CIG", "C.I.G", "C.I.G.", "C I G"];

export interface CigDiscrepancy {
  invoiceKey: string; // "anno-numero" or "anno-numero-suffisso"
  invoiceType: "vendita" | "acquisto";
  anno: number;
  numero: number;
  label: string; // cliente/fornitore
  cigSalvato: string; // CIG from the file (XML/Excel structured field)
  cigInDescrizione: string; // best CIG candidate found in description
  altriCandidati: string[]; // other 10-char alphanumeric candidates
  descrizione: string;
  source: "excel" | "xml";
}

function isPlausibleCig(s: string): boolean {
  return /[A-Z]/.test(s) && /[0-9]/.test(s);
}

/**
 * Extract CIG candidates from a free text. Prefers candidates that appear
 * directly after a "CIG" keyword.
 */
export function extractCigCandidates(text: string): { all: string[]; nearKeyword: string[] } {
  if (!text) return { all: [], nearKeyword: [] };
  const upper = text.toUpperCase();
  const all = Array.from(new Set(upper.match(CIG_REGEX) || [])).filter(isPlausibleCig);
  const nearKeyword: string[] = [];
  for (const kw of NEAR_CIG_KEYWORDS) {
    const re = new RegExp(`${kw.replace(/\./g, "\\.")}[^A-Z0-9]{0,5}([A-Z0-9]{10})\\b`, "g");
    let m;
    while ((m = re.exec(upper)) !== null) {
      if (isPlausibleCig(m[1]) && !nearKeyword.includes(m[1])) nearKeyword.push(m[1]);
    }
  }
  return { all, nearKeyword };
}

/**
 * Returns a discrepancy object if the description contains a CIG that differs
 * from the one being saved. Returns null when there's no conflict.
 */
export function detectCigDiscrepancy(params: {
  cigSalvato: string;
  descrizione: string;
  invoiceType: "vendita" | "acquisto";
  anno: number;
  numero: number;
  suffisso?: string;
  label: string;
  source: "excel" | "xml";
}): CigDiscrepancy | null {
  const cigSalvato = (params.cigSalvato || "").trim().toUpperCase();
  const desc = params.descrizione || "";
  if (!desc) return null;

  const { all, nearKeyword } = extractCigCandidates(desc);
  if (all.length === 0) return null;

  // No conflict if saved CIG appears among candidates
  if (cigSalvato && all.includes(cigSalvato)) return null;

  const best = nearKeyword[0] || all[0];
  const others = all.filter((c) => c !== best);

  return {
    invoiceKey: params.suffisso
      ? `${params.anno}-${params.numero}-${params.suffisso}`
      : `${params.anno}-${params.numero}`,
    invoiceType: params.invoiceType,
    anno: params.anno,
    numero: params.numero,
    label: params.label || "—",
    cigSalvato,
    cigInDescrizione: best,
    altriCandidati: others,
    descrizione: desc,
    source: params.source,
  };
}
