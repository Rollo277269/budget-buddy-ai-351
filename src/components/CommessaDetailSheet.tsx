import { useMemo, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { ManualLink } from "@/hooks/useCommessaLinks";
import { CssrCommessa } from "@/hooks/useCssrCommesse";
import { useCentriData, useCentroMap, CentroCR } from "@/hooks/useCentri";
import { CentroCell } from "@/components/CentroCell";
import { PdfViewerPanel } from "@/components/PdfViewerPanel";
import { useXmlInvoices } from "@/hooks/useXmlInvoices";
import { CommessaExpenseUpload } from "@/components/CommessaExpenseUpload";
import { EditExpenseDialog } from "@/components/EditExpenseDialog";
import { useNamingRules } from "@/hooks/useNamingRules";
import {
  Link2, Link2Off, Plus, Search, X, Building2, Calendar, FileText, User,
  TrendingUp, TrendingDown, BarChart3, PieChart, Receipt, ArrowUpRight, ArrowDownRight,
  Percent, Target, AlertTriangle, SlidersHorizontal, Eye, EyeOff, FileSearch, CheckCircle2
} from "lucide-react";
import { XmlInvoiceSheet } from "@/components/XmlInvoiceSheet";
import { XmlPickerSheet } from "@/components/XmlPickerSheet";
import { XmlInvoiceRecord } from "@/hooks/useXmlInvoices";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart as RechartsPie, Pie,
  Legend, CartesianGrid, ComposedChart, Line,
} from "recharts";

function invoiceKey(anno: number, numero: number) {
  return `${anno}-${numero}`;
}

interface Commessa {
  numero: string | number;
  oggetto: string;
  committente: string;
  assegnataria: string;
  cig: string;
  cssrData?: CssrCommessa;
}

interface CommessaDetailSheetProps {
  commessa: Commessa | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allSales: SaleInvoice[];
  allPurchases: PurchaseInvoice[];
  manualLinks: ManualLink[];
  onAddLink: (link: ManualLink) => void;
  onRemoveLink: (invoiceKey: string, invoiceType: "vendita" | "acquisto", cig: string) => void;
  onExpenseAdded?: () => void;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(210, 70%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(45, 80%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(340, 65%, 50%)",
  "hsl(190, 70%, 45%)",
];

export function CommessaDetailSheet({
  commessa,
  open,
  onOpenChange,
  allSales,
  allPurchases,
  manualLinks,
  onAddLink,
  onRemoveLink,
  onExpenseAdded,
}: CommessaDetailSheetProps) {
  const [addMode, setAddMode] = useState<"vendita" | "acquisto" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tabOrder, setTabOrder] = useState(["analisi", "vendite", "acquisti", "dati"]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [pdfData, setPdfData] = useState<{ base64: string; fileName: string } | null>(null);
  const [editingExpense, setEditingExpense] = useState<PurchaseInvoice | null>(null);

  // -- Dati Commessa slot-based grid reorder --
  const isAdmin = true; // TODO: replace with actual admin check
  const COLS = 4;
  const DEFAULT_DATI_SLOTS: (string | null)[] = [
    "cig", "committente", "assegnataria", "rup",
    "direttore_lavori", "cup", "cig_derivato", "numero_repertorio",
    "data_contratto", "data_scadenza_contratto", "data_consegna_lavori", "durata",
  ];
  const ALL_FIELD_KEYS = [
    "cig", "committente", "assegnataria", "rup", "direttore_lavori", "cup",
    "cig_derivato", "numero_repertorio", "data_contratto", "data_scadenza_contratto",
    "data_consegna_lavori", "durata", "importo_contrattuale", "importo_base_gara",
    "ribasso", "oneri_sicurezza", "costo_manodopera",
  ];
  const CURRENCY_FIELDS = new Set(["importo_contrattuale", "importo_base_gara", "oneri_sicurezza", "costo_manodopera"]);
  const DATI_STORAGE_KEY = "commessa-dati-slot-order";
  const [datiSlots, setDatiSlots] = useState<(string | null)[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DATI_STORAGE_KEY) || "null");
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return [...DEFAULT_DATI_SLOTS];
  });
  const [datiEditMode, setDatiEditMode] = useState(false);
  const [datiDragIdx, setDatiDragIdx] = useState<number | null>(null);

  const saveDatiSlots = useCallback((slots: (string | null)[]) => {
    localStorage.setItem(DATI_STORAGE_KEY, JSON.stringify(slots));
  }, []);

  const handleSlotDrop = useCallback((fromIdx: number, toIdx: number) => {
    setDatiSlots((prev) => {
      const next = [...prev];
      // Swap the two slots
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      saveDatiSlots(next);
      return next;
    });
  }, [saveDatiSlots]);

  const addDatiRow = useCallback(() => {
    setDatiSlots((prev) => {
      const next = [...prev, null, null, null, null];
      saveDatiSlots(next);
      return next;
    });
  }, [saveDatiSlots]);

  const removeDatiRow = useCallback((rowIdx: number) => {
    setDatiSlots((prev) => {
      const start = rowIdx * COLS;
      // Don't remove if any slot in row has a field
      const rowSlots = prev.slice(start, start + COLS);
      if (rowSlots.some((s) => s !== null)) return prev;
      const next = [...prev.slice(0, start), ...prev.slice(start + COLS)];
      saveDatiSlots(next);
      return next;
    });
  }, [saveDatiSlots]);
  const { centri } = useCentriData();
  const { rules: namingRules } = useNamingRules();
  const ricavoMap = useCentroMap("ricavo", "vendite");
  const costoMap = useCentroMap("costo", "acquisti");

  const { xmlMap: xmlMapVendita, xmlRecords: xmlRecordsVendita, fetchParsedData: fetchParsedVendita, findXml: findXmlVendita, hasXml: hasXmlVendita, manualMatch: manualMatchVendita } = useXmlInvoices(allSales, "vendita");
  const { xmlMap: xmlMapAcquisto, xmlRecords: xmlRecordsAcquisto, fetchParsedData: fetchParsedAcquisto, findXml: findXmlAcquisto, hasXml: hasXmlAcquisto, manualMatch: manualMatchAcquisto } = useXmlInvoices(allPurchases, "acquisto");

  const [selectedXml, setSelectedXml] = useState<XmlInvoiceRecord | null>(null);
  const [xmlPickerInvoice, setXmlPickerInvoice] = useState<{ inv: SaleInvoice | PurchaseInvoice; type: "vendita" | "acquisto" } | null>(null);

  const openXmlSheet = useCallback(async (record: XmlInvoiceRecord, type: "vendita" | "acquisto") => {
    const fetchFn = type === "vendita" ? fetchParsedVendita : fetchParsedAcquisto;
    const parsed = await fetchFn(record.id);
    setSelectedXml({ ...record, parsed_data: parsed });
  }, [fetchParsedVendita, fetchParsedAcquisto]);

  const openPdf = useCallback(async (inv: SaleInvoice | PurchaseInvoice, type: "vendita" | "acquisto") => {
    const key = `${inv.anno}-${inv.numero}`;
    const xmlRecord = type === "vendita" ? xmlMapVendita.get(key) : xmlMapAcquisto.get(key);
    if (!xmlRecord) {
      toast.error("Nessun XML associato a questa fattura");
      return;
    }
    const fetchFn = type === "vendita" ? fetchParsedVendita : fetchParsedAcquisto;
    const parsed = await fetchFn(xmlRecord.id);
    const pdfAllegato = parsed?.allegati?.find((a: any) => a.formato?.toUpperCase() === "PDF");
    if (pdfAllegato) {
      setPdfData({ base64: pdfAllegato.base64, fileName: pdfAllegato.nome || xmlRecord.file_name });
    } else {
      toast.error("Nessun PDF trovato in questo XML");
    }
  }, [xmlMapVendita, xmlMapAcquisto, fetchParsedVendita, fetchParsedAcquisto]);

  const data = useMemo(() => {
    if (!commessa) return null;

    const cigLinks = manualLinks.filter((l) => l.cig === commessa.cig);
    const manualSaleKeys = new Set(cigLinks.filter((l) => l.invoiceType === "vendita").map((l) => l.invoiceKey));
    const manualPurchaseKeys = new Set(cigLinks.filter((l) => l.invoiceType === "acquisto").map((l) => l.invoiceKey));

    const autoSales = allSales.filter((s) => s.cig === commessa.cig);
    const autoPurchases = allPurchases.filter((p) => p.cig === commessa.cig);

    const manualSales = allSales.filter((s) => manualSaleKeys.has(invoiceKey(s.anno, s.numero)) && s.cig !== commessa.cig);
    const manualPurchases = allPurchases.filter((p) => manualPurchaseKeys.has(invoiceKey(p.anno, p.numero)) && p.cig !== commessa.cig);

    const linkedSales = [...autoSales, ...manualSales];
    const linkedPurchases = [...autoPurchases, ...manualPurchases];

    const totalVendite = linkedSales.reduce((s, i) => s + i.totale, 0);
    const totalAcquisti = linkedPurchases.reduce((s, i) => s + i.totale, 0);
    const saldo = totalVendite - totalAcquisti;
    const margine = totalVendite > 0 ? (saldo / totalVendite) * 100 : 0;

    const cssr = commessa.cssrData;
    const importoContratto = cssr?.importo_contrattuale ? parseFloat(cssr.importo_contrattuale) : null;
    const percentualeFatturato = importoContratto && !isNaN(importoContratto) && importoContratto > 0
      ? (totalVendite / importoContratto) * 100 : null;

    const allLinkedSaleKeys = new Set([
      ...autoSales.map((s) => invoiceKey(s.anno, s.numero)),
      ...manualSaleKeys,
    ]);
    const allLinkedPurchaseKeys = new Set([
      ...autoPurchases.map((p) => invoiceKey(p.anno, p.numero)),
      ...manualPurchaseKeys,
    ]);

    const autoSaleKeys = new Set(autoSales.map((s) => invoiceKey(s.anno, s.numero)));
    const autoPurchaseKeys = new Set(autoPurchases.map((p) => invoiceKey(p.anno, p.numero)));

    // Monthly breakdown
    const monthlyMap = new Map<string, { vendite: number; acquisti: number; incassato: number; pagato: number }>();
    linkedSales.forEach((s) => {
      const parts = s.data?.split("/");
      if (parts?.length === 3) {
        const key = `${parts[2]}-${parts[1].padStart(2, "0")}`;
        const e = monthlyMap.get(key) || { vendite: 0, acquisti: 0, incassato: 0, pagato: 0 };
        e.vendite += s.totale;
        if (s.stato?.toLowerCase().includes("pagat") || s.stato?.toLowerCase().includes("incass")) e.incassato += s.totale;
        monthlyMap.set(key, e);
      }
    });
    linkedPurchases.forEach((p) => {
      const parts = p.data?.split("/");
      if (parts?.length === 3) {
        const key = `${parts[2]}-${parts[1].padStart(2, "0")}`;
        const e = monthlyMap.get(key) || { vendite: 0, acquisti: 0, incassato: 0, pagato: 0 };
        e.acquisti += p.totale;
        if (p.stato?.toLowerCase().includes("pagat")) e.pagato += p.totale;
        monthlyMap.set(key, e);
      }
    });
    const monthlyData = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({
        mese: month,
        vendite: vals.vendite,
        acquisti: vals.acquisti,
        saldo: vals.vendite - vals.acquisti,
        incassato: vals.incassato,
        pagato: vals.pagato,
        saldoCassa: vals.incassato - vals.pagato,
      }));

    // Supplier breakdown for purchases
    const supplierMap = new Map<string, number>();
    linkedPurchases.forEach((p) => {
      const name = p.fornitore || "Sconosciuto";
      supplierMap.set(name, (supplierMap.get(name) || 0) + p.totale);
    });
    const supplierData = Array.from(supplierMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name: name.length > 25 ? name.slice(0, 22) + "…" : name, value }));

    // Status breakdown
    const statusSales = { pagata: 0, nonPagata: 0 };
    const statusPurchases = { pagata: 0, nonPagata: 0 };
    linkedSales.forEach((s) => {
      if (s.stato?.toLowerCase().includes("pagat") || s.stato?.toLowerCase().includes("incass")) statusSales.pagata += s.totale;
      else statusSales.nonPagata += s.totale;
    });
    linkedPurchases.forEach((p) => {
      if (p.stato?.toLowerCase().includes("pagat")) statusPurchases.pagata += p.totale;
      else statusPurchases.nonPagata += p.totale;
    });

    return {
      linkedSales, linkedPurchases, totalVendite, totalAcquisti, saldo, margine,
      cssr, importoContratto, percentualeFatturato,
      allLinkedSaleKeys, allLinkedPurchaseKeys,
      autoSaleKeys, autoPurchaseKeys,
      monthlyData, supplierData, statusSales, statusPurchases,
    };
  }, [commessa, allSales, allPurchases, manualLinks]);

  if (!commessa || !data) return null;

  const availableSales = allSales.filter((s) => !data.allLinkedSaleKeys.has(invoiceKey(s.anno, s.numero)));
  const availablePurchases = allPurchases.filter((p) => !data.allLinkedPurchaseKeys.has(invoiceKey(p.anno, p.numero)));

  const lower = searchQuery.toLowerCase();
  const filteredAvailable = addMode === "vendita"
    ? availableSales.filter((s) =>
        s.cliente.toLowerCase().includes(lower) ||
        String(s.numero).includes(lower) ||
        s.descrizione?.toLowerCase().includes(lower)
      ).slice(0, 20)
    : addMode === "acquisto"
    ? availablePurchases.filter((p) =>
        p.fornitore.toLowerCase().includes(lower) ||
        String(p.numero).includes(lower) ||
        p.descrizione?.toLowerCase().includes(lower)
      ).slice(0, 20)
    : [];

  const cssr = data.cssr;

  const centroLabelMap = new Map(centri.map((c) => [c.codice, c.descrizione]));
  const buildCentroRows = (
    items: Array<SaleInvoice | PurchaseInvoice>,
    map: Record<string, string>
  ) => {
    const agg = new Map<string, number>();
    items.forEach((item) => {
      const codice = map[`${item.anno}-${item.numero}`] || "Non classificato";
      const label = codice === "Non classificato" ? codice : `${codice} - ${centroLabelMap.get(codice) || ""}`;
      agg.set(label, (agg.get(label) || 0) + item.totale);
    });
    return Array.from(agg.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  };

  const applySavedOrder = (rows: { name: string; value: number }[], storageKey: string) => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as string[] | null;
      if (!saved || !Array.isArray(saved) || saved.length === 0) return rows;
      const lookup = new Map(rows.map((r) => [r.name, r]));
      const ordered = saved.map((name) => lookup.get(name)).filter(Boolean) as { name: string; value: number }[];
      const missing = rows.filter((r) => !saved.includes(r.name));
      return [...ordered, ...missing];
    } catch {
      return rows;
    }
  };

  const ricavoRows = applySavedOrder(buildCentroRows(data.linkedSales, ricavoMap.map), "centro-ricavo-order");
  const costoRows = applySavedOrder(buildCentroRows(data.linkedPurchases, costoMap.map), "centro-costo-order");
  const totalRicaviPrint = ricavoRows.reduce((s, r) => s + r.value, 0);
  const totalCostiPrint = costoRows.reduce((s, r) => s + r.value, 0);
  const saldoPrint = totalRicaviPrint - totalCostiPrint;
  const marginePrint = totalRicaviPrint > 0 ? (saldoPrint / totalRicaviPrint) * 100 : 0;

  const handleExportPdf = () => {
    document.body.classList.add("print-report", "print-report-dialog");

    const cleanup = () => {
      document.body.classList.remove("print-report", "print-report-dialog");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setAddMode(null); setSearchQuery(""); setPdfData(null); } }}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-row overflow-hidden p-0 border-none">
        <div className={`flex flex-col ${pdfData ? "w-1/2" : "w-full"} transition-all overflow-hidden`}>
        {/* Header */}
        <DialogHeader className="px-6 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <DialogTitle className="flex items-center gap-2 text-xl">
                Commessa {commessa.numero}
              </DialogTitle>
              <Badge variant="outline" className="font-mono text-sm">CIG: {commessa.cig || "—"}</Badge>
              {cssr?.cig_derivato && <Badge variant="outline" className="font-mono text-sm">CIG Derivato: {cssr.cig_derivato}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1.5 no-print">
                <FileText className="h-3.5 w-3.5" />
                Report
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="gap-1.5 no-print">
                <ArrowDownRight className="h-3.5 w-3.5 rotate-90" />
                Torna a Commesse
              </Button>
            </div>
          </div>
          <DialogDescription className="text-sm">{commessa.oggetto}</DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 screen-report">
          {/* KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KpiCard
              icon={ArrowUpRight}
              label="Totale Vendite"
              value={formatCurrency(data.totalVendite)}
              sub={`${data.linkedSales.length} fatture`}
              color="text-income"
              iconBg="bg-income/10"
            />
            <KpiCard
              icon={ArrowDownRight}
              label="Totale Acquisti"
              value={formatCurrency(data.totalAcquisti)}
              sub={`${data.linkedPurchases.length} fatture`}
              color="text-expense"
              iconBg="bg-expense/10"
            />
            <KpiCard
              icon={TrendingUp}
              label="Saldo"
              value={formatCurrency(data.saldo)}
              sub={data.saldo >= 0 ? "Attivo" : "Passivo"}
              color={data.saldo >= 0 ? "text-income" : "text-expense"}
              iconBg={data.saldo >= 0 ? "bg-income/10" : "bg-expense/10"}
            />
            <KpiCard
              icon={Percent}
              label="Margine"
              value={`${data.margine.toFixed(1)}%`}
              sub={data.margine >= 0 ? "Positivo" : "Negativo"}
              color={data.margine >= 20 ? "text-income" : data.margine >= 0 ? "text-orange-600" : "text-expense"}
              iconBg="bg-primary/10"
            />
            {data.importoContratto != null && !isNaN(data.importoContratto) && (
              <KpiCard
                icon={Target}
                label="Importo Contratto"
                value={formatCurrency(data.importoContratto)}
                sub={cssr?.stato || "—"}
                color="text-primary"
                iconBg="bg-primary/10"
              />
            )}
            {data.percentualeFatturato != null && (
              <KpiCard
                icon={BarChart3}
                label="Fatturato"
                value={`${data.percentualeFatturato.toFixed(1)}%`}
                sub="del contratto"
                color={data.percentualeFatturato >= 100 ? "text-income" : "text-primary"}
                iconBg="bg-primary/10"
              />
            )}
          </div>

          <Tabs defaultValue="analisi" className="space-y-4">
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${tabOrder.length}, 1fr)` }}>
              {tabOrder.map((tab, idx) => {
                const tabMeta: Record<string, { icon: typeof BarChart3; label: string }> = {
                  analisi: { icon: BarChart3, label: "Analisi" },
                  vendite: { icon: ArrowUpRight, label: `Vendite (${data.linkedSales.length})` },
                  acquisti: { icon: ArrowDownRight, label: `Acquisti (${data.linkedPurchases.length})` },
                  dati: { icon: FileText, label: "Dati Commessa" },
                };
                const meta = tabMeta[tab];
                const Icon = meta.icon;
                return (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className={`text-xs gap-1.5 cursor-grab active:cursor-grabbing ${dragIdx === idx ? "opacity-50" : ""}`}
                    draggable
                    onDragStart={(e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null && dragIdx !== idx) {
                        setTabOrder((prev) => {
                          const next = [...prev];
                          const [moved] = next.splice(dragIdx, 1);
                          next.splice(idx, 0, moved);
                          return next;
                        });
                      }
                      setDragIdx(null);
                    }}
                    onDragEnd={() => setDragIdx(null)}
                  >
                    <Icon className="h-3.5 w-3.5" />{meta.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* ── TAB: Analisi ── */}
            <TabsContent value="analisi" className="space-y-6">
              {/* Monthly chart */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-card p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Andamento mensile Vendite/Acquisti
                  </h3>
                  {data.monthlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={data.monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="vendite" name="Vendite" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="acquisti" name="Acquisti" fill="hsl(var(--expense))" radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="saldo" name="Saldo" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-12">Nessun dato mensile disponibile</p>
                  )}
                </div>

                <div className="rounded-xl border bg-card p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Andamento mensile Incassi/Pagamenti
                  </h3>
                  {data.monthlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={data.monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="incassato" name="Incassato" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="pagato" name="Pagato" fill="hsl(var(--expense))" radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="saldoCassa" name="Saldo Cassa" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-12">Nessun dato mensile disponibile</p>
                  )}
                </div>
              </div>

              {/* Payment status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PaymentStatusCard
                  title="Stato Incassi (Vendite)"
                  pagata={data.statusSales.pagata}
                  nonPagata={data.statusSales.nonPagata}
                  labelPagata="Incassato"
                  labelNonPagata="Da incassare"
                />
                <PaymentStatusCard
                  title="Stato Pagamenti (Acquisti)"
                  pagata={data.statusPurchases.pagata}
                  nonPagata={data.statusPurchases.nonPagata}
                  labelPagata="Pagato"
                  labelNonPagata="Da pagare"
                />
              </div>


              {/* Contract progress if available */}
              {data.importoContratto != null && !isNaN(data.importoContratto) && data.importoContratto > 0 && (
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    Avanzamento Contratto
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Fatturato: {formatCurrency(data.totalVendite)}</span>
                      <span>Contratto: {formatCurrency(data.importoContratto)}</span>
                    </div>
                    <div className="h-4 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(data.percentualeFatturato || 0, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-mono font-semibold text-primary">{(data.percentualeFatturato || 0).toFixed(1)}%</span>
                      <span className="text-muted-foreground">Residuo: {formatCurrency(data.importoContratto - data.totalVendite)}</span>
                    </div>
                    {(data.percentualeFatturato || 0) > 100 && (
                      <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-500/10 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Fatturato superiore all'importo contrattuale
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Centro Ricavo/Costo breakdown */}
              <CentroBreakdownCharts
                linkedSales={data.linkedSales}
                linkedPurchases={data.linkedPurchases}
                ricavoMap={ricavoMap.map}
                costoMap={costoMap.map}
                centri={centri}
                onAssignRicavo={ricavoMap.assign}
                onAssignCosto={costoMap.assign}
              />
            </TabsContent>

            {/* ── TAB: Vendite ── */}
            <TabsContent value="vendite" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Fatture di Vendita ({data.linkedSales.length})</h3>
                <Button
                  variant="outline" size="sm" className="text-xs h-7 no-print"
                  onClick={() => { setAddMode(addMode === "vendita" ? null : "vendita"); setSearchQuery(""); }}
                >
                  <Plus className="h-3 w-3 mr-1" />Associa manualmente
                </Button>
              </div>
              {addMode === "vendita" && (
                <LinkSearchPanel
                  searchQuery={searchQuery} onSearchChange={setSearchQuery}
                  items={filteredAvailable as SaleInvoice[]} type="vendita"
                  cig={commessa.cig} onAdd={onAddLink}
                  onClose={() => { setAddMode(null); setSearchQuery(""); }}
                />
              )}
              <InvoiceList
                invoices={data.linkedSales} type="vendita"
                autoKeys={data.autoSaleKeys} cig={commessa.cig}
                onRemoveLink={onRemoveLink}
                centri={centri} centroMap={ricavoMap.map} onAssignCentro={ricavoMap.assign}
                onRowClick={(inv) => openPdf(inv, "vendita")}
                findXml={(k, name) => findXmlVendita(k, name)}
                hasXml={hasXmlVendita}
                onOpenXml={(record) => openXmlSheet(record, "vendita")}
                onOpenXmlPicker={(inv) => setXmlPickerInvoice({ inv, type: "vendita" })}
              />
            </TabsContent>

            {/* ── TAB: Acquisti ── */}
            <TabsContent value="acquisti" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Fatture di Acquisto ({data.linkedPurchases.length})</h3>
                <Button
                  variant="outline" size="sm" className="text-xs h-7 no-print"
                  onClick={() => { setAddMode(addMode === "acquisto" ? null : "acquisto"); setSearchQuery(""); }}
                >
                  <Plus className="h-3 w-3 mr-1" />Associa manualmente
                </Button>
              </div>
              {addMode === "acquisto" && (
                <LinkSearchPanel
                  searchQuery={searchQuery} onSearchChange={setSearchQuery}
                  items={filteredAvailable as PurchaseInvoice[]} type="acquisto"
                  cig={commessa.cig} onAdd={onAddLink}
                  onClose={() => { setAddMode(null); setSearchQuery(""); }}
                />
              )}

              {/* Upload PDF spesa */}
              <CommessaExpenseUpload
                cig={commessa.cig}
                commessaNumero={commessa.numero}
                namingRules={namingRules}
                onExpenseAdded={onExpenseAdded}
              />

              <InvoiceList
                invoices={data.linkedPurchases} type="acquisto"
                autoKeys={data.autoPurchaseKeys} cig={commessa.cig}
                onRemoveLink={onRemoveLink}
                centri={centri} centroMap={costoMap.map} onAssignCentro={costoMap.assign}
                onRowClick={(inv) => setEditingExpense(inv as PurchaseInvoice)}
                findXml={(k, name) => findXmlAcquisto(k, name)}
                hasXml={hasXmlAcquisto}
                onOpenXml={(record) => openXmlSheet(record, "acquisto")}
                onOpenXmlPicker={(inv) => setXmlPickerInvoice({ inv, type: "acquisto" })}
              />

              <EditExpenseDialog
                invoice={editingExpense}
                open={!!editingExpense}
                onOpenChange={(o) => { if (!o) setEditingExpense(null); }}
                onSaved={() => { setEditingExpense(null); onExpenseAdded?.(); }}
              />
            </TabsContent>

            {/* ── TAB: Dati Commessa ── */}
            <TabsContent value="dati" className="space-y-4">
              {cssr ? (
                <div className="rounded-xl border bg-muted/30 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dati Commessa</h3>
                    {isAdmin && (
                      <Button
                        variant={datiEditMode ? "default" : "ghost"}
                        size="sm"
                        className="text-xs h-7 gap-1.5 no-print"
                        onClick={() => setDatiEditMode(!datiEditMode)}
                      >
                        <SlidersHorizontal className="h-3 w-3" />
                        {datiEditMode ? "Fine riordino" : "Riordina campi"}
                      </Button>
                    )}
                  </div>
                   {(() => {
                    const fmtEur = (v: string | null | undefined): string | undefined => {
                      if (!v) return undefined;
                      const n = parseFloat(v);
                      return isNaN(n) ? v : formatCurrency(n);
                    };
                    const FIELD_META: Record<string, { icon: typeof FileText; label: string; value: string | undefined }> = {
                      cig: { icon: FileText, label: "CIG", value: cssr.cig },
                      committente: { icon: Building2, label: "Committente", value: cssr.committente },
                      assegnataria: { icon: Building2, label: "Impresa Assegnataria", value: cssr.impresa_assegnataria },
                      rup: { icon: User, label: "RUP", value: cssr.rup },
                      direttore_lavori: { icon: User, label: "Direttore Lavori", value: cssr.direttore_lavori },
                      cup: { icon: FileText, label: "CUP", value: cssr.cup },
                      cig_derivato: { icon: FileText, label: "CIG Derivato", value: cssr.cig_derivato },
                      numero_repertorio: { icon: FileText, label: "N° Repertorio", value: cssr.numero_repertorio },
                      data_contratto: { icon: Calendar, label: "Data Contratto", value: cssr.data_contratto },
                      data_scadenza_contratto: { icon: Calendar, label: "Scadenza Contratto", value: cssr.data_scadenza_contratto },
                      data_consegna_lavori: { icon: Calendar, label: "Consegna Lavori", value: cssr.data_consegna_lavori },
                      durata: { icon: Calendar, label: "Durata", value: cssr.durata_contrattuale },
                      importo_contrattuale: { icon: Receipt, label: "Importo Contrattuale", value: fmtEur(cssr.importo_contrattuale) },
                      importo_base_gara: { icon: Receipt, label: "Base Gara", value: fmtEur(cssr.importo_base_gara) },
                      ribasso: { icon: Percent, label: "Ribasso", value: cssr.ribasso ? `${cssr.ribasso}%` : undefined },
                      oneri_sicurezza: { icon: Receipt, label: "Oneri Sicurezza", value: fmtEur(cssr.oneri_sicurezza) },
                      costo_manodopera: { icon: Receipt, label: "Costo Manodopera", value: fmtEur(cssr.costo_manodopera) },
                    };
                    // Ensure slots include all fields (append missing ones)
                    const usedKeys = new Set(datiSlots.filter((s): s is string => s !== null));
                    const missingKeys = ALL_FIELD_KEYS.filter((k) => !usedKeys.has(k));
                    const effectiveSlots = [...datiSlots, ...missingKeys];
                    // Pad to multiple of COLS
                    while (effectiveSlots.length % COLS !== 0) effectiveSlots.push(null);
                    const totalRows = effectiveSlots.length / COLS;

                    return (
                      <div className="space-y-1">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                          {effectiveSlots.map((slotKey, idx) => {
                            const meta = slotKey ? FIELD_META[slotKey] : null;
                            const isEmpty = !slotKey || !meta;
                            return (
                              <div
                                key={`slot-${idx}`}
                                draggable={datiEditMode && !isEmpty}
                                onDragStart={(e) => {
                                  if (!datiEditMode || isEmpty) return;
                                  setDatiDragIdx(idx);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={(e) => {
                                  if (!datiEditMode) return;
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (!datiEditMode || datiDragIdx === null || datiDragIdx === idx) return;
                                  handleSlotDrop(datiDragIdx, idx);
                                  setDatiDragIdx(null);
                                }}
                                onDragEnd={() => setDatiDragIdx(null)}
                                className={`min-h-[52px] transition-all ${
                                  datiEditMode
                                    ? `rounded-lg ring-1 p-1 ${
                                        isEmpty
                                          ? "ring-dashed ring-border/30 bg-muted/20"
                                          : "ring-border/50 cursor-grab active:cursor-grabbing hover:ring-primary/50"
                                      }`
                                    : ""
                                } ${datiDragIdx === idx ? "opacity-40" : ""}`}
                              >
                                {meta ? (
                                  <CssrField icon={meta.icon} label={meta.label} value={meta.value} />
                                ) : (
                                  <div className="min-h-[52px]" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {datiEditMode && (
                          <div className="flex items-center gap-2 pt-2">
                            <Button variant="outline" size="sm" className="text-xs h-7 gap-1.5" onClick={addDatiRow}>
                              <Plus className="h-3 w-3" /> Aggiungi riga
                            </Button>
                            {totalRows > Math.ceil(ALL_FIELD_KEYS.length / COLS) && (
                              <Button
                                variant="ghost" size="sm" className="text-xs h-7 gap-1.5 text-muted-foreground"
                                onClick={() => removeDatiRow(totalRows - 1)}
                              >
                                <X className="h-3 w-3" /> Rimuovi ultima riga vuota
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <Separator />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MiniCard label="Importo Contrattuale" value={data.importoContratto != null && !isNaN(data.importoContratto) ? formatCurrency(data.importoContratto) : (cssr.importo_contrattuale || "—")} />
                    <MiniCard label="Base Gara" value={cssr.importo_base_gara ? (isNaN(parseFloat(cssr.importo_base_gara)) ? cssr.importo_base_gara : formatCurrency(parseFloat(cssr.importo_base_gara))) : "—"} />
                    <MiniCard label="Ribasso" value={cssr.ribasso ? `${cssr.ribasso}%` : "—"} />
                    <MiniCard label="Stato" value={cssr.stato} highlight />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                  Nessun dato disponibile per questa commessa
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        </div>

        {/* Print-only professional report — must be direct child of DialogContent for CSS selectors */}
        <div className="pdf-report">
          {/* Fixed footer repeats on every printed page */}
          <div className="pdf-footer">
            <span className="pdf-footer-left">Report generato da Gestione Commesse</span>
            <span className="pdf-footer-center">Esportato il {new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            <span className="pdf-footer-right pdf-page-number"></span>
          </div>

          <div className="pdf-header">
            <div className="pdf-header-logo">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="48" height="48" rx="10" fill="hsl(220 60% 28%)"/>
                <text x="24" y="30" textAnchor="middle" fill="white" fontSize="20" fontWeight="700" fontFamily="DM Sans, sans-serif">GC</text>
              </svg>
            </div>
            <div className="pdf-header-text">
              <h1>Report Economico Commessa {commessa.numero}</h1>
              <p>{commessa.oggetto}</p>
              <div className="pdf-meta">
                <span>CIG: {commessa.cig || "—"}</span>
                {cssr?.cig_derivato && <span>CIG Derivato: {cssr.cig_derivato}</span>}
                <span>Committente: {commessa.committente}</span>
                <span>Assegnataria: {commessa.assegnataria}</span>
              </div>
            </div>
          </div>

          {/* Dati Commessa */}
          {cssr && (
            <section className="pdf-section pdf-full-width">
              <h2>Dati Commessa</h2>
              <div className="pdf-data-grid">
                {[
                  ["CIG", cssr.cig], ["CIG Derivato", cssr.cig_derivato], ["CUP", cssr.cup],
                  ["RUP", cssr.rup], ["Direttore Lavori", cssr.direttore_lavori], ["N° Repertorio", cssr.numero_repertorio],
                  ["Data Contratto", cssr.data_contratto], ["Scadenza", cssr.data_scadenza_contratto],
                  ["Consegna Lavori", cssr.data_consegna_lavori], ["Durata", cssr.durata_contrattuale],
                  ["Importo Contrattuale", data.importoContratto != null && !isNaN(data.importoContratto) ? formatCurrency(data.importoContratto) : cssr.importo_contrattuale],
                  ["Base Gara", cssr.importo_base_gara ? (isNaN(parseFloat(cssr.importo_base_gara)) ? cssr.importo_base_gara : formatCurrency(parseFloat(cssr.importo_base_gara))) : null],
                  ["Ribasso", cssr.ribasso ? `${cssr.ribasso}%` : null],
                  ["Stato", cssr.stato],
                ].map(([label, value]) => (
                  <div key={String(label)} className="pdf-data-item">
                    <span className="pdf-data-label">{label}</span>
                    <span className="pdf-data-value">{value || "—"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* KPI */}
          <div className="pdf-kpi-grid">
            <div className="pdf-kpi-card">
              <p className="pdf-kpi-label">Totale Ricavi</p>
              <p className="pdf-kpi-value is-positive">{formatCurrency(data.totalVendite)}</p>
              <p className="pdf-kpi-sub">{data.linkedSales.length} fatture</p>
            </div>
            <div className="pdf-kpi-card">
              <p className="pdf-kpi-label">Totale Costi</p>
              <p className="pdf-kpi-value is-negative">{formatCurrency(data.totalAcquisti)}</p>
              <p className="pdf-kpi-sub">{data.linkedPurchases.length} fatture</p>
            </div>
            <div className="pdf-kpi-card">
              <p className="pdf-kpi-label">Saldo</p>
              <p className={`pdf-kpi-value ${data.saldo >= 0 ? "is-positive" : "is-negative"}`}>{formatCurrency(data.saldo)}</p>
              <p className="pdf-kpi-sub">{data.saldo >= 0 ? "Attivo" : "Passivo"}</p>
            </div>
            <div className="pdf-kpi-card">
              <p className="pdf-kpi-label">Margine</p>
              <p className={`pdf-kpi-value ${data.margine >= 0 ? "is-positive" : "is-negative"}`}>{data.margine.toFixed(1)}%</p>
              <p className="pdf-kpi-sub">{data.importoContratto != null && !isNaN(data.importoContratto) ? `Fatturato: ${(data.percentualeFatturato || 0).toFixed(1)}% contratto` : ""}</p>
            </div>
          </div>

          {/* ── Grafici Analisi ── */}
          {/* Andamento Mensile Vendite/Acquisti - Bar chart */}
          {data.monthlyData.length > 0 && (() => {
            const maxMonth = Math.max(...data.monthlyData.map(m => Math.max(m.vendite, m.acquisti)), 1);
            return (
              <section className="pdf-section pdf-full-width">
                <h2>Grafico Andamento mensile Vendite/Acquisti</h2>
                <div className="pdf-bar-chart">
                  {data.monthlyData.map((m) => (
                    <div key={m.mese} className="pdf-bar-row">
                      <span className="pdf-bar-label">{m.mese}</span>
                      <div className="pdf-bar-tracks">
                        <div className="pdf-bar is-positive" style={{ width: `${(m.vendite / maxMonth) * 100}%` }}>
                          <span className="pdf-bar-value">{formatCurrency(m.vendite)}</span>
                        </div>
                        <div className="pdf-bar is-negative" style={{ width: `${(m.acquisti / maxMonth) * 100}%` }}>
                          <span className="pdf-bar-value">{formatCurrency(m.acquisti)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="pdf-bar-legend">
                    <span className="pdf-legend-item"><span className="pdf-legend-swatch is-positive"></span>Vendite</span>
                    <span className="pdf-legend-item"><span className="pdf-legend-swatch is-negative"></span>Acquisti</span>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Andamento Mensile Incassi/Pagamenti - Bar chart */}
          {data.monthlyData.length > 0 && (() => {
            const maxPayment = Math.max(...data.monthlyData.map(m => Math.max(m.incassato, m.pagato)), 1);
            return (
              <section className="pdf-section pdf-full-width">
                <h2>Grafico Andamento mensile Incassi/Pagamenti</h2>
                <div className="pdf-bar-chart">
                  {data.monthlyData.map((m) => (
                    <div key={m.mese} className="pdf-bar-row">
                      <span className="pdf-bar-label">{m.mese}</span>
                      <div className="pdf-bar-tracks">
                        <div className="pdf-bar is-positive" style={{ width: `${(m.incassato / maxPayment) * 100}%` }}>
                          <span className="pdf-bar-value">{formatCurrency(m.incassato)}</span>
                        </div>
                        <div className="pdf-bar is-negative" style={{ width: `${(m.pagato / maxPayment) * 100}%` }}>
                          <span className="pdf-bar-value">{formatCurrency(m.pagato)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="pdf-bar-legend">
                    <span className="pdf-legend-item"><span className="pdf-legend-swatch is-positive"></span>Incassato</span>
                    <span className="pdf-legend-item"><span className="pdf-legend-swatch is-negative"></span>Pagato</span>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Centro Ricavo / Costo - Horizontal bars */}
          {(ricavoRows.length > 0 || costoRows.length > 0) && (() => {
            const maxCentro = Math.max(
              ...ricavoRows.map(r => r.value),
              ...costoRows.map(r => r.value),
              1
            );
            return (
              <div className="pdf-table-grid">
                {ricavoRows.length > 0 && (
                  <section className="pdf-section">
                    <h2>Grafico Centri di Ricavo</h2>
                    <div className="pdf-bar-chart">
                      {ricavoRows.map((r) => (
                        <div key={r.name} className="pdf-bar-row">
                          <span className="pdf-bar-label">{r.name}</span>
                          <div className="pdf-bar-tracks">
                            <div className="pdf-bar is-positive" style={{ width: `${(r.value / maxCentro) * 100}%` }}>
                              <span className="pdf-bar-value">{formatCurrency(r.value)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {costoRows.length > 0 && (
                  <section className="pdf-section">
                    <h2>Grafico Centri di Costo</h2>
                    <div className="pdf-bar-chart">
                      {costoRows.map((r) => (
                        <div key={r.name} className="pdf-bar-row">
                          <span className="pdf-bar-label">{r.name}</span>
                          <div className="pdf-bar-tracks">
                            <div className="pdf-bar is-negative" style={{ width: `${(r.value / maxCentro) * 100}%` }}>
                              <span className="pdf-bar-value">{formatCurrency(r.value)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            );
          })()}

          {/* Avanzamento Contratto - Progress bar */}
          {data.importoContratto != null && !isNaN(data.importoContratto) && data.importoContratto > 0 && (
            <section className="pdf-section pdf-full-width">
              <h2>Avanzamento Contratto</h2>
              <div className="pdf-progress-wrap">
                <div className="pdf-progress-info">
                  <span>Fatturato: {formatCurrency(data.totalVendite)}</span>
                  <span>Contratto: {formatCurrency(data.importoContratto)}</span>
                </div>
                <div className="pdf-progress-track">
                  <div className="pdf-progress-fill" style={{ width: `${Math.min(data.percentualeFatturato || 0, 100)}%` }}></div>
                </div>
                <div className="pdf-progress-info">
                  <span style={{ fontWeight: 700 }}>{(data.percentualeFatturato || 0).toFixed(1)}%</span>
                  <span>Residuo: {formatCurrency(data.importoContratto - data.totalVendite)}</span>
                </div>
              </div>
            </section>
          )}

          {/* Andamento Mensile */}
          {data.monthlyData.length > 0 && (
            <section className="pdf-section pdf-full-width">
              <h2>Andamento Mensile</h2>
              <table className="pdf-table">
                <thead><tr><th>Mese</th><th className="is-right">Vendite</th><th className="is-right">Acquisti</th><th className="is-right">Saldo</th></tr></thead>
                <tbody>
                  {data.monthlyData.map((m) => (
                    <tr key={m.mese}><td>{m.mese}</td><td className="is-right">{formatCurrency(m.vendite)}</td><td className="is-right">{formatCurrency(m.acquisti)}</td><td className={`is-right ${m.saldo >= 0 ? "is-positive" : "is-negative"}`}>{formatCurrency(m.saldo)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Fornitori */}
          {data.supplierData.length > 0 && (
            <section className="pdf-section pdf-full-width">
              <h2>Ripartizione Fornitori</h2>
              <table className="pdf-table">
                <thead><tr><th>Fornitore</th><th className="is-right">Importo</th><th className="is-right">%</th></tr></thead>
                <tbody>
                  {(() => { const total = data.supplierData.reduce((a, x) => a + x.value, 0); return data.supplierData.map((s) => (
                    <tr key={s.name}><td>{s.name}</td><td className="is-right">{formatCurrency(s.value)}</td><td className="is-right">{total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%</td></tr>
                  )); })()}
                </tbody>
              </table>
            </section>
          )}

          {/* Stato Incassi / Pagamenti */}
          <div className="pdf-table-grid">
            <section className="pdf-section">
              <h2>Stato Incassi (Vendite)</h2>
              <table className="pdf-table"><tbody>
                <tr><td>Incassato</td><td className="is-right is-positive">{formatCurrency(data.statusSales.pagata)}</td></tr>
                <tr><td>Da incassare</td><td className="is-right is-negative">{formatCurrency(data.statusSales.nonPagata)}</td></tr>
              </tbody></table>
            </section>
            <section className="pdf-section">
              <h2>Stato Pagamenti (Acquisti)</h2>
              <table className="pdf-table"><tbody>
                <tr><td>Pagato</td><td className="is-right is-positive">{formatCurrency(data.statusPurchases.pagata)}</td></tr>
                <tr><td>Da pagare</td><td className="is-right is-negative">{formatCurrency(data.statusPurchases.nonPagata)}</td></tr>
              </tbody></table>
            </section>
          </div>

          {/* Riepilogo Centri */}
          <div className="pdf-table-grid">
            <section className="pdf-section">
              <h2>Riepilogo Centri di Ricavo</h2>
              <table className="pdf-table">
                <thead><tr><th>Centro</th><th className="is-right">Importo</th><th className="is-right">%</th></tr></thead>
                <tbody>{ricavoRows.map((r) => (<tr key={r.name}><td>{r.name}</td><td className="is-right">{formatCurrency(r.value)}</td><td className="is-right">{totalRicaviPrint > 0 ? ((r.value / totalRicaviPrint) * 100).toFixed(1) : "0.0"}%</td></tr>))}</tbody>
              </table>
            </section>
            <section className="pdf-section">
              <h2>Riepilogo Centri di Costo</h2>
              <table className="pdf-table">
                <thead><tr><th>Centro</th><th className="is-right">Importo</th><th className="is-right">%</th></tr></thead>
                <tbody>{costoRows.map((r) => (<tr key={r.name}><td>{r.name}</td><td className="is-right">{formatCurrency(r.value)}</td><td className="is-right">{totalCostiPrint > 0 ? ((r.value / totalCostiPrint) * 100).toFixed(1) : "0.0"}%</td></tr>))}</tbody>
              </table>
            </section>
          </div>

          {/* Elenco Vendite per Centro di Ricavo */}
          {(() => {
            const grouped = new Map<string, SaleInvoice[]>();
            data.linkedSales.forEach((s) => {
              const codice = ricavoMap.map[`${s.anno}-${s.numero}`] || "Non classificato";
              const label = codice === "Non classificato" ? codice : `${codice} - ${centroLabelMap.get(codice) || ""}`;
              if (!grouped.has(label)) grouped.set(label, []);
              grouped.get(label)!.push(s);
            });
            return Array.from(grouped.entries()).map(([centro, invoices]) => (
              <section key={centro} className="pdf-section pdf-full-width">
                <h2>Vendite — {centro}</h2>
                <table className="pdf-table">
                  <thead><tr><th>N°</th><th>Data</th><th>Cliente</th><th>Descrizione</th><th>Stato</th><th className="is-right">Imponibile</th><th className="is-right">Totale</th></tr></thead>
                  <tbody>
                    {invoices.map((s) => (
                      <tr key={`${s.anno}-${s.numero}`}><td>{s.numero}/{s.anno}</td><td>{s.data}</td><td>{s.cliente}</td><td className="pdf-desc-cell">{s.descrizione}</td><td>{s.stato}</td><td className="is-right">{formatCurrency(s.imponibile)}</td><td className="is-right">{formatCurrency(s.totale)}</td></tr>
                    ))}
                    <tr className="pdf-table-total"><td colSpan={5}></td><td className="is-right">{formatCurrency(invoices.reduce((a, s) => a + s.imponibile, 0))}</td><td className="is-right">{formatCurrency(invoices.reduce((a, s) => a + s.totale, 0))}</td></tr>
                  </tbody>
                </table>
              </section>
            ));
          })()}

          {/* Elenco Acquisti per Centro di Costo */}
          {(() => {
            const grouped = new Map<string, PurchaseInvoice[]>();
            data.linkedPurchases.forEach((p) => {
              const codice = costoMap.map[`${p.anno}-${p.numero}`] || "Non classificato";
              const label = codice === "Non classificato" ? codice : `${codice} - ${centroLabelMap.get(codice) || ""}`;
              if (!grouped.has(label)) grouped.set(label, []);
              grouped.get(label)!.push(p);
            });
            return Array.from(grouped.entries()).map(([centro, invoices]) => (
              <section key={centro} className="pdf-section pdf-full-width">
                <h2>Acquisti — {centro}</h2>
                <table className="pdf-table">
                  <thead><tr><th>N°</th><th>Data</th><th>Fornitore</th><th>Descrizione</th><th>Stato</th><th className="is-right">Imponibile</th><th className="is-right">Totale</th></tr></thead>
                  <tbody>
                    {invoices.map((p) => (
                      <tr key={`${p.anno}-${p.numero}`}><td>{p.numero}/{p.anno}</td><td>{p.data}</td><td>{p.fornitore}</td><td className="pdf-desc-cell">{p.descrizione}</td><td>{p.stato}</td><td className="is-right">{formatCurrency(p.imponibile)}</td><td className="is-right">{formatCurrency(p.totale)}</td></tr>
                    ))}
                    <tr className="pdf-table-total"><td colSpan={5}></td><td className="is-right">{formatCurrency(invoices.reduce((a, p) => a + p.imponibile, 0))}</td><td className="is-right">{formatCurrency(invoices.reduce((a, p) => a + p.totale, 0))}</td></tr>
                  </tbody>
                </table>
              </section>
            ));
          })()}
        </div>

        {/* PDF side panel */}
        {pdfData && (
          <div className="w-1/2 h-full">
            <PdfViewerPanel base64={pdfData.base64} fileName={pdfData.fileName} onClose={() => setPdfData(null)} />
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* XML detail sheet */}
    <XmlInvoiceSheet
      record={selectedXml}
      open={!!selectedXml}
      onOpenChange={(open) => !open && setSelectedXml(null)}
      onDelete={() => {}}
      invoices={xmlPickerInvoice?.type === "acquisto" ? allPurchases : allSales}
      xmlMap={xmlPickerInvoice?.type === "acquisto" ? xmlMapAcquisto : xmlMapVendita}
      tipo={xmlPickerInvoice?.type || "vendita"}
      onManualMatch={xmlPickerInvoice?.type === "acquisto" ? manualMatchAcquisto : manualMatchVendita}
    />

    {/* XML picker for manual association */}
    <XmlPickerSheet
      open={!!xmlPickerInvoice}
      onOpenChange={(open) => { if (!open) setXmlPickerInvoice(null); }}
      xmlRecords={xmlPickerInvoice?.type === "acquisto" ? xmlRecordsAcquisto : xmlRecordsVendita}
      invoiceAnno={xmlPickerInvoice?.inv.anno || 0}
      invoiceNumero={xmlPickerInvoice?.inv.numero || 0}
      invoiceName={xmlPickerInvoice ? (xmlPickerInvoice.type === "vendita" ? (xmlPickerInvoice.inv as SaleInvoice).cliente : (xmlPickerInvoice.inv as PurchaseInvoice).fornitore) : ""}
      invoiceTotale={xmlPickerInvoice?.inv.totale || 0}
      onMatch={xmlPickerInvoice?.type === "acquisto" ? manualMatchAcquisto : manualMatchVendita}
    />
  </>
  );
}

/* ── KPI Card ── */
function KpiCard({ icon: Icon, label, value, sub, color, iconBg }: {
  icon: React.ElementType; label: string; value: string; sub: string; color: string; iconBg: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 transition-all hover:shadow-md">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className={`rounded-lg p-1.5 ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
      </div>
      <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

/* ── Payment Status Card ── */
function PaymentStatusCard({ title, pagata, nonPagata, labelPagata, labelNonPagata }: {
  title: string; pagata: number; nonPagata: number; labelPagata: string; labelNonPagata: string;
}) {
  const total = pagata + nonPagata;
  const pctPagata = total > 0 ? (pagata / total) * 100 : 0;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-income transition-all" style={{ width: `${pctPagata}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground">{labelPagata}</p>
          <p className="text-sm font-bold font-mono text-income">{formatCurrency(pagata)}</p>
          <p className="text-[10px] text-muted-foreground">{pctPagata.toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">{labelNonPagata}</p>
          <p className="text-sm font-bold font-mono text-expense">{formatCurrency(nonPagata)}</p>
          <p className="text-[10px] text-muted-foreground">{(100 - pctPagata).toFixed(0)}%</p>
        </div>
      </div>
    </div>
  );
}

/* ── CSSR field helpers ── */
function CssrField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-medium truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

function MiniCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-xs font-bold font-mono ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

/* ── Centro Ricavo/Costo breakdown charts ── */
function CentroBreakdownCharts({ linkedSales, linkedPurchases, ricavoMap, costoMap, centri, onAssignRicavo, onAssignCosto }: {
  linkedSales: SaleInvoice[];
  linkedPurchases: PurchaseInvoice[];
  ricavoMap: Record<string, string>;
  costoMap: Record<string, string>;
  centri: CentroCR[];
  onAssignRicavo: (key: string, codice: string) => void;
  onAssignCosto: (key: string, codice: string) => void;
}) {
  const [layout, setLayout] = useState<"horizontal" | "vertical">("horizontal");
  const [expandedRicavo, setExpandedRicavo] = useState<string | null>(null);
  const [expandedCosto, setExpandedCosto] = useState<string | null>(null);
  const [ricavoOrder, setRicavoOrder] = useState<string[] | null>(() => {
    try { return JSON.parse(localStorage.getItem("centro-ricavo-order") || "null"); } catch { return null; }
  });
  const [costoOrder, setCostoOrder] = useState<string[] | null>(() => {
    try { return JSON.parse(localStorage.getItem("centro-costo-order") || "null"); } catch { return null; }
  });
  const [dragRicavoIdx, setDragRicavoIdx] = useState<number | null>(null);
  const [dragCostoIdx, setDragCostoIdx] = useState<number | null>(null);

  const centroLookup = useMemo(() => {
    const m = new Map<string, string>();
    centri.forEach((c) => m.set(c.codice, c.descrizione));
    return m;
  }, [centri]);

  const ricavoData = useMemo(() => {
    const map = new Map<string, number>();
    linkedSales.forEach((s) => {
      const codice = ricavoMap[`${s.anno}-${s.numero}`];
      const label = codice ? `${codice} - ${centroLookup.get(codice) || ""}` : "Non classificato";
      map.set(label, (map.get(label) || 0) + s.totale);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [linkedSales, ricavoMap, centroLookup]);

  const costoData = useMemo(() => {
    const map = new Map<string, number>();
    linkedPurchases.forEach((p) => {
      const codice = costoMap[`${p.anno}-${p.numero}`];
      const label = codice ? `${codice} - ${centroLookup.get(codice) || ""}` : "Non classificato";
      map.set(label, (map.get(label) || 0) + p.totale);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [linkedPurchases, costoMap, centroLookup]);

  // Group invoices by centro label
  const ricavoInvoiceGroups = useMemo(() => {
    const groups = new Map<string, SaleInvoice[]>();
    linkedSales.forEach((s) => {
      const codice = ricavoMap[`${s.anno}-${s.numero}`];
      const label = codice ? `${codice} - ${centroLookup.get(codice) || ""}` : "Non classificato";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(s);
    });
    return groups;
  }, [linkedSales, ricavoMap, centroLookup]);

  const costoInvoiceGroups = useMemo(() => {
    const groups = new Map<string, PurchaseInvoice[]>();
    linkedPurchases.forEach((p) => {
      const codice = costoMap[`${p.anno}-${p.numero}`];
      const label = codice ? `${codice} - ${centroLookup.get(codice) || ""}` : "Non classificato";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(p);
    });
    return groups;
  }, [linkedPurchases, costoMap, centroLookup]);

  if (ricavoData.length === 0 && costoData.length === 0) return null;

  const maxValue = Math.max(
    ...ricavoData.map((d) => d.value),
    ...costoData.map((d) => d.value),
    0
  );

  const isVertical = layout === "vertical";

  const renderChart = (data: { name: string; value: string | number }[], title: string, colors: string[]) => {
    const chartHeight = Math.max(data.length * 36, 120);
    return (
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <PieChart className="h-4 w-4 text-muted-foreground" />
          {title}
        </h3>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} domain={[0, maxValue * 1.05]} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={140} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="value" name={title} radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline" size="sm" className="text-xs h-7 gap-1.5"
          onClick={() => setLayout(isVertical ? "horizontal" : "vertical")}
        >
          {isVertical ? "⬌ Affiancati" : "⬍ Sovrapposti"}
        </Button>
      </div>
      <div className={isVertical ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
        {ricavoData.length > 0 && renderChart(ricavoData, "Centri di Ricavo", CHART_COLORS)}
        {costoData.length > 0 && renderChart(costoData, "Centri di Costo", CHART_COLORS.slice(3))}
      </div>

      {/* Comparison tables with drag reorder + expandable invoice detail */}
      {(() => {
        const totalRicavi = ricavoData.reduce((s, r) => s + r.value, 0);
        const totalCosti = costoData.reduce((s, r) => s + r.value, 0);
        const saldo = totalRicavi - totalCosti;
        const margine = totalRicavi > 0 ? (saldo / totalRicavi) * 100 : 0;

        const orderedRicavo = ricavoOrder
          ? ricavoOrder.map((n) => ricavoData.find((d) => d.name === n)).filter(Boolean) as typeof ricavoData
          : ricavoData;
        const orderedCosto = costoOrder
          ? costoOrder.map((n) => costoData.find((d) => d.name === n)).filter(Boolean) as typeof costoData
          : costoData;

        if (ricavoData.length > 0 && !ricavoOrder) {
          setTimeout(() => setRicavoOrder(ricavoData.map((d) => d.name)), 0);
        }
        if (costoData.length > 0 && !costoOrder) {
          setTimeout(() => setCostoOrder(costoData.map((d) => d.name)), 0);
        }

        const handleDrop = (
          fromIdx: number,
          toIdx: number,
          setOrder: React.Dispatch<React.SetStateAction<string[] | null>>,
          currentData: typeof ricavoData,
          storageKey: string
        ) => {
          setOrder((prev) => {
            const arr = prev || currentData.map((d) => d.name);
            const next = [...arr];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            localStorage.setItem(storageKey, JSON.stringify(next));
            return next;
          });
        };

        const renderDraggableTable = (
          data: typeof ricavoData,
          ordered: typeof ricavoData,
          total: number,
          title: string,
          icon: React.ReactNode,
          _totalLabel: string,
          _totalColor: string,
          dragIdx: number | null,
          setDragIdx: (i: number | null) => void,
          setOrder: React.Dispatch<React.SetStateAction<string[] | null>>,
          storageKey: string,
          invoiceGroups: Map<string, (SaleInvoice | PurchaseInvoice)[]>,
          expanded: string | null,
          setExpanded: (v: string | null) => void,
          tipo: "ricavo" | "costo",
          centroMapObj: Record<string, string>,
          onAssign: (key: string, codice: string) => void
        ) => (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                {icon}
                {title}
              </h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] w-[20px]"></TableHead>
                  <TableHead className="text-[10px]">Centro</TableHead>
                  <TableHead className="text-[10px] text-right">Importo</TableHead>
                  <TableHead className="text-[10px] text-right">%</TableHead>
                  <TableHead className="text-[10px] w-[30px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((d, idx) => {
                  const pct = total > 0 ? (d.value / total) * 100 : 0;
                  const isExpanded = expanded === d.name;
                  const groupInvoices = invoiceGroups.get(d.name) || [];
                  return (
                    <>
                      <TableRow
                        key={d.name}
                        className={`cursor-grab active:cursor-grabbing ${dragIdx === idx ? "opacity-40" : ""} ${isExpanded ? "bg-muted/30" : ""}`}
                        draggable
                        onDragStart={(e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                        onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== idx) handleDrop(dragIdx, idx, setOrder, data, storageKey); setDragIdx(null); }}
                        onDragEnd={() => setDragIdx(null)}
                      >
                        <TableCell className="text-muted-foreground px-1 w-[20px]">⠿</TableCell>
                        <TableCell className="text-xs">{d.name}</TableCell>
                        <TableCell className="text-xs font-mono text-right">{formatCurrency(d.value)}</TableCell>
                        <TableCell className="text-xs font-mono text-right">{pct.toFixed(1)}%</TableCell>
                        <TableCell className="px-1">
                          <Button
                            variant="ghost" size="sm"
                            className="h-5 w-5 p-0"
                            onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : d.name); }}
                            title="Espandi per modificare centri"
                          >
                            <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && groupInvoices.map((inv) => {
                        const key = `${inv.anno}-${inv.numero}`;
                        const counterpart = "cliente" in inv ? (inv as SaleInvoice).cliente : (inv as PurchaseInvoice).fornitore;
                        return (
                          <TableRow key={`detail-${key}`} className="bg-muted/10">
                            <TableCell></TableCell>
                            <TableCell className="text-[11px]">
                              <span className="font-mono">{inv.numero}/{inv.anno}</span>
                              <span className="text-muted-foreground ml-2">{counterpart}</span>
                            </TableCell>
                            <TableCell className="text-[11px] font-mono text-right">{formatCurrency(inv.totale)}</TableCell>
                            <TableCell colSpan={2}>
                              <CentroCell
                                invoiceKey={key}
                                tipo={tipo}
                                centri={centri}
                                centroMap={centroMapObj}
                                onAssign={onAssign}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        );

        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ricavoData.length > 0 && renderDraggableTable(
                ricavoData, orderedRicavo, totalRicavi,
                "Riepilogo Centri di Ricavo",
                <ArrowUpRight className="h-3.5 w-3.5 text-income" />,
                "Totale Ricavi", "text-income",
                dragRicavoIdx, setDragRicavoIdx, setRicavoOrder, "centro-ricavo-order",
                ricavoInvoiceGroups as Map<string, (SaleInvoice | PurchaseInvoice)[]>,
                expandedRicavo, setExpandedRicavo,
                "ricavo", ricavoMap, onAssignRicavo
              )}
              {costoData.length > 0 && renderDraggableTable(
                costoData, orderedCosto, totalCosti,
                "Riepilogo Centri di Costo",
                <ArrowDownRight className="h-3.5 w-3.5 text-expense" />,
                "Totale Costi", "text-expense",
                dragCostoIdx, setDragCostoIdx, setCostoOrder, "centro-costo-order",
                costoInvoiceGroups as Map<string, (SaleInvoice | PurchaseInvoice)[]>,
                expandedCosto, setExpandedCosto,
                "costo", costoMap, onAssignCosto
              )}
            </div>

            {/* Totals row aligned */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ricavoData.length > 0 && (
                <div className="rounded-xl border bg-muted/20 p-3 flex items-center justify-between">
                  <span className="text-xs font-bold">Totale Ricavi</span>
                  <span className="text-sm font-bold font-mono text-income">{formatCurrency(totalRicavi)}</span>
                </div>
              )}
              {costoData.length > 0 && (
                <div className="rounded-xl border bg-muted/20 p-3 flex items-center justify-between">
                  <span className="text-xs font-bold">Totale Costi</span>
                  <span className="text-sm font-bold font-mono text-expense">{formatCurrency(totalCosti)}</span>
                </div>
              )}
            </div>

            {/* Saldo / Margine */}
            {ricavoData.length > 0 && costoData.length > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Saldo</p>
                    <p className={`text-sm font-bold font-mono ${saldo >= 0 ? "text-income" : "text-expense"}`}>{formatCurrency(saldo)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Margine</p>
                    <p className={`text-sm font-bold font-mono ${margine >= 0 ? "text-income" : "text-expense"}`}>{margine.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

/* ── Stato badge with colors ── */
function StatoBadge({ stato }: { stato?: string }) {
  const s = (stato || "").toLowerCase();
  if (s.includes("pagat") || s.includes("incassat")) {
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{stato}</span>;
  }
  if (s.includes("scadut")) {
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{stato}</span>;
  }
  if (s.includes("da incassar") || s.includes("da pagare") || s.includes("emess") || stato) {
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">{stato}</span>;
  }
  return <span className="text-[9px] text-muted-foreground">—</span>;
}

/* ── Invoice list sub-component with sort & filter ── */
function InvoiceList({
  invoices, type, autoKeys, cig, onRemoveLink, centri, centroMap, onAssignCentro, onRowClick,
  findXml, hasXml, onOpenXml, onOpenXmlPicker,
}: {
  invoices: (SaleInvoice | PurchaseInvoice)[];
  type: "vendita" | "acquisto";
  autoKeys: Set<string>;
  cig: string;
  onRemoveLink: (key: string, type: "vendita" | "acquisto", cig: string) => void;
  centri: CentroCR[];
  centroMap: Record<string, string>;
  onAssignCentro: (key: string, codice: string) => void;
  onRowClick?: (inv: SaleInvoice | PurchaseInvoice) => void;
  findXml?: (key: string, name?: string) => XmlInvoiceRecord | undefined;
  hasXml?: (key: string) => boolean;
  onOpenXml?: (record: XmlInvoiceRecord) => void;
  onOpenXmlPicker?: (inv: SaleInvoice | PurchaseInvoice) => void;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showColPicker, setShowColPicker] = useState(false);

  const centroLabel = type === "vendita" ? "Centro Ricavo" : "Centro Costo";
  const centroTipo = type === "vendita" ? "ricavo" as const : "costo" as const;

  const allColumns = [
    { key: "numero_display", label: "N°", filterable: true },
    { key: "data", label: "Data", filterable: true },
    { key: "counterpart", label: type === "vendita" ? "Cliente" : "Fornitore", filterable: true },
    { key: "descrizione", label: "Descrizione", filterable: true, render: (r: any) => <span className="text-xs max-w-[300px] whitespace-normal break-words block leading-snug py-1">{r.descrizione || "—"}</span> },
    { key: "stato", label: "Stato", filterable: true },
    { key: "imponibile", label: "Imponibile", filterable: false, align: "right" as const },
    { key: "imposta", label: "IVA", filterable: false, align: "right" as const },
    { key: "totale", label: "Totale", filterable: false, align: "right" as const },
    { key: "centro", label: centroLabel, filterable: true },
  ];

  if (invoices.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Nessuna fattura collegata</p>;
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const toggleFilter = (key: string) => {
    setActiveFilter(activeFilter === key ? null : key);
  };

  const toggleCol = (key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const getVal = (inv: SaleInvoice | PurchaseInvoice, key: string): string | number => {
    if (key === "numero_display") return inv.numero;
    if (key === "data") return inv.data || "";
    if (key === "counterpart") return type === "vendita" ? (inv as SaleInvoice).cliente || "" : (inv as PurchaseInvoice).fornitore || "";
    if (key === "descrizione") return inv.descrizione || "";
    if (key === "stato") return inv.stato || "";
    if (key === "imponibile") return inv.imponibile || 0;
    if (key === "imposta") return inv.imposta || 0;
    if (key === "totale") return inv.totale || 0;
    if (key === "centro") return centroMap[`${inv.anno}-${inv.numero}`] || "";
    return "";
  };
  const filtered = invoices.filter((inv) => {
    return Object.entries(filters).every(([key, filterVal]) => {
      if (!filterVal) return true;
      const val = String(getVal(inv, key)).toLowerCase();
      return val.includes(filterVal.toLowerCase());
    });
  });

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    const aVal = getVal(a, sortKey);
    const bVal = getVal(b, sortKey);
    const cmp = typeof aVal === "number" && typeof bVal === "number"
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal), "it");
    return sortAsc ? cmp : -cmp;
  });

  const visibleColumns = allColumns.filter((c) => !hiddenCols.has(c.key));

  return (
    <div className="space-y-2">
      {/* Column visibility toggle */}
      <div className="flex justify-end relative">
        <Button variant="outline" size="sm" className="text-xs h-7 gap-1.5" onClick={() => setShowColPicker(!showColPicker)}>
          <SlidersHorizontal className="h-3 w-3" />Colonne
        </Button>
        {showColPicker && (
          <div className="absolute right-0 top-8 z-20 rounded-lg border bg-popover shadow-md p-2 space-y-1 min-w-[160px]">
            {allColumns.map((col) => (
              <button
                key={col.key}
                className="flex items-center gap-2 w-full text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors"
                onClick={() => toggleCol(col.key)}
              >
                {hiddenCols.has(col.key) ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-primary" />}
                <span className={hiddenCols.has(col.key) ? "text-muted-foreground" : ""}>{col.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
      <div className="max-h-[400px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              {visibleColumns.map((col) => (
                <TableHead key={col.key} className={`text-xs ${col.align === "right" ? "text-right" : ""}`}>
                  <div className="space-y-1">
                    <button
                      className="flex items-center gap-1 hover:text-foreground transition-colors font-semibold"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        <span className="text-[10px]">{sortAsc ? "▲" : "▼"}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">⇅</span>
                      )}
                    </button>
                    {col.filterable && activeFilter === col.key && (
                      <Input
                        autoFocus
                        placeholder="Filtra..."
                        value={filters[col.key] || ""}
                        onChange={(e) => setFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                        className="h-5 text-[10px] px-1 py-0 w-full"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {col.filterable && activeFilter !== col.key && (
                      <button
                        className="text-[9px] text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); toggleFilter(col.key); }}
                      >
                        <Search className="h-2.5 w-2.5 inline" />
                      </button>
                    )}
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-xs w-[80px]">Tipo</TableHead>
              <TableHead className="text-xs w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((inv) => {
              const key = invoiceKey(inv.anno, inv.numero);
              const isAuto = autoKeys.has(key);
              const counterpart = type === "vendita"
                ? (inv as SaleInvoice).cliente
                : (inv as PurchaseInvoice).fornitore;

              const cellMap: Record<string, React.ReactNode> = {
                numero_display: <TableCell key="n" className="font-mono text-xs">{inv.numero}/{inv.anno}</TableCell>,
                data: <TableCell key="d" className="text-xs">{inv.data}</TableCell>,
                counterpart: <TableCell key="c" className="text-xs max-w-[180px] truncate">{counterpart}</TableCell>,
                descrizione: <TableCell key="desc" className="text-xs max-w-[300px] whitespace-normal break-words leading-snug py-1">{inv.descrizione || "—"}</TableCell>,
                stato: <TableCell key="s"><StatoBadge stato={inv.stato} /></TableCell>,
                imponibile: <TableCell key="imp" className="text-xs font-mono text-right">{formatCurrency(inv.imponibile)}</TableCell>,
                imposta: <TableCell key="iva" className="text-xs font-mono text-right">{formatCurrency(inv.imposta)}</TableCell>,
                totale: <TableCell key="tot" className="text-xs font-mono text-right font-semibold">{formatCurrency(inv.totale)}</TableCell>,
                centro: <TableCell key="centro"><CentroCell invoiceKey={key} tipo={centroTipo} centri={centri} centroMap={centroMap} onAssign={onAssignCentro} /></TableCell>,
              };

              return (
                <TableRow key={key} className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""} onClick={() => onRowClick?.(inv)}>
                  {visibleColumns.map((col) => cellMap[col.key])}
                  <TableCell>
                    <Badge variant={isAuto ? "secondary" : "outline"} className="text-[9px]">
                      {isAuto ? (<><Link2 className="h-2.5 w-2.5 mr-0.5" />CIG</>) : (<><Link2Off className="h-2.5 w-2.5 mr-0.5" />Man.</>)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!isAuto && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveLink(key, type, cig)} title="Rimuovi associazione">
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
    </div>
  );
}

/* ── Search panel for manual linking ── */
function LinkSearchPanel({
  searchQuery, onSearchChange, items, type, cig, onAdd, onClose,
}: {
  searchQuery: string; onSearchChange: (q: string) => void;
  items: (SaleInvoice | PurchaseInvoice)[]; type: "vendita" | "acquisto";
  cig: string; onAdd: (link: ManualLink) => void; onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input autoFocus placeholder={`Cerca fattura di ${type} per nome, numero o descrizione...`}
          value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="h-8 text-xs" />
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
      </div>
      {searchQuery.length > 0 && (
        <div className="max-h-[200px] overflow-auto space-y-1">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Nessun risultato</p>
          ) : (
            items.map((inv) => {
              const key = invoiceKey(inv.anno, inv.numero);
              const counterpart = type === "vendita" ? (inv as SaleInvoice).cliente : (inv as PurchaseInvoice).fornitore;
              return (
                <div key={key}
                  className="flex items-center justify-between rounded-lg border bg-card p-2 hover:bg-muted/50 cursor-pointer"
                  onClick={() => onAdd({ invoiceKey: key, invoiceType: type, cig })}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs shrink-0">{inv.numero}/{inv.anno}</span>
                    <span className="text-xs truncate">{counterpart}</span>
                  </div>
                  <span className="text-xs font-mono shrink-0 ml-2">{formatCurrency(inv.totale)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
