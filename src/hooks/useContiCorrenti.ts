import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ContoCorrente {
  id: string;
  tipo: "conto_corrente" | "carta_credito" | "finanziamento" | "crediti_fiscali";
  banca: string;
  iban: string;
  intestatario: string;
  note: string;
}

export function useContiCorrenti() {
  const [conti, setConti] = useState<ContoCorrente[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConti = useCallback(async () => {
    const { data, error } = await supabase
      .from("conti_correnti" as any)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error loading conti:", error);
      return;
    }
    setConti((data as any[] || []).map((d: any) => ({
      id: d.id,
      tipo: d.tipo as ContoCorrente["tipo"],
      banca: d.banca,
      iban: d.iban,
      intestatario: d.intestatario || "",
      note: d.note || "",
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchConti(); }, [fetchConti]);

  const saveConto = useCallback(async (conto: ContoCorrente) => {
    if (conto.id && conti.some(c => c.id === conto.id)) {
      // Update
      const { error } = await supabase
        .from("conti_correnti" as any)
        .update({ tipo: conto.tipo, banca: conto.banca, iban: conto.iban, intestatario: conto.intestatario, note: conto.note } as any)
        .eq("id", conto.id);
      if (error) { toast.error("Errore aggiornamento conto"); return; }
      toast.success("Conto aggiornato");
    } else {
      // Insert
      const { error } = await supabase
        .from("conti_correnti" as any)
        .insert({ tipo: conto.tipo, banca: conto.banca, iban: conto.iban, intestatario: conto.intestatario, note: conto.note } as any);
      if (error) { toast.error("Errore inserimento conto"); return; }
      toast.success("Conto aggiunto");
    }
    await fetchConti();
  }, [conti, fetchConti]);

  const deleteConto = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("conti_correnti" as any)
      .delete()
      .eq("id", id);
    if (error) { toast.error("Errore eliminazione conto"); return; }
    toast.success("Conto eliminato");
    await fetchConti();
  }, [fetchConti]);

  return { conti, loading, saveConto, deleteConto, refetch: fetchConti };
}
