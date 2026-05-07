import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { scoreMatch } from "@/hooks/useBankData";
import { formatCurrency } from "@/lib/format";
import { Landmark, Link2, Unlink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface BankMovementRow {
  id: string;
  data: string;
  descrizione: string;
  causale: string;
  importo: number;
  cig: string;
  account_id: string;
}

interface Suggestion extends BankMovementRow {
  score: number;
}

interface Props {
  invoice: SaleInvoice | PurchaseInvoice;
  type: "vendita" | "acquisto";
}

export function BankMovementSuggestions({ invoice, type }: Props) {
  const [linked, setLinked] = useState<BankMovementRow[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counterpart = type === "vendita"
    ? (invoice as SaleInvoice).cliente
    : (invoice as PurchaseInvoice).fornitore;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Linked movements for this invoice
      const { data: recs } = await supabase
        .from("bank_reconciliations" as any)
        .select("movement_id")
        .eq("invoice_type", type)
        .eq("invoice_anno", invoice.anno)
        .eq("invoice_numero", invoice.numero);
      const linkedIds = new Set<string>((recs as any[] | null)?.map((r) => r.movement_id) || []);

      let linkedMovs: BankMovementRow[] = [];
      if (linkedIds.size > 0) {
        const { data } = await supabase
          .from("bank_movements" as any)
          .select("id, data, descrizione, causale, importo, cig, account_id")
          .in("id", Array.from(linkedIds));
        linkedMovs = (data as any[] | null) || [];
      }
      setLinked(linkedMovs);

      // Candidate movements: same CIG OR amount in ±10%, correct sign
      const totale = invoice.totale || 0;
      const absT = Math.abs(totale);
      const minAbs = absT * 0.9;
      const maxAbs = absT * 1.1;

      const filters: string[] = [];
      if (type === "vendita") {
        filters.push(`and(importo.gte.${minAbs},importo.lte.${maxAbs})`);
      } else {
        filters.push(`and(importo.lte.${-minAbs},importo.gte.${-maxAbs})`);
      }
      if (invoice.cig) {
        filters.push(`cig.eq.${invoice.cig}`);
      }
      const { data: candidates } = await supabase
        .from("bank_movements" as any)
        .select("id, data, descrizione, causale, importo, cig, account_id")
        .or(filters.join(","))
        .limit(200);

      const candList = ((candidates as any[] | null) || []).filter((m) => !linkedIds.has(m.id));
      const invForScore = {
        totale: invoice.totale,
        cig: invoice.cig,
        numero: invoice.numero,
        anno: invoice.anno,
        partitaIva: invoice.partitaIva,
        imponibile: invoice.imponibile,
        cassa: (invoice as PurchaseInvoice).cassa,
        ritenute: (invoice as PurchaseInvoice).ritenute,
      };
      const scored: Suggestion[] = candList
        .map((m) => ({
          ...m,
          importo: Number(m.importo) || 0,
          score: scoreMatch(
            { importo: Number(m.importo) || 0, descrizione: `${m.causale || ""} ${m.descrizione || ""}`, cig: m.cig || "" },
            invForScore,
            counterpart || ""
          ),
        }))
        .filter((s) => s.score >= 25)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      setSuggestions(scored);
    } catch (err) {
      console.error("Error loading bank suggestions:", err);
    } finally {
      setLoading(false);
    }
  }, [invoice.anno, invoice.numero, invoice.cig, invoice.totale, invoice.imponibile, invoice.partitaIva, type, counterpart]);

  useEffect(() => { load(); }, [load]);

  const handleLink = async (movId: string) => {
    setBusyId(movId);
    try {
      await supabase.from("bank_reconciliations" as any).insert({
        movement_id: movId,
        invoice_type: type,
        invoice_anno: invoice.anno,
        invoice_numero: invoice.numero,
      } as any);
      toast.success("Movimento collegato alla fattura");
      await load();
    } catch (err) {
      console.error(err);
      toast.error("Errore durante il collegamento");
    } finally {
      setBusyId(null);
    }
  };

  const handleUnlink = async (movId: string) => {
    setBusyId(movId);
    try {
      await supabase.from("bank_reconciliations" as any).delete()
        .eq("movement_id", movId)
        .eq("invoice_type", type)
        .eq("invoice_anno", invoice.anno)
        .eq("invoice_numero", invoice.numero);
      toast.success("Collegamento rimosso");
      await load();
    } catch (err) {
      console.error(err);
      toast.error("Errore durante la rimozione");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Landmark className="h-3.5 w-3.5" />
          Movimenti bancari
        </h3>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {linked.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Collegati</p>
          {linked.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-md border bg-success/5 px-2 py-1.5 text-xs">
              <Link2 className="h-3 w-3 text-success shrink-0" />
              <span className="font-mono shrink-0">{m.data}</span>
              <span className="truncate flex-1">{m.descrizione || m.causale}</span>
              <span className="font-mono font-semibold shrink-0">{formatCurrency(Math.abs(m.importo))}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={busyId === m.id}
                onClick={() => handleUnlink(m.id)}
                title="Rimuovi collegamento"
              >
                {busyId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
              </Button>
            </div>
          ))}
        </div>
      )}

      {!loading && suggestions.length === 0 && linked.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">Nessun movimento bancario candidato trovato.</p>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Suggeriti
          </p>
          {suggestions.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-md border bg-card hover:bg-accent/40 px-2 py-1.5 text-xs transition">
              <Badge variant="outline" className="text-[10px] font-mono shrink-0">{s.score}%</Badge>
              <span className="font-mono shrink-0">{s.data}</span>
              <span className="truncate flex-1">{s.descrizione || s.causale}</span>
              <span className="font-mono font-semibold shrink-0">{formatCurrency(Math.abs(s.importo))}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1"
                disabled={busyId === s.id}
                onClick={() => handleLink(s.id)}
              >
                {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                Collega
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}