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
}

interface InvoiceWithKey {
  anno: number;
  numero: number;
}

export function useXmlInvoices(invoices: InvoiceWithKey[], tipo: "vendita" | "acquisto" = "vendita") {
  const [xmlRecords, setXmlRecords] = useState<XmlInvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    const { data, error } = await supabase
      .from("fatture_xml" as any)
      .select("id, file_name, storage_path, anno, numero, invoice_key, cedente_denominazione, cessionario_denominazione, data_fattura, importo_totale, matched, tipo, created_at")
      .eq("tipo", tipo)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching XML records:", error);
      return;
    }
    setXmlRecords((data || []).map((r: any) => ({ ...r, parsed_data: null })) as unknown as XmlInvoiceRecord[]);
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
    const total = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(i, total);
      try {
        const text = await file.text();
        const parsed = parseFatturaPA(text);
        const numero = extractInvoiceNumber(parsed.numero);
        const anno = extractInvoiceYear(parsed.data);

        const storagePath = `${tipo}/${anno}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("fatture-xml")
          .upload(storagePath, file, { upsert: true });
        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(`Errore upload ${file.name}`);
          continue;
        }

        const invoiceKey = `${anno}-${numero}`;
        const isMatched = invoices.some((s) => s.anno === anno && s.numero === numero);
        const { rawXml, ...parsedWithoutRaw } = parsed;

        const { error: insertError } = await supabase
          .from("fatture_xml" as any)
          .insert({
            file_name: file.name,
            storage_path: storagePath,
            anno: anno || null,
            numero: numero || null,
            invoice_key: (anno && numero) ? invoiceKey : null,
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
    toast.success(`${uploaded} XML caricati, ${matched} associati automaticamente`);
    await fetchRecords();
    return { uploaded, matched };
  }, [invoices, fetchRecords, tipo]);

  const deleteRecord = useCallback(async (id: string, storagePath: string) => {
    await supabase.storage.from("fatture-xml").remove([storagePath]);
    await supabase.from("fatture_xml" as any).delete().eq("id", id);
    await fetchRecords();
    toast.success("XML eliminato");
  }, [fetchRecords]);

  const manualMatch = useCallback(async (xmlId: string, anno: number, numero: number) => {
    const invoiceKey = `${anno}-${numero}`;
    await supabase
      .from("fatture_xml" as any)
      .update({ invoice_key: invoiceKey, anno, numero, matched: true } as any)
      .eq("id", xmlId);
    await fetchRecords();
    toast.success(`Associato a fattura ${numero}/${anno}`);
  }, [fetchRecords]);

  // Map: invoice_key -> XmlInvoiceRecord
  const xmlMap = new Map<string, XmlInvoiceRecord>();
  xmlRecords.forEach((r) => {
    if (r.invoice_key) xmlMap.set(r.invoice_key, r);
  });

  return { xmlRecords, xmlMap, loading: loading, uploadXmlFiles, deleteRecord, manualMatch, refresh: fetchRecords, fetchParsedData };
}
