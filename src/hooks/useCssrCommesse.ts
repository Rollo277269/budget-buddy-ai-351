import { useQuery } from "@tanstack/react-query";
import { cssrSupabase } from "@/lib/cssrClient";

export interface CssrCommessa {
  id: string;
  cig: string | null;
  cig_derivato: string | null;
  cup: string | null;
  oggetto_lavori: string | null;
  committente: string | null;
  impresa_assegnataria: string | null;
  importo_contrattuale: string | null;
  importo_base_gara: string | null;
  data_contratto: string | null;
  data_consegna_lavori: string | null;
  data_scadenza_contratto: string | null;
  durata_contrattuale: string | null;
  stato: string;
  rup: string | null;
  direttore_lavori: string | null;
  ribasso: string | null;
  oneri_sicurezza: string | null;
  costo_manodopera: string | null;
  numero_repertorio: string | null;
  commessa_consortile: string | null;
}

async function fetchCssrCommesse(): Promise<CssrCommessa[]> {
  const { data, error } = await cssrSupabase
    .from("commessa_data")
    .select(
      "id, cig, cig_derivato, cup, oggetto_lavori, committente, impresa_assegnataria, " +
      "importo_contrattuale, importo_base_gara, data_contratto, data_consegna_lavori, " +
      "data_scadenza_contratto, durata_contrattuale, stato, rup, direttore_lavori, " +
      "ribasso, oneri_sicurezza, costo_manodopera, numero_repertorio, commessa_consortile"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching CSSR commesse:", error);
    return [];
  }
  return (data as unknown as CssrCommessa[]) || [];
}

export function useCssrCommesse() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cssr-commesse"],
    queryFn: fetchCssrCommesse,
    staleTime: 30 * 1000, // 30s cache
    refetchOnWindowFocus: true,
  });

  // Build a map by CIG for fast lookup
  const byCig = new Map<string, CssrCommessa>();
  if (data) {
    data.forEach((c) => {
      if (c.cig) byCig.set(c.cig, c);
      if (c.cig_derivato) byCig.set(c.cig_derivato, c);
    });
  }

  return {
    commesse: data || [],
    byCig,
    loading: isLoading,
    error,
  };
}
