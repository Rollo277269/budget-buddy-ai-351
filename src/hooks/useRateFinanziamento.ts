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

export function useRateFinanziamento(contoId?: string) {
  const [rate, setRate] = useState<RataFinanziamento[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRate = useCallback(async () => {
    let query = supabase
      .from("rate_finanziamento" as any)
      .select("*")
      .order("numero_rata", { ascending: true });
    if (contoId) {
      query = query.eq("conto_id", contoId);
    }
    const { data, error } = await query;
    if (error) {
      console.error("Error loading rate:", error);
      setLoading(false);
      return;
    }
    setRate((data as any[] || []).map((d: any) => ({
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
    })));
    setLoading(false);
  }, [contoId]);

  useEffect(() => { fetchRate(); }, [fetchRate]);

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

  const deleteRateForConto = useCallback(async (contoId: string) => {
    await supabase.from("rate_finanziamento" as any).delete().eq("conto_id", contoId);
    await fetchRate();
  }, [fetchRate]);

  return { rate, loading, importRate, togglePagata, deleteRateForConto, refetch: fetchRate };
}
