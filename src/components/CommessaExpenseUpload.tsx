import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCentriFromDb } from "@/hooks/useCentri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Upload, Loader2, FileText, Check, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(" ") + "\n";
  }
  return text;
}

interface ExpenseFormData {
  fornitore: string;
  descrizione: string;
  importo_totale: number;
  imponibile: number;
  imposta: number;
  data_documento: string;
  centro_costo: string;
  tipo_documento: string;
}

interface Props {
  cig: string;
  commessaNumero: string | number;
  onExpenseAdded: () => void;
}

export function CommessaExpenseUpload({ cig, commessaNumero, onExpenseAdded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [storagePath, setStoragePath] = useState<string>("");
  const [formData, setFormData] = useState<ExpenseFormData | null>(null);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Seleziona un file PDF");
      return;
    }

    setProcessing(true);
    setSelectedFile(file);
    setFormData(null);

    try {
      // 1. Extract text from PDF
      const text = await extractTextFromPdf(file);
      setExtractedText(text);

      // 2. Upload to storage
      const path = `commesse/${commessaNumero}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documenti-commesse")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      setStoragePath(path);

      // 3. Call AI to parse
      const centri = await fetchCentriFromDb();
      const { data, error } = await supabase.functions.invoke("parse-spesa-commessa", {
        body: { text, centri, cig },
      });

      if (error) {
        console.error("AI parse error:", error);
        toast.error("Errore analisi AI, compila manualmente");
        setFormData({
          fornitore: "",
          descrizione: file.name,
          importo_totale: 0,
          imponibile: 0,
          imposta: 0,
          data_documento: "",
          centro_costo: "",
          tipo_documento: "Altro",
        });
      } else {
        setFormData({
          fornitore: data.fornitore || "",
          descrizione: data.descrizione || file.name,
          importo_totale: data.importo_totale || 0,
          imponibile: data.imponibile || 0,
          imposta: data.imposta || 0,
          data_documento: data.data_documento || "",
          centro_costo: data.centro_costo || "",
          tipo_documento: data.tipo_documento || "Altro",
        });
      }
    } catch (err) {
      console.error("Error processing PDF:", err);
      toast.error("Errore nell'elaborazione del PDF");
    } finally {
      setProcessing(false);
    }
  }, [cig, commessaNumero]);

  const handleSave = useCallback(async () => {
    if (!formData || !selectedFile) return;

    setSaving(true);
    try {
      // Determine anno from data_documento
      let anno = new Date().getFullYear();
      if (formData.data_documento) {
        const parts = formData.data_documento.split("/");
        if (parts.length === 3) anno = parseInt(parts[2]) || anno;
      }

      // Get next numero for this anno
      const { data: existing } = await supabase
        .from("fatture_acquisto")
        .select("numero")
        .eq("anno", anno)
        .order("numero", { ascending: false })
        .limit(1);
      const nextNumero = (existing?.[0]?.numero || 0) + 1;

      // 1. Insert into fatture_acquisto
      const { error: insertError } = await supabase
        .from("fatture_acquisto")
        .insert({
          anno,
          numero: nextNumero,
          fornitore: formData.fornitore,
          descrizione: formData.descrizione,
          totale: formData.importo_totale,
          imponibile: formData.imponibile,
          imposta: formData.imposta,
          data: formData.data_documento,
          tipo: formData.tipo_documento,
          cig: cig,
          stato: "",
          source_file: `commessa-${commessaNumero}`,
        } as any);

      if (insertError) throw insertError;

      // 2. Link to commessa via commessa_links
      const invoiceKey = `${anno}-${nextNumero}`;
      await supabase
        .from("commessa_links")
        .insert({
          invoice_key: invoiceKey,
          invoice_type: "acquisto",
          cig: cig,
        } as any);

      // 3. Also save in documenti_acquisto for the Acquisti section
      await supabase
        .from("documenti_acquisto" as any)
        .insert({
          file_name: selectedFile.name,
          storage_path: storagePath,
          descrizione: formData.descrizione,
          importo: formData.importo_totale,
          data_documento: formData.data_documento,
          fornitore: formData.fornitore,
          centro_costo: formData.centro_costo,
          parsed_text: extractedText.substring(0, 10000),
          ai_summary: `Spesa commessa ${commessaNumero} (CIG: ${cig})`,
        } as any);

      // 4. Assign centro costo if provided
      if (formData.centro_costo) {
        await supabase
          .from("centro_assignments" as any)
          .insert({
            invoice_key: invoiceKey,
            centro_codice: formData.centro_costo,
            tipo: "costo",
            context: "acquisti",
          } as any);
      }

      toast.success(`Spesa registrata: ${formData.descrizione} — Fattura ${nextNumero}/${anno}`);
      
      // Reset form
      setSelectedFile(null);
      setFormData(null);
      setStoragePath("");
      setExtractedText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      onExpenseAdded();
    } catch (err) {
      console.error("Error saving expense:", err);
      toast.error("Errore nel salvataggio della spesa");
    } finally {
      setSaving(false);
    }
  }, [formData, selectedFile, cig, commessaNumero, storagePath, extractedText, onExpenseAdded]);

  const handleCancel = useCallback(() => {
    // Remove uploaded file from storage
    if (storagePath) {
      supabase.storage.from("documenti-commesse").remove([storagePath]);
    }
    setSelectedFile(null);
    setFormData(null);
    setStoragePath("");
    setExtractedText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [storagePath]);

  const updateField = (field: keyof ExpenseFormData, value: string | number) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
  };

  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-4 space-y-3 no-print">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Receipt className="h-4 w-4" />
        Aggiungi spesa da PDF
      </div>

      {!formData && !processing && (
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Carica PDF spesa
          </Button>
          <span className="text-xs text-muted-foreground">
            Il documento verrà analizzato con AI e registrato in contabilità
          </span>
        </div>
      )}

      {processing && (
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium">Analisi in corso...</p>
            <p className="text-xs text-muted-foreground">Estrazione dati dal PDF con AI</p>
          </div>
        </div>
      )}

      {formData && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Sparkles className="h-3 w-3" />
              {formData.tipo_documento}
            </Badge>
            <Badge variant="secondary" className="text-[10px] gap-1">
              <FileText className="h-3 w-3" />
              {selectedFile?.name}
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Fornitore</Label>
              <Input
                value={formData.fornitore}
                onChange={(e) => updateField("fornitore", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px]">Descrizione</Label>
              <Input
                value={formData.descrizione}
                onChange={(e) => updateField("descrizione", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Totale</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.importo_totale}
                onChange={(e) => updateField("importo_totale", parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Imponibile</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.imponibile}
                onChange={(e) => updateField("imponibile", parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">IVA</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.imposta}
                onChange={(e) => updateField("imposta", parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Data documento</Label>
              <Input
                value={formData.data_documento}
                onChange={(e) => updateField("data_documento", e.target.value)}
                placeholder="DD/MM/YYYY"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Centro di costo</Label>
              <Input
                value={formData.centro_costo}
                onChange={(e) => updateField("centro_costo", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="text-xs h-7 gap-1">
              <X className="h-3 w-3" />
              Annulla
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs h-7 gap-1">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Registra spesa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Need to import Receipt icon
import { Receipt } from "lucide-react";
