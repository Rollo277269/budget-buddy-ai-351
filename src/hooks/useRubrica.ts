import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ContattoRubrica {
  id: string;
  denominazione: string;
  tipo: "cliente" | "fornitore" | "socio";
  partita_iva: string;
  email: string;
  telefono: string;
  indirizzo: string;
  note: string;
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
        telefono: d.telefono || "",
        indirizzo: d.indirizzo || "",
        note: d.note || "",
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchContatti();
  }, [fetchContatti]);

  const saveContatto = useCallback(
    async (contatto: ContattoRubrica) => {
      if (contatto.id && contatti.some((c) => c.id === contatto.id)) {
        const { error } = await supabase
          .from("rubrica" as any)
          .update({
            denominazione: contatto.denominazione,
            tipo: contatto.tipo,
            partita_iva: contatto.partita_iva,
            email: contatto.email,
            telefono: contatto.telefono,
            indirizzo: contatto.indirizzo,
            note: contatto.note,
          } as any)
          .eq("id", contatto.id);
        if (error) {
          toast.error("Errore aggiornamento contatto");
          return;
        }
        toast.success("Contatto aggiornato");
      } else {
        const { error } = await supabase
          .from("rubrica" as any)
          .insert({
            denominazione: contatto.denominazione,
            tipo: contatto.tipo,
            partita_iva: contatto.partita_iva,
            email: contatto.email,
            telefono: contatto.telefono,
            indirizzo: contatto.indirizzo,
            note: contatto.note,
          } as any);
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
    // Fetch all unique names from sales, purchases, XML and documents
    const [salesRes, purchasesRes, xmlRes, docsRes] = await Promise.all([
      supabase.from("fatture_vendita").select("cliente, partita_iva"),
      supabase.from("fatture_acquisto").select("fornitore, partita_iva"),
      supabase.from("fatture_xml").select("cedente_denominazione, cessionario_denominazione, tipo"),
      supabase.from("documenti_acquisto").select("fornitore, tipo"),
    ]);

    const existingNames = new Set(contatti.map((c) => c.denominazione.toLowerCase().trim()));
    const toInsert: Map<string, { denominazione: string; tipo: string; partita_iva: string }> = new Map();

    const addEntry = (name: string | null, tipo: string, piva?: string | null) => {
      if (!name || !name.trim()) return;
      const key = name.trim().toLowerCase();
      if (existingNames.has(key) || toInsert.has(key)) return;
      toInsert.set(key, {
        denominazione: name.trim(),
        tipo,
        partita_iva: piva?.trim() || "",
      });
    };

    // Sales invoices → cliente
    (salesRes.data || []).forEach((r: any) => addEntry(r.cliente, "cliente", r.partita_iva));

    // Purchase invoices → fornitore
    (purchasesRes.data || []).forEach((r: any) => addEntry(r.fornitore, "fornitore", r.partita_iva));

    // XML: vendita → cessionario is cliente; acquisto → cedente is fornitore
    (xmlRes.data || []).forEach((r: any) => {
      if (r.tipo === "vendita") {
        addEntry(r.cessionario_denominazione, "cliente");
      } else {
        addEntry(r.cedente_denominazione, "fornitore");
      }
    });

    // Documents
    (docsRes.data || []).forEach((r: any) => {
      const docTipo = r.tipo === "vendita" ? "cliente" : "fornitore";
      addEntry(r.fornitore, docTipo);
    });

    if (toInsert.size === 0) {
      toast.info("Nessun nuovo contatto da importare");
      return 0;
    }

    // Check if any name already exists as a different tipo → mark as "socio"
    // For names appearing as both cliente and fornitore in the import batch
    const tipoMap = new Map<string, Set<string>>();
    // Include existing contatti
    contatti.forEach((c) => {
      const key = c.denominazione.toLowerCase().trim();
      if (!tipoMap.has(key)) tipoMap.set(key, new Set());
      tipoMap.get(key)!.add(c.tipo);
    });

    const entries = Array.from(toInsert.values());

    // Batch insert
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
