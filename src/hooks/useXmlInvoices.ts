import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseFatturaPA, extractInvoiceNumber, extractInvoiceYear, FatturaPAData } from "@/lib/fatturaPA";
import { toast } from "sonner";

export interface XmlInvoiceRecord {
  id: string;
  file_name: string;
  storage_path: string;
  anno: number | null;
  numero: number | null;
  invoice_key: string | null;
  cedente_denominazione: string | null;
  cessionario_denominazione: string | null;
  data_fattura: string | null;
  importo_totale: number | null;
  parsed_data: FatturaPAData | null;
  matched: boolean;
  tipo: string;
  created_at: string;
  numero_documento: string;
}

interface InvoiceWithKey {
  anno: number;
  numero: number;
  totale?: number;
  cliente?: string;
  fornitore?: string;
  tipo?: string; // e.g. "Nota di Credito", "Fattura", etc.
}

function normalizeStr(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fuzzyNameMatch(a: string, b: string): boolean {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/** TD04 = nota di credito, TD01/TD06/TD24/TD25 = fattura */
function isXmlCreditNote(tipoDocumento: string | undefined): boolean {
  return (tipoDocumento || "").toUpperCase() === "TD04";
}

function isInvoiceCreditNote(tipo: string | undefined): boolean {
  const t = (tipo || "").toLowerCase();
  return t.includes("nota") && t.includes("credito");
}

/**
 * For purchases, match by amount + supplier name since the XML's invoice number
 * is the supplier's numbering, not the company's internal registration number.
 */
function findPurchaseMatch(
  xmlCedente: string | null,
  xmlImporto: number | null,
  invoices: InvoiceWithKey[],
  alreadyMatchedKeys: Set<string>
): InvoiceWithKey | null {
  if (!xmlImporto) return null;

  // First: exact amount + name match
  for (const inv of invoices) {
    const key = `${inv.anno}-${inv.numero}`;
    if (alreadyMatchedKeys.has(key)) continue;
    const amountMatch = inv.totale && Math.abs(inv.totale - xmlImporto) < 0.02;
    const nameMatch = xmlCedente && inv.fornitore && fuzzyNameMatch(xmlCedente, inv.fornitore);
    if (amountMatch && nameMatch) return inv;
  }

  // Fallback: exact amount match only (if unique)
  const amountMatches = invoices.filter((inv) => {
    const key = `${inv.anno}-${inv.numero}`;
    if (alreadyMatchedKeys.has(key)) return false;
    return inv.totale && Math.abs(inv.totale - xmlImporto) < 0.02;
  });
  if (amountMatches.length === 1) return amountMatches[0];

  return null;
}

export function useXmlInvoices(invoices: InvoiceWithKey[], tipo: "vendita" | "acquisto" = "vendita") {
  const [xmlRecords, setXmlRecords] = useState<XmlInvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    const { data, error } = await supabase
      .from("fatture_xml" as any)
      .select("id, file_name, storage_path, anno, numero, invoice_key, cedente_denominazione, cessionario_denominazione, data_fattura, importo_totale, matched, tipo, created_at, numero_documento")
      .eq("tipo", tipo)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching XML records:", error);
      return;
    }
    setXmlRecords((data || []).map((r: any) => ({ ...r, parsed_data: null, numero_documento: r.numero_documento || "" })) as unknown as XmlInvoiceRecord[]);
    setLoading(false);
  }, [tipo]);

  const fetchParsedData = useCallback(async (id: string): Promise<FatturaPAData | null> => {
    const { data, error } = await supabase
      .from("fatture_xml" as any)
      .select("parsed_data")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return (data as any).parsed_data as FatturaPAData | null;
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const uploadXmlFiles = useCallback(async (files: File[], onProgress?: (done: number, total: number) => void) => {
    let uploaded = 0;
    let matched = 0;
    let skipped = 0;
    const total = files.length;

    // Track already-matched invoice keys to avoid double matching
    const alreadyMatchedKeys = new Set<string>();
    xmlRecords.forEach((r) => {
      if (r.matched && r.invoice_key) alreadyMatchedKeys.add(r.invoice_key);
    });

    // Build a set of existing file names for dedup
    const existingFileNames = new Map<string, XmlInvoiceRecord>();
    xmlRecords.forEach((r) => {
      existingFileNames.set(r.file_name, r);
    });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(i, total);
      try {
        // Check if file already exists
        const existingRecord = existingFileNames.get(file.name);
        if (existingRecord) {
          // Compare: new file is "more complete" if it's larger
          if (file.size <= 0) { skipped++; continue; }
          // If existing record already matched and has data, skip unless new file is bigger
          const existingHasData = existingRecord.matched && existingRecord.cedente_denominazione;
          if (existingHasData) {
            skipped++;
            continue;
          }
          // Otherwise, delete old and re-upload (new file is potentially more complete)
          await supabase.storage.from("fatture-xml").remove([existingRecord.storage_path]);
          await supabase.from("fatture_xml" as any).delete().eq("id", existingRecord.id);
        }

        const text = await file.text();
        const parsed = parseFatturaPA(text);
        const xmlNumero = extractInvoiceNumber(parsed.numero);
        const xmlAnno = extractInvoiceYear(parsed.data);

        const storagePath = `${tipo}/${xmlAnno}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("fatture-xml")
          .upload(storagePath, file, { upsert: true });
        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(`Errore upload ${file.name}`);
          continue;
        }

        let invoiceKey: string | null = null;
        let isMatched = false;
        let matchedAnno: number | null = xmlAnno || null;
        let matchedNumero: number | null = xmlNumero || null;

        if (tipo === "vendita") {
          const xmlIsNC = isXmlCreditNote(parsed.tipoDocumento);
          const candidates = invoices.filter(
            (s) => s.anno === xmlAnno && s.numero === xmlNumero
          );
          const typeMatch = candidates.find(
            (s) => isInvoiceCreditNote(s.tipo) === xmlIsNC
          );
          const match = typeMatch || (candidates.length === 1 ? candidates[0] : null);
          if (match) {
            invoiceKey = `${match.anno}-${match.numero}`;
            isMatched = true;
          }
        } else {
          const purchaseMatch = findPurchaseMatch(
            parsed.cedente.denominazione,
            parsed.importoTotale,
            invoices,
            alreadyMatchedKeys
          );
          if (purchaseMatch) {
            invoiceKey = `${purchaseMatch.anno}-${purchaseMatch.numero}`;
            matchedAnno = purchaseMatch.anno;
            matchedNumero = purchaseMatch.numero;
            isMatched = true;
            alreadyMatchedKeys.add(invoiceKey);
          }
        }

        const { rawXml, ...parsedWithoutRaw } = parsed;

        const { error: insertError } = await supabase
          .from("fatture_xml" as any)
          .insert({
            file_name: file.name,
            storage_path: storagePath,
            anno: matchedAnno,
            numero: matchedNumero,
            invoice_key: invoiceKey,
            cedente_denominazione: parsed.cedente.denominazione || null,
            cessionario_denominazione: parsed.cessionario.denominazione || null,
            data_fattura: parsed.data || null,
            importo_totale: parsed.importoTotale || null,
            parsed_data: parsedWithoutRaw as any,
            matched: isMatched,
            tipo,
          } as any);

        if (insertError) {
          console.error("Insert error:", insertError);
          toast.error(`Errore salvataggio ${file.name}`);
          continue;
        }

        uploaded++;
        if (isMatched) matched++;
      } catch (e) {
        console.error(`Error processing ${file.name}:`, e);
        toast.error(`Errore elaborazione ${file.name}`);
      }
    }

    onProgress?.(total, total);
    const parts = [`${uploaded} XML caricati`, `${matched} associati`];
    if (skipped > 0) parts.push(`${skipped} già presenti`);
    toast.success(parts.join(", "));
    await fetchRecords();
    return { uploaded, matched };
  }, [invoices, fetchRecords, tipo, xmlRecords]);

  const deleteRecord = useCallback(async (id: string, storagePath: string) => {
    await supabase.storage.from("fatture-xml").remove([storagePath]);
    await supabase.from("fatture_xml" as any).delete().eq("id", id);
    await fetchRecords();
    toast.success("XML eliminato");
  }, [fetchRecords]);

  /**
   * Find and remove duplicate XML records (same file_name + tipo).
   * Keeps the oldest record (first uploaded) and deletes newer duplicates.
   */
  const removeDuplicates = useCallback(async () => {
    const seen = new Map<string, typeof xmlRecords[0]>();
    const duplicates: typeof xmlRecords[0][] = [];

    // Sort by created_at ascending so we keep the oldest
    const sorted = [...xmlRecords].sort((a, b) => a.created_at.localeCompare(b.created_at));

    for (const r of sorted) {
      const key = r.file_name;
      if (seen.has(key)) {
        duplicates.push(r);
      } else {
        seen.set(key, r);
      }
    }

    if (duplicates.length === 0) {
      toast.info("Nessun XML duplicato trovato");
      return 0;
    }

    // Delete duplicates from storage and DB
    const storagePaths = duplicates.map(d => d.storage_path);
    await supabase.storage.from("fatture-xml").remove(storagePaths);

    for (const d of duplicates) {
      await supabase.from("fatture_xml" as any).delete().eq("id", d.id);
    }

    await fetchRecords();
    toast.success(`${duplicates.length} XML duplicati rimossi`);
    return duplicates.length;
  }, [xmlRecords, fetchRecords]);

  const manualMatch = useCallback(async (xmlId: string, anno: number, numero: number) => {
    const invoiceKey = `${anno}-${numero}`;
    await supabase
      .from("fatture_xml" as any)
      .update({ invoice_key: invoiceKey, anno, numero, matched: true } as any)
      .eq("id", xmlId);
    await fetchRecords();
    toast.success(`Associato a fattura ${numero}/${anno}`);
  }, [fetchRecords]);

  /**
   * Re-match all unmatched (or all) records for purchases using amount+name logic.
   */
  const rematchAll = useCallback(async () => {
    const alreadyMatchedKeys = new Set<string>();
    let matchedCount = 0;

    for (const record of xmlRecords) {
      let match: InvoiceWithKey | null = null;

      if (tipo === "acquisto") {
        match = findPurchaseMatch(
          record.cedente_denominazione,
          record.importo_totale,
          invoices,
          alreadyMatchedKeys
        );
      } else {
        // Vendita: match by anno+numero, preferring type-coherent matches
        const xmlIsNC = isXmlCreditNote((record as any).parsed_data?.tipoDocumento);
        const xmlAnno = record.anno;
        const xmlNumero = record.numero;
        if (xmlAnno && xmlNumero) {
          const candidates = invoices.filter(
            (s) => s.anno === xmlAnno && s.numero === xmlNumero && !alreadyMatchedKeys.has(`${s.anno}-${s.numero}`)
          );
          const typeMatch = candidates.find((s) => isInvoiceCreditNote(s.tipo) === xmlIsNC);
          match = typeMatch || (candidates.length === 1 ? candidates[0] : null);
        }
      }

      if (match) {
        const invoiceKey = `${match.anno}-${match.numero}`;
        alreadyMatchedKeys.add(invoiceKey);

        if (record.invoice_key !== invoiceKey || !record.matched) {
          await supabase
            .from("fatture_xml" as any)
            .update({
              invoice_key: invoiceKey,
              anno: match.anno,
              numero: match.numero,
              matched: true,
            } as any)
            .eq("id", record.id);
          matchedCount++;
        }
      } else if (record.matched) {
        await supabase
          .from("fatture_xml" as any)
          .update({ invoice_key: null, matched: false } as any)
          .eq("id", record.id);
        matchedCount++;
      }
    }

    if (matchedCount > 0) {
      await fetchRecords();
      toast.success(`${matchedCount} associazioni aggiornate`);
    } else {
      toast.info("Nessuna modifica necessaria");
    }
  }, [xmlRecords, invoices, tipo, fetchRecords]);

  // Map: invoice_key -> XmlInvoiceRecord[] (multiple XMLs can share the same number/year)
  const xmlMultiMap = new Map<string, XmlInvoiceRecord[]>();
  xmlRecords.forEach((r) => {
    if (r.invoice_key) {
      const list = xmlMultiMap.get(r.invoice_key) || [];
      list.push(r);
      xmlMultiMap.set(r.invoice_key, list);
    }
  });

  /**
   * Look up an XML record by invoice key + optional counterpart name.
   * For sales, counterpart = cessionario (client).
   * For purchases, counterpart = cedente (supplier).
   */
  const findXml = (key: string, counterpartName?: string): XmlInvoiceRecord | undefined => {
    const list = xmlMultiMap.get(key);
    if (!list || list.length === 0) return undefined;
    if (list.length === 1 || !counterpartName) return list[0];
    // Try matching by counterpart name
    const cn = normalizeStr(counterpartName);
    const field = tipo === "vendita" ? "cessionario_denominazione" : "cedente_denominazione";
    const match = list.find((r) => {
      const xmlName = normalizeStr(r[field] || "");
      return xmlName && cn && (xmlName.includes(cn) || cn.includes(xmlName));
    });
    return match || list[0];
  };

  const hasXml = (key: string): boolean => xmlMultiMap.has(key);

  // Legacy xmlMap for backward compatibility (single record per key, first match)
  const xmlMap = new Map<string, XmlInvoiceRecord>();
  xmlMultiMap.forEach((list, key) => xmlMap.set(key, list[0]));

  return { xmlRecords, xmlMap, xmlMultiMap, loading, uploadXmlFiles, deleteRecord, manualMatch, rematchAll, removeDuplicates, refresh: fetchRecords, fetchParsedData, findXml, hasXml };
}
