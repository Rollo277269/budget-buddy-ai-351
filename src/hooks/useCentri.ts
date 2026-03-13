import { useState, useCallback, useMemo } from "react";

export interface CategoriaCentro {
  id: string;
  tipo: "costo" | "ricavo";
  codice: string;
  descrizione: string;
}

export interface CentroCR {
  id: string;
  tipo: "costo" | "ricavo";
  codice: string;
  descrizione: string;
  paroleChiaveMatching: string;
  note: string;
  categoriaId?: string;
}

const CENTRI_KEY = "centri-costo-ricavo";
const CATEGORIE_KEY = "centri-categorie";
const CENTRO_MAP_PREFIX = "centro-map-";

export function loadCentri(): CentroCR[] {
  try {
    return JSON.parse(localStorage.getItem(CENTRI_KEY) || "[]");
  } catch {
    return [];
  }
}

export function loadCategorie(): CategoriaCentro[] {
  try {
    return JSON.parse(localStorage.getItem(CATEGORIE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveCategorie(categorie: CategoriaCentro[]) {
  localStorage.setItem(CATEGORIE_KEY, JSON.stringify(categorie));
}

export function saveCentri(centri: CentroCR[]) {
  localStorage.setItem(CENTRI_KEY, JSON.stringify(centri));
}

function storageKey(tipo: "costo" | "ricavo", context: "vendite" | "acquisti") {
  return `${CENTRO_MAP_PREFIX}${tipo}-${context}`;
}

function loadMap(tipo: "costo" | "ricavo", context: "vendite" | "acquisti"): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(tipo, context)) || "{}");
  } catch {
    return {};
  }
}

function saveMap(tipo: "costo" | "ricavo", context: "vendite" | "acquisti", map: Record<string, string>) {
  localStorage.setItem(storageKey(tipo, context), JSON.stringify(map));
}

// Migrate old key if exists
function migrateOldKey() {
  const old = localStorage.getItem("centro-ricavo-map");
  if (old) {
    localStorage.setItem(storageKey("ricavo", "vendite"), old);
    localStorage.removeItem("centro-ricavo-map");
  }
}
migrateOldKey();

export function useCentroMap(tipo: "costo" | "ricavo", context: "vendite" | "acquisti") {
  const [map, setMap] = useState<Record<string, string>>(() => loadMap(tipo, context));

  const assign = useCallback(
    (key: string, codice: string) => {
      setMap((prev) => {
        const next = { ...prev, [key]: codice };
        saveMap(tipo, context, next);
        return next;
      });
    },
    [tipo, context]
  );

  return { map, assign };
}

export function useCentriData() {
  const centri = useMemo(() => loadCentri(), []);
  const categorie = useMemo(() => loadCategorie(), []);
  const centriCosto = useMemo(() => centri.filter((c) => c.tipo === "costo"), [centri]);
  const centriRicavo = useMemo(() => centri.filter((c) => c.tipo === "ricavo"), [centri]);
  return { centri, categorie, centriCosto, centriRicavo };
}
