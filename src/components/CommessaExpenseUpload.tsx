import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCentriFromDb } from "@/hooks/useCentri";
import { NamingRule } from "@/hooks/useNamingRules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Upload, Loader2, FileText, Check, X, Sparkles, Receipt } from "lucide-react";
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

/**
 * Apply a naming rule pattern to generate a file name.
 * Supported placeholders: {ANNO}, {NUMERO}, {FORNITORE}, {CLIENTE}, {DATA}, {CIG}, {COMMESSA}, {DESCRIZIONE}
 */
function applyNamingRule(
  pattern: string,
  vars: Record<string, string>
): string {
  let result = pattern;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "gi"), value);
  }
  // Sanitize for file name
  result = result.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim();
  return result;
}

/** Convert DD/MM/YYYY to YYYY-MM-DD for file naming */
function toIsoDate(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  return ddmmyyyy;
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
  namingRules: NamingRule[];
  onExpenseAdded: () => void;
}

export function CommessaExpenseUpload({ cig, commessaNumero, namingRules, onExpenseAdded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [storagePath, setStoragePath] = useState<string>("");
  const [formData, setFormData] = useState<ExpenseFormData | null>(null);
  const [renamedFileName, setRenamedFileName] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  /** Find a matching naming rule by tipo_documento and build the renamed file name */
  const buildRenamedFileName = useCallback((aiData: ExpenseFormData, originalName: string): string => {
    // Try exact match on tipo_documento first, then fuzzy match
    const tipoLower = (aiData.tipo_documento || "").toLowerCase();
    let rule = namingRules.find((r) => r.tipo.toLowerCase() === tipoLower);
    if (!rule) {
      rule = namingRules.find((r) => {
        const t = r.tipo.toLowerCase();
        return tipoLower.includes(t) || t.includes(tipoLower);
      });
    }
    // Fallback: any acquisto/spesa rule
    if (!rule) {
      rule = namingRules.find((r) => {
        const t = r.tipo.toLowerCase();
        return t.includes("acquisto") || t.includes("spesa");
      });
    }
    if (!rule) return originalName;

    let anno = String(new Date().getFullYear());
    let dataFormatted = aiData.data_documento || "";
    if (aiData.data_documento) {
      const parts = aiData.data_documento.split("/");
      if (parts.length === 3) anno = parts[2];
    }

    const vars: Record<string, string> = {
      ANNO: anno,
      NUMERO: "0",
      FORNITORE: (aiData.fornitore || "").replace(/[^a-zA-Z0-9À-ÿ ]/g, "").trim(),
      CLIENTE: "",
      DATA: dataFormatted,
      CIG: cig || "",
      COMMESSA: String(commessaNumero),
      DESCRIZIONE: (aiData.descrizione || "").substring(0, 50).replace(/[^a-zA-Z0-9À-ÿ ]/g, "").trim(),
      TIPO: aiData.tipo_documento || "",
    };

    const name = applyNamingRule(rule.pattern, vars);
    return name ? `${name}.pdf` : originalName;
  }, [namingRules, cig, commessaNumero]);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Seleziona un file PDF");
      return;
    }

    setProcessing(true);
    setSelectedFile(file);
    setFormData(null);
    setRenamedFileName("");

    try {
      const text = await extractTextFromPdf(file);
      setExtractedText(text);

      // Upload with temporary name
      const path = `commesse/${commessaNumero}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documenti-commesse")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      setStoragePath(path);

      // Call AI to parse
      const centri = await fetchCentriFromDb();
      const ruleTypes = namingRules.map((r) => r.tipo);
      const { data, error } = await supabase.functions.invoke("parse-spesa-commessa", {
        body: { text, centri, cig, namingRuleTypes: ruleTypes },
      });

      let aiResult: ExpenseFormData;
      if (error) {
        console.error("AI parse error:", error);
        toast.error("Errore analisi AI, compila manualmente");
        aiResult = {
          fornitore: "", descrizione: file.name, importo_totale: 0,
          imponibile: 0, imposta: 0, data_documento: "", centro_costo: "", tipo_documento: "Altro",
        };
      } else {
        aiResult = {
          fornitore: data.fornitore || "", descrizione: data.descrizione || file.name,
          importo_totale: data.importo_totale || 0, imponibile: data.imponibile || 0,
          imposta: data.imposta || 0, data_documento: data.data_documento || "",
          centro_costo: data.centro_costo || "", tipo_documento: data.tipo_documento || "Altro",
        };
      }

      setFormData(aiResult);
      const renamed = buildRenamedFileName(aiResult, file.name);
      setRenamedFileName(renamed);
    } catch (err) {
      console.error("Error processing PDF:", err);
      toast.error("Errore nell'elaborazione del PDF");
    } finally {
      setProcessing(false);
    }
  }, [cig, commessaNumero, buildRenamedFileName]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    setDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleSave = useCallback(async () => {
    if (!formData || !selectedFile) return;

    setSaving(true);
    try {
      let anno = new Date().getFullYear();
      if (formData.data_documento) {
        const parts = formData.data_documento.split("/");
        if (parts.length === 3) anno = parseInt(parts[2]) || anno;
      }

      const { data: existing } = await supabase
        .from("fatture_acquisto")
        .select("numero")
        .eq("anno", anno)
        .order("numero", { ascending: false })
        .limit(1);
      const nextNumero = (existing?.[0]?.numero || 0) + 1;

      // Update renamed file name with actual numero
      let finalFileName = renamedFileName;
      if (finalFileName.includes("0.pdf") || !finalFileName) {
        const tipoLower = (formData.tipo_documento || "").toLowerCase();
        let rule = namingRules.find((r) => r.tipo.toLowerCase() === tipoLower);
        if (!rule) rule = namingRules.find((r) => {
          const t = r.tipo.toLowerCase();
          return tipoLower.includes(t) || t.includes(tipoLower);
        });
        if (!rule) rule = namingRules.find((r) => {
          const t = r.tipo.toLowerCase();
          return t.includes("acquisto") || t.includes("spesa");
        });
        if (rule) {
          const vars: Record<string, string> = {
            ANNO: String(anno),
            NUMERO: String(nextNumero),
            FORNITORE: (formData.fornitore || "").replace(/[^a-zA-Z0-9À-ÿ ]/g, "").trim(),
            CLIENTE: "",
            DATA: formData.data_documento || "",
            CIG: cig || "",
            COMMESSA: String(commessaNumero),
            DESCRIZIONE: (formData.descrizione || "").substring(0, 50).replace(/[^a-zA-Z0-9À-ÿ ]/g, "").trim(),
            TIPO: formData.tipo_documento || "",
          };
          finalFileName = applyNamingRule(rule.pattern, vars) + ".pdf";
        }
      }

      // Rename file in storage by copying + deleting old
      let finalStoragePath = storagePath;
      if (finalFileName && finalFileName !== selectedFile.name) {
        const newPath = `commesse/${commessaNumero}/${finalFileName}`;
        // Download old, upload with new name, delete old
        const { data: fileData } = await supabase.storage.from("documenti-commesse").download(storagePath);
        if (fileData) {
          const { error: reupErr } = await supabase.storage
            .from("documenti-commesse")
            .upload(newPath, fileData, { upsert: true });
          if (!reupErr) {
            await supabase.storage.from("documenti-commesse").remove([storagePath]);
            finalStoragePath = newPath;
          }
        }
      }

      // 1. Insert into fatture_acquisto
      const { error: insertError } = await supabase
        .from("fatture_acquisto")
        .insert({
          anno, numero: nextNumero, fornitore: formData.fornitore,
          descrizione: formData.descrizione, totale: formData.importo_totale,
          imponibile: formData.imponibile, imposta: formData.imposta,
          data: formData.data_documento, tipo: formData.tipo_documento,
          cig, stato: "", source_file: `commessa-${commessaNumero}`,
        } as any);
      if (insertError) throw insertError;

      // 2. Link to commessa
      const invoiceKey = `${anno}-${nextNumero}`;
      await supabase.from("commessa_links").insert({
        invoice_key: invoiceKey, invoice_type: "acquisto", cig,
      } as any);

      // 3. Save in documenti_acquisto
      await supabase.from("documenti_acquisto" as any).insert({
        file_name: finalFileName || selectedFile.name,
        storage_path: finalStoragePath,
        descrizione: formData.descrizione, importo: formData.importo_totale,
        data_documento: formData.data_documento, fornitore: formData.fornitore,
        centro_costo: formData.centro_costo,
        parsed_text: extractedText.substring(0, 10000),
        ai_summary: `Spesa commessa ${commessaNumero} (CIG: ${cig})`,
      } as any);

      // 4. Assign centro costo
      if (formData.centro_costo) {
        await supabase.from("centro_assignments" as any).insert({
          invoice_key: invoiceKey, centro_codice: formData.centro_costo,
          tipo: "costo", context: "acquisti",
        } as any);
      }

      toast.success(`Spesa registrata: ${finalFileName || formData.descrizione} — Fattura ${nextNumero}/${anno}`);

      setSelectedFile(null);
      setFormData(null);
      setStoragePath("");
      setExtractedText("");
      setRenamedFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onExpenseAdded();
    } catch (err) {
      console.error("Error saving expense:", err);
      toast.error("Errore nel salvataggio della spesa");
    } finally {
      setSaving(false);
    }
  }, [formData, selectedFile, cig, commessaNumero, storagePath, extractedText, renamedFileName, namingRules, onExpenseAdded]);

  const handleCancel = useCallback(() => {
    if (storagePath) {
      supabase.storage.from("documenti-commesse").remove([storagePath]);
    }
    setSelectedFile(null);
    setFormData(null);
    setStoragePath("");
    setExtractedText("");
    setRenamedFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [storagePath]);

  const updateField = (field: keyof ExpenseFormData, value: string | number) => {
    if (!formData) return;
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    // Rebuild renamed file name on change
    setRenamedFileName(buildRenamedFileName(updated, selectedFile?.name || ""));
  };

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-4 space-y-3 no-print transition-colors ${
        dragging
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50"
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Receipt className="h-4 w-4" />
        Aggiungi spesa da PDF
      </div>

      {!formData && !processing && (
        <div className="flex flex-col items-center gap-2 py-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <Upload className="h-5 w-5 text-muted-foreground" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            Carica PDF spesa
          </Button>
          <span className="text-[11px] text-muted-foreground text-center">
            Trascina qui un PDF oppure clicca per selezionare · Verrà analizzato con AI e rinominato automaticamente
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
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Sparkles className="h-3 w-3" />
              {formData.tipo_documento}
            </Badge>
            <Badge variant="secondary" className="text-[10px] gap-1">
              <FileText className="h-3 w-3" />
              {selectedFile?.name}
            </Badge>
            {renamedFileName && renamedFileName !== selectedFile?.name && (
              <Badge className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20">
                → {renamedFileName}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Fornitore</Label>
              <Input value={formData.fornitore} onChange={(e) => updateField("fornitore", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px]">Descrizione</Label>
              <Input value={formData.descrizione} onChange={(e) => updateField("descrizione", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Totale (€)</Label>
              <div className="relative">
                <Input type="number" step="0.01" value={formData.importo_totale} onChange={(e) => updateField("importo_totale", parseFloat(e.target.value) || 0)} className="h-8 text-xs font-mono pr-7" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">€</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Imponibile (€)</Label>
              <div className="relative">
                <Input type="number" step="0.01" value={formData.imponibile} onChange={(e) => updateField("imponibile", parseFloat(e.target.value) || 0)} className="h-8 text-xs font-mono pr-7" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">€</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">IVA (€)</Label>
              <div className="relative">
                <Input type="number" step="0.01" value={formData.imposta} onChange={(e) => updateField("imposta", parseFloat(e.target.value) || 0)} className="h-8 text-xs font-mono pr-7" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">€</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Data documento</Label>
              <Input value={formData.data_documento} onChange={(e) => updateField("data_documento", e.target.value)} placeholder="DD/MM/YYYY" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Centro di costo</Label>
              <Input value={formData.centro_costo} onChange={(e) => updateField("centro_costo", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Nome file</Label>
              <Input value={renamedFileName} onChange={(e) => setRenamedFileName(e.target.value)} className="h-8 text-xs font-mono" />
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="text-xs h-7 gap-1">
              <X className="h-3 w-3" /> Annulla
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
