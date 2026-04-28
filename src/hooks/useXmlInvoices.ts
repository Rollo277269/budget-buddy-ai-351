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
  suffisso?: string;
  totale?: number;
  cliente?: string;
  fornitore?: string;
  tipo?: string;
  cig?: string;
  partita_iva?: string;
}

/** Extract suffisso from numero_documento, e.g. "9/A" → "A", "123" → "" */
function extractSuffisso(numeroDocumento: string): string {
  const match = (numeroDocumento || "").match(/\/([A-Za-z]+)$/);
  return match ? match[1] : "";
}

/** Build XML invoice key including suffisso when present */
export function buildSalesXmlKey(anno: number, numero: number, suffisso?: string): string {
  return suffisso ? `${anno}-${numero}-${suffisso}` : `${anno}-${numero}`;
}

function normalizeStr(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Split a name into normalized words for order-independent matching */
function nameWords(s: string): string[] {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
}

function fuzzyNameMatch(a: string, b: string): boolean {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return false;
  // Direct substring match
  if (na.includes(nb) || nb.includes(na)) return true;
  // Word-order-independent: check if all words of the shorter name appear in the longer
  const wa = nameWords(a);
  const wb = nameWords(b);
  if (wa.length === 0 || wb.length === 0) return false;
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const longerJoined = longer.join(" ");
  return shorter.every(w => longerJoined.includes(w));
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
 * Match a vendita XML to the correct invoice, using suffisso and cessionario name
 * to disambiguate when multiple invoices share the same anno+numero.
 */
function findSaleMatch(
  xmlAnno: number,
  xmlNumero: number,
  xmlNumeroDocumento: string,
  xmlCessionario: string | null,
  xmlTipoDocumento: string | undefined,
  invoices: InvoiceWithKey[],
  alreadyMatchedKeys: Set<string>
): InvoiceWithKey | null {
  const xmlIsNC = isXmlCreditNote(xmlTipoDocumento);
  const xmlSuffisso = extractSuffisso(xmlNumeroDocumento);
  const candidates = invoices.filter(
    (s) => s.anno === xmlAnno && s.numero === xmlNumero && !alreadyMatchedKeys.has(buildSalesXmlKey(s.anno, s.numero, s.suffisso))
  );

  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const c = candidates[0];
    // Still prefer type-coherent match
    return isInvoiceCreditNote(c.tipo) === xmlIsNC ? c : c;
  }

  // Multiple candidates: disambiguate by suffisso
  const suffissoMatch = candidates.filter(s => (s.suffisso || "") === xmlSuffisso);
  if (suffissoMatch.length === 1) return suffissoMatch[0];
  if (suffissoMatch.length > 1) {
    const typeMatch = suffissoMatch.find(s => isInvoiceCreditNote(s.tipo) === xmlIsNC);
    if (typeMatch) return typeMatch;
    return suffissoMatch[0];
  }

  // Fallback: disambiguate by cessionario/cliente name
  if (xmlCessionario) {
    const nameMatch = candidates.find(s => s.cliente && fuzzyNameMatch(xmlCessionario, s.cliente));
    if (nameMatch) return nameMatch;
  }

  // Last resort: type match
  const typeMatch = candidates.find(s => isInvoiceCreditNote(s.tipo) === xmlIsNC);
  return typeMatch || null;
}

/**
 * For purchases, use a multi-signal scoring approach:
 * - Exact amount match: +40 points
 * - Supplier name match: +30 points
 * - Same year (XML data_fattura vs invoice anno): +10 points
 * - CIG match: +20 points
 * - Numero documento match (XML supplier number = invoice numero): +15 points
 * Returns the highest-scoring unmatched invoice, or null if score < 40.
 */
function findPurchaseMatch(
  xmlCedente: string | null,
  xmlImporto: number | null,
  xmlAnno: number | null,
  xmlNumeroDocumento: string | null,
  xmlCig: string | null,
  invoices: InvoiceWithKey[],
  alreadyMatchedKeys: Set<string>
): InvoiceWithKey | null {
  if (!xmlImporto) return null;

  let bestMatch: InvoiceWithKey | null = null;
  let bestScore = 0;

  for (const inv of invoices) {
    const key = `${inv.anno}-${inv.numero}`;
    if (alreadyMatchedKeys.has(key)) continue;

    let score = 0;

    // Amount match (exact within 2 cents)
    if (inv.totale && Math.abs(inv.totale - xmlImporto) < 0.02) {
      score += 40;
    }

    // Supplier name match
    if (xmlCedente && inv.fornitore && fuzzyNameMatch(xmlCedente, inv.fornitore)) {
      score += 30;
    }

    // Year match
    if (xmlAnno && inv.anno === xmlAnno) {
      score += 10;
    }

    // CIG match (both non-empty and equal)
    if (xmlCig && inv.cig && xmlCig.trim().toLowerCase() === inv.cig.trim().toLowerCase()) {
      score += 20;
    }

    // Numero documento match: XML's supplier numbering matches the invoice numero
    if (xmlNumeroDocumento) {
      const xmlNum = parseInt(xmlNumeroDocumento, 10);
      if (!isNaN(xmlNum) && xmlNum === inv.numero) {
        score += 15;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = inv;
    }
  }

  // Require at least amount match (40) or name+year+CIG (60) to consider it valid
  return bestScore >= 40 ? bestMatch : null;
}

export function useXmlInvoices(invoices: InvoiceWithKey[], tipo: "vendita" | "acquisto" = "vendita") {
  const [xmlRecords, setXmlRecords] = useState<XmlInvoiceRecord[]>(xmlCache[tipo] ?? []);
  const [loading, setLoading] = useState(!xmlCache[tipo]);

  const loadOnce = useCallback(async (force = false): Promise<XmlInvoiceRecord[]> => {
    if (xmlCache[tipo] && !force) return xmlCache[tipo]!;
    if (xmlInflight[tipo] && !force) return xmlInflight[tipo]!;
    xmlInflight[tipo] = (async () => {
      const { data, error } = await supabase
        .from("fatture_xml" as any)
        .select("id, file_name, storage_path, anno, numero, invoice_key, cedente_denominazione, cessionario_denominazione, data_fattura, importo_totale, matched, tipo, created_at, numero_documento")
        .eq("tipo", tipo)
        .order("created_at", { ascending: false });
      if (error) { console.error("Error fetching XML records:", error); xmlInflight[tipo] = undefined; return xmlCache[tipo] ?? []; }
      xmlCache[tipo] = (data || []).map((r: any) => ({ ...r, parsed_data: null, numero_documento: r.numero_documento || "" })) as unknown as XmlInvoiceRecord[];
      xmlInflight[tipo] = undefined;
      (xmlSubs[tipo] ||= new Set()).forEach((s) => s(xmlCache[tipo]!));
      return xmlCache[tipo]!;
    })();
    return xmlInflight[tipo]!;
  }, [tipo]);

  const fetchRecords = useCallback(async () => {
    const r = await loadOnce(true);
    setXmlRecords(r);
    setLoading(false);
  }, [loadOnce]);

  const fetchParsedData = useCallback(async (id: string): Promise<FatturaPAData | null> => {
    const { data, error } = await supabase
      .from("fatture_xml" as any)
      .select("parsed_data")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return (data as any).parsed_data as FatturaPAData | null;
  }, []);

  useEffect(() => {
    const cb = (r: XmlInvoiceRecord[]) => setXmlRecords(r);
    (xmlSubs[tipo] ||= new Set()).add(cb);
    if (xmlCache[tipo]) { setXmlRecords(xmlCache[tipo]!); setLoading(false); }
    else loadOnce().then((r) => { setXmlRecords(r); setLoading(false); });
    return () => { xmlSubs[tipo]?.delete(cb); };
  }, [tipo, loadOnce]);

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
          if (file.size <= 0) { skipped++; continue; }
          const existingHasData = existingRecord.matched && existingRecord.cedente_denominazione;
          if (existingHasData) {
            skipped++;
            continue;
          }
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
          const match = findSaleMatch(
            xmlAnno, xmlNumero, parsed.numero,
            parsed.cessionario.denominazione,
            parsed.tipoDocumento,
            invoices, alreadyMatchedKeys
          );
          if (match) {
            invoiceKey = buildSalesXmlKey(match.anno, match.numero, match.suffisso);
            isMatched = true;
            alreadyMatchedKeys.add(invoiceKey);
          }
        } else {
          const purchaseMatch = findPurchaseMatch(
            parsed.cedente.denominazione,
            parsed.importoTotale,
            xmlAnno || null,
            parsed.numero || null,
            parsed.cig || null,
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
            numero_documento: parsed.numero || "",
          } as any);

        if (insertError) {
          console.error("Insert error:", insertError);
          toast.error(`Errore salvataggio ${file.name}`);
          continue;
        }

        uploaded++;
        if (isMatched) matched++;

        // If XML has CIG, update the matched invoice's CIG if it's empty
        if (parsed.cig && isMatched && matchedAnno && matchedNumero) {
          const table = tipo === "vendita" ? "fatture_vendita" : "fatture_acquisto";
          await supabase
            .from(table as any)
            .update({ cig: parsed.cig } as any)
            .eq("anno", matchedAnno)
            .eq("numero", matchedNumero)
            .or("cig.is.null,cig.eq.");
        }
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

    const storagePaths = duplicates.map(d => d.storage_path);
    await supabase.storage.from("fatture-xml").remove(storagePaths);

    for (const d of duplicates) {
      await supabase.from("fatture_xml" as any).delete().eq("id", d.id);
    }

    await fetchRecords();
    toast.success(`${duplicates.length} XML duplicati rimossi`);
    return duplicates.length;
  }, [xmlRecords, fetchRecords]);

  const manualMatch = useCallback(async (xmlId: string, anno: number, numero: number, suffisso?: string) => {
    const invoiceKey = tipo === "vendita" ? buildSalesXmlKey(anno, numero, suffisso) : `${anno}-${numero}`;
    await supabase
      .from("fatture_xml" as any)
      .update({ invoice_key: invoiceKey, anno, numero, matched: true } as any)
      .eq("id", xmlId);
    await fetchRecords();
    toast.success(`Associato a fattura ${numero}${suffisso ? '/' + suffisso : ''}/${anno}`);
  }, [fetchRecords, tipo]);

  /**
   * Re-match all unmatched (or all) records using suffisso+name disambiguation for vendita.
   */
  const rematchAll = useCallback(async () => {
    const alreadyMatchedKeys = new Set<string>();
    let matchedCount = 0;

    for (const record of xmlRecords) {
      // Skip already-matched records (preserve manual associations)
      if (record.matched && record.invoice_key) {
        alreadyMatchedKeys.add(record.invoice_key);
        continue;
      }

      let match: InvoiceWithKey | null = null;

      if (tipo === "acquisto") {
        match = findPurchaseMatch(
          record.cedente_denominazione,
          record.importo_totale,
          record.anno || null,
          record.numero_documento || null,
          null, // CIG not stored on fatture_xml yet
          invoices,
          alreadyMatchedKeys
        );
      } else {
        // Vendita: use suffisso + name disambiguation
        const xmlAnno = record.anno;
        const xmlNumero = record.numero;
        if (xmlAnno && xmlNumero) {
          match = findSaleMatch(
            xmlAnno, xmlNumero, record.numero_documento,
            record.cessionario_denominazione,
            (record as any).parsed_data?.tipoDocumento,
            invoices, alreadyMatchedKeys
          );
        }
      }

      if (match) {
        const invoiceKey = tipo === "vendita"
          ? buildSalesXmlKey(match.anno, match.numero, match.suffisso)
          : `${match.anno}-${match.numero}`;
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

  return { xmlRecords, xmlMap, xmlMultiMap, loading, uploadXmlFiles, deleteRecord, manualMatch, rematchAll, removeDuplicates, refresh: fetchRecords, fetchParsedData, findXml, hasXml, buildSalesXmlKey };
}
