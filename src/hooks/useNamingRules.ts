import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface NamingRule {
  id: string;
  tipo: string;
  pattern: string;
  esempio: string;
}

const DEFAULTS: Omit<NamingRule, "id">[] = [
  { tipo: "Fattura Vendita", pattern: "FV_{ANNO}_{NUMERO}_{CLIENTE}", esempio: "FV_2024_001_RossiSRL" },
  { tipo: "Fattura Acquisto", pattern: "FA_{ANNO}_{NUMERO}_{FORNITORE}", esempio: "FA_2024_042_BianchiSPA" },
  { tipo: "Estratto Conto", pattern: "EC_{BANCA}_{MESE}_{ANNO}", esempio: "EC_Intesa_01_2024" },
];

export function useNamingRules() {
  const [rules, setRules] = useState<NamingRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    const { data, error } = await supabase
      .from("naming_rules" as any)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) { console.error("Error loading rules:", error); setLoading(false); return; }
    let rows = (data as any[] || []).map((d: any) => ({
      id: d.id,
      tipo: d.tipo,
      pattern: d.pattern,
      esempio: d.esempio || "",
    }));
    // Seed defaults if empty
    if (rows.length === 0) {
      const { error: insertErr } = await supabase
        .from("naming_rules" as any)
        .insert(DEFAULTS as any);
      if (!insertErr) {
        const { data: d2 } = await supabase.from("naming_rules" as any).select("*").order("created_at", { ascending: true });
        rows = (d2 as any[] || []).map((d: any) => ({ id: d.id, tipo: d.tipo, pattern: d.pattern, esempio: d.esempio || "" }));
      }
    }
    setRules(rows);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const saveRule = useCallback(async (rule: NamingRule) => {
    if (rules.some(r => r.id === rule.id)) {
      await supabase.from("naming_rules" as any).update({ tipo: rule.tipo, pattern: rule.pattern, esempio: rule.esempio } as any).eq("id", rule.id);
      toast.success("Regola aggiornata");
    } else {
      await supabase.from("naming_rules" as any).insert({ tipo: rule.tipo, pattern: rule.pattern, esempio: rule.esempio } as any);
      toast.success("Regola aggiunta");
    }
    await fetchRules();
  }, [rules, fetchRules]);

  const deleteRule = useCallback(async (id: string) => {
    await supabase.from("naming_rules" as any).delete().eq("id", id);
    toast.success("Regola eliminata");
    await fetchRules();
  }, [fetchRules]);

  return { rules, loading, saveRule, deleteRule };
}
