import { useMemo, useState } from "react";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useRubrica } from "@/hooks/useRubrica";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line,
  PieChart, Pie, Cell,
} from "recharts";
import { Receipt, TrendingUp, TrendingDown, ArrowLeftRight, AlertCircle, Percent, Users, Handshake } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

function parseMonthYear(dateStr: string): { month: number; year: number } | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length >= 3) {
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) return { month: m, year: y };
  }
  return null;
}

function isSplitPayment(inv: SaleInvoice | PurchaseInvoice): boolean {
  const pag = (inv.pagamento || "").toLowerCase();
  const desc = (inv.descrizione || "").toLowerCase();
  const tipo = (inv.tipo || "").toLowerCase();
  return pag.includes("split") || desc.includes("split payment") || desc.includes("scissione") || tipo.includes("split");
}

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const QUARTER_LABELS = ["T1 (Gen-Mar)", "T2 (Apr-Giu)", "T3 (Lug-Set)", "T4 (Ott-Dic)"];

interface PeriodData {
  label: string;
  ivaDebito: number;       // IVA sulle vendite (debito verso erario)
  ivaCredito: number;      // IVA sugli acquisti (credito verso erario)
  ivaSplitDebito: number;  // IVA split payment vendite
  ivaSplitCredito: number; // IVA split payment acquisti
  saldo: number;
  saldoSenzaSplit: number;
}

function ClientQuarterIvaSection({ sales, year }: { sales: SaleInvoice[]; year: number }) {
  const [expanded, setExpanded] = useState(false);

  const data = useMemo(() => {
    const map = new Map<string, { cliente: string; t1: number; t2: number; t3: number; t4: number; split: number; total: number }>();
    const yearSales = sales.filter((s) => s.anno === year);

    for (const s of yearSales) {
      const parsed = parseMonthYear(s.data);
      if (!parsed) continue;
      const q = Math.floor((parsed.month - 1) / 3);
      const imposta = Math.abs(s.imposta || 0);
      const cliente = s.cliente || "Sconosciuto";

      // Art.17: invoice-level imposta=0 ma le righe contengono l'IVA teorica
      const isArt17 = (s.imposta === 0 && s.imponibile > 0);
      let art17Iva = 0;
      if (isArt17 && s.righe && s.righe.length > 0) {
        art17Iva = s.righe.reduce((sum, r) => sum + Math.abs(r.imposta || 0), 0);
      }

      if (!map.has(cliente)) {
        map.set(cliente, { cliente, t1: 0, t2: 0, t3: 0, t4: 0, split: 0, total: 0 });
      }
      const entry = map.get(cliente)!;
      if (q === 0) entry.t1 += imposta;
      else if (q === 1) entry.t2 += imposta;
      else if (q === 2) entry.t3 += imposta;
      else entry.t4 += imposta;
      entry.total += imposta;
      if (isArt17) entry.split += art17Iva;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [sales, year]);

  if (data.length === 0) return null;

  const totals = data.reduce(
    (acc, d) => ({ t1: acc.t1 + d.t1, t2: acc.t2 + d.t2, t3: acc.t3 + d.t3, t4: acc.t4 + d.t4, split: acc.split + d.split, total: acc.total + d.total }),
    { t1: 0, t2: 0, t3: 0, t4: 0, split: 0, total: 0 }
  );

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full text-left">
              <Users className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm flex-1">IVA a debito per cliente — Dettaglio trimestrale {year}</CardTitle>
              <Badge variant="secondary" className="text-[10px]">{data.length} clienti</Badge>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs text-right">T1</TableHead>
                  <TableHead className="text-xs text-right">T2</TableHead>
                  <TableHead className="text-xs text-right">T3</TableHead>
                  <TableHead className="text-xs text-right">T4</TableHead>
                  <TableHead className="text-xs text-right">IVA Art.17</TableHead>
                  <TableHead className="text-xs text-right">Totale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d) => (
                  <TableRow key={d.cliente}>
                    <TableCell className="text-xs font-medium max-w-[200px] truncate" title={d.cliente}>{d.cliente}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{d.t1 > 0 ? formatCurrency(d.t1) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{d.t2 > 0 ? formatCurrency(d.t2) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{d.t3 > 0 ? formatCurrency(d.t3) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{d.t4 > 0 ? formatCurrency(d.t4) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-amber-600">{d.split > 0 ? formatCurrency(d.split) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(d.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="text-xs">TOTALE</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.t1)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.t2)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.t3)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.t4)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-amber-600">{formatCurrency(totals.split)}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(totals.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function SocioFornitoreIvaSection({ purchases, year, soci }: { purchases: PurchaseInvoice[]; year: number; soci: Set<string> }) {
  const [expanded, setExpanded] = useState(false);

  const data = useMemo(() => {
    const map = new Map<string, { fornitore: string; t1: number; t2: number; t3: number; t4: number; art17: number; total: number }>();
    const yearPurchases = purchases.filter((p) => p.anno === year);

    for (const p of yearPurchases) {
      const fornitore = p.fornitore || "Sconosciuto";
      // Filter only soci (case-insensitive normalized name)
      if (!soci.has(fornitore.trim().toLowerCase())) continue;

      const parsed = parseMonthYear(p.data);
      if (!parsed) continue;
      const q = Math.floor((parsed.month - 1) / 3);
      const imposta = Math.abs(p.imposta || 0);

      // Art.17 reverse charge: invoice-level imposta=0 ma imponibile>0 → IVA teorica al 22% a debito per il consorzio
      const isArt17 = (p.imposta === 0 && p.imponibile > 0);
      const art17Iva = isArt17 ? p.imponibile * 0.22 : 0;

      if (!map.has(fornitore)) {
        map.set(fornitore, { fornitore, t1: 0, t2: 0, t3: 0, t4: 0, art17: 0, total: 0 });
      }
      const entry = map.get(fornitore)!;
      const debito = imposta + art17Iva;
      if (q === 0) entry.t1 += debito;
      else if (q === 1) entry.t2 += debito;
      else if (q === 2) entry.t3 += debito;
      else entry.t4 += debito;
      entry.total += debito;
      if (isArt17) entry.art17 += art17Iva;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [purchases, year, soci]);

  if (data.length === 0) return null;

  const totals = data.reduce(
    (acc, d) => ({ t1: acc.t1 + d.t1, t2: acc.t2 + d.t2, t3: acc.t3 + d.t3, t4: acc.t4 + d.t4, art17: acc.art17 + d.art17, total: acc.total + d.total }),
    { t1: 0, t2: 0, t3: 0, t4: 0, art17: 0, total: 0 }
  );

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full text-left">
              <Handshake className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm flex-1">IVA a debito per fornitore (Soci) — Dettaglio trimestrale {year}</CardTitle>
              <Badge variant="secondary" className="text-[10px]">{data.length} soci</Badge>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fornitore (Socio)</TableHead>
                  <TableHead className="text-xs text-right">T1</TableHead>
                  <TableHead className="text-xs text-right">T2</TableHead>
                  <TableHead className="text-xs text-right">T3</TableHead>
                  <TableHead className="text-xs text-right">T4</TableHead>
                  <TableHead className="text-xs text-right">IVA Art.17</TableHead>
                  <TableHead className="text-xs text-right">Totale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d) => (
                  <TableRow key={d.fornitore}>
                    <TableCell className="text-xs font-medium max-w-[200px] truncate" title={d.fornitore}>{d.fornitore}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{d.t1 > 0 ? formatCurrency(d.t1) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{d.t2 > 0 ? formatCurrency(d.t2) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{d.t3 > 0 ? formatCurrency(d.t3) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{d.t4 > 0 ? formatCurrency(d.t4) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-amber-600">{d.art17 > 0 ? formatCurrency(d.art17) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(d.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="text-xs">TOTALE</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.t1)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.t2)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.t3)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.t4)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-amber-600">{formatCurrency(totals.art17)}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(totals.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

const IvaPage = () => {
  const { allSales, allPurchases, loading } = useInvoiceData();
  const { contatti } = useRubrica();
  const [viewMode, setViewMode] = useState<"monthly" | "quarterly">("monthly");

  const sociSet = useMemo(() => {
    const s = new Set<string>();
    contatti.forEach((c) => {
      if ((c.tipo || "").split(",").includes("socio")) {
        s.add((c.denominazione || "").trim().toLowerCase());
      }
    });
    return s;
  }, [contatti]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    [...allSales, ...allPurchases].forEach((inv) => {
      if (inv.anno) years.add(inv.anno);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allSales, allPurchases]);

  const [selectedYear, setSelectedYear] = useState<string>(() =>
    availableYears.length > 0 ? String(availableYears[0]) : String(new Date().getFullYear())
  );

  const yearNum = parseInt(selectedYear, 10);

  const periodData = useMemo(() => {
    const periods = viewMode === "monthly" ? 12 : 4;
    const data: PeriodData[] = Array.from({ length: periods }, (_, i) => ({
      label: viewMode === "monthly" ? MONTH_LABELS[i] : QUARTER_LABELS[i],
      ivaDebito: 0,
      ivaCredito: 0,
      ivaSplitDebito: 0,
      ivaSplitCredito: 0,
      saldo: 0,
      saldoSenzaSplit: 0,
    }));

    // IVA a debito (vendite)
    allSales.filter((s) => s.anno === yearNum).forEach((s) => {
      const parsed = parseMonthYear(s.data);
      if (!parsed) return;
      const idx = viewMode === "monthly" ? parsed.month - 1 : Math.floor((parsed.month - 1) / 3);
      const imposta = Math.abs(s.imposta || 0);
      if (isSplitPayment(s)) {
        data[idx].ivaSplitDebito += imposta;
      } else {
        data[idx].ivaDebito += imposta;
      }
    });

    // IVA a credito (acquisti)
    allPurchases.filter((p) => p.anno === yearNum).forEach((p) => {
      const parsed = parseMonthYear(p.data);
      if (!parsed) return;
      const idx = viewMode === "monthly" ? parsed.month - 1 : Math.floor((parsed.month - 1) / 3);
      const imposta = Math.abs(p.imposta || 0);
      if (isSplitPayment(p)) {
        data[idx].ivaSplitCredito += imposta;
      } else {
        data[idx].ivaCredito += imposta;
      }
    });

    data.forEach((d) => {
      d.saldo = (d.ivaDebito + d.ivaSplitDebito) - (d.ivaCredito + d.ivaSplitCredito);
      d.saldoSenzaSplit = d.ivaDebito - d.ivaCredito;
    });

    return data;
  }, [allSales, allPurchases, yearNum, viewMode]);

  const totals = useMemo(() => {
    const t = {
      ivaDebito: 0, ivaCredito: 0,
      ivaSplitDebito: 0, ivaSplitCredito: 0,
      saldo: 0, splitRimborso: 0,
    };
    periodData.forEach((d) => {
      t.ivaDebito += d.ivaDebito;
      t.ivaCredito += d.ivaCredito;
      t.ivaSplitDebito += d.ivaSplitDebito;
      t.ivaSplitCredito += d.ivaSplitCredito;
    });
    t.saldo = (t.ivaDebito + t.ivaSplitDebito) - (t.ivaCredito + t.ivaSplitCredito);
    t.splitRimborso = t.ivaSplitDebito; // Split payment vendite: IVA non incassata, da chiedere a rimborso
    return t;
  }, [periodData]);

  // VAT rate breakdown
  const RATE_COLORS: Record<string, string> = {
    "22%": "hsl(217, 91%, 60%)",
    "10%": "hsl(160, 84%, 39%)",
    "4%": "hsl(38, 92%, 50%)",
    "5%": "hsl(280, 65%, 60%)",
    "0%": "hsl(var(--muted-foreground))",
  };

  function inferRate(imponibile: number, imposta: number): string {
    if (!imponibile || imponibile === 0) return "0%";
    const pct = Math.round((imposta / imponibile) * 100);
    if (pct >= 21 && pct <= 23) return "22%";
    if (pct >= 9 && pct <= 11) return "10%";
    if (pct >= 3 && pct <= 5) return "4%";
    if (pct >= 4 && pct <= 6) return "5%";
    if (pct === 0) return "0%";
    return `${pct}%`;
  }

  const rateBreakdown = useMemo(() => {
    const map = new Map<string, { aliquota: string; imponibileVendite: number; ivaVendite: number; imponibileAcquisti: number; ivaAcquisti: number }>();

    const getOrCreate = (rate: string) => {
      if (!map.has(rate)) map.set(rate, { aliquota: rate, imponibileVendite: 0, ivaVendite: 0, imponibileAcquisti: 0, ivaAcquisti: 0 });
      return map.get(rate)!;
    };

    // Sales: use righe for per-row rate detection
    allSales.filter((s) => s.anno === yearNum).forEach((s) => {
      if (s.righe && s.righe.length > 0) {
        s.righe.forEach((r) => {
          const rate = inferRate(r.imponibile, r.imposta);
          const entry = getOrCreate(rate);
          entry.imponibileVendite += Math.abs(r.imponibile || 0);
          entry.ivaVendite += Math.abs(r.imposta || 0);
        });
      } else {
        const rate = inferRate(s.imponibile, s.imposta);
        const entry = getOrCreate(rate);
        entry.imponibileVendite += Math.abs(s.imponibile || 0);
        entry.ivaVendite += Math.abs(s.imposta || 0);
      }
    });

    // Purchases: aggregate rate
    allPurchases.filter((p) => p.anno === yearNum).forEach((p) => {
      const rate = inferRate(p.imponibile, p.imposta);
      const entry = getOrCreate(rate);
      entry.imponibileAcquisti += Math.abs(p.imponibile || 0);
      entry.ivaAcquisti += Math.abs(p.imposta || 0);
    });

    return Array.from(map.values()).sort((a, b) => {
      const pa = parseInt(a.aliquota);
      const pb = parseInt(b.aliquota);
      return pb - pa;
    });
  }, [allSales, allPurchases, yearNum]);

  const ratePieData = useMemo(() => {
    return rateBreakdown.map((r) => ({
      name: r.aliquota,
      value: Math.round((r.ivaVendite + r.ivaAcquisti) * 100) / 100,
    })).filter(d => d.value > 0);
  }, [rateBreakdown]);

  // Chart data for the composed chart
  const chartData = useMemo(() => {
    return periodData.map((d) => ({
      name: d.label,
      "IVA a debito": Math.round(d.ivaDebito * 100) / 100,
      "IVA a credito": -Math.round(d.ivaCredito * 100) / 100,
      "Split debito": Math.round(d.ivaSplitDebito * 100) / 100,
      "Split credito": -Math.round(d.ivaSplitCredito * 100) / 100,
      "Saldo": Math.round(d.saldo * 100) / 100,
    }));
  }, [periodData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-auto h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">Analisi IVA</h1>
          </div>
          <div className="flex items-center gap-3">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "monthly" | "quarterly")}>
              <TabsList className="h-8">
                <TabsTrigger value="monthly" className="text-xs h-7">Mensile</TabsTrigger>
                <TabsTrigger value="quarterly" className="text-xs h-7">Trimestrale</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> IVA a debito
              </p>
              <p className="text-lg font-bold font-mono mt-1">{formatCurrency(totals.ivaDebito)}</p>
              <p className="text-[10px] text-muted-foreground">Vendite ordinarie</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> IVA a credito
              </p>
              <p className="text-lg font-bold font-mono mt-1">{formatCurrency(totals.ivaCredito)}</p>
              <p className="text-[10px] text-muted-foreground">Acquisti ordinari</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Split Payment
              </p>
              <p className="text-lg font-bold font-mono mt-1">{formatCurrency(totals.ivaSplitDebito)}</p>
              <p className="text-[10px] text-muted-foreground">IVA non incassata (rimborso)</p>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${totals.saldo >= 0 ? "border-l-red-500" : "border-l-green-500"}`}>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ArrowLeftRight className="h-3 w-3" /> Saldo IVA
              </p>
              <p className={`text-lg font-bold font-mono mt-1 ${totals.saldo >= 0 ? "text-destructive" : "text-income"}`}>
                {formatCurrency(Math.abs(totals.saldo))}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {totals.saldo >= 0 ? "Da versare" : "A credito"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Andamento IVA {viewMode === "monthly" ? "mensile" : "trimestrale"} — {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(Math.abs(value))}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeOpacity={0.3} />
                <Bar dataKey="IVA a debito" fill="hsl(217, 91%, 60%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="IVA a credito" fill="hsl(160, 84%, 39%)" radius={[0, 0, 3, 3]} />
                <Bar dataKey="Split debito" fill="hsl(38, 92%, 50%)" radius={[3, 3, 0, 0]} stackId="split" />
                <Bar dataKey="Split credito" fill="hsl(38, 60%, 70%)" radius={[0, 0, 3, 3]} stackId="split" />
                <Line type="monotone" dataKey="Saldo" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Detail table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Dettaglio {viewMode === "monthly" ? "mensile" : "trimestrale"}
              {totals.ivaSplitDebito > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  Split Payment: {formatCurrency(totals.ivaSplitDebito)} da richiedere a rimborso
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Periodo</TableHead>
                  <TableHead className="text-xs text-right">IVA debito</TableHead>
                  <TableHead className="text-xs text-right">IVA credito</TableHead>
                  <TableHead className="text-xs text-right">Split debito</TableHead>
                  <TableHead className="text-xs text-right">Split credito</TableHead>
                  <TableHead className="text-xs text-right">Saldo</TableHead>
                  <TableHead className="text-xs text-right">Saldo (no split)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodData.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-medium">{d.label}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{formatCurrency(d.ivaDebito)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{formatCurrency(d.ivaCredito)}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-amber-600">{d.ivaSplitDebito > 0 ? formatCurrency(d.ivaSplitDebito) : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-amber-600">{d.ivaSplitCredito > 0 ? formatCurrency(d.ivaSplitCredito) : "—"}</TableCell>
                    <TableCell className={`text-xs text-right font-mono font-semibold ${d.saldo >= 0 ? "text-destructive" : "text-income"}`}>
                      {formatCurrency(Math.abs(d.saldo))} {d.saldo >= 0 ? "D" : "C"}
                    </TableCell>
                    <TableCell className={`text-xs text-right font-mono ${d.saldoSenzaSplit >= 0 ? "text-destructive" : "text-income"}`}>
                      {formatCurrency(Math.abs(d.saldoSenzaSplit))} {d.saldoSenzaSplit >= 0 ? "D" : "C"}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="text-xs">TOTALE {selectedYear}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.ivaDebito)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatCurrency(totals.ivaCredito)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-amber-600">{formatCurrency(totals.ivaSplitDebito)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-amber-600">{formatCurrency(totals.ivaSplitCredito)}</TableCell>
                  <TableCell className={`text-xs text-right font-mono ${totals.saldo >= 0 ? "text-destructive" : "text-income"}`}>
                    {formatCurrency(Math.abs(totals.saldo))} {totals.saldo >= 0 ? "D" : "C"}
                  </TableCell>
                  <TableCell className={`text-xs text-right font-mono ${(totals.ivaDebito - totals.ivaCredito) >= 0 ? "text-destructive" : "text-income"}`}>
                    {formatCurrency(Math.abs(totals.ivaDebito - totals.ivaCredito))} {(totals.ivaDebito - totals.ivaCredito) >= 0 ? "D" : "C"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Liquidazione trimestrale summary */}
        {viewMode === "quarterly" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Riepilogo liquidazione trimestrale</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {periodData.map((d, i) => {
                  const versamento = d.saldoSenzaSplit;
                  return (
                    <div key={i} className="rounded-lg border p-3 space-y-1">
                      <p className="text-xs font-semibold">{QUARTER_LABELS[i]}</p>
                      <p className={`text-sm font-mono font-bold ${versamento >= 0 ? "text-destructive" : "text-income"}`}>
                        {formatCurrency(Math.abs(versamento))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {versamento >= 0 ? "Da versare" : "A credito"}
                      </p>
                      {d.ivaSplitDebito > 0 && (
                        <p className="text-[10px] text-amber-600">
                          + {formatCurrency(d.ivaSplitDebito)} split (rimborso)
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* VAT rate breakdown */}
        {rateBreakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Percent className="h-4 w-4" /> Ripartizione per aliquota IVA — {selectedYear}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Pie chart */}
                <div className="w-full lg:w-1/3 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={ratePieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        innerRadius={45}
                        paddingAngle={2}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={{ strokeWidth: 1 }}
                      >
                        {ratePieData.map((entry) => (
                          <Cell key={entry.name} fill={RATE_COLORS[entry.name] || "hsl(var(--muted-foreground))"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Detail table */}
                <div className="w-full lg:w-2/3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Aliquota</TableHead>
                        <TableHead className="text-xs text-right">Imponibile vendite</TableHead>
                        <TableHead className="text-xs text-right">IVA vendite</TableHead>
                        <TableHead className="text-xs text-right">Imponibile acquisti</TableHead>
                        <TableHead className="text-xs text-right">IVA acquisti</TableHead>
                        <TableHead className="text-xs text-right">Saldo IVA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rateBreakdown.map((r) => {
                        const saldo = r.ivaVendite - r.ivaAcquisti;
                        return (
                          <TableRow key={r.aliquota}>
                            <TableCell className="text-xs font-semibold">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RATE_COLORS[r.aliquota] || "hsl(var(--muted-foreground))" }} />
                                {r.aliquota}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">{formatCurrency(r.imponibileVendite)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{formatCurrency(r.ivaVendite)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{formatCurrency(r.imponibileAcquisti)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{formatCurrency(r.ivaAcquisti)}</TableCell>
                            <TableCell className={`text-xs text-right font-mono font-semibold ${saldo >= 0 ? "text-destructive" : "text-income"}`}>
                              {formatCurrency(Math.abs(saldo))} {saldo >= 0 ? "D" : "C"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell className="text-xs">TOTALE</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(rateBreakdown.reduce((s, r) => s + r.imponibileVendite, 0))}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(rateBreakdown.reduce((s, r) => s + r.ivaVendite, 0))}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(rateBreakdown.reduce((s, r) => s + r.imponibileAcquisti, 0))}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(rateBreakdown.reduce((s, r) => s + r.ivaAcquisti, 0))}</TableCell>
                        <TableCell className={`text-xs text-right font-mono font-semibold ${totals.saldo >= 0 ? "text-destructive" : "text-income"}`}>
                          {formatCurrency(Math.abs(rateBreakdown.reduce((s, r) => s + r.ivaVendite - r.ivaAcquisti, 0)))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* IVA debito per cliente/socio per trimestre */}
        <ClientQuarterIvaSection sales={allSales} year={yearNum} />
      </div>
    </div>
  );
};

export default IvaPage;
