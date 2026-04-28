import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RataFinanziamento {
  id: string;
  conto_id: string;
  numero_rata: number;
  data_scadenza: string;
  importo_rata: number;
  importo_capitale: number;
  importo_interessi: number;
  debito_residuo: number;
  pagata: boolean;
  note: string;
}

// ── Module-scope cache for the FULL list (no contoId filter) ──
let cachedRate: RataFinanziamento[] | null = null;
let inflight: Promise<RataFinanziamento[]> | null = null;
const subs = new Set<(r: RataFinanziamento[]) => void>();

async function loadAllRate(force = false): Promise<RataFinanziamento[]> {
  if (cachedRate && !force) return cachedRate;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from("rate_finanziamento" as any)
      .select("*")
      .order("numero_rata", { ascending: true });
    if (error) { console.error("Error loading rate:", error); cachedRate = cachedRate ?? []; inflight = null; return cachedRate; }
    cachedRate = (data as any[] || []).map((d: any) => ({
      id: d.id,
      conto_id: d.conto_id,
      numero_rata: d.numero_rata,
      data_scadenza: d.data_scadenza,
      importo_rata: Number(d.importo_rata),
      importo_capitale: Number(d.importo_capitale),
      importo_interessi: Number(d.importo_interessi),
      debito_residuo: Number(d.debito_residuo),
      pagata: d.pagata,
      note: d.note || "",
    }));
    inflight = null;
    subs.forEach((s) => s(cachedRate!));
    return cachedRate;
  })();
  return inflight;
}

export function useRateFinanziamento(contoId?: string) {
  const initial = cachedRate ? (contoId ? cachedRate.filter((r) => r.conto_id === contoId) : cachedRate) : [];
  const [rate, setRate] = useState<RataFinanziamento[]>(initial);
  const [loading, setLoading] = useState(!cachedRate);

  const apply = useCallback((all: RataFinanziamento[]) => {
    setRate(contoId ? all.filter((r) => r.conto_id === contoId) : all);
    setLoading(false);
  }, [contoId]);

  const fetchRate = useCallback(async () => {
    const all = await loadAllRate(true);
    apply(all);
  }, [apply]);

  useEffect(() => {
    const cb = (all: RataFinanziamento[]) => apply(all);
    subs.add(cb);
    if (cachedRate) apply(cachedRate);
    else loadAllRate().then(apply);
    return () => { subs.delete(cb); };
  }, [apply]);

  const importRate = useCallback(async (contoId: string, rows: Omit<RataFinanziamento, "id">[]) => {
    // Delete existing rates for this account first
    await supabase.from("rate_finanziamento" as any).delete().eq("conto_id", contoId);
    const { error } = await supabase
      .from("rate_finanziamento" as any)
      .insert(rows.map(r => ({
        conto_id: contoId,
        numero_rata: r.numero_rata,
        data_scadenza: r.data_scadenza,
        importo_rata: r.importo_rata,
        importo_capitale: r.importo_capitale,
        importo_interessi: r.importo_interessi,
        debito_residuo: r.debito_residuo,
        pagata: r.pagata,
        note: r.note,
      })) as any);
    if (error) {
      toast.error("Errore importazione piano ammortamento");
      console.error(error);
      return;
    }
    toast.success(`${rows.length} rate importate`);
    await fetchRate();
  }, [fetchRate]);

  const togglePagata = useCallback(async (id: string, pagata: boolean) => {
    const { error } = await supabase
      .from("rate_finanziamento" as any)
      .update({ pagata } as any)
      .eq("id", id);
    if (error) { toast.error("Errore aggiornamento rata"); return; }
    await fetchRate();
  }, [fetchRate]);

  const updateRata = useCallback(async (id: string, updates: Partial<Omit<RataFinanziamento, "id" | "conto_id">>) => {
    const { error } = await supabase
      .from("rate_finanziamento" as any)
      .update(updates as any)
      .eq("id", id);
    if (error) { toast.error("Errore aggiornamento rata"); console.error(error); return; }
    toast.success("Rata aggiornata");
    await fetchRate();
  }, [fetchRate]);

  const deleteRateForConto = useCallback(async (contoId: string) => {
    await supabase.from("rate_finanziamento" as any).delete().eq("conto_id", contoId);
    await fetchRate();
  }, [fetchRate]);

  return { rate, loading, importRate, togglePagata, updateRata, deleteRateForConto, refetch: fetchRate };
}
