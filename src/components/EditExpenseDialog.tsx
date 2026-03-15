import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PurchaseInvoice } from "@/hooks/useInvoiceData";
import { formatCurrency } from "@/lib/format";

interface EditExpenseDialogProps {
  invoice: PurchaseInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditExpenseDialog({ invoice, open, onOpenChange, onSaved }: EditExpenseDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fornitore: "",
    descrizione: "",
    totale: 0,
    imponibile: 0,
    imposta: 0,
    data: "",
    tipo: "",
    stato: "",
    cig: "",
  });

  // Sync form when invoice changes
  const resetForm = useCallback((inv: PurchaseInvoice) => {
    setForm({
      fornitore: inv.fornitore || "",
      descrizione: inv.descrizione || "",
      totale: inv.totale || 0,
      imponibile: inv.imponibile || 0,
      imposta: inv.imposta || 0,
      data: inv.data || "",
      tipo: inv.tipo || "",
      stato: inv.stato || "",
      cig: inv.cig || "",
    });
  }, []);

  // Reset form when dialog opens with new invoice
  const handleOpenChange = useCallback((o: boolean) => {
    if (o && invoice) resetForm(invoice);
    onOpenChange(o);
  }, [invoice, onOpenChange, resetForm]);

  // Also reset when invoice prop changes while open
  if (open && invoice && form.fornitore === "" && form.totale === 0 && invoice.totale !== 0) {
    resetForm(invoice);
  }

  const updateField = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = useCallback(async () => {
    if (!invoice) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("fatture_acquisto")
        .update({
          fornitore: form.fornitore,
          descrizione: form.descrizione,
          totale: form.totale,
          imponibile: form.imponibile,
          imposta: form.imposta,
          data: form.data,
          tipo: form.tipo,
          stato: form.stato,
          cig: form.cig,
        })
        .eq("anno", invoice.anno)
        .eq("numero", invoice.numero);

      if (error) throw error;

      toast.success(`Fattura ${invoice.numero}/${invoice.anno} aggiornata`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Error updating expense:", err);
      toast.error("Errore nel salvataggio delle modifiche");
    } finally {
      setSaving(false);
    }
  }, [invoice, form, onSaved, onOpenChange]);

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            Modifica Fattura {invoice.numero}/{invoice.anno}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Modifica i dati della fattura di acquisto
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-[11px]">Fornitore</Label>
            <Input value={form.fornitore} onChange={(e) => updateField("fornitore", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-[11px]">Descrizione</Label>
            <Input value={form.descrizione} onChange={(e) => updateField("descrizione", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Totale (€)</Label>
            <div className="relative">
              <Input type="number" step="0.01" value={form.totale} onChange={(e) => updateField("totale", parseFloat(e.target.value) || 0)} className="h-8 text-xs font-mono pr-7" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">€</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Imponibile (€)</Label>
            <div className="relative">
              <Input type="number" step="0.01" value={form.imponibile} onChange={(e) => updateField("imponibile", parseFloat(e.target.value) || 0)} className="h-8 text-xs font-mono pr-7" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">€</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">IVA (€)</Label>
            <div className="relative">
              <Input type="number" step="0.01" value={form.imposta} onChange={(e) => updateField("imposta", parseFloat(e.target.value) || 0)} className="h-8 text-xs font-mono pr-7" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">€</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Data documento</Label>
            <Input value={form.data} onChange={(e) => updateField("data", e.target.value)} placeholder="DD/MM/YYYY" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Tipo</Label>
            <Input value={form.tipo} onChange={(e) => updateField("tipo", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Stato</Label>
            <Input value={form.stato} onChange={(e) => updateField("stato", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">CIG</Label>
            <Input value={form.cig} onChange={(e) => updateField("cig", e.target.value)} className="h-8 text-xs font-mono" />
          </div>
        </div>

        <Separator className="my-2" />

        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs h-7 gap-1">
            <X className="h-3 w-3" /> Annulla
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs h-7 gap-1">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Salva modifiche
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
