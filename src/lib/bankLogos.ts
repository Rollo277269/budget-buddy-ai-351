/**
 * Maps known bank names to their local logo paths.
 */
const BANK_LOGO_MAP: Record<string, string> = {
  "credit agricole": "/bank-logos/credit-agricole.png",
  "unicredit": "/bank-logos/unicredit.png",
  "intesa sanpaolo": "/bank-logos/intesa-sanpaolo.png",
  "intesa": "/bank-logos/intesa-sanpaolo.png",
  "bnl": "/bank-logos/bnl.png",
  "monte paschi": "/bank-logos/mps.png",
  "mps": "/bank-logos/mps.png",
  "bper": "/bank-logos/bper.png",
  "banco bpm": "/bank-logos/banco-bpm.png",
  "credem": "/bank-logos/credem.png",
  "fineco": "/bank-logos/fineco.png",
  "mediolanum": "/bank-logos/mediolanum.png",
  "poste italiane": "/bank-logos/poste.png",
  "bancoposta": "/bank-logos/poste.png",
  "deutsche bank": "/bank-logos/deutsche-bank.png",
  "ing": "/bank-logos/ing.png",
  "sella": "/bank-logos/sella.png",
};

export function getBankLogoUrl(bankName: string): string | null {
  const normalized = bankName.toLowerCase().trim();
  for (const [key, url] of Object.entries(BANK_LOGO_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return url;
    }
  }
  return null;
}
