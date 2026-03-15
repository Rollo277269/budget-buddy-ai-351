import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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

// ── Load/Save centri from DB ──

export async function fetchCentriFromDb(): Promise<CentroCR[]> {
  const { data, error } = await supabase
    .from("centri_cr" as any)
    .select("*")
    .order("created_at", { ascending: true });
  if (error) { console.error("Error loading centri:", error); return []; }
  return (data as any[] || []).map((d: any) => ({
    id: d.id,
    tipo: d.tipo as "costo" | "ricavo",
    codice: d.codice,
    descrizione: d.descrizione || "",
    paroleChiaveMatching: d.parole_chiave_matching || "",
    note: d.note || "",
    categoriaId: d.categoria_id || undefined,
  }));
}

export async function fetchCategorieFromDb(): Promise<CategoriaCentro[]> {
  const { data, error } = await supabase
    .from("categorie_centri" as any)
    .select("*")
    .order("created_at", { ascending: true });
  if (error) { console.error("Error loading categorie:", error); return []; }
  return (data as any[] || []).map((d: any) => ({
    id: d.id,
    tipo: d.tipo as "costo" | "ricavo",
    codice: d.codice,
    descrizione: d.descrizione || "",
  }));
}

export async function upsertCentro(c: CentroCR) {
  const row = {
    id: c.id,
    tipo: c.tipo,
    codice: c.codice,
    descrizione: c.descrizione,
    parole_chiave_matching: c.paroleChiaveMatching,
    note: c.note,
    categoria_id: c.categoriaId || null,
  };
  await supabase.from("centri_cr" as any).upsert(row as any);
}

export async function deleteCentroDb(id: string) {
  await supabase.from("centri_cr" as any).delete().eq("id", id);
}

export async function upsertCategoria(c: CategoriaCentro) {
  await supabase.from("categorie_centri" as any).upsert({ id: c.id, tipo: c.tipo, codice: c.codice, descrizione: c.descrizione } as any);
}

export async function deleteCategoriaDb(id: string) {
  await supabase.from("categorie_centri" as any).delete().eq("id", id);
}

// ── Centro assignment map (invoice_key → centro_codice) ──

async function loadMapFromDb(tipo: "costo" | "ricavo", context: "vendite" | "acquisti"): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("centro_assignments" as any)
    .select("invoice_key, centro_codice")
    .eq("tipo", tipo)
    .eq("context", context);
  if (error) { console.error("Error loading centro map:", error); return {}; }
  const map: Record<string, string> = {};
  for (const d of (data as any[] || [])) {
    map[d.invoice_key] = d.centro_codice;
  }
  return map;
}

async function saveAssignment(invoiceKey: string, tipo: "costo" | "ricavo", context: "vendite" | "acquisti", centroCodice: string) {
  await supabase.from("centro_assignments" as any).upsert({
    invoice_key: invoiceKey,
    tipo,
    context,
    centro_codice: centroCodice,
  } as any, { onConflict: "invoice_key,tipo,context" });
}

export async function updateCentroCodeInAssignments(oldCodice: string, newCodice: string) {
  await supabase
    .from("centro_assignments" as any)
    .update({ centro_codice: newCodice } as any)
    .eq("centro_codice", oldCodice);
}

export function useCentroMap(tipo: "costo" | "ricavo", context: "vendite" | "acquisti") {
  const [map, setMap] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const data = await loadMapFromDb(tipo, context);
    setMap(data);
  }, [tipo, context]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const assign = useCallback(
    (key: string, codice: string) => {
      setMap((prev) => {
        const next = { ...prev, [key]: codice };
        saveAssignment(key, tipo, context, codice);
        return next;
      });
    },
    [tipo, context]
  );

  return { map, assign, refresh };
}

export function useCentriData() {
  const [centri, setCentri] = useState<CentroCR[]>([]);
  const [categorie, setCategorie] = useState<CategoriaCentro[]>([]);

  const refresh = useCallback(() => {
    fetchCentriFromDb().then(setCentri);
    fetchCategorieFromDb().then(setCategorie);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const centriCosto = useMemo(() => centri.filter((c) => c.tipo === "costo"), [centri]);
  const centriRicavo = useMemo(() => centri.filter((c) => c.tipo === "ricavo"), [centri]);
  return { centri, categorie, centriCosto, centriRicavo, refresh };
}
