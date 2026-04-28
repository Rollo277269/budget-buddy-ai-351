import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ContoCorrente {
  id: string;
  tipo: "conto_corrente" | "carta_credito" | "finanziamento" | "crediti_fiscali" | "anticipo_presidente" | "cassa_contanti" | "bolli";
  banca: string;
  iban: string;
  intestatario: string;
  note: string;
  conto_addebito_id: string;
}

// ── Module-scope cache shared across all hook instances ──
let cachedConti: ContoCorrente[] | null = null;
let inflight: Promise<ContoCorrente[]> | null = null;
const subscribers = new Set<(c: ContoCorrente[]) => void>();

function notify() {
  if (cachedConti) subscribers.forEach((s) => s(cachedConti!));
}

async function loadConti(force = false): Promise<ContoCorrente[]> {
  if (cachedConti && !force) return cachedConti;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from("conti_correnti" as any)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error loading conti:", error);
      cachedConti = cachedConti ?? [];
      inflight = null;
      return cachedConti;
    }
    cachedConti = (data as any[] || []).map((d: any) => ({
      id: d.id,
      tipo: d.tipo as ContoCorrente["tipo"],
      banca: d.banca,
      iban: d.iban,
      intestatario: d.intestatario || "",
      note: d.note || "",
      conto_addebito_id: d.conto_addebito_id || "",
    }));
    inflight = null;
    notify();
    return cachedConti;
  })();
  return inflight;
}

export function useContiCorrenti() {
  const [conti, setConti] = useState<ContoCorrente[]>(cachedConti ?? []);
  const [loading, setLoading] = useState(!cachedConti);

  const fetchConti = useCallback(async () => {
    const data = await loadConti(true);
    setConti(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const cb = (c: ContoCorrente[]) => setConti(c);
    subscribers.add(cb);
    if (cachedConti) {
      setConti(cachedConti);
      setLoading(false);
    } else {
      loadConti().then((c) => { setConti(c); setLoading(false); });
    }
    return () => { subscribers.delete(cb); };
  }, []);

  const saveConto = useCallback(async (conto: ContoCorrente) => {
    if (conto.id && conti.some(c => c.id === conto.id)) {
      // Update
      const { error } = await supabase
        .from("conti_correnti" as any)
        .update({ tipo: conto.tipo, banca: conto.banca, iban: conto.iban, intestatario: conto.intestatario, note: conto.note, conto_addebito_id: conto.conto_addebito_id || null } as any)
        .eq("id", conto.id);
      if (error) { toast.error("Errore aggiornamento conto"); return; }
      toast.success("Conto aggiornato");
    } else {
      // Insert
      const { error } = await supabase
        .from("conti_correnti" as any)
        .insert({ tipo: conto.tipo, banca: conto.banca, iban: conto.iban, intestatario: conto.intestatario, note: conto.note, conto_addebito_id: conto.conto_addebito_id || null } as any);
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
