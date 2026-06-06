import { useMemo } from "react";
import { useRubrica, type ContattoRubrica } from "./useRubrica";

/** Versione non-React: costruisce il resolver a partire dai contatti caricati. */
export function buildRubricaResolver(contatti: ContattoRubrica[]) {
  const byPiva = new Map<string, string>();
  const byName = new Map<string, string>();
  const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  for (const c of contatti) {
    const piva = (c.partita_iva || "").replace(/\s+/g, "").trim();
    if (piva) byPiva.set(piva, c.denominazione);
    const key = norm(c.denominazione);
    if (key) byName.set(key, c.denominazione);
  }
  return (piva?: string | null, fallbackName?: string | null): string => {
    const p = (piva || "").replace(/\s+/g, "").trim();
    if (p) {
      const hit = byPiva.get(p);
      if (hit) return hit;
    }
    const n = norm(fallbackName || "");
    if (n) {
      const hit = byName.get(n);
      if (hit) return hit;
    }
    return fallbackName || "";
  };
}

/**
 * Risolve la denominazione "ufficiale" dalla Rubrica a partire dai dati
 * presenti su una fattura/documento. Match prioritario per Partita IVA,
 * fallback per nome normalizzato.
 *
 * Esempio: const resolveName = useRubricaName();
 *          const display = resolveName(row.partita_iva, row.cliente);
 */
export function useRubricaName() {
  const { contatti } = useRubrica();
  return useMemo(() => buildRubricaResolver(contatti), [contatti]);
}