import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CentroCR, fetchCentriFromDb } from "@/hooks/useCentri";

export interface DocumentoAcquisto {
  id: string;
  file_name: string;
  storage_path: string;
  descrizione: string | null;
  importo: number | null;
  data_documento: string | null;
  fornitore: string | null;
  centro_costo: string | null;
  cig: string | null;
  parsed_text: string | null;
  ai_summary: string | null;
  created_at: string | null;
}

export function useDocumentiAcquisto(tipo: "acquisto" | "vendita" = "acquisto") {
  const [documenti, setDocumenti] = useState<DocumentoAcquisto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocumenti = useCallback(async () => {
    const { data, error } = await supabase
      .from("documenti_acquisto" as any)
      .select("*")
      .eq("tipo", tipo)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching documenti:", error);
      return;
    }
    setDocumenti((data || []) as unknown as DocumentoAcquisto[]);
    setLoading(false);
  }, [tipo]);

  useEffect(() => { fetchDocumenti(); }, [fetchDocumenti]);

  const uploadDocumento = useCallback(async (
    file: File,
    extractedText: string,
    onAiResult?: (result: any) => void
  ) => {
    // Check for existing document with same file name
    const { data: existing } = await supabase
      .from("documenti_acquisto" as any)
      .select("id, storage_path, parsed_text, importo, fornitore, descrizione")
      .eq("file_name", file.name);

    if (existing && existing.length > 0) {
      const ex = existing[0] as any;
      // Compare completeness: existing has AI-parsed data vs new text
      const existingHasData = ex.importo || ex.fornitore || (ex.descrizione && ex.descrizione !== ex.file_name);
      const newTextLonger = extractedText.length > (ex.parsed_text || "").length;

      if (existingHasData && !newTextLonger) {
        toast.info(`"${file.name}" già presente, dati esistenti mantenuti`);
        return null;
      }

      // New file is more complete — delete old and re-upload
      await supabase.storage.from("documenti-acquisto").remove([ex.storage_path]);
      await supabase.from("documenti_acquisto" as any).delete().eq("id", ex.id);
    }

    const storagePath = `documenti/${Date.now()}_${file.name}`;

    // Upload file
    const { error: uploadError } = await supabase.storage
      .from("documenti-acquisto")
      .upload(storagePath, file, { upsert: true });
    if (uploadError) {
      console.error("Upload error:", uploadError);
      toast.error(`Errore upload ${file.name}`);
      return null;
    }

    // Call AI to parse
    let aiData: any = {};
    try {
      const centri = await fetchCentriFromDb();
      const { data, error } = await supabase.functions.invoke("parse-documento-acquisto", {
        body: { text: extractedText, centri },
      });
      if (!error && data) {
        aiData = data;
        onAiResult?.(data);
      }
    } catch (e) {
      console.error("AI parse error:", e);
    }

    // Insert record
    const { error: insertError } = await supabase
      .from("documenti_acquisto" as any)
      .insert({
        file_name: file.name,
        storage_path: storagePath,
        descrizione: aiData.descrizione || file.name,
        importo: aiData.importo || null,
        data_documento: aiData.data_documento || null,
        fornitore: aiData.fornitore || null,
        centro_costo: aiData.centro_costo || null,
        parsed_text: extractedText.substring(0, 10000),
        ai_summary: aiData.summary || null,
      } as any);

    if (insertError) {
      console.error("Insert error:", insertError);
      toast.error(`Errore salvataggio ${file.name}`);
      return null;
    }

    toast.success(`Documento "${aiData.descrizione || file.name}" caricato e analizzato`);
    await fetchDocumenti();
    return aiData;
  }, [fetchDocumenti]);

  const deleteDocumento = useCallback(async (id: string, storagePath: string) => {
    await supabase.storage.from("documenti-acquisto").remove([storagePath]);
    await supabase.from("documenti_acquisto" as any).delete().eq("id", id);
    await fetchDocumenti();
    toast.success("Documento eliminato");
  }, [fetchDocumenti]);

  const updateCentroCosto = useCallback(async (id: string, centroCosto: string) => {
    await supabase
      .from("documenti_acquisto" as any)
      .update({ centro_costo: centroCosto } as any)
      .eq("id", id);
    await fetchDocumenti();
  }, [fetchDocumenti]);

  const updateCig = useCallback(async (id: string, cig: string) => {
    await supabase
      .from("documenti_acquisto" as any)
      .update({ cig } as any)
      .eq("id", id);
    await fetchDocumenti();
  }, [fetchDocumenti]);

  return { documenti, loading, uploadDocumento, deleteDocumento, updateCentroCosto, updateCig, refresh: fetchDocumenti };
}
