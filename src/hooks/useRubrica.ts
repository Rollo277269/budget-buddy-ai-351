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
  tipo: string;
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

// ── Module-scope cache ──
let rubricaCache: ContattoRubrica[] | null = null;
let rubricaInflight: Promise<ContattoRubrica[]> | null = null;
const rubricaSubs = new Set<(c: ContattoRubrica[]) => void>();

async function loadRubrica(force = false): Promise<ContattoRubrica[]> {
  if (rubricaCache && !force) return rubricaCache;
  if (rubricaInflight && !force) return rubricaInflight;
  rubricaInflight = (async () => {
    const { data, error } = await supabase
      .from("rubrica" as any)
      .select("*")
      .order("denominazione", { ascending: true });
    if (error) { console.error("Error loading rubrica:", error); rubricaCache = rubricaCache ?? []; rubricaInflight = null; return rubricaCache; }
    rubricaCache = (data as any[] || []).map((d: any) => ({
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
    }));
    rubricaInflight = null;
    rubricaSubs.forEach((s) => s(rubricaCache!));
    return rubricaCache;
  })();
  return rubricaInflight;
}

export function useRubrica() {
  const [contatti, setContatti] = useState<ContattoRubrica[]>(rubricaCache ?? []);
  const [loading, setLoading] = useState(!rubricaCache);

  const fetchContatti = useCallback(async () => {
    const c = await loadRubrica(true);
    setContatti(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    const cb = (c: ContattoRubrica[]) => setContatti(c);
    rubricaSubs.add(cb);
    if (rubricaCache) { setContatti(rubricaCache); setLoading(false); }
    else loadRubrica().then((c) => { setContatti(c); setLoading(false); });
    return () => { rubricaSubs.delete(cb); };
  }, []);

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

  // Unisce più contatti fornitori in uno solo: rinomina il fornitore in tutte le
  // tabelle delle fatture/documenti d'acquisto e cancella i contatti duplicati.
  const mergeContatti = useCallback(
    async (masterId: string, mergeIds: string[]) => {
      const master = contatti.find((c) => c.id === masterId);
      if (!master) {
        toast.error("Contatto principale non trovato");
        return;
      }
      const toMerge = contatti.filter((c) => mergeIds.includes(c.id) && c.id !== masterId);
      if (toMerge.length === 0) {
        toast.info("Nessun contatto da unire");
        return;
      }
      const masterName = master.denominazione;
      let updatedRows = 0;
      // Escape wildcards di LIKE per match esatto ma case-insensitive
      const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);
      // Esegue update case-insensitive: trova gli id che matchano (anche con
      // differenze di maiuscole/minuscole) e li aggiorna in blocco.
      const renameIn = async (
        table: "fatture_acquisto" | "documenti_acquisto" | "fatture_xml",
        column: "fornitore" | "cedente_denominazione",
        oldName: string,
        extraFilter?: (q: any) => any
      ) => {
        let selectQ: any = supabase.from(table).select("id").ilike(column, escLike(oldName));
        if (extraFilter) selectQ = extraFilter(selectQ);
        const { data: rows, error: selErr } = await selectQ;
        if (selErr || !rows || rows.length === 0) return 0;
        const ids = rows.map((r: any) => r.id);
        const { error: updErr } = await supabase
          .from(table)
          .update({ [column]: masterName } as any)
          .in("id", ids);
        if (updErr) {
          console.error(`merge update ${table} failed`, updErr);
          return 0;
        }
        return ids.length;
      };

      for (const c of toMerge) {
        const oldName = c.denominazione?.trim();
        if (!oldName) continue;
        const counts = await Promise.all([
          renameIn("fatture_acquisto", "fornitore", oldName),
          renameIn("documenti_acquisto", "fornitore", oldName),
          renameIn("fatture_xml", "cedente_denominazione", oldName, (q) => q.neq("tipo", "vendita")),
        ]);
        updatedRows += counts.reduce((a, b) => a + b, 0);
      }
      // Cancella i contatti uniti
      const idsToDelete = toMerge.map((c) => c.id);
      const { error: delErr } = await supabase.from("rubrica" as any).delete().in("id", idsToDelete);
      if (delErr) {
        toast.error("Errore eliminazione duplicati");
        return;
      }
      toast.success(`Uniti ${toMerge.length} contatti in "${masterName}" (${updatedRows} righe aggiornate)`);
      await fetchContatti();
    },
    [contatti, fetchContatti]
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
          if ((existing.tipo as string) !== "socio") {
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
    // Separate new inserts from existing contacts to upgrade to socio
    const newEntries: typeof entries = [];
    const upgradeToSocio: typeof entries = [];
    for (const e of entries) {
      const key = e.denominazione.toLowerCase().trim();
      const existing = contatti.find((c) => c.denominazione.toLowerCase().trim() === key);
      if (existing && e.tipo === "socio") {
        upgradeToSocio.push(e);
      } else if (!existing) {
        newEntries.push(e);
      }
    }

    // Update existing contacts to socio
    for (const e of upgradeToSocio) {
      const existing = contatti.find((c) => c.denominazione.toLowerCase().trim() === e.denominazione.toLowerCase().trim());
      if (existing) {
        await supabase.from("rubrica" as any).update({ tipo: "socio" } as any).eq("id", existing.id);
      }
    }

    const batchSize = 50;
    let inserted = 0;
    for (let i = 0; i < newEntries.length; i += batchSize) {
      const batch = newEntries.slice(i, i + batchSize).map((e) => ({
        denominazione: e.denominazione,
        tipo: e.tipo,
        partita_iva: e.partita_iva,
      }));
      const { error } = await supabase.from("rubrica" as any).insert(batch as any);
      if (!error) inserted += batch.length;
    }

    const total = inserted + upgradeToSocio.length;
    toast.success(total > 0 ? `${inserted} contatti importati, ${upgradeToSocio.length} aggiornati a Socio` : "Nessun nuovo contatto da importare");
    return inserted;
  }, [contatti, fetchContatti]);

  return { contatti, loading, saveContatto, deleteContatto, mergeContatti, importFromInvoices, refetch: fetchContatti };
}
