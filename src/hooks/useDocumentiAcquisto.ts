import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchCentriFromDb } from "@/hooks/useCentri";

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

export interface PreparedDocumento {
  file_name: string;
  storage_path: string;
  descrizione: string;
  importo: number | null;
  data_documento: string;
  fornitore: string;
  centro_costo: string;
  cig: string;
  parsed_text: string;
  ai_summary: string;
  tipo: "acquisto" | "vendita";
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

  /**
   * Upload PDF + run AI parse, return the prepared data WITHOUT inserting yet.
   * Returns null if file already exists with complete data, or on upload error.
   */
  const prepareDocumento = useCallback(async (
    file: File,
    extractedText: string,
  ): Promise<PreparedDocumento | null> => {
    // Check for existing document with same file name
    const { data: existing } = await supabase
      .from("documenti_acquisto" as any)
      .select("id, storage_path, parsed_text, importo, fornitore, descrizione")
      .eq("file_name", file.name);

    if (existing && existing.length > 0) {
      const ex = existing[0] as any;
      const existingHasData = ex.importo || ex.fornitore || (ex.descrizione && ex.descrizione !== ex.file_name);
      const newTextLonger = extractedText.length > (ex.parsed_text || "").length;

      if (existingHasData && !newTextLonger) {
        toast.info(`"${file.name}" già presente, dati esistenti mantenuti`);
        return null;
      }

      await supabase.storage.from("documenti-acquisto").remove([ex.storage_path]);
      await supabase.from("documenti_acquisto" as any).delete().eq("id", ex.id);
    }

    const storagePath = `documenti/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("documenti-acquisto")
      .upload(storagePath, file, { upsert: true });
    if (uploadError) {
      console.error("Upload error:", uploadError);
      toast.error(`Errore upload ${file.name}`);
      return null;
    }

    let aiData: any = {};
    try {
      const centri = await fetchCentriFromDb();
      const { data, error } = await supabase.functions.invoke("parse-documento-acquisto", {
        body: { text: extractedText, centri },
      });
      if (!error && data) aiData = data;
    } catch (e) {
      console.error("AI parse error:", e);
    }

    return {
      file_name: file.name,
      storage_path: storagePath,
      descrizione: aiData.descrizione || file.name,
      importo: aiData.importo ?? null,
      data_documento: aiData.data_documento || "",
      fornitore: aiData.fornitore || "",
      centro_costo: aiData.centro_costo || "",
      cig: aiData.cig || "",
      parsed_text: extractedText.substring(0, 10000),
      ai_summary: aiData.summary || "",
      tipo,
    };
  }, [tipo]);

  /** Insert the prepared document (after user confirmation/edit). */
  const finalizeDocumento = useCallback(async (prepared: PreparedDocumento) => {
    const { error: insertError } = await supabase
      .from("documenti_acquisto" as any)
      .insert({
        file_name: prepared.file_name,
        storage_path: prepared.storage_path,
        descrizione: prepared.descrizione || prepared.file_name,
        importo: prepared.importo,
        data_documento: prepared.data_documento || null,
        fornitore: prepared.fornitore || null,
        centro_costo: prepared.centro_costo || null,
        cig: prepared.cig || "",
        parsed_text: prepared.parsed_text,
        ai_summary: prepared.ai_summary || null,
        tipo: prepared.tipo,
      } as any);

    if (insertError) {
      console.error("Insert error:", insertError);
      toast.error(`Errore salvataggio ${prepared.file_name}`);
      return false;
    }

    toast.success(`Documento "${prepared.descrizione || prepared.file_name}" salvato`);
    await fetchDocumenti();
    return true;
  }, [fetchDocumenti]);

  /** Legacy one-shot upload (kept for backward compatibility). */
  const uploadDocumento = useCallback(async (file: File, extractedText: string) => {
    const prepared = await prepareDocumento(file, extractedText);
    if (!prepared) return null;
    await finalizeDocumento(prepared);
    return prepared;
  }, [prepareDocumento, finalizeDocumento]);

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

  const updateField = useCallback(async (id: string, field: string, value: string | number | null) => {
    await supabase
      .from("documenti_acquisto" as any)
      .update({ [field]: value } as any)
      .eq("id", id);
    await fetchDocumenti();
  }, [fetchDocumenti]);

  return {
    documenti,
    loading,
    prepareDocumento,
    finalizeDocumento,
    uploadDocumento,
    deleteDocumento,
    updateCentroCosto,
    updateCig,
    updateField,
    refresh: fetchDocumenti,
  };
}
