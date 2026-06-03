import { useState, useRef, useMemo, useCallback, useEffect, DragEvent } from "react";
import { Landmark, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Search, FileText, Trash2, CreditCard, Settings, RefreshCw, ChevronDown, Banknote, Pencil  } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useBankData, BankMovement, MatchedInvoice, scoreMatch, DuplicateInfo } from "@/hooks/useBankData";
import { useDocumentiAcquisto, DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";
import { useXmlInvoices, XmlInvoiceRecord } from "@/hooks/useXmlInvoices";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from
"@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from
"@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger } from
"@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

// Load conti from shared hook
import { useContiCorrenti, ContoCorrente } from "@/hooks/useContiCorrenti";
import { BankLogo } from "@/components/BankLogo";
import { useRateFinanziamento, RataFinanziamento } from "@/hooks/useRateFinanziamento";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox as CheckboxUI } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";


function ReconciliationBadge({ m }: {m: BankMovement;}) {
  if (m.matchConfidence === "auto") {
    return (
      <Badge variant="default" className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] text-[10px]">
        <CheckCircle2 className="h-3 w-3 mr-1" />Auto
      </Badge>);

  }
  if (m.matchConfidence === "manual") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        <CheckCircle2 className="h-3 w-3 mr-1" />Manuale
      </Badge>);

  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      <AlertCircle className="h-3 w-3 mr-1" />Da riconciliare
    </Badge>);

}

function MatchedInvoiceLabel({ m }: {m: BankMovement;}) {
  if (m.matchConfidence === "none" || !m.matchedInvoices.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {m.matchedInvoices.map((inv, i) => {
        if (inv.type === "documento") {
          return (
            <span key={i} className="text-xs font-mono">
              📄 {inv.documentoLabel || "Doc"}
            </span>);
        }
        const type = inv.type === "vendita" ? "V" : "A";
        return (
          <span key={i} className="text-xs font-mono">
            {type} {inv.anno}/{inv.numero}
          </span>);
      })}
    </div>);
}

interface ReconcileSheetProps {
  movement: BankMovement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: SaleInvoice[];
  purchases: PurchaseInvoice[];
  documenti: DocumentoAcquisto[];
  onReconcile: (movementId: string, invoices: MatchedInvoice[]) => void;
  onRemove: (movementId: string, invoiceKey?: string) => void;
  findXml?: (key: string, counterpartName?: string) => XmlInvoiceRecord | undefined;
}

function ReconcileSheet({ movement, open, onOpenChange, sales, purchases, documenti, onReconcile, onRemove, findXml }: ReconcileSheetProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"vendita" | "acquisto" | "documento">("vendita");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"score" | "data">("score");

  const effectiveTab = movement ?
  movement.importo < 0 ? "acquisto" : "vendita" :
  tab;

  const currentTab = tab !== effectiveTab && tab !== "documento" ? effectiveTab : tab;

  // Initialize selected from existing matches when movement changes
  useMemo(() => {
    if (movement && movement.matchedInvoices.length > 0) {
      setSelected(new Set(movement.matchedInvoices.map((inv) => {
        if (inv.type === "documento") return `documento-${inv.documentoId}`;
        return `${inv.type}-${inv.anno}-${inv.numero}`;
      })));
    } else {
      setSelected(new Set());
    }
  }, [movement?.id]);

  // Parse date helper for sorting
  const parseDateForSort = (d: string): number => {
    if (!d) return 0;
    const parts = d.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!parts) return 0;
    const year = parts[3].length === 2 ? 2000 + Number(parts[3]) : Number(parts[3]);
    return year * 10000 + Number(parts[2]) * 100 + Number(parts[1]);
  };

  // Broad search helper
  const matchesSearch = (q: string, ...fields: string[]): boolean => {
    return fields.some(f => (f || "").toLowerCase().includes(q));
  };

  // Scored items for invoice tabs
  const scoredItems = useMemo(() => {
    if (!movement || currentTab === "documento") return [];
    const isVendita = currentTab === "vendita";
    const list = isVendita ? sales : purchases;
    const scored = list.map((inv) => {
      const name = isVendita ? (inv as SaleInvoice).cliente : (inv as PurchaseInvoice).fornitore;
      const sc = scoreMatch(movement, inv, name);
      let xmlNumDoc = "";
      if (!isVendita && findXml) {
        const xml = findXml(`${inv.anno}-${inv.numero}`, (inv as PurchaseInvoice).fornitore);
        xmlNumDoc = xml?.numero_documento || "";
      }
      return { inv, score: sc, name, xmlNumDoc };
    });
    const filtered = search ?
      scored.filter(({ inv, name, xmlNumDoc }) => {
        const q = search.toLowerCase();
        return matchesSearch(q,
          name, String(inv.numero), String(inv.anno),
          inv.cig, inv.descrizione, inv.data,
          inv.scadenza, inv.pagamento,
          String(inv.totale), String(inv.imponibile),
          inv.partitaIva, xmlNumDoc,
          (inv as any).suffisso || ""
        );
      }) : scored;
    if (sortBy === "data") {
      return filtered.sort((a, b) => parseDateForSort(b.inv.data) - parseDateForSort(a.inv.data));
    }
    return filtered.sort((a, b) => b.score - a.score);
  }, [movement, currentTab, sales, purchases, search, sortBy]);

  // Scored documenti for documento tab
  const scoredDocumenti = useMemo(() => {
    if (!movement || currentTab !== "documento") return [];
    const scored = documenti.filter(d => d.importo != null).map((doc) => {
      let score = 0;
      const absImporto = Math.abs(movement.importo);
      const docImporto = Math.abs(doc.importo || 0);
      const diff = Math.abs(docImporto - absImporto);
      if (diff < 0.02) score += 30;
      else if (diff < 1) score += 25;
      else if (absImporto > 0 && diff < absImporto * 0.01) score += 20;
      else if (absImporto > 0 && diff < absImporto * 0.05) score += 10;
      if (movement.cig && doc.cig && movement.cig.toLowerCase() === doc.cig.toLowerCase()) score += 40;
      const docName = doc.fornitore || doc.descrizione || doc.file_name;
      const descLower = (movement.descrizione || "").toLowerCase();
      const nameLower = (docName || "").toLowerCase();
      if (nameLower && descLower.includes(nameLower)) score += 15;
      else if (nameLower) {
        const words = nameLower.split(/\s+/);
        const common = words.filter(w => w.length > 2 && descLower.includes(w)).length;
        score += Math.round((common / Math.max(words.length, 1)) * 15);
      }
      return { doc, score, name: docName || doc.file_name };
    });
    const filtered = search ?
      scored.filter(({ doc, name }) => {
        const q = search.toLowerCase();
        return matchesSearch(q,
          name, doc.file_name, doc.cig,
          doc.descrizione || "", doc.data_documento || "",
          doc.fornitore || "", String(doc.importo || ""),
          doc.centro_costo || ""
        );
      }) : scored;
    if (sortBy === "data") {
      return filtered.sort((a, b) => parseDateForSort(b.doc.data_documento || "") - parseDateForSort(a.doc.data_documento || ""));
    }
    return filtered.sort((a, b) => b.score - a.score);
  }, [movement, currentTab, documenti, search, sortBy]);

  const selectedTotal = useMemo(() => {
    if (!movement) return 0;
    let total = 0;
    for (const key of selected) {
      if (key.startsWith("documento-")) {
        const docId = key.replace("documento-", "");
        const doc = documenti.find(d => d.id === docId);
        if (doc && doc.importo) total += Math.abs(doc.importo);
      } else {
        const [type, anno, numero] = key.split("-");
        const list = type === "vendita" ? sales : purchases;
        const inv = list.find((i) => i.anno === Number(anno) && i.numero === Number(numero));
        if (inv) {
          // Per fornitori con ritenute il bonifico riguarda l'importo da pagare
          if (type === "acquisto") {
            const p = inv as PurchaseInvoice;
            const ritAbs = Math.abs(p.ritenute || 0);
            const daPagare = ritAbs > 0
              ? Math.max(0, p.imponibile + p.cassa + p.imposta - ritAbs)
              : p.totale;
            total += daPagare;
          } else {
            total += inv.totale;
          }
        }
      }
    }
    return total;
  }, [selected, sales, purchases, documenti, movement]);

  // Count selected per tab for badges
  const selectedCounts = useMemo(() => {
    let vendita = 0, acquisto = 0, documento = 0;
    for (const key of selected) {
      if (key.startsWith("documento-")) documento++;
      else if (key.startsWith("vendita-")) vendita++;
      else if (key.startsWith("acquisto-")) acquisto++;
    }
    return { vendita, acquisto, documento };
  }, [selected]);

  if (!movement) return null;
  const isMatched = movement.matchConfidence !== "none";

  const toggleInvoice = (type: "vendita" | "acquisto", anno: number, numero: number) => {
    const key = `${type}-${anno}-${numero}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleDocumento = (docId: string) => {
    const key = `documento-${docId}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    const invoices: MatchedInvoice[] = Array.from(selected).map((key) => {
      if (key.startsWith("documento-")) {
        const docId = key.replace("documento-", "");
        const doc = documenti.find(d => d.id === docId);
        return { type: "documento" as const, anno: 0, numero: 0, documentoId: docId, documentoLabel: doc?.fornitore || doc?.file_name || "Doc" };
      }
      const [type, anno, numero] = key.split("-");
      return { type: type as "vendita" | "acquisto", anno: Number(anno), numero: Number(numero) };
    });
    onReconcile(movement.id, invoices);
    onOpenChange(false);
  };

  const tabButton = (tabId: "vendita" | "acquisto" | "documento", label: string, icon?: React.ReactNode) => {
    const count = selectedCounts[tabId];
    return (
      <Button variant={currentTab === tabId ? "default" : "outline"} size="sm" className="text-xs flex-1 relative" onClick={() => setTab(tabId)}>
        {icon}{label}
        {count > 0 && (
          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary-foreground text-primary text-[9px] h-4 min-w-[16px] px-1">
            {count}
          </span>
        )}
      </Button>
    );
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
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-medium whitespace-pre-wrap break-words">{movement.descrizione || "Nessuna descrizione"}</p>
            {movement.cig && <span className="text-[10px] font-mono text-muted-foreground">CIG: {movement.cig}</span>}
            <div className="flex items-center gap-2">
              <ReconciliationBadge m={movement} />
              {isMatched && <MatchedInvoiceLabel m={movement} />}
            </div>
          </div>
          {isMatched &&
          <div className="space-y-1">
              {movement.matchedInvoices.map((inv, i) =>
            <div key={i} className="flex items-center justify-between text-xs rounded border px-2 py-1">
                  <span className="font-mono">
                    {inv.type === "documento" ? `📄 ${inv.documentoLabel || "Doc"}` : `${inv.type === "vendita" ? "V" : "A"} ${inv.anno}/${inv.numero}`}
                  </span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(movement.id, inv.type === "documento" ? `documento-${inv.documentoId}` : `${inv.type}-${inv.anno}-${inv.numero}`)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
            )}
              <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => {onRemove(movement.id);onOpenChange(false);}}>
                <X className="h-3 w-3 mr-1" />Rimuovi tutte le associazioni
              </Button>
            </div>
          }
          {/* Selection summary — always visible when items selected */}
          {selected.size > 0 &&
          <div className="rounded-lg border bg-primary/5 border-primary/30 p-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-xs">
                  <span className="font-medium">{selected.size} element{selected.size === 1 ? "o" : "i"}</span>
                  <span className="text-muted-foreground ml-2">Totale: {formatCurrency(selectedTotal)}</span>
                  <span className={`ml-2 font-medium ${Math.abs(selectedTotal - Math.abs(movement.importo)) < 0.01 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}`}>
                    {Math.abs(selectedTotal - Math.abs(movement.importo)) < 0.01 ? "✓ Quadra" : `Δ ${formatCurrency(selectedTotal - Math.abs(movement.importo))}`}
                  </span>
                </div>
                <Button size="sm" className="text-xs h-7" onClick={handleConfirm}>
                  Conferma
                </Button>
              </div>
              {selected.size > 1 && (
                <p className="text-[10px] text-muted-foreground">Riconciliazione parziale: {selected.size} documenti associati a 1 movimento</p>
              )}
            </div>
          }
          <div className="flex gap-1">
            {tabButton("vendita", "Vendita")}
            {tabButton("acquisto", "Acquisto")}
            {tabButton("documento", "Documenti", <FileText className="h-3 w-3 mr-1" />)}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Cerca in tutti i campi..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-xs" />
            </div>
            <Button variant="outline" size="sm" className="h-9 text-[10px] px-2 shrink-0" onClick={() => setSortBy(sortBy === "score" ? "data" : "score")} title={sortBy === "score" ? "Ordina per data" : "Ordina per rilevanza"}>
              {sortBy === "score" ? "📊 Rilevanza" : "📅 Data"}
            </Button>
          </div>
          <ScrollArea className="h-[350px]">
            <div className="space-y-1 pr-3">
              {currentTab !== "documento" && (
                <>
                  {scoredItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Nessuna fattura trovata</p>}
                  {scoredItems.map(({ inv, score, name, xmlNumDoc }) => {
                    const invKey = `${currentTab}-${inv.anno}-${inv.numero}`;
                    const isSelected = selected.has(invKey);
                    const isVendita = currentTab === "vendita";
                    return (
                      <button
                        key={inv.id}
                        className={`w-full text-left rounded-lg border p-2 hover:bg-accent/50 transition-colors ${isSelected ? "border-primary bg-primary/10" : score >= 35 ? "border-primary/40 bg-primary/5" : ""}`}
                        onClick={() => toggleInvoice(currentTab as "vendita" | "acquisto", inv.anno, inv.numero)}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                            <Checkbox checked={isSelected} className="pointer-events-none" />
                            <span className="text-xs font-medium">{inv.anno}/{inv.numero}</span>
                            {isVendita && (inv as SaleInvoice).suffisso && (
                              <span className="text-[10px] font-mono text-muted-foreground">({(inv as SaleInvoice).suffisso})</span>
                            )}
                            {!isVendita && xmlNumDoc && (
                              <span className="text-[10px] font-mono text-muted-foreground">N° forn: {xmlNumDoc}</span>
                            )}
                            {!isVendita && !xmlNumDoc && (
                              <span className="text-[10px] font-mono text-muted-foreground/60">N° forn: —</span>
                            )}
                            {score >= 35 &&
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/50 text-primary">{score}%</Badge>
                            }
                          </div>
                          {(() => {
                            if (isVendita) {
                              return <span className="text-xs font-mono font-medium text-income">{formatCurrency(inv.totale)}</span>;
                            }
                            const p = inv as PurchaseInvoice;
                            const ritAbs = Math.abs(p.ritenute || 0);
                            const hasRitenute = ritAbs > 0;
                            const daPagare = hasRitenute
                              ? Math.max(0, p.imponibile + p.cassa + p.imposta - ritAbs)
                              : p.totale;
                            return (
                              <div className="flex flex-col items-end leading-tight">
                                <span className="text-xs font-mono font-medium text-expense">{formatCurrency(daPagare)}</span>
                                {hasRitenute && (
                                  <span className="text-[9px] font-mono text-muted-foreground/80" title="Tot. lordo fattura">
                                    lordo {formatCurrency(p.totale)}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-3 ml-6">
                          <span className="text-[10px] text-muted-foreground">{inv.data}</span>
                          <p className="text-[11px] text-muted-foreground truncate flex-1">{name}</p>
                        </div>
                        {inv.cig && <span className="text-[10px] font-mono text-muted-foreground ml-6">CIG: {inv.cig}</span>}
                      </button>);
                  })}
                </>
              )}
              {currentTab === "documento" && (
                <>
                  {scoredDocumenti.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Nessun documento trovato</p>}
                  {scoredDocumenti.map(({ doc, score, name }) => {
                    const docKey = `documento-${doc.id}`;
                    const isSelected = selected.has(docKey);
                    return (
                      <button
                        key={docKey}
                        className={`w-full text-left rounded-lg border p-2 hover:bg-accent/50 transition-colors ${isSelected ? "border-primary bg-primary/10" : score >= 35 ? "border-primary/40 bg-primary/5" : ""}`}
                        onClick={() => toggleDocumento(doc.id)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={isSelected} className="pointer-events-none" />
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium truncate max-w-[200px]">{name}</span>
                            {score >= 35 &&
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/50 text-primary">{score}%</Badge>
                            }
                          </div>
                          <span className="text-xs font-mono font-medium text-expense">{formatCurrency(Math.abs(doc.importo || 0))}</span>
                        </div>
                        <div className="flex items-center gap-3 ml-8">
                          {doc.data_documento && <span className="text-[10px] text-muted-foreground">{doc.data_documento}</span>}
                          <p className="text-[11px] text-muted-foreground truncate flex-1">{doc.file_name}</p>
                        </div>
                        {doc.cig && <span className="text-[10px] font-mono text-muted-foreground ml-8">CIG: {doc.cig}</span>}
                      </button>);
                  })}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>);
}

const ACCEPTED_TYPES = [
"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
"application/vnd.ms-excel",
"text/csv",
"application/pdf"];

const ACCEPTED_EXT = [".xlsx", ".xls", ".csv", ".pdf"];

function isAcceptedFile(file: File) {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return ACCEPTED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext));
}

const BanchePage = () => {
  const { allSales, allPurchases, loading: invoiceLoading } = useInvoiceData();
  const {
    movements, rawMovements, loading, handleFileUpload,
    addReconciliation, removeReconciliation, clearMovements, deleteMovements,
    stats, activeAccountId, setActiveAccountId,
    pendingDuplicates, confirmDuplicates, dismissDuplicates, refreshAutoMatch,
    deduplicateExisting, bulkUpdateCIG, updateMovementCig,
  } = useBankData(allSales, allPurchases);
  const { conti } = useContiCorrenti();
  const { documenti } = useDocumentiAcquisto();
  const { findXml } = useXmlInvoices(allPurchases, "acquisto");
  const contiFinanziamento = useMemo(() => conti.filter(c => c.tipo === "finanziamento" || c.tipo === "crediti_fiscali"), [conti]);
  const { rate: allRate, togglePagata, refetch: refetchRate } = useRateFinanziamento();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableToolbarRef = useRef<HTMLDivElement>(null);
  const [selectedMovement, setSelectedMovement] = useState<BankMovement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingPlaceholder, setIsDraggingPlaceholder] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [filterYear, setFilterYear] = useState<string>("");
  const [editingCigId, setEditingCigId] = useState<string | null>(null);
  const [editingCigValue, setEditingCigValue] = useState("");


  const hasValidAccount = activeAccountId !== "default" && activeAccountId !== "all" && conti.some((c) => c.id === activeAccountId);

  const accountStats = useMemo(() => {
    const map = new Map<string, {entrate: number;uscite: number;saldo: number;movimenti: number;}>();
    for (const m of rawMovements) {
      const aid = m.accountId || "default";
      const cur = map.get(aid) || { entrate: 0, uscite: 0, saldo: 0, movimenti: 0 };
      cur.movimenti++;
      if (m.importo >= 0) cur.entrate += m.importo;else
      cur.uscite += Math.abs(m.importo);
      cur.saldo += m.importo;
      map.set(aid, cur);
    }
    return map;
  }, [rawMovements]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const m of movements) {
      const parts = m.data?.split("/");
      if (parts && parts.length >= 3) {
        const y = parseInt(parts[2], 10);
        if (!isNaN(y)) years.add(y);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [movements]);

  const filteredMovements = useMemo(() => {
    if (!filterYear || filterYear === "all") return movements;
    return movements.filter((m) => {
      const parts = m.data?.split("/");
      if (parts && parts.length >= 3) return parts[2] === filterYear;
      return false;
    });
  }, [movements, filterYear]);

  const allIds = useMemo(() => filteredMovements.map((m) => m.id), [filteredMovements]);
  const allSelected = filteredMovements.length > 0 && selectedRows.size === filteredMovements.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  const columns: ColumnDef<BankMovement>[] = useMemo(() => [
  {
    key: "_select", label: "", render: (r) =>
    <input
      type="checkbox"
      className="h-3.5 w-3.5 rounded border-input accent-primary"
      checked={selectedRows.has(r.id)}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        setSelectedRows((prev) => {
          const next = new Set(prev);
          if (e.target.checked) next.add(r.id);else
          next.delete(r.id);
          return next;
        });
      }} />,


    headerRender: () =>
    <input
      type="checkbox"
      className="h-3.5 w-3.5 rounded border-input accent-primary"
      checked={allSelected}
      ref={(el) => {if (el) el.indeterminate = someSelected;}}
      onChange={(e) => {
        if (e.target.checked) setSelectedRows(new Set(allIds));else
        setSelectedRows(new Set());
      }} />


  },
  { key: "data", label: "Data Operazione", render: (r) => <span className="text-xs font-mono whitespace-nowrap">{r.data}</span>, sortable: true, filterable: true },
  { key: "dataValuta", label: "Data Valuta", render: (r) => <span className="text-xs font-mono whitespace-nowrap">{r.dataValuta || "—"}</span>, sortable: true, filterable: true },
  {
    key: "causale", label: "Causale", filterable: true,
    render: (r) => r.causale ? <span className="text-xs font-mono">{r.causale}</span> : <span className="text-xs text-muted-foreground">—</span>
  },
  {
    key: "descrizione", label: "Descrizione", filterable: true, wrap: true, defaultWidth: 340,
    render: (r) => <span className="text-xs">{r.descrizione}</span>
  },
  {
    key: "importo", label: "Importo", sortable: true, align: "right" as const,
    render: (r) =>
    <span className={`text-xs font-mono font-medium ${r.importo >= 0 ? "text-income" : "text-expense"}`}>
          {formatCurrency(r.importo)}
        </span>

  },
  { key: "saldo", label: "Saldo", sortable: true, align: "right" as const, defaultHidden: true, render: (r) => <span className="text-xs font-mono">{formatCurrency(r.saldo)}</span> },
  { key: "cig", label: "CIG", filterable: true, render: (r) => {
    if (editingCigId === r.id) {
      return (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); updateMovementCig(r.id, editingCigValue); setEditingCigId(null); }}>
          <Input
            autoFocus
            className="h-6 w-28 text-xs font-mono px-1"
            value={editingCigValue}
            onChange={(e) => setEditingCigValue(e.target.value)}
            onBlur={() => { updateMovementCig(r.id, editingCigValue); setEditingCigId(null); }}
            onKeyDown={(e) => { if (e.key === "Escape") setEditingCigId(null); }}
            onClick={(e) => e.stopPropagation()}
          />
        </form>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-mono cursor-pointer hover:text-primary transition-colors group"
        title="Clicca per modificare il CIG"
        onClick={(e) => { e.stopPropagation(); setEditingCigId(r.id); setEditingCigValue(r.cig || ""); }}>
        {r.cig || <span className="text-muted-foreground">—</span>}
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    );
  }},
  {
    key: "matchConfidence", label: "Stato", sortable: true, filterable: true,
    render: (r) => <ReconciliationBadge m={r} />
  },
  {
    key: "matchedType", label: "Fattura", sortable: true,
    render: (r) => <MatchedInvoiceLabel m={r} />
  },
  {
    key: "_delete", label: "", render: (r) =>
    <button
      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
      title="Elimina movimento"
      onClick={(e) => {e.stopPropagation();deleteMovements([r.id]);}}>
      
          <Trash2 className="h-3.5 w-3.5" />
        </button>

  }],
  [selectedRows, deleteMovements, allIds, allSelected, someSelected, editingCigId, editingCigValue, updateMovementCig]);

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
      documentoId: inv.documentoId,
    }));
    addReconciliation(recs);
  };

  const onDragOver = useCallback((e: DragEvent) => {e.preventDefault();e.stopPropagation();setIsDragging(true);}, []);
  const onDragLeave = useCallback((e: DragEvent) => {e.preventDefault();e.stopPropagation();setIsDragging(false);}, []);
  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();e.stopPropagation();setIsDragging(false);
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
    <div className="p-6 space-y-6 relative min-h-full bg-white" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {isDragging &&
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-xl backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-primary">
            <Upload className="h-12 w-12 animate-bounce" />
            <p className="text-lg font-semibold">Rilascia il file qui</p>
            <p className="text-sm text-muted-foreground">Excel (.xlsx, .xls, .csv) o PDF</p>
          </div>
        </div>
      }

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div />
        <div className="flex items-center gap-2">
          {/* Account selector */}
          <Select value={activeAccountId} onValueChange={setActiveAccountId}>
            <SelectTrigger className={`w-[220px] h-9 text-xs ${!hasValidAccount && movements.length === 0 ? "border-primary ring-1 ring-primary/30" : ""}`}>
              <SelectValue placeholder="Seleziona conto..." />
            </SelectTrigger>
            <SelectContent>
              {conti.length === 0 &&
              <div className="px-3 py-2 text-xs text-muted-foreground">Nessun conto configurato</div>
              }
              {conti.map((c) =>
              <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-1.5">
                    <BankLogo bankName={c.banca} tipo={c.tipo} className="h-4 w-4" />
                    {c.banca} — {c.iban.slice(-4)}
                  </span>
                </SelectItem>
              )}
              <SelectItem value="all">Tutti i conti</SelectItem>
            </SelectContent>
          </Select>

          <Link to="/strumenti">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" />Gestisci conti
            </Button>
          </Link>

          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" multiple className="hidden" onChange={onFileChange} />
          {movements.length > 0 &&
          <>
          <Button variant="outline" size="sm" title="Riesegui il matching automatico solo sui movimenti non ancora riconciliati" onClick={() => {const n = refreshAutoMatch();if (n > 0) toast.success(`${n} nuove riconciliazioni automatiche salvate`); else toast.info("Nessun nuovo match trovato — le riconciliazioni esistenti sono state preservate");}}>
              <RefreshCw className="h-4 w-4 mr-1" />Aggiorna riconciliazione
            </Button>
          <Button variant="outline" size="sm" title="Trova e rimuovi movimenti duplicati nel database" onClick={async () => {
              const count = await deduplicateExisting();
              if (count > 0) toast.success(`Rimossi ${count} movimenti duplicati`);
              else toast.info("Nessun duplicato trovato");
            }}>
              <Trash2 className="h-4 w-4 mr-1" />Rimuovi doppioni
            </Button>
          <Button variant="outline" size="sm" title="Estrai CIG dalla descrizione dei movimenti senza CIG" onClick={async () => {
              const count = await bulkUpdateCIG();
              if (count > 0) toast.success(`CIG aggiornato su ${count} movimenti`);
              else toast.info("Nessun nuovo CIG trovato nelle descrizioni");
            }}>
              <RefreshCw className="h-4 w-4 mr-1" />Aggiorna CIG
            </Button>
          </>
          }
          <Button onClick={() => {
            if (!hasValidAccount) {toast.error("Seleziona prima un conto corrente o una carta");return;}
            fileInputRef.current?.click();
          }} disabled={isLoading} size="sm">
            <Upload className="h-4 w-4 mr-2" />Carica estratto
          </Button>
        </div>
      </div>

      {movements.length === 0 && !isLoading && conti.length === 0 &&
      <div className="w-full flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed bg-card text-muted-foreground">
          <Landmark className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm font-medium">Configura prima un conto corrente o una carta</p>
          <Link to="/strumenti">
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs">
              <Settings className="h-3.5 w-3.5 mr-1" />Vai a Strumenti
            </Button>
          </Link>
        </div>
      }

      {movements.length === 0 && !isLoading && conti.length > 0 &&
      <button
        type="button"
        className={`w-full flex items-center justify-center gap-3 h-24 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
        isDraggingPlaceholder ?
        "border-primary bg-primary/10 text-primary" :
        "bg-card text-muted-foreground hover:border-primary/40 hover:bg-accent/30"}`
        }
        onClick={() => {
          if (!hasValidAccount) {toast.error("Seleziona prima un conto dal menu in alto");return;}
          fileInputRef.current?.click();
        }}
        onDragOver={(e) => {e.preventDefault();e.stopPropagation();setIsDraggingPlaceholder(true);}}
        onDragEnter={(e) => {e.preventDefault();e.stopPropagation();setIsDraggingPlaceholder(true);}}
        onDragLeave={(e) => {e.preventDefault();e.stopPropagation();setIsDraggingPlaceholder(false);}}
        onDrop={(e) => {
          e.preventDefault();e.stopPropagation();
          setIsDraggingPlaceholder(false);
          setIsDragging(false);
          if (!hasValidAccount) {toast.error("Seleziona prima un conto dal menu in alto");return;}
          const files = e.dataTransfer.files;
          if (files) Array.from(files).filter(isAcceptedFile).forEach((file) => handleFileUpload(file, activeAccountId));
        }}>
        
          <Upload className={`h-6 w-6 ${isDraggingPlaceholder ? "opacity-100" : "opacity-40"}`} />
          <div className="text-left">
            <p className="text-sm font-medium">
              {isDraggingPlaceholder ?
              "Rilascia il file qui" :
              hasValidAccount ? "Carica o trascina un estratto conto" : "Seleziona un conto, poi carica l'estratto"}
            </p>
            <p className="text-[11px] mt-0.5">Excel (.xlsx, .xls, .csv) o PDF</p>
          </div>
        </button>
      }

      {/* Account balances */}
      {conti.length > 0 && rawMovements.length > 0 &&
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {conti.filter((c) => !activeAccountId || c.id === activeAccountId).map((c) => {
          const st = accountStats.get(c.id);
          if (!st) return null;
          return (
            <Card
              key={c.id}
              className={`cursor-pointer transition-colors ${activeAccountId === c.id ? "border-primary ring-1 ring-primary/30" : "hover:border-primary/30"}`}
              onClick={() => setActiveAccountId(c.id)}>
              
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <BankLogo bankName={c.banca} tipo={c.tipo} className="h-5 w-5" />
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
              </Card>);

        })}
        </div>
      }

      {/* Finanziamenti section */}
      {contiFinanziamento.length > 0 && allRate.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Banknote className="h-4 w-4" /> Prestiti e Finanziamenti
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {contiFinanziamento.map((conto) => {
              const rate = allRate.filter(r => r.conto_id === conto.id);
              if (rate.length === 0) return null;
              const totalePiano = rate.reduce((a, r) => a + r.importo_rata, 0);
              const pagate = rate.filter(r => r.pagata);
              const pagato = pagate.reduce((a, r) => a + r.importo_rata, 0);
              const residuo = rate.length > 0 ? rate[rate.length - 1].debito_residuo : 0;
              const oggi = new Date();
              const prossima = rate
                .filter(r => !r.pagata)
                .map(r => {
                  const parts = r.data_scadenza.split("/");
                  const d = parts.length === 3 ? new Date(+parts[2], +parts[1] - 1, +parts[0]) : new Date(0);
                  return { ...r, _date: d };
                })
                .sort((a, b) => {
                  // Prefer the closest future date, then closest past date
                  const aFuture = a._date >= oggi;
                  const bFuture = b._date >= oggi;
                  if (aFuture && !bFuture) return -1;
                  if (!aFuture && bFuture) return 1;
                  return aFuture ? a._date.getTime() - b._date.getTime() : b._date.getTime() - a._date.getTime();
                })[0];
              const percentuale = totalePiano > 0 ? Math.round((pagato / totalePiano) * 100) : 0;

              // Find matching movements for this loan
              const loanRef = conto.iban.replace(/\s/g, "");
              const addebitoId = conto.conto_addebito_id;
              const matchingMovements = rawMovements.filter(m => {
                const desc = m.descrizione.replace(/\s/g, "").toUpperCase();
                const isRataPayment = m.causale.toUpperCase().includes("PAGAMENTO RATE") || m.causale.toUpperCase().includes("FINANZIAMENTO") || desc.includes("FIN.") || desc.includes("PAG.RATA");
                const matchesLoanRef = desc.includes(loanRef.toUpperCase());
                const matchesAccount = addebitoId ? m.accountId === addebitoId : true;
                return isRataPayment && matchesLoanRef && matchesAccount;
              });

              const handleReconciliaRate = async () => {
                let matched = 0;
                for (const mov of matchingMovements) {
                  // Try to extract rata number from description
                  const rataNumMatch = mov.descrizione.match(/RATA\s*N\.?\s*(\d+)/i);
                  if (rataNumMatch) {
                    const rataNum = parseInt(rataNumMatch[1], 10);
                    const rata = rate.find(r => r.numero_rata === rataNum && !r.pagata);
                    if (rata) {
                      await togglePagata(rata.id, true);
                      matched++;
                      continue;
                    }
                  }
                  // Fallback: match by amount
                  const movAbs = Math.abs(mov.importo);
                  const rata = rate.find(r => !r.pagata && Math.abs(r.importo_rata - movAbs) < 0.05);
                  if (rata) {
                    await togglePagata(rata.id, true);
                    matched++;
                  }
                }
                if (matched > 0) {
                  toast.success(`${matched} rate riconciliate con i movimenti bancari`);
                } else {
                  toast.info("Nessuna nuova rata da riconciliare trovata");
                }
              };

              return (
                <Card key={conto.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                      <div className="flex items-center gap-2">
                        <BankLogo bankName={conto.banca} tipo={conto.tipo} className="h-5 w-5" />
                        <div>
                          <span className="text-sm font-semibold">{conto.banca}</span>
                          {conto.note && <span className="text-xs text-muted-foreground ml-2">— {conto.note}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {matchingMovements.length > 0 && (
                          <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={handleReconciliaRate}>
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Riconcilia ({matchingMovements.length} mov.)
                          </Button>
                        )}
                        <Badge variant="outline" className="text-[10px]">{rate.length} rate</Badge>
                      </div>
                    </div>

                    {/* KPI row */}
                    {(() => {
                      const now = new Date();
                      const scadute = rate.filter(r => {
                        if (r.pagata) return false;
                        const p = r.data_scadenza.split("/");
                        return p.length === 3 && new Date(+p[2], +p[1] - 1, +p[0]) < now;
                      });
                      return (
                    <div className="grid grid-cols-5 gap-0 border-b text-center">
                      <div className="p-3 border-r">
                        <p className="text-[10px] text-muted-foreground">Totale Piano</p>
                        <p className="text-sm font-semibold font-mono">{formatCurrency(totalePiano)}</p>
                      </div>
                      <div className="p-3 border-r">
                        <p className="text-[10px] text-muted-foreground">Pagato</p>
                        <p className="text-sm font-semibold font-mono text-[hsl(var(--success))]">{formatCurrency(pagato)}</p>
                      </div>
                      <div className="p-3 border-r">
                        <p className="text-[10px] text-muted-foreground">Debito Residuo</p>
                        <p className="text-sm font-semibold font-mono text-destructive">{formatCurrency(residuo)}</p>
                      </div>
                      <div className="p-3 border-r">
                        <p className="text-[10px] text-muted-foreground">Scadute</p>
                        <p className={`text-sm font-semibold ${scadute.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {scadute.length > 0 ? `${scadute.length} ⚠` : "0"}
                        </p>
                      </div>
                      <div className="p-3">
                        <p className="text-[10px] text-muted-foreground">Avanzamento</p>
                        <p className="text-sm font-semibold">{pagate.length}/{rate.length} ({percentuale}%)</p>
                      </div>
                    </div>
                      );
                    })()}

                    {/* Progress bar */}
                     <div className="px-4 pt-3 pb-1 bg-slate-500">
                      <Progress value={percentuale} className="h-2" />
                    </div>

                    {/* Prossima rata */}
                    {prossima && (
                      <div className="px-4 py-2 text-xs text-muted-foreground">
                        Prossima rata: <span className="font-medium text-foreground">{prossima.data_scadenza}</span> — <span className="font-mono font-medium">{formatCurrency(prossima.importo_rata)}</span>
                      </div>
                    )}

                    {/* Rate table (compact, scrollable) */}
                    <div className="max-h-[240px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                          <TableRow>
                            <TableHead className="text-[10px] w-[30px]">#</TableHead>
                            <TableHead className="text-[10px]">Scadenza</TableHead>
                            <TableHead className="text-[10px] text-right">Rata</TableHead>
                            <TableHead className="text-[10px] text-right">Capitale</TableHead>
                            <TableHead className="text-[10px] text-right">Interessi</TableHead>
                            <TableHead className="text-[10px] text-right">Residuo</TableHead>
                            <TableHead className="text-[10px] w-[50px] text-center">Pagata</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rate.map((r) => {
                            const parts = r.data_scadenza.split("/");
                            const scadDate = parts.length === 3 ? new Date(+parts[2], +parts[1] - 1, +parts[0]) : null;
                            const isOverdue = !r.pagata && scadDate && scadDate < new Date();
                            return (
                            <TableRow key={r.id} className={`text-xs ${r.pagata ? "opacity-50" : isOverdue ? "bg-destructive/10" : ""}`}>
                              <TableCell className="py-1.5 text-[11px] text-muted-foreground">{r.numero_rata}</TableCell>
                              <TableCell className={`py-1.5 text-[11px] font-mono whitespace-nowrap ${isOverdue ? "text-destructive font-semibold" : ""}`}>
                                {r.data_scadenza}
                                {isOverdue && <span className="ml-1 text-[9px]">⚠</span>}
                              </TableCell>
                              <TableCell className="py-1.5 text-[11px] font-mono text-right">{formatCurrency(r.importo_rata)}</TableCell>
                              <TableCell className="py-1.5 text-[11px] font-mono text-right">{formatCurrency(r.importo_capitale)}</TableCell>
                              <TableCell className="py-1.5 text-[11px] font-mono text-right text-muted-foreground">{formatCurrency(r.importo_interessi)}</TableCell>
                              <TableCell className="py-1.5 text-[11px] font-mono text-right">{formatCurrency(r.debito_residuo)}</TableCell>
                              <TableCell className="py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded accent-primary"
                                  checked={r.pagata}
                                  onChange={() => togglePagata(r.id, !r.pagata)}
                                />
                              </TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {isLoading &&
      <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }

      {movements.length > 0 && !isLoading &&
      <>
          {/* Stats cards (in alto) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Movimenti</p><p className="text-xl font-bold">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Riconciliati</p><p className="text-xl font-bold text-income">{stats.matched}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Da riconciliare</p><p className="text-xl font-bold text-expense">{stats.unmatched}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Entrate</p><p className="text-lg font-bold font-mono text-income">{formatCurrency(stats.entrate)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Uscite</p><p className="text-lg font-bold font-mono text-expense">{formatCurrency(stats.uscite)}</p></CardContent></Card>
          </div>

          {/* Bulk actions */}
          {selectedRows.size > 0 &&
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
        }

          {/* Toolbar custom: filtro anno + Reset a sinistra, search e altri controlli del DataTable a destra (via portal) */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Tutti gli anni" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli anni</SelectItem>
                {availableYears.map((y) =>
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                )}
              </SelectContent>
            </Select>
            {filterYear && filterYear !== "all" &&
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-9" onClick={() => setFilterYear("")}>
                Reset
              </Button>
            }
            <div ref={tableToolbarRef} className="flex items-center gap-2 flex-1 min-w-0" />
          </div>
          <DataTable<BankMovement>
            columns={columns}
            data={filteredMovements}
            rowKey={(r) => r.id}
            onRowClick={setSelectedMovement}
            toolbarPortalRef={tableToolbarRef} />
        </>
      }

      <ReconcileSheet
        movement={selectedMovement}
        open={!!selectedMovement}
        onOpenChange={(open) => {if (!open) setSelectedMovement(null);}}
        sales={allSales}
        purchases={allPurchases}
        documenti={documenti}
        onReconcile={handleReconcile}
        onRemove={(id, invoiceKey) => {removeReconciliation(id, invoiceKey);if (!invoiceKey) setSelectedMovement(null);}}
        findXml={findXml} />
      

      {/* Duplicate detection dialog */}
      <AlertDialog open={!!pendingDuplicates} onOpenChange={(open) => {if (!open) dismissDuplicates();}}>
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
                  {pendingDuplicates?.unique && pendingDuplicates.unique.length > 0 &&
                  <> ({pendingDuplicates.unique.length} nuovi già importati)</>
                  }.
                </p>
                <ScrollArea className="max-h-[200px] rounded-md border">
                  <div className="p-2 space-y-1">
                    {pendingDuplicates?.duplicates.slice(0, 20).map((d, i) =>
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                        <span className="text-muted-foreground">{d.data}</span>
                        <span className="truncate max-w-[200px] mx-2">{d.descrizione}</span>
                        <span className={`font-mono font-medium ${d.importo >= 0 ? "text-income" : "text-expense"}`}>
                          {formatCurrency(d.importo)}
                        </span>
                      </div>
                    )}
                    {(pendingDuplicates?.duplicates.length ?? 0) > 20 &&
                    <p className="text-xs text-muted-foreground text-center py-1">
                        ...e altri {(pendingDuplicates?.duplicates.length ?? 0) - 20}
                      </p>
                    }
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

    </div>);

};

export default BanchePage;