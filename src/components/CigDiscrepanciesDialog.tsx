import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowRight, Loader2, Check } from "lucide-react";
import { CigDiscrepancy } from "@/lib/cigCoherence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invalidateInvoiceCache } from "@/hooks/useInvoiceData";

interface CigDiscrepanciesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discrepancies: CigDiscrepancy[];
  onResolved?: () => void;
}

type Decision = "keep" | "replace";

export function CigDiscrepanciesDialog({
  open,
  onOpenChange,
  discrepancies,
  onResolved,
}: CigDiscrepanciesDialogProps) {
  // default decision per row: replace (use CIG from description, since user said
  // file CIG already won during import; here we offer the chance to override
  // it with the description CIG when the file was wrong)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open) {
      const initial: Record<string, Decision> = {};
      for (const d of discrepancies) {
        // Default: keep the file CIG (user's chosen priority).
        initial[`${d.invoiceType}-${d.invoiceKey}`] = "keep";
      }
      setDecisions(initial);
    }
  }, [open, discrepancies]);

  const setDecision = (key: string, value: Decision) => {
    setDecisions((prev) => ({ ...prev, [key]: value }));
  };

  const setAllTo = (value: Decision) => {
    const next: Record<string, Decision> = {};
    for (const d of discrepancies) {
      next[`${d.invoiceType}-${d.invoiceKey}`] = value;
    }
    setDecisions(next);
  };

  const apply = async () => {
    const toReplace = discrepancies.filter(
      (d) => decisions[`${d.invoiceType}-${d.invoiceKey}`] === "replace"
    );
    if (toReplace.length === 0) {
      onOpenChange(false);
      onResolved?.();
      return;
    }
    setApplying(true);
    try {
      let updated = 0;
      for (const d of toReplace) {
        const table = d.invoiceType === "vendita" ? "fatture_vendita" : "fatture_acquisto";
        const { error } = await supabase
          .from(table as any)
          .update({ cig: d.cigInDescrizione })
          .eq("anno", d.anno)
          .eq("numero", d.numero);
        if (!error) updated++;
      }
      invalidateInvoiceCache();
      toast.success(`${updated} CIG sostituiti con il valore trovato in descrizione`);
      onOpenChange(false);
      onResolved?.();
    } catch (e: any) {
      toast.error("Errore nell'aggiornamento: " + e.message);
    } finally {
      setApplying(false);
    }
  };

  if (discrepancies.length === 0) return null;

  const replaceCount = Object.values(decisions).filter((v) => v === "replace").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Discordanze CIG rilevate ({discrepancies.length})
          </DialogTitle>
          <DialogDescription>
            Durante l'importazione ho trovato fatture in cui il CIG salvato (dal file XML/Excel)
            è diverso dal CIG presente nel testo della descrizione/causale. Il CIG dal file è
            stato salvato come da tua impostazione. Per ogni riga puoi decidere se mantenere
            quello salvato o sostituirlo con quello trovato in descrizione.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 py-2 border-y">
          <p className="text-sm text-muted-foreground">
            <Check className="h-4 w-4 inline mr-1 text-primary" />
            {replaceCount} sostituzioni selezionate, {discrepancies.length - replaceCount} mantenute
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAllTo("keep")}>
              Mantieni tutti
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAllTo("replace")}>
              Sostituisci tutti
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-[70px]">Tipo</TableHead>
                <TableHead className="w-[90px]">Fattura</TableHead>
                <TableHead className="min-w-[140px]">Soggetto</TableHead>
                <TableHead className="w-[120px]">CIG dal file</TableHead>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead className="w-[120px]">CIG da descrizione</TableHead>
                <TableHead>Descrizione (estratto)</TableHead>
                <TableHead className="w-[180px] text-center">Azione</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discrepancies.map((d) => {
                const key = `${d.invoiceType}-${d.invoiceKey}`;
                const decision = decisions[key] || "keep";
                const upperDesc = d.descrizione.toUpperCase();
                const idx = upperDesc.indexOf(d.cigInDescrizione);
                const excerpt = idx >= 0
                  ? "…" + d.descrizione.slice(Math.max(0, idx - 30), idx + 40) + "…"
                  : d.descrizione.slice(0, 100) + "…";
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {d.invoiceType === "acquisto" ? "Acq" : "Vend"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {d.anno}/{d.numero}
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[200px]">{d.label}</TableCell>
                    <TableCell>
                      {d.cigSalvato ? (
                        <code className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono">
                          {d.cigSalvato}
                        </code>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">vuoto</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <code className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                        {d.cigInDescrizione}
                      </code>
                      {d.altriCandidati.length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          +{d.altriCandidati.length} altri
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-[260px] truncate">
                      {excerpt}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex rounded-md border overflow-hidden">
                        <button
                          className={`px-2 py-1 text-[11px] transition-colors ${
                            decision === "keep"
                              ? "bg-secondary text-secondary-foreground"
                              : "hover:bg-muted"
                          }`}
                          onClick={() => setDecision(key, "keep")}
                        >
                          Mantieni
                        </button>
                        <button
                          className={`px-2 py-1 text-[11px] border-l transition-colors ${
                            decision === "replace"
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          }`}
                          onClick={() => setDecision(key, "replace")}
                        >
                          Sostituisci
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Chiudi senza modifiche
          </Button>
          <Button onClick={apply} disabled={applying}>
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Applico...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Applica {replaceCount > 0 ? `(${replaceCount} sostituzioni)` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
