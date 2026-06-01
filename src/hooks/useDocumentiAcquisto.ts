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
  numero: string | null;
  fornitore: string | null;
  centro_costo: string | null;
  cig: string | null;
  parsed_text: string | null;
  ai_summary: string | null;
  created_at: string | null;
  tipo_documento?: string | null;
  data_scadenza?: string | null;
}

export interface PreparedDocumento {
  file_name: string;
  storage_path: string;
  descrizione: string;
  importo: number | null;
  data_documento: string;
  numero: string;
  fornitore: string;
  centro_costo: string;
  cig: string;
  parsed_text: string;
  ai_summary: string;
  tipo: "acquisto" | "vendita";
  tipo_documento: string;
  data_scadenza: string;
}

// ── Module-scope cache (per tipo) ──
const docCache: Record<string, DocumentoAcquisto[] | undefined> = {};
const docInflight: Record<string, Promise<DocumentoAcquisto[]> | undefined> = {};
const docSubs: Record<string, Set<(d: DocumentoAcquisto[]) => void>> = {};

async function loadDocumenti(tipo: string, force = false): Promise<DocumentoAcquisto[]> {
  if (docCache[tipo] && !force) return docCache[tipo]!;
  if (docInflight[tipo] && !force) return docInflight[tipo]!;
  docInflight[tipo] = (async () => {
    const { data, error } = await supabase
      .from("documenti_acquisto" as any)
      .select("*")
      .eq("tipo", tipo)
      .order("created_at", { ascending: false });
    if (error) { console.error("Error fetching documenti:", error); docCache[tipo] = docCache[tipo] ?? []; docInflight[tipo] = undefined; return docCache[tipo]!; }
    docCache[tipo] = (data || []) as unknown as DocumentoAcquisto[];
    docInflight[tipo] = undefined;
    docSubs[tipo]?.forEach((s) => s(docCache[tipo]!));
    return docCache[tipo]!;
  })();
  return docInflight[tipo]!;
}

export function useDocumentiAcquisto(tipo: "acquisto" | "vendita" = "acquisto") {
  const [documenti, setDocumenti] = useState<DocumentoAcquisto[]>(docCache[tipo] ?? []);
  const [loading, setLoading] = useState(!docCache[tipo]);

  const fetchDocumenti = useCallback(async () => {
    const d = await loadDocumenti(tipo, true);
    setDocumenti(d);
    setLoading(false);
  }, [tipo]);

  useEffect(() => {
    const cb = (d: DocumentoAcquisto[]) => setDocumenti(d);
    (docSubs[tipo] ||= new Set()).add(cb);
    if (docCache[tipo]) { setDocumenti(docCache[tipo]!); setLoading(false); }
    else loadDocumenti(tipo).then((d) => { setDocumenti(d); setLoading(false); });
    return () => { docSubs[tipo]?.delete(cb); };
  }, [tipo]);

  /**
   * Upload PDF + run AI parse, return the prepared data WITHOUT inserting yet.
   * Returns:
   *  - { kind: "duplicate", existing } if a document with the same file name already exists
   *  - { kind: "ready", prepared } otherwise
   *  - null on upload error
   */
  const prepareDocumento = useCallback(async (
    file: File,
    extractedText: string,
    options?: { overwriteExistingId?: string; overwriteStoragePath?: string },
  ): Promise<
    | { kind: "duplicate"; existing: { id: string; storage_path: string; file_name: string; descrizione: string | null; importo: number | null; fornitore: string | null; created_at: string | null } }
    | { kind: "ready"; prepared: PreparedDocumento }
    | null
  > => {
    // Check for existing document with same file name (skip if user already chose to overwrite)
    if (!options?.overwriteExistingId) {
      const { data: existing } = await supabase
        .from("documenti_acquisto" as any)
        .select("id, storage_path, file_name, descrizione, importo, fornitore, created_at")
        .eq("file_name", file.name)
        .eq("tipo", tipo);

      if (existing && existing.length > 0) {
        return { kind: "duplicate", existing: existing[0] as any };
      }
    } else {
      // User confirmed overwrite: delete old record + storage object
      await supabase.storage.from("documenti-acquisto").remove([options.overwriteStoragePath!]);
      await supabase.from("documenti_acquisto" as any).delete().eq("id", options.overwriteExistingId);
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
      kind: "ready",
      prepared: {
        file_name: file.name,
        storage_path: storagePath,
        descrizione: aiData.descrizione || file.name,
        importo: aiData.importo ?? null,
        data_documento: aiData.data_documento || "",
        numero: aiData.numero || "",
        fornitore: aiData.fornitore || "",
        centro_costo: aiData.centro_costo || "",
        cig: aiData.cig || "",
        parsed_text: extractedText.substring(0, 10000),
        ai_summary: aiData.summary || "",
        tipo,
        tipo_documento: aiData.tipo_documento || "",
        data_scadenza: aiData.data_scadenza || "",
      },
    };
  }, [tipo]);

  /** Insert the prepared document (after user confirmation/edit). */
  const finalizeDocumento = useCallback(async (prepared: PreparedDocumento) => {
    // Normalize DD/MM/YYYY -> YYYY-MM-DD for data_scadenza (better sorting)
    const isoScadenza = (() => {
      const s = (prepared.data_scadenza || "").trim();
      if (!s) return "";
      const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      return s;
    })();
    const { error: insertError } = await supabase
      .from("documenti_acquisto" as any)
      .insert({
        file_name: prepared.file_name,
        storage_path: prepared.storage_path,
        descrizione: prepared.descrizione || prepared.file_name,
        importo: prepared.importo,
        data_documento: prepared.data_documento || null,
        numero: prepared.numero || "",
        fornitore: prepared.fornitore || null,
        centro_costo: prepared.centro_costo || null,
        cig: prepared.cig || "",
        parsed_text: prepared.parsed_text,
        ai_summary: prepared.ai_summary || null,
        tipo: prepared.tipo,
        tipo_documento: prepared.tipo_documento || "",
        data_scadenza: isoScadenza,
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

  /** Legacy one-shot upload (kept for backward compatibility — duplicates are silently overwritten). */
  const uploadDocumento = useCallback(async (file: File, extractedText: string) => {
    let result = await prepareDocumento(file, extractedText);
    if (!result) return null;
    if (result.kind === "duplicate") {
      result = await prepareDocumento(file, extractedText, {
        overwriteExistingId: result.existing.id,
        overwriteStoragePath: result.existing.storage_path,
      });
      if (!result || result.kind !== "ready") return null;
    }
    await finalizeDocumento(result.prepared);
    return result.prepared;
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
