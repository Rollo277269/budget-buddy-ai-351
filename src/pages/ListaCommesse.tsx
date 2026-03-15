import { useMemo, useState, useCallback } from "react";
import { useCssrCommesse, CssrCommessa } from "@/hooks/useCssrCommesse";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { CommessaDetailSheet } from "@/components/CommessaDetailSheet";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { useCommessaLinks } from "@/hooks/useCommessaLinks";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2 } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export interface Commessa {
  numero: number;
  oggetto: string;
  committente: string;
  assegnataria: string;
  cig: string;
  cssrStato: string;
  fattureVendita: number;
  fattureAcquisto: number;
  totaleVendite: number;
  totaleAcquisti: number;
  cssrData?: CssrCommessa;
}

type StatoFilter = "tutte" | "in_corso" | "completata" | "da_iniziare";

const ListaCommessePage = () => {
  const { commesse: cssrCommesse, loading: cssrLoading, removeCommessa } = useCssrCommesse();
  const { allSales, allPurchases, loading: invoiceLoading, refresh: refreshInvoices } = useInvoiceData();
  const { links, addLink, removeLink, refresh: refreshLinks } = useCommessaLinks();
  const [selected, setSelected] = useState<Commessa | null>(null);
  const [statoFilter, setStatoFilter] = useState<StatoFilter>("tutte");
  const [deleteTarget, setDeleteTarget] = useState<Commessa | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget?.cssrData?.id) return;
    setDeleting(true);
    const ok = await removeCommessa(deleteTarget.cssrData.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (ok) {
      toast.success(`Commessa ${deleteTarget.numero || ""} eliminata`);
    } else {
      toast.error("Errore nell'eliminazione della commessa");
    }
  }, [deleteTarget, removeCommessa]);

  const columns: ColumnDef<Commessa>[] = useMemo(() => [
    { key: "numero", label: "N° Comm.", render: (r) => <span className="font-mono text-xs font-medium">{r.numero ? formatNumber(r.numero).replace(/,00$/, "") : "—"}</span>, sortable: true },
    { key: "oggetto", label: "Oggetto", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[280px] whitespace-normal break-words block leading-snug py-1">{r.oggetto}</span> },
    { key: "committente", label: "Committente", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[180px] truncate block">{r.committente}</span> },
    { key: "assegnataria", label: "Assegnataria", sortable: true, filterable: true, render: (r) => <span className="text-xs max-w-[180px] truncate block">{r.assegnataria}</span> },
    { key: "cig", label: "CIG", sortable: true, filterable: true, render: (r) => <span className="font-mono text-[11px]">{r.cig || "—"}</span> },
    {
      key: "cssrStato", label: "Stato", sortable: true,
      render: (r) => {
        if (!r.cssrData) return <span className="text-xs text-muted-foreground">—</span>;
        const stato = r.cssrData.stato;
        const colorClass =
          stato === "completata" || stato === "completate"
            ? "bg-success text-success-foreground border-success"
            : stato === "in_corso"
            ? "bg-warning/30 text-warning-foreground border-warning"
            : "bg-destructive text-destructive-foreground border-destructive";
        return <Badge className={`text-[10px] ${colorClass}`}>{stato}</Badge>;
      },
    },
    {
      key: "cssrImporto" as any, label: "Importo Contratto", sortable: true, align: "right" as const,
      render: (r) => {
        if (!r.cssrData?.importo_contrattuale) return <span className="text-xs text-muted-foreground">—</span>;
        const val = parseFloat(r.cssrData.importo_contrattuale);
        return <span className="text-xs font-mono font-medium">{isNaN(val) ? r.cssrData.importo_contrattuale : formatCurrency(val)}</span>;
      },
    },
    { key: "fattureVendita", label: "Fatt. Vendita", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.fattureVendita}</span> },
    { key: "totaleVendite", label: "Tot. Vendite", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.totaleVendite ? formatCurrency(r.totaleVendite) : "—"}</span> },
    { key: "fattureAcquisto", label: "Fatt. Acquisto", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.fattureAcquisto}</span> },
    { key: "totaleAcquisti", label: "Tot. Acquisti", sortable: true, align: "right" as const, render: (r) => <span className="text-xs font-mono">{r.totaleAcquisti ? formatCurrency(r.totaleAcquisti) : "—"}</span> },
    {
      key: "azioni" as any, label: "", sortable: false,
      render: (r) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          disabled
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(r);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ], []);

  const handleSheetClose = useCallback((o: boolean) => {
    if (!o) {
      setSelected(null);
      refreshInvoices();
      refreshLinks();
    }
  }, [refreshInvoices, refreshLinks]);

  const rows = useMemo(() => {
    const cigCounts = new Map<string, { fv: number; fa: number; tv: number; ta: number }>();
    allSales.forEach((s) => {
      if (s.cig) {
        const e = cigCounts.get(s.cig) || { fv: 0, fa: 0, tv: 0, ta: 0 };
        e.fv++;
        e.tv += s.totale || 0;
        cigCounts.set(s.cig, e);
      }
    });
    allPurchases.forEach((p) => {
      if (p.cig) {
        const e = cigCounts.get(p.cig) || { fv: 0, fa: 0, tv: 0, ta: 0 };
        e.fa++;
        e.ta += p.cassa > 0 ? p.imponibile + p.cassa : p.totale;
        cigCounts.set(p.cig, e);
      }
    });

    return cssrCommesse.map((c) => {
      const cig = c.cig || "";
      const counts = cig ? cigCounts.get(cig) || { fv: 0, fa: 0, tv: 0, ta: 0 } : { fv: 0, fa: 0, tv: 0, ta: 0 };
      const countsDeriv = c.cig_derivato ? cigCounts.get(c.cig_derivato) || { fv: 0, fa: 0, tv: 0, ta: 0 } : { fv: 0, fa: 0, tv: 0, ta: 0 };

      return {
        numero: parseFloat(c.commessa_consortile || "0") || 0,
        oggetto: c.oggetto_lavori || "—",
        committente: c.committente || "—",
        assegnataria: c.impresa_assegnataria || "—",
        cig,
        cssrStato: c.stato || "",
        fattureVendita: counts.fv + countsDeriv.fv,
        fattureAcquisto: counts.fa + countsDeriv.fa,
        totaleVendite: counts.tv + countsDeriv.tv,
        totaleAcquisti: counts.ta + countsDeriv.ta,
        cssrData: c,
      };
    }).sort((a, b) => b.numero - a.numero);
  }, [cssrCommesse, allSales, allPurchases]);

  const statoCounts = useMemo(() => {
    const c = { in_corso: 0, completata: 0, da_iniziare: 0 };
    rows.forEach((r) => {
      const s = r.cssrStato;
      if (s === "in_corso") c.in_corso++;
      else if (s === "completata" || s === "completate") c.completata++;
      else if (s) c.da_iniziare++;
    });
    return c;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (statoFilter === "tutte") return rows;
    return rows.filter((r) => {
      const s = r.cssrStato;
      if (statoFilter === "in_corso") return s === "in_corso";
      if (statoFilter === "completata") return s === "completata" || s === "completate";
      return s !== "" && s !== "in_corso" && s !== "completata" && s !== "completate";
    });
  }, [rows, statoFilter]);

  if (cssrLoading || invoiceLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <ToggleGroup type="single" value={statoFilter} onValueChange={(v) => v && setStatoFilter(v as StatoFilter)} className="bg-muted rounded-lg p-1">
          <ToggleGroupItem value="tutte" className="text-xs px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
            Tutte <span className="ml-1 text-muted-foreground">({rows.length})</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="in_corso" className="text-xs px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
            In corso <span className="ml-1 text-muted-foreground">({statoCounts.in_corso})</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="completata" className="text-xs px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
            Completate <span className="ml-1 text-muted-foreground">({statoCounts.completata})</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="da_iniziare" className="text-xs px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
            Da iniziare <span className="ml-1 text-muted-foreground">({statoCounts.da_iniziare})</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <DataTable<Commessa> columns={columns} data={filteredRows} rowKey={(r) => r.cssrData?.id || r.cig || String(r.numero)} onRowClick={setSelected} defaultSort={{ key: "numero", dir: "desc" }} />
      <CommessaDetailSheet
        commessa={selected}
        open={!!selected}
        onOpenChange={handleSheetClose}
        allSales={allSales}
        allPurchases={allPurchases}
        manualLinks={links}
        onAddLink={addLink}
        onRemoveLink={removeLink}
        onExpenseAdded={refreshInvoices}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina commessa</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare la commessa <strong>N° {deleteTarget?.numero}</strong>{" "}
              {deleteTarget?.oggetto !== "—" && <>— {deleteTarget?.oggetto}</>}? L'azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ListaCommessePage;
