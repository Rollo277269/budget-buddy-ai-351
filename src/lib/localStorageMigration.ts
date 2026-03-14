/**
 * One-shot migration from localStorage to Supabase DB.
 * Reads old data from known localStorage keys, inserts into DB, then marks migration done.
 * Safe to call multiple times — exits immediately if already migrated.
 */
import { supabase } from "@/integrations/supabase/client";

const MIGRATION_FLAG = "ls-to-db-migration-done-v1";

function tryParse<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Try multiple possible keys for the same data
function tryParseMultiple<T>(...keys: string[]): T | null {
  for (const key of keys) {
    const result = tryParse<T>(key);
    if (result) return result;
  }
  return null;
}

interface OldCentro {
  id: string;
  tipo: "costo" | "ricavo";
  codice: string;
  descrizione?: string;
  paroleChiaveMatching?: string;
  note?: string;
  categoriaId?: string;
}

interface OldCategoria {
  id: string;
  tipo: "costo" | "ricavo";
  codice: string;
  descrizione?: string;
}

interface OldConto {
  id: string;
  tipo: string;
  banca: string;
  iban: string;
  intestatario?: string;
  note?: string;
}

interface OldCentroAssignment {
  [invoiceKey: string]: string; // invoice_key → centro_codice
}

export async function runLocalStorageMigration() {
  // Skip if already done
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  // Log all localStorage keys for debugging
  const allKeys = Object.keys(localStorage);
  console.log("[Migration] All localStorage keys:", allKeys);
  console.log("[Migration] localStorage contents preview:", allKeys.reduce((acc, k) => {
    const val = localStorage.getItem(k);
    acc[k] = val ? val.substring(0, 100) : null;
    return acc;
  }, {} as Record<string, string | null>));

  let migrated = 0;

  // ── 1. Centri C/R ──
  const centri = tryParseMultiple<OldCentro[]>(
    "centri_cr", "centri-cr", "centri", "centri_costo_ricavo"
  );
  if (centri && centri.length > 0) {
    console.log(`[Migration] Found ${centri.length} centri in localStorage`);
    // Check DB is empty first
    const { data: existing } = await supabase.from("centri_cr" as any).select("id").limit(1);
    if (!existing || existing.length === 0) {
      const rows = centri.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        codice: c.codice,
        descrizione: c.descrizione || "",
        parole_chiave_matching: c.paroleChiaveMatching || "",
        note: c.note || "",
        categoria_id: c.categoriaId || null,
      }));
      const { error } = await supabase.from("centri_cr" as any).insert(rows as any);
      if (error) console.error("[Migration] Error migrating centri:", error);
      else { migrated += rows.length; console.log(`[Migration] Migrated ${rows.length} centri`); }
    }
  }

  // ── 2. Categorie Centri ──
  const categorie = tryParseMultiple<OldCategoria[]>(
    "categorie_centri", "categorie-centri", "categorie"
  );
  if (categorie && categorie.length > 0) {
    console.log(`[Migration] Found ${categorie.length} categorie in localStorage`);
    const { data: existing } = await supabase.from("categorie_centri" as any).select("id").limit(1);
    if (!existing || existing.length === 0) {
      const rows = categorie.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        codice: c.codice,
        descrizione: c.descrizione || "",
      }));
      const { error } = await supabase.from("categorie_centri" as any).insert(rows as any);
      if (error) console.error("[Migration] Error migrating categorie:", error);
      else { migrated += rows.length; console.log(`[Migration] Migrated ${rows.length} categorie`); }
    }
  }

  // ── 3. Conti Correnti ──
  const conti = tryParseMultiple<OldConto[]>(
    "conti_correnti", "conti-correnti", "conti"
  );
  if (conti && conti.length > 0) {
    console.log(`[Migration] Found ${conti.length} conti in localStorage`);
    const { data: existing } = await supabase.from("conti_correnti" as any).select("id").limit(1);
    if (!existing || existing.length === 0) {
      const rows = conti.map((c) => ({
        tipo: c.tipo || "conto_corrente",
        banca: c.banca,
        iban: c.iban,
        intestatario: c.intestatario || "",
        note: c.note || "",
      }));
      const { error } = await supabase.from("conti_correnti" as any).insert(rows as any);
      if (error) console.error("[Migration] Error migrating conti:", error);
      else { migrated += rows.length; console.log(`[Migration] Migrated ${rows.length} conti`); }
    }
  }

  // ── 4. Centro Assignments (ricavo vendite, costo acquisti, costo vendite, ricavo acquisti) ──
  const assignmentKeys = [
    { ls: ["centro-map-ricavo-vendite", "centroMap-ricavo-vendite", "centro_map_ricavo_vendite"], tipo: "ricavo", context: "vendite" },
    { ls: ["centro-map-costo-acquisti", "centroMap-costo-acquisti", "centro_map_costo_acquisti"], tipo: "costo", context: "acquisti" },
    { ls: ["centro-map-costo-vendite", "centroMap-costo-vendite", "centro_map_costo_vendite"], tipo: "costo", context: "vendite" },
    { ls: ["centro-map-ricavo-acquisti", "centroMap-ricavo-acquisti", "centro_map_ricavo_acquisti"], tipo: "ricavo", context: "acquisti" },
  ];

  for (const ak of assignmentKeys) {
    const map = tryParseMultiple<OldCentroAssignment>(...ak.ls);
    if (map && Object.keys(map).length > 0) {
      console.log(`[Migration] Found ${Object.keys(map).length} assignments for ${ak.tipo}/${ak.context}`);
      const { data: existing } = await supabase
        .from("centro_assignments" as any)
        .select("id")
        .eq("tipo", ak.tipo)
        .eq("context", ak.context)
        .limit(1);
      if (!existing || existing.length === 0) {
        const rows = Object.entries(map).map(([invoiceKey, centroCodice]) => ({
          invoice_key: invoiceKey,
          tipo: ak.tipo,
          context: ak.context,
          centro_codice: centroCodice,
        }));
        // Insert in batches of 100
        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100);
          const { error } = await supabase.from("centro_assignments" as any).insert(batch as any);
          if (error) { console.error("[Migration] Error migrating assignments:", error); break; }
        }
        migrated += rows.length;
        console.log(`[Migration] Migrated ${rows.length} assignments for ${ak.tipo}/${ak.context}`);
      }
    }
  }

  // ── 5. Commessa Manual Links ──
  const links = tryParseMultiple<any[]>("commessa-manual-links");
  if (links && links.length > 0) {
    console.log(`[Migration] Found ${links.length} commessa links in localStorage (kept in localStorage for now)`);
    // These are still managed via localStorage in useCommessaLinks, so we don't migrate them
  }

  // Mark migration as done
  localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());

  if (migrated > 0) {
    console.log(`[Migration] ✅ Successfully migrated ${migrated} records from localStorage to database`);
    // Reload to pick up the new data
    window.location.reload();
  } else {
    console.log("[Migration] No data found in localStorage to migrate");
  }
}
