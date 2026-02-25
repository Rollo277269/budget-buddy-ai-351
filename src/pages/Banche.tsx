import { useState, useRef, useMemo, useCallback, DragEvent } from "react";
import { Landmark, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Search, FileText } from "lucide-react";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useBankData, BankMovement } from "@/hooks/useBankData";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function ReconciliationBadge({ m }: { m: BankMovement }) {
  if (m.matchConfidence === "auto") {
    return (
      <Badge variant="default" className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] text-[10px]">
        <CheckCircle2 className="h-3 w-3 mr-1" />Auto
      </Badge>
    );
  }
  if (m.matchConfidence === "manual") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        <CheckCircle2 className="h-3 w-3 mr-1" />Manuale
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      <AlertCircle className="h-3 w-3 mr-1" />Da riconciliare
    </Badge>
  );
}

function MatchedInvoiceLabel({ m }: { m: BankMovement }) {
  if (m.matchConfidence === "none") return <span className="text-xs text-muted-foreground">—</span>;
  const type = m.matchedType === "vendita" ? "V" : "A";
  return (
    <span className="text-xs font-mono">
      {type} {m.matchedAnno}/{m.matchedNumero}
    </span>
  );
}

interface ReconcileSheetProps {
  movement: BankMovement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: SaleInvoice[];
  purchases: PurchaseInvoice[];
  onReconcile: (movementId: string, type: "vendita" | "acquisto", anno: number, numero: number) => void;
  onRemove: (movementId: string) => void;
}

function ReconcileSheet({ movement, open, onOpenChange, sales, purchases, onReconcile, onRemove }: ReconcileSheetProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"vendita" | "acquisto">("vendita");

  if (!movement) return null;

  const isMatched = movement.matchConfidence !== "none";
  const items = tab === "vendita"
    ? sales.filter((s) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return s.cliente.toLowerCase().includes(q) || String(s.numero).includes(q) || s.cig.toLowerCase().includes(q) || s.descrizione.toLowerCase().includes(q);
      })
    : purchases.filter((p) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return p.fornitore.toLowerCase().includes(q) || String(p.numero).includes(q) || p.cig.toLowerCase().includes(q) || p.descrizione.toLowerCase().includes(q);
      });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-base">Riconciliazione movimento</SheetTitle>
          <SheetDescription className="text-xs">
            {movement.data} — {formatCurrency(movement.importo)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Movement summary */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-medium truncate">{movement.descrizione || "Nessuna descrizione"}</p>
            <div className="flex items-center gap-2">
              <ReconciliationBadge m={movement} />
              {isMatched && <MatchedInvoiceLabel m={movement} />}
            </div>
          </div>

          {isMatched && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                onRemove(movement.id);
                onOpenChange(false);
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Rimuovi associazione
            </Button>
          )}

          {/* Tab selector */}
          <div className="flex gap-1">
            <Button
              variant={tab === "vendita" ? "default" : "outline"}
              size="sm"
              className="text-xs flex-1"
              onClick={() => setTab("vendita")}
            >
              Fatture Vendita
            </Button>
            <Button
              variant={tab === "acquisto" ? "default" : "outline"}
              size="sm"
              className="text-xs flex-1"
              onClick={() => setTab("acquisto")}
            >
              Fatture Acquisto
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cerca fattura..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>

          {/* Invoice list */}
          <ScrollArea className="h-[400px]">
            <div className="space-y-1 pr-3">
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">Nessuna fattura trovata</p>
              )}
              {items.map((inv) => {
                const isVendita = tab === "vendita";
                const name = isVendita ? (inv as SaleInvoice).cliente : (inv as PurchaseInvoice).fornitore;
                const tot = inv.totale;
                return (
                  <button
                    key={`${inv.anno}-${inv.numero}`}
                    className="w-full text-left rounded-lg border p-2.5 hover:bg-accent/50 transition-colors"
                    onClick={() => {
                      onReconcile(movement.id, tab, inv.anno, inv.numero);
                      onOpenChange(false);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{inv.anno}/{inv.numero}</span>
                      <span className={`text-xs font-mono ${isVendita ? "text-income" : "text-expense"}`}>
                        {formatCurrency(tot)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{name}</p>
                    {inv.cig && <span className="text-[10px] font-mono text-muted-foreground">CIG: {inv.cig}</span>}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const ACCEPTED_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/pdf",
];
const ACCEPTED_EXT = [".xlsx", ".xls", ".csv", ".pdf"];

function isAcceptedFile(file: File) {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return ACCEPTED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext));
}

const BanchePage = () => {
  const { allSales, allPurchases, loading: invoiceLoading } = useInvoiceData();
  const { movements, loading, fileName, handleFileUpload, addReconciliation, removeReconciliation, stats } = useBankData(allSales, allPurchases);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedMovement, setSelectedMovement] = useState<BankMovement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const columns: ColumnDef<BankMovement>[] = useMemo(() => [
    { key: "data", label: "Data", render: (r) => <span className="text-xs">{r.data}</span>, sortable: true, filterable: true },
    { key: "dataValuta", label: "Data Valuta", render: (r) => <span className="text-xs">{r.dataValuta}</span>, sortable: true, defaultHidden: true },
    {
      key: "descrizione", label: "Descrizione", filterable: true,
      render: (r) => <span className="text-xs truncate max-w-[300px] block">{r.descrizione}</span>,
    },
    {
      key: "importo", label: "Importo", sortable: true, align: "right" as const,
      render: (r) => (
        <span className={`text-xs font-mono font-medium ${r.importo >= 0 ? "text-income" : "text-expense"}`}>
          {formatCurrency(r.importo)}
        </span>
      ),
    },
    { key: "saldo", label: "Saldo", sortable: true, align: "right" as const, defaultHidden: true, render: (r) => <span className="text-xs font-mono">{formatCurrency(r.saldo)}</span> },
    { key: "cig", label: "CIG", render: (r) => r.cig ? <span className="text-xs font-mono">{r.cig}</span> : <span className="text-xs text-muted-foreground">—</span>, filterable: true },
    {
      key: "matchConfidence", label: "Stato", sortable: true, filterable: true,
      render: (r) => <ReconciliationBadge m={r} />,
    },
    {
      key: "matchedType", label: "Fattura", sortable: true,
      render: (r) => <MatchedInvoiceLabel m={r} />,
    },
  ], []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  const handleReconcile = (movementId: string, type: "vendita" | "acquisto", anno: number, numero: number) => {
    addReconciliation({ movementId, invoiceType: type, invoiceAnno: anno, invoiceNumero: numero });
  };

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && isAcceptedFile(file)) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const isLoading = loading || invoiceLoading;

  return (
    <div
      className="p-6 space-y-6 relative min-h-full"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-xl backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-primary">
            <Upload className="h-12 w-12 animate-bounce" />
            <p className="text-lg font-semibold">Rilascia il file qui</p>
            <p className="text-sm text-muted-foreground">Excel (.xlsx, .xls, .csv) o PDF</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Banche</h2>
          <p className="text-sm text-muted-foreground">
            {fileName ? `File: ${fileName}` : "Carica un estratto conto per iniziare"}
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={onFileChange}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
            <Upload className="h-4 w-4 mr-2" />
            Carica estratto conto
          </Button>
        </div>
      </div>

      {movements.length === 0 && !isLoading && (
        <button
          className="w-full flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed bg-card text-muted-foreground hover:border-primary/40 hover:bg-accent/30 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex gap-3 mb-4">
            <FileSpreadsheet className="h-10 w-10 opacity-30" />
            <FileText className="h-10 w-10 opacity-30" />
          </div>
          <p className="text-sm font-medium">Carica o trascina un estratto conto</p>
          <p className="text-xs mt-1">Formati supportati: Excel (.xlsx, .xls, .csv) e PDF</p>
        </button>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {movements.length > 0 && !isLoading && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Movimenti</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Riconciliati</p>
                <p className="text-xl font-bold text-income">{stats.matched}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Da riconciliare</p>
                <p className="text-xl font-bold text-expense">{stats.unmatched}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Entrate</p>
                <p className="text-lg font-bold font-mono text-income">{formatCurrency(stats.entrate)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Uscite</p>
                <p className="text-lg font-bold font-mono text-expense">{formatCurrency(stats.uscite)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <DataTable<BankMovement>
            columns={columns}
            data={movements}
            rowKey={(r) => r.id}
            onRowClick={setSelectedMovement}
          />
        </>
      )}

      <ReconcileSheet
        movement={selectedMovement}
        open={!!selectedMovement}
        onOpenChange={(open) => { if (!open) setSelectedMovement(null); }}
        sales={allSales}
        purchases={allPurchases}
        onReconcile={handleReconcile}
        onRemove={(id) => { removeReconciliation(id); setSelectedMovement(null); }}
      />
    </div>
  );
};

export default BanchePage;
