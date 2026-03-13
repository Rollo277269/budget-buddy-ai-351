import { useState, useCallback, useMemo } from "react";

export interface CentroCR {
  id: string;
  tipo: "costo" | "ricavo";
  codice: string;
  descrizione: string;
  paroleChiaveMatching: string;
  note: string;
}

const CENTRI_KEY = "centri-costo-ricavo";
const CENTRO_MAP_PREFIX = "centro-map-";

export function loadCentri(): CentroCR[] {
  try {
    return JSON.parse(localStorage.getItem(CENTRI_KEY) || "[]");
  } catch {
    return [];
  }
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
  const centriCosto = useMemo(() => centri.filter((c) => c.tipo === "costo"), [centri]);
  const centriRicavo = useMemo(() => centri.filter((c) => c.tipo === "ricavo"), [centri]);
  return { centri, centriCosto, centriRicavo };
}
