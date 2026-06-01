import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FileText, Check, X } from "lucide-react";
import type { PreparedDocumento } from "@/hooks/useDocumentiAcquisto";
import type { CentroCR } from "@/hooks/useCentri";

interface Props {
  open: boolean;
  prepared: PreparedDocumento | null;
  centri: CentroCR[];
  tipo: "acquisto" | "vendita";
  onConfirm: (edited: PreparedDocumento) => void;
  onCancel: () => void;
}

export function DocumentoAiReviewDialog({ open, prepared, centri, tipo, onConfirm, onCancel }: Props) {
  const [form, setForm] = useState<PreparedDocumento | null>(prepared);

  useEffect(() => {
    setForm(prepared);
  }, [prepared]);

  if (!form) return null;

  const update = <K extends keyof PreparedDocumento>(field: K, value: PreparedDocumento[K]) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onConfirm(form); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Verifica dati estratti dall'AI
          </DialogTitle>
          <DialogDescription>
            Controlla e correggi i dati estratti automaticamente prima di salvare il documento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Badge variant="secondary" className="text-[10px] gap-1">
            <FileText className="h-3 w-3" />
            {form.file_name}
          </Badge>

          {form.ai_summary && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Riassunto AI: </span>
              {form.ai_summary}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px]">Descrizione</Label>
              <Input
                value={form.descrizione}
                onChange={(e) => update("descrizione", e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">{tipo === "vendita" ? "Cliente" : "Fornitore"}</Label>
              <Input
                value={form.fornitore}
                onChange={(e) => update("fornitore", e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Data documento (DD/MM/YYYY)</Label>
              <Input
                value={form.data_documento}
                onChange={(e) => update("data_documento", e.target.value)}
                placeholder="GG/MM/AAAA"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Numero (es. polizza, ricevuta)</Label>
              <Input
                value={form.numero}
                onChange={(e) => update("numero", e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Importo (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.importo ?? ""}
                onChange={(e) => update("importo", e.target.value === "" ? null : parseFloat(e.target.value))}
                className="h-9 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">CIG</Label>
              <Input
                value={form.cig}
                onChange={(e) => update("cig", e.target.value)}
                className="h-9 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Tipo documento</Label>
              <Select
                value={form.tipo_documento || "Altro"}
                onValueChange={(v) => update("tipo_documento", v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Fattura", "Polizza", "Bollo", "ANAC", "Ricevuta", "Nota Spese", "Altro"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(form.tipo_documento === "Polizza" || form.data_scadenza) && (
              <div className="space-y-1">
                <Label className="text-[11px]">Scadenza (DD/MM/YYYY)</Label>
                <Input
                  value={form.data_scadenza}
                  onChange={(e) => update("data_scadenza", e.target.value)}
                  placeholder="GG/MM/AAAA"
                  className="h-9 text-sm font-mono"
                />
              </div>
            )}

            {(form.tipo_documento === "Polizza" || (form.importo_garantito ?? 0) > 0) && (
              <div className="space-y-1">
                <Label className="text-[11px]">Importo garantito (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.importo_garantito ?? ""}
                  onChange={(e) => update("importo_garantito", e.target.value === "" ? null : Number(e.target.value))}
                  placeholder="Somma assicurata / massimale"
                  className="h-9 text-sm font-mono"
                />
              </div>
            )}

            <div className="col-span-2 space-y-1">
              <Label className="text-[11px]">{tipo === "vendita" ? "Centro Ricavo" : "Centro Costo"}</Label>
              <Select
                value={form.centro_costo || "none"}
                onValueChange={(v) => update("centro_costo", v === "none" ? "" : v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleziona..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nessuno —</SelectItem>
                  {centri.map((c) => (
                    <SelectItem key={c.codice} value={c.codice}>
                      {c.codice} — {c.descrizione}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Annulla upload
          </Button>
          <Button onClick={() => onConfirm(form)} className="gap-1.5">
            <Check className="h-3.5 w-3.5" /> Conferma e salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
