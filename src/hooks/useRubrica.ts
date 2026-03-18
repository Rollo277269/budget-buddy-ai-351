import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Indirizzo {
  via: string;
  civico: string;
  cap: string;
  citta: string;
  provincia: string;
}

export const emptyIndirizzo: Indirizzo = { via: "", civico: "", cap: "", citta: "", provincia: "" };

export interface ContattoRubrica {
  id: string;
  denominazione: string;
  tipo: "cliente" | "fornitore" | "socio";
  partita_iva: string;
  email: string;
  pec: string;
  codice_sdi: string;
  telefono: string;
  indirizzo: string;
  note: string;
  sede_legale: Indirizzo;
  sede_operativa: Indirizzo;
}

function parseIndirizzo(raw: any): Indirizzo {
  if (!raw || typeof raw !== "object") return { ...emptyIndirizzo };
  return {
    via: raw.via || "",
    civico: raw.civico || "",
    cap: raw.cap || "",
    citta: raw.citta || "",
    provincia: raw.provincia || "",
  };
}

export function useRubrica() {
  const [contatti, setContatti] = useState<ContattoRubrica[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContatti = useCallback(async () => {
    const { data, error } = await supabase
      .from("rubrica" as any)
      .select("*")
      .order("denominazione", { ascending: true });
    if (error) {
      console.error("Error loading rubrica:", error);
      setLoading(false);
      return;
    }
    setContatti(
      (data as any[] || []).map((d: any) => ({
        id: d.id,
        denominazione: d.denominazione,
        tipo: d.tipo as ContattoRubrica["tipo"],
        partita_iva: d.partita_iva || "",
        email: d.email || "",
        pec: d.pec || "",
        codice_sdi: d.codice_sdi || "",
        telefono: d.telefono || "",
        indirizzo: d.indirizzo || "",
        note: d.note || "",
        sede_legale: parseIndirizzo(d.sede_legale),
        sede_operativa: parseIndirizzo(d.sede_operativa),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchContatti();
  }, [fetchContatti]);

  const saveContatto = useCallback(
    async (contatto: ContattoRubrica) => {
      const payload = {
        denominazione: contatto.denominazione,
        tipo: contatto.tipo,
        partita_iva: contatto.partita_iva,
        email: contatto.email,
        pec: contatto.pec,
        codice_sdi: contatto.codice_sdi,
        telefono: contatto.telefono,
        indirizzo: contatto.indirizzo,
        note: contatto.note,
        sede_legale: contatto.sede_legale,
        sede_operativa: contatto.sede_operativa,
      };
      if (contatto.id && contatti.some((c) => c.id === contatto.id)) {
        const { error } = await supabase
          .from("rubrica" as any)
          .update(payload as any)
          .eq("id", contatto.id);
        if (error) {
          toast.error("Errore aggiornamento contatto");
          return;
        }
        toast.success("Contatto aggiornato");
      } else {
        const { error } = await supabase
          .from("rubrica" as any)
          .insert(payload as any);
        if (error) {
          if (error.code === "23505") {
            toast.error("Contatto già presente in rubrica");
          } else {
            toast.error("Errore inserimento contatto");
          }
          return;
        }
        toast.success("Contatto aggiunto");
      }
      await fetchContatti();
    },
    [contatti, fetchContatti]
  );

  const deleteContatto = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("rubrica" as any)
        .delete()
        .eq("id", id);
      if (error) {
        toast.error("Errore eliminazione contatto");
        return;
      }
      toast.success("Contatto eliminato");
      await fetchContatti();
    },
    [fetchContatti]
  );

  const importFromInvoices = useCallback(async () => {
    const [salesRes, purchasesRes, xmlRes, docsRes] = await Promise.all([
      supabase.from("fatture_vendita").select("cliente, partita_iva"),
      supabase.from("fatture_acquisto").select("fornitore, partita_iva"),
      supabase.from("fatture_xml").select("cedente_denominazione, cessionario_denominazione, tipo"),
      supabase.from("documenti_acquisto").select("fornitore, tipo"),
    ]);

    const existingMap = new Map(contatti.map((c) => [c.denominazione.toLowerCase().trim(), c]));
    const toInsert: Map<string, { denominazione: string; tipo: string; partita_iva: string }> = new Map();

    const addEntry = (name: string | null, tipo: string, piva?: string | null) => {
      if (!name || !name.trim()) return;
      const key = name.trim().toLowerCase();
      const existing = existingMap.get(key);
      if (existing) {
        // If already in DB as cliente and now seen as fornitore (or vice versa), upgrade to socio
        if (
          (existing.tipo === "cliente" && tipo === "fornitore") ||
          (existing.tipo === "fornitore" && tipo === "cliente")
        ) {
          if (existing.tipo !== "socio") {
            // Mark for update to socio
            toInsert.set(key, { denominazione: existing.denominazione, tipo: "socio", partita_iva: existing.partita_iva || piva?.trim() || "" });
            existingMap.set(key, { ...existing, tipo: "socio" });
          }
        }
        return;
      }
      const prev = toInsert.get(key);
      if (prev) {
        // Both cliente and fornitore in new entries → socio
        if (
          (prev.tipo === "cliente" && tipo === "fornitore") ||
          (prev.tipo === "fornitore" && tipo === "cliente")
        ) {
          prev.tipo = "socio";
          if (!prev.partita_iva && piva?.trim()) prev.partita_iva = piva.trim();
        }
        return;
      }
      toInsert.set(key, {
        denominazione: name.trim(),
        tipo,
        partita_iva: piva?.trim() || "",
      });
    };

    (salesRes.data || []).forEach((r: any) => addEntry(r.cliente, "cliente", r.partita_iva));
    (purchasesRes.data || []).forEach((r: any) => addEntry(r.fornitore, "fornitore", r.partita_iva));
    (xmlRes.data || []).forEach((r: any) => {
      if (r.tipo === "vendita") {
        addEntry(r.cessionario_denominazione, "cliente");
      } else {
        addEntry(r.cedente_denominazione, "fornitore");
      }
    });
    (docsRes.data || []).forEach((r: any) => {
      const docTipo = r.tipo === "vendita" ? "cliente" : "fornitore";
      addEntry(r.fornitore, docTipo);
    });

    if (toInsert.size === 0) {
      toast.info("Nessun nuovo contatto da importare");
      return 0;
    }

    const entries = Array.from(toInsert.values());
    const batchSize = 50;
    let inserted = 0;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize).map((e) => ({
        denominazione: e.denominazione,
        tipo: e.tipo,
        partita_iva: e.partita_iva,
      }));
      const { error } = await supabase.from("rubrica" as any).insert(batch as any);
      if (!error) inserted += batch.length;
    }

    toast.success(`${inserted} contatti importati`);
    await fetchContatti();
    return inserted;
  }, [contatti, fetchContatti]);

  return { contatti, loading, saveContatto, deleteContatto, importFromInvoices, refetch: fetchContatti };
}
