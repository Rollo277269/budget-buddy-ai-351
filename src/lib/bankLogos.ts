/**
 * Maps known bank names to their logo URLs.
 * Uses logo.clearbit.com for reliable, high-quality logos.
 */
const BANK_LOGO_MAP: Record<string, string> = {
  "credit agricole": "https://logo.clearbit.com/credit-agricole.com",
  "unicredit": "https://logo.clearbit.com/unicredit.it",
  "intesa sanpaolo": "https://logo.clearbit.com/intesasanpaolo.com",
  "intesa": "https://logo.clearbit.com/intesasanpaolo.com",
  "bnl": "https://logo.clearbit.com/bnl.it",
  "monte paschi": "https://logo.clearbit.com/mps.it",
  "mps": "https://logo.clearbit.com/mps.it",
  "bper": "https://logo.clearbit.com/bper.it",
  "banco bpm": "https://logo.clearbit.com/bancobpm.it",
  "credem": "https://logo.clearbit.com/credem.it",
  "fineco": "https://logo.clearbit.com/finecobank.com",
  "mediolanum": "https://logo.clearbit.com/bancamediolanum.it",
  "poste italiane": "https://logo.clearbit.com/poste.it",
  "bancoposta": "https://logo.clearbit.com/poste.it",
  "deutsche bank": "https://logo.clearbit.com/db.com",
  "ing": "https://logo.clearbit.com/ing.com",
  "widiba": "https://logo.clearbit.com/widiba.it",
  "illimity": "https://logo.clearbit.com/illimitybank.com",
  "sella": "https://logo.clearbit.com/sella.it",
  "carige": "https://logo.clearbit.com/gruppocarige.it",
  "popolare di sondrio": "https://logo.clearbit.com/popso.it",
};

export function getBankLogoUrl(bankName: string): string | null {
  const normalized = bankName.toLowerCase().trim();
  // Direct match
  for (const [key, url] of Object.entries(BANK_LOGO_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return url;
    }
  }
  return null;
}
