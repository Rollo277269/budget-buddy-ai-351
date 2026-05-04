import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet, CACHE_KEYS } from "@/lib/idbCache";

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
  if (centriCache) return centriCache;
  if (centriInflight) return centriInflight;
  centriInflight = (async () => {
    const { data, error } = await supabase
      .from("centri_cr" as any)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) { console.error("Error loading centri:", error); centriInflight = null; return []; }
    centriCache = (data as any[] || []).map((d: any) => ({
      id: d.id,
      tipo: d.tipo as "costo" | "ricavo",
      codice: d.codice,
      descrizione: d.descrizione || "",
      paroleChiaveMatching: d.parole_chiave_matching || "",
      note: d.note || "",
      categoriaId: d.categoria_id || undefined,
    }));
    centriInflight = null;
    idbSet(CACHE_KEYS.centri, centriCache);
    return centriCache;
  })();
  return centriInflight;
}

export async function fetchCategorieFromDb(): Promise<CategoriaCentro[]> {
  if (categorieCache) return categorieCache;
  if (categorieInflight) return categorieInflight;
  categorieInflight = (async () => {
    const { data, error } = await supabase
      .from("categorie_centri" as any)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) { console.error("Error loading categorie:", error); categorieInflight = null; return []; }
    categorieCache = (data as any[] || []).map((d: any) => ({
      id: d.id,
      tipo: d.tipo as "costo" | "ricavo",
      codice: d.codice,
      descrizione: d.descrizione || "",
    }));
    categorieInflight = null;
    idbSet(CACHE_KEYS.categorie, categorieCache);
    return categorieCache;
  })();
  return categorieInflight;
}

/**
 * Hydrate in-memory caches from IndexedDB. Call early at app boot so the
 * first render of pages using `useCentriData` shows data instantly while a
 * fresh fetch revalidates in the background.
 */
export async function hydrateCentriFromIdb(): Promise<void> {
  const [c, cat] = await Promise.all([
    idbGet<CentroCR[]>(CACHE_KEYS.centri),
    idbGet<CategoriaCentro[]>(CACHE_KEYS.categorie),
  ]);
  if (c && !centriCache) centriCache = c;
  if (cat && !categorieCache) categorieCache = cat;
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
  centriCache = null;
}

export async function deleteCentroDb(id: string) {
  await supabase.from("centri_cr" as any).delete().eq("id", id);
  centriCache = null;
}

export async function upsertCategoria(c: CategoriaCentro) {
  await supabase.from("categorie_centri" as any).upsert({ id: c.id, tipo: c.tipo, codice: c.codice, descrizione: c.descrizione } as any);
  categorieCache = null;
}

export async function deleteCategoriaDb(id: string) {
  await supabase.from("categorie_centri" as any).delete().eq("id", id);
  categorieCache = null;
}

// ── Centro assignment map (invoice_key → centro_codice) ──

// Module-scope caches
let centriCache: CentroCR[] | null = null;
let centriInflight: Promise<CentroCR[]> | null = null;
let categorieCache: CategoriaCentro[] | null = null;
let categorieInflight: Promise<CategoriaCentro[]> | null = null;
const assignmentMapCache: Record<string, Record<string, string>> = {};
const assignmentMapInflight: Record<string, Promise<Record<string, string>> | undefined> = {};

async function loadMapFromDb(tipo: "costo" | "ricavo", context: "vendite" | "acquisti"): Promise<Record<string, string>> {
  const ck = `${tipo}|${context}`;
  if (assignmentMapCache[ck]) return assignmentMapCache[ck];
  if (assignmentMapInflight[ck]) return assignmentMapInflight[ck]!;
  assignmentMapInflight[ck] = (async () => {
  const map: Record<string, string> = {};
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("centro_assignments" as any)
      .select("invoice_key, centro_codice")
      .eq("tipo", tipo)
      .eq("context", context)
      .range(from, from + pageSize - 1);
    if (error) { console.error("Error loading centro map:", error); break; }
    if (!data || data.length === 0) break;
    for (const d of (data as any[])) {
      map[d.invoice_key] = d.centro_codice;
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
    assignmentMapCache[ck] = map;
    assignmentMapInflight[ck] = undefined;
    return map;
  })();
  return assignmentMapInflight[ck]!;
}

async function saveAssignment(invoiceKey: string, tipo: "costo" | "ricavo", context: "vendite" | "acquisti", centroCodice: string) {
  await supabase.from("centro_assignments" as any).upsert({
    invoice_key: invoiceKey,
    tipo,
    context,
    centro_codice: centroCodice,
  } as any, { onConflict: "invoice_key,tipo,context" });
  const ck = `${tipo}|${context}`;
  if (assignmentMapCache[ck]) assignmentMapCache[ck][invoiceKey] = centroCodice;
}

async function deleteAssignment(invoiceKey: string, tipo: "costo" | "ricavo", context: "vendite" | "acquisti") {
  await supabase.from("centro_assignments" as any)
    .delete()
    .eq("invoice_key", invoiceKey)
    .eq("tipo", tipo)
    .eq("context", context);
  const ck = `${tipo}|${context}`;
  if (assignmentMapCache[ck]) delete assignmentMapCache[ck][invoiceKey];
}

export async function updateCentroCodeInAssignments(oldCodice: string, newCodice: string) {
  await supabase
    .from("centro_assignments" as any)
    .update({ centro_codice: newCodice } as any)
    .eq("centro_codice", oldCodice);
  // Invalidate all assignment maps
  Object.keys(assignmentMapCache).forEach((k) => delete assignmentMapCache[k]);
}

export function useCentroMap(tipo: "costo" | "ricavo", context: "vendite" | "acquisti") {
  const ck = `${tipo}|${context}`;
  const [map, setMap] = useState<Record<string, string>>(assignmentMapCache[ck] ?? {});

  const refresh = useCallback(async () => {
    delete assignmentMapCache[ck];
    const data = await loadMapFromDb(tipo, context);
    setMap(data);
  }, [tipo, context, ck]);

  useEffect(() => {
    if (assignmentMapCache[ck]) setMap(assignmentMapCache[ck]);
    else loadMapFromDb(tipo, context).then(setMap);
  }, [tipo, context, ck]);

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

  const remove = useCallback(
    (key: string) => {
      setMap((prev) => {
        const next = { ...prev };
        delete next[key];
        deleteAssignment(key, tipo, context);
        return next;
      });
    },
    [tipo, context]
  );

  return { map, assign, remove, refresh };
}

export function useCentriData() {
  const [centri, setCentri] = useState<CentroCR[]>(centriCache ?? []);
  const [categorie, setCategorie] = useState<CategoriaCentro[]>(categorieCache ?? []);

  const refresh = useCallback(() => {
    centriCache = null;
    categorieCache = null;
    fetchCentriFromDb().then(setCentri);
    fetchCategorieFromDb().then(setCategorie);
  }, []);

  useEffect(() => {
    // Show whatever we have (possibly hydrated from IDB) immediately.
    if (centriCache) setCentri(centriCache);
    if (categorieCache) setCategorie(categorieCache);
    // Always trigger a fresh fetch so IDB-hydrated data gets revalidated.
    fetchCentriFromDb().then(setCentri);
    fetchCategorieFromDb().then(setCategorie);
  }, []);

  const centriCosto = useMemo(() => centri.filter((c) => c.tipo === "costo"), [centri]);
  const centriRicavo = useMemo(() => centri.filter((c) => c.tipo === "ricavo"), [centri]);
  return { centri, categorie, centriCosto, centriRicavo, refresh };
}
