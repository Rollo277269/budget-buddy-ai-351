import { useState, useRef, useMemo, useCallback, useEffect, DragEvent } from "react";
import { Landmark, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Search, FileText, Trash2, CreditCard, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useBankData, BankMovement, MatchedInvoice, scoreMatch, DuplicateInfo } from "@/hooks/useBankData";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

// Load conti from localStorage (same key as Strumenti page)
interface ContoCorrente {
  id: string;
  tipo: "conto_corrente" | "carta_credito";
  banca: string;
  iban: string;
  intestatario: string;
  note: string;
}
const CONTI_KEY = "conti-correnti";
function loadConti(): ContoCorrente[] {
  try { return JSON.parse(localStorage.getItem(CONTI_KEY) || "[]"); } catch { return []; }
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
  if (m.matchConfidence === "none" || !m.matchedInvoices.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {m.matchedInvoices.map((inv, i) => {
        const type = inv.type === "vendita" ? "V" : "A";
        return (
          <span key={i} className="text-xs font-mono">
            {type} {inv.anno}/{inv.numero}
          </span>
        );
      })}
    </div>
  );
}

interface ReconcileSheetProps {
  movement: BankMovement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: SaleInvoice[];
  purchases: PurchaseInvoice[];
  onReconcile: (movementId: string, invoices: MatchedInvoice[]) => void;
  onRemove: (movementId: string, invoiceKey?: string) => void;
}

function ReconcileSheet({ movement, open, onOpenChange, sales, purchases, onReconcile, onRemove }: ReconcileSheetProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"vendita" | "acquisto">("vendita");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const effectiveTab = movement
    ? (movement.importo < 0 ? "acquisto" : "vendita")
    : tab;

  const currentTab = tab === effectiveTab ? tab : effectiveTab;

  // Initialize selected from existing matches when movement changes
  useMemo(() => {
    if (movement && movement.matchedInvoices.length > 0) {
      setSelected(new Set(movement.matchedInvoices.map((inv) => `${inv.type}-${inv.anno}-${inv.numero}`)));
    } else {
      setSelected(new Set());
    }
  }, [movement?.id]);

  const scoredItems = useMemo(() => {
    if (!movement) return [];
    const isVendita = currentTab === "vendita";
    const list = isVendita ? sales : purchases;
    const scored = list.map((inv) => {
      const name = isVendita ? (inv as SaleInvoice).cliente : (inv as PurchaseInvoice).fornitore;
      const sc = scoreMatch(movement, inv, name);
      return { inv, score: sc, name };
    });
    const filtered = search
      ? scored.filter(({ inv, name }) => {
          const q = search.toLowerCase();
          return name.toLowerCase().includes(q) ||
            String(inv.numero).includes(q) ||
            inv.cig.toLowerCase().includes(q) ||
            inv.descrizione.toLowerCase().includes(q);
        })
      : scored;
    return filtered.sort((a, b) => b.score - a.score);
  }, [movement, currentTab, sales, purchases, search]);

  const selectedTotal = useMemo(() => {
    if (!movement) return 0;
    let total = 0;
    for (const key of selected) {
      const [type, anno, numero] = key.split("-");
      const list = type === "vendita" ? sales : purchases;
      const inv = list.find((i) => i.anno === Number(anno) && i.numero === Number(numero));
      if (inv) total += inv.totale;
    }
    return total;
  }, [selected, sales, purchases, movement]);

  if (!movement) return null;
  const isMatched = movement.matchConfidence !== "none";

  const toggleInvoice = (type: "vendita" | "acquisto", anno: number, numero: number) => {
    const key = `${type}-${anno}-${numero}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    const invoices: MatchedInvoice[] = Array.from(selected).map((key) => {
      const [type, anno, numero] = key.split("-");
      return { type: type as "vendita" | "acquisto", anno: Number(anno), numero: Number(numero) };
    });
    onReconcile(movement.id, invoices);
    onOpenChange(false);
  };

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
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-medium whitespace-pre-wrap break-words">{movement.descrizione || "Nessuna descrizione"}</p>
            <div className="flex items-center gap-2">
              <ReconciliationBadge m={movement} />
              {isMatched && <MatchedInvoiceLabel m={movement} />}
            </div>
          </div>
          {isMatched && (
            <div className="space-y-1">
              {movement.matchedInvoices.map((inv, i) => (
                <div key={i} className="flex items-center justify-between text-xs rounded border px-2 py-1">
                  <span className="font-mono">{inv.type === "vendita" ? "V" : "A"} {inv.anno}/{inv.numero}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(movement.id, `${inv.type}-${inv.anno}-${inv.numero}`)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => { onRemove(movement.id); onOpenChange(false); }}>
                <X className="h-3 w-3 mr-1" />Rimuovi tutte le associazioni
              </Button>
            </div>
          )}
          <div className="flex gap-1">
            <Button variant={currentTab === "vendita" ? "default" : "outline"} size="sm" className="text-xs flex-1" onClick={() => setTab("vendita")}>Fatture Vendita</Button>
            <Button variant={currentTab === "acquisto" ? "default" : "outline"} size="sm" className="text-xs flex-1" onClick={() => setTab("acquisto")}>Fatture Acquisto</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Cerca fattura..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-xs" />
          </div>
          {selected.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border bg-primary/5 border-primary/30 p-2">
              <div className="text-xs">
                <span className="font-medium">{selected.size} fattur{selected.size === 1 ? "a" : "e"}</span>
                <span className="text-muted-foreground ml-2">Totale: {formatCurrency(selectedTotal)}</span>
                <span className={`ml-2 font-medium ${Math.abs(selectedTotal - Math.abs(movement.importo)) < 0.01 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}`}>
                  {Math.abs(selectedTotal - Math.abs(movement.importo)) < 0.01 ? "✓ Quadra" : `Δ ${formatCurrency(selectedTotal - Math.abs(movement.importo))}`}
                </span>
              </div>
              <Button size="sm" className="text-xs h-7" onClick={handleConfirm}>
                Conferma
              </Button>
            </div>
          )}
          <ScrollArea className="h-[350px]">
            <div className="space-y-1 pr-3">
              {scoredItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Nessuna fattura trovata</p>}
              {scoredItems.map(({ inv, score, name }) => {
                const invKey = `${currentTab}-${inv.anno}-${inv.numero}`;
                const isSelected = selected.has(invKey);
                const isVendita = currentTab === "vendita";
                return (
                  <button
                    key={invKey}
                    className={`w-full text-left rounded-lg border p-2.5 hover:bg-accent/50 transition-colors ${isSelected ? "border-primary bg-primary/10" : score >= 35 ? "border-primary/40 bg-primary/5" : ""}`}
                    onClick={() => toggleInvoice(currentTab, inv.anno, inv.numero)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={isSelected} className="pointer-events-none" />
                        <span className="text-xs font-medium">{inv.anno}/{inv.numero}</span>
                        {score >= 35 && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/50 text-primary">{score}% match</Badge>
                        )}
                      </div>
                      <span className={`text-xs font-mono font-medium ${isVendita ? "text-income" : "text-expense"}`}>{formatCurrency(inv.totale)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate ml-6">{name}</p>
                    {inv.cig && <span className="text-[10px] font-mono text-muted-foreground ml-6">CIG: {inv.cig}</span>}
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
  const {
    movements, rawMovements, loading, fileNames, handleFileUpload,
    addReconciliation, removeReconciliation, clearMovements, deleteMovements, deleteFileMovements,
    stats, activeAccountId, setActiveAccountId,
    pendingDuplicates, confirmDuplicates, dismissDuplicates,
  } = useBankData(allSales, allPurchases);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedMovement, setSelectedMovement] = useState<BankMovement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const [conti, setConti] = useState<ContoCorrente[]>(loadConti);

  // Re-read conti when localStorage changes (e.g. edited in Strumenti)
  useCallback(() => {
    const handler = () => setConti(loadConti());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const hasValidAccount = activeAccountId !== "default" && activeAccountId !== "all" && conti.some(c => c.id === activeAccountId);

  const accountStats = useMemo(() => {
    const map = new Map<string, { entrate: number; uscite: number; saldo: number; movimenti: number }>();
    for (const m of rawMovements) {
      const aid = m.accountId || "default";
      const cur = map.get(aid) || { entrate: 0, uscite: 0, saldo: 0, movimenti: 0 };
      cur.movimenti++;
      if (m.importo >= 0) cur.entrate += m.importo;
      else cur.uscite += Math.abs(m.importo);
      cur.saldo += m.importo;
      map.set(aid, cur);
    }
    return map;
  }, [rawMovements]);

  const allIds = useMemo(() => movements.map(m => m.id), [movements]);
  const allSelected = movements.length > 0 && selectedRows.size === movements.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  const columns: ColumnDef<BankMovement>[] = useMemo(() => [
    {
      key: "_select", label: "", render: (r) => (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-input accent-primary"
          checked={selectedRows.has(r.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            setSelectedRows(prev => {
              const next = new Set(prev);
              if (e.target.checked) next.add(r.id);
              else next.delete(r.id);
              return next;
            });
          }}
        />
      ),
      headerRender: () => (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-input accent-primary"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected; }}
          onChange={(e) => {
            if (e.target.checked) setSelectedRows(new Set(allIds));
            else setSelectedRows(new Set());
          }}
        />
      ),
    },
    { key: "data", label: "Data Operazione", render: (r) => <span className="text-xs font-mono whitespace-nowrap">{r.data}</span>, sortable: true, filterable: true },
    { key: "dataValuta", label: "Data Valuta", render: (r) => <span className="text-xs font-mono whitespace-nowrap">{r.dataValuta || "—"}</span>, sortable: true, filterable: true },
    {
      key: "causale", label: "Causale", filterable: true,
      render: (r) => r.causale ? <span className="text-xs font-mono">{r.causale}</span> : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: "descrizione", label: "Descrizione", filterable: true, wrap: true, defaultWidth: 340,
      render: (r) => <span className="text-xs">{r.descrizione}</span>,
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
    {
      key: "_delete", label: "", render: (r) => (
        <button
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Elimina movimento"
          onClick={(e) => { e.stopPropagation(); deleteMovements([r.id]); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ], [selectedRows, deleteMovements, allIds, allSelected, someSelected]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasValidAccount) {
      toast.error("Seleziona prima un conto corrente o una carta");
      e.target.value = "";
      return;
    }
    const files = e.target.files;
    if (files) Array.from(files).forEach((file) => handleFileUpload(file, activeAccountId));
    e.target.value = "";
  };

  const handleReconcile = (movementId: string, invoices: MatchedInvoice[]) => {
    const recs = invoices.map((inv) => ({
      movementId,
      invoiceType: inv.type,
      invoiceAnno: inv.anno,
      invoiceNumero: inv.numero,
    }));
    addReconciliation(recs);
  };

  const onDragOver = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (!hasValidAccount) {
      toast.error("Seleziona prima un conto corrente o una carta");
      return;
    }
    const files = e.dataTransfer.files;
    if (files) Array.from(files).filter(isAcceptedFile).forEach((file) => handleFileUpload(file, activeAccountId));
  }, [handleFileUpload, hasValidAccount, activeAccountId]);

  const isLoading = loading || invoiceLoading;

  const handleDeleteSelected = () => {
    if (selectedRows.size === 0) return;
    deleteMovements(Array.from(selectedRows));
    setSelectedRows(new Set());
  };

  return (
    <div className="p-6 space-y-6 relative min-h-full" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-xl backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-primary">
            <Upload className="h-12 w-12 animate-bounce" />
            <p className="text-lg font-semibold">Rilascia il file qui</p>
            <p className="text-sm text-muted-foreground">Excel (.xlsx, .xls, .csv) o PDF</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Banche</h2>
          {fileNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">Carica un estratto conto per iniziare</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {fileNames.map((fn) => (
                <AlertDialog key={fn}>
                  <Badge variant="secondary" className="text-[11px] gap-1 pr-1">
                    <FileSpreadsheet className="h-3 w-3" />
                    {fn}
                    <AlertDialogTrigger asChild>
                      <button
                        className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                        title={`Rimuovi ${fn} e i suoi movimenti`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </AlertDialogTrigger>
                  </Badge>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminare il file?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Vuoi rimuovere <span className="font-medium">{fn}</span> e tutti i movimenti importati da questo file? L'azione non può essere annullata.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteFileMovements(fn)}>Elimina</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Account selector */}
          <Select value={activeAccountId} onValueChange={setActiveAccountId}>
            <SelectTrigger className={`w-[220px] h-9 text-xs ${!hasValidAccount && movements.length === 0 ? "border-primary ring-1 ring-primary/30" : ""}`}>
              <SelectValue placeholder="Seleziona conto..." />
            </SelectTrigger>
            <SelectContent>
              {conti.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">Nessun conto configurato</div>
              )}
              {conti.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-1.5">
                    {c.tipo === "carta_credito" ? <CreditCard className="h-3 w-3" /> : <Landmark className="h-3 w-3" />}
                    {c.banca} — {c.iban.slice(-4)}
                  </span>
                </SelectItem>
              ))}
              <SelectItem value="all">Tutti i conti</SelectItem>
            </SelectContent>
          </Select>

          <Link to="/strumenti">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" />Gestisci conti
            </Button>
          </Link>

          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" multiple className="hidden" onChange={onFileChange} />
          <Button onClick={() => {
            if (!hasValidAccount) { toast.error("Seleziona prima un conto corrente o una carta"); return; }
            fileInputRef.current?.click();
          }} disabled={isLoading} size="sm">
            <Upload className="h-4 w-4 mr-2" />Carica estratto
          </Button>
        </div>
      </div>

      {movements.length === 0 && !isLoading && conti.length === 0 && (
        <div className="w-full flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed bg-card text-muted-foreground">
          <Landmark className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm font-medium">Configura prima un conto corrente o una carta</p>
          <p className="text-xs mt-1 text-muted-foreground">Vai in Strumenti per aggiungere un conto</p>
          <Link to="/strumenti">
            <Button size="sm" className="mt-4">
              <Settings className="h-4 w-4 mr-1" />Vai a Strumenti
            </Button>
          </Link>
        </div>
      )}

      {movements.length === 0 && !isLoading && conti.length > 0 && (
        <button
          className="w-full flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed bg-card text-muted-foreground hover:border-primary/40 hover:bg-accent/30 transition-colors cursor-pointer"
          onClick={() => {
            if (!hasValidAccount) { toast.error("Seleziona prima un conto dal menu in alto"); return; }
            fileInputRef.current?.click();
          }}
        >
          <div className="flex gap-3 mb-4">
            <FileSpreadsheet className="h-10 w-10 opacity-30" />
            <FileText className="h-10 w-10 opacity-30" />
          </div>
          <p className="text-sm font-medium">
            {hasValidAccount ? "Carica o trascina un estratto conto" : "Seleziona un conto dal menu, poi carica l'estratto"}
          </p>
          <p className="text-xs mt-1">Formati supportati: Excel (.xlsx, .xls, .csv) e PDF</p>
        </button>
      )}

      {/* Account balances */}
      {conti.length > 0 && rawMovements.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {conti.map((c) => {
            const st = accountStats.get(c.id);
            if (!st) return null;
            return (
              <Card
                key={c.id}
                className={`cursor-pointer transition-colors ${activeAccountId === c.id ? "border-primary ring-1 ring-primary/30" : "hover:border-primary/30"}`}
                onClick={() => setActiveAccountId(c.id)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {c.tipo === "carta_credito" ? <CreditCard className="h-4 w-4 text-muted-foreground" /> : <Landmark className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-sm font-semibold truncate">{c.banca}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{st.movimenti} mov.</Badge>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">{c.iban.slice(-8)}</p>
                  <div className={`text-lg font-bold font-mono ${st.saldo >= 0 ? "text-income" : "text-expense"}`}>
                    {formatCurrency(st.saldo)}
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>↑ {formatCurrency(st.entrate)}</span>
                    <span>↓ {formatCurrency(st.uscite)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
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
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Movimenti</p><p className="text-xl font-bold">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Riconciliati</p><p className="text-xl font-bold text-income">{stats.matched}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Da riconciliare</p><p className="text-xl font-bold text-expense">{stats.unmatched}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Entrate</p><p className="text-lg font-bold font-mono text-income">{formatCurrency(stats.entrate)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Uscite</p><p className="text-lg font-bold font-mono text-expense">{formatCurrency(stats.uscite)}</p></CardContent></Card>
          </div>

          {/* Bulk actions */}
          {selectedRows.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <span className="text-xs font-medium">{selectedRows.size} righe selezionate</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="text-xs">
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Elimina selezionate
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
                    <AlertDialogDescription>
                      Vuoi eliminare {selectedRows.size} movimenti selezionati? Questa azione non può essere annullata.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSelected}>Elimina</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedRows(new Set())}>
                Deseleziona tutto
              </Button>
            </div>
          )}

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
        onRemove={(id, invoiceKey) => { removeReconciliation(id, invoiceKey); if (!invoiceKey) setSelectedMovement(null); }}
      />

      {/* Duplicate detection dialog */}
      <AlertDialog open={!!pendingDuplicates} onOpenChange={(open) => { if (!open) dismissDuplicates(); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              Movimenti duplicati rilevati
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Nel file <span className="font-medium">{pendingDuplicates?.fileName}</span> sono stati trovati{" "}
                  <span className="font-bold text-foreground">{pendingDuplicates?.duplicates.length}</span> movimenti già presenti
                  {pendingDuplicates?.unique && pendingDuplicates.unique.length > 0 && (
                    <> ({pendingDuplicates.unique.length} nuovi già importati)</>
                  )}.
                </p>
                <ScrollArea className="max-h-[200px] rounded-md border">
                  <div className="p-2 space-y-1">
                    {pendingDuplicates?.duplicates.slice(0, 20).map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                        <span className="text-muted-foreground">{d.data}</span>
                        <span className="truncate max-w-[200px] mx-2">{d.descrizione}</span>
                        <span className={`font-mono font-medium ${d.importo >= 0 ? "text-income" : "text-expense"}`}>
                          {formatCurrency(d.importo)}
                        </span>
                      </div>
                    ))}
                    {(pendingDuplicates?.duplicates.length ?? 0) > 20 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        ...e altri {(pendingDuplicates?.duplicates.length ?? 0) - 20}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={dismissDuplicates}>Ignora duplicati</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDuplicates}>Importa comunque</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default BanchePage;
