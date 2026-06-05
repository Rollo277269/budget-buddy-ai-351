import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, AlertCircle, Sparkles, Loader2, FileText, ExternalLink, Columns3, Check } from "lucide-react";
import { ArrowUp, ArrowDown, ArrowUpDown, Link2 } from "lucide-react";
import { Pencil, X as XIcon } from "lucide-react";
import { extractCigCandidates } from "@/lib/cigCoherence";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentiAcquisto, type DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";
import { useCentriData } from "@/hooks/useCentri";
import { useCssrCommesse } from "@/hooks/useCssrCommesse";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const REMINDER_DAYS = 10;

type StatusFilter = "all" | "scaduto" | "imminenti" | "future" | "senza";
type ColKey = "fornitore" | "numero" | "descrizione" | "cig" | "commessa" | "centro" | "data_doc" | "scadenza" | "stato" | "premio" | "garantito" | "azioni";
const ALL_COLS: { key: ColKey; label: string }[] = [
  { key: "fornitore", label: "Fornitore" },
  { key: "numero", label: "N° polizza" },
  { key: "descrizione", label: "Descrizione" },
  { key: "cig", label: "CIG" },
  { key: "commessa", label: "Commessa" },
  { key: "centro", label: "Centro" },
  { key: "data_doc", label: "Data doc." },
  { key: "scadenza", label: "Scadenza" },
  { key: "stato", label: "Stato" },
  { key: "premio", label: "Premio" },
  { key: "garantito", label: "Importo garantito" },
  { key: "azioni", label: "Azioni" },
];
const COLS_STORAGE_KEY = "polizze-visible-cols";

// ── helpers ────────────────────────────────────────────────────────────────
function parseIsoOrItDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const str = s.trim();
  if (!str) return null;
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const itMatch = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (itMatch) {
    const d = new Date(Number(itMatch[3]), Number(itMatch[2]) - 1, Number(itMatch[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatIt(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysUntil(d: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function isPolizza(d: DocumentoAcquisto): boolean {
  const tipo = (d.tipo_documento || "").toLowerCase();
  if (tipo === "polizza") return true;
  const text = `${d.descrizione || ""} ${d.ai_summary || ""} ${d.file_name || ""}`.toLowerCase();
  return /polizz|fideiussor|cauzion/.test(text);
}

function categoria(d: DocumentoAcquisto): "gara" | "commessa" | "altre" {
  const centro = (d.centro_costo || "").toUpperCase();
  if (centro.startsWith("CO")) return "gara";
  if (d.cig || centro) return "commessa";
  return "altre";
}

function CountdownBadge({ date }: { date: Date | null }) {
  if (!date) return <Badge variant="outline" className="text-[10px]">—</Badge>;
  const days = daysUntil(date);
  if (days < 0) {
    return <Badge variant="destructive" className="text-[10px] gap-1"><ShieldAlert className="h-3 w-3" />Scaduta da {Math.abs(days)}g</Badge>;
  }
  if (days === 0) {
    return <Badge className="text-[10px] gap-1 bg-destructive text-destructive-foreground"><AlertCircle className="h-3 w-3" />Scade oggi</Badge>;
  }
  if (days <= REMINDER_DAYS) {
    return <Badge className="text-[10px] gap-1 bg-amber-500 hover:bg-amber-500 text-white"><AlertCircle className="h-3 w-3" />Tra {days}g</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px]">Tra {days}g</Badge>;
}

// ── page ───────────────────────────────────────────────────────────────────
export default function Polizze() {
  const { documenti, refresh, updateField } = useDocumentiAcquisto("acquisto");
  const { centriCosto } = useCentriData();
  const { byCig: commesseByCig } = useCssrCommesse();
  // Case-insensitive lookup map (CIG sometimes stored uppercase, sometimes mixed).
  const commesseByCigUpper = useMemo(() => {
    const m = new Map<string, ReturnType<typeof commesseByCig.get>>();
    commesseByCig.forEach((v, k) => { if (k) m.set(k.toUpperCase(), v); });
    return m;
  }, [commesseByCig]);
  const lookupCommessa = useCallback((cig: string | null | undefined) => {
    if (!cig) return null;
    return commesseByCigUpper.get(cig.trim().toUpperCase()) || null;
  }, [commesseByCigUpper]);
  const getCommessaNumero = useCallback((cig: string | null | undefined) => {
    const c = lookupCommessa(cig);
    return c?.numero_repertorio || c?.commessa_consortile || "";
  }, [lookupCommessa]);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [reassociating, setReassociating] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "gara" | "commessa" | "altre">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [sortCol, setSortCol] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const toggleSort = useCallback((k: ColKey) => {
    if (sortCol !== k) { setSortCol(k); setSortDir("asc"); return; }
    if (sortDir === "asc") setSortDir("desc");
    else if (sortDir === "desc") { setSortCol(null); setSortDir(null); }
    else setSortDir("asc");
  }, [sortCol, sortDir]);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const saved = localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) return new Set(JSON.parse(saved) as ColKey[]);
    } catch {}
    return new Set(ALL_COLS.map((c) => c.key));
  });
  const isVisible = useCallback((k: ColKey) => visibleCols.has(k), [visibleCols]);
  const toggleCol = useCallback((k: ColKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    document.title = "Polizze | Scadenze";
  }, []);

  const centroLabel = useMemo(() => {
    const m = new Map<string, string>();
    centriCosto.forEach((c) => m.set(c.codice, c.descrizione));
    return m;
  }, [centriCosto]);

  const polizze = useMemo(() => documenti.filter(isPolizza), [documenti]);

  const enriched = useMemo(
    () =>
      polizze.map((d) => {
        const date = parseIsoOrItDate(d.data_scadenza);
        return {
          ...d,
          _date: date,
          _days: date ? daysUntil(date) : null,
          _cat: categoria(d),
        };
      }),
    [polizze]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return enriched.filter((d) => {
      if (activeTab !== "all" && d._cat !== activeTab) return false;
      if (yearFilter !== "all") {
        if (!d._date) return false;
        if (String(d._date.getFullYear()) !== yearFilter) return false;
      }
      if (statusFilter !== "all") {
        if (statusFilter === "senza") {
          if (d._date) return false;
        } else {
          if (!d._date) return false;
          const days = d._days!;
          if (statusFilter === "scaduto" && days >= 0) return false;
          if (statusFilter === "imminenti" && (days < 0 || days > REMINDER_DAYS)) return false;
          if (statusFilter === "future" && days <= REMINDER_DAYS) return false;
        }
      }
      if (!q) return true;
      return (
        (d.fornitore || "").toLowerCase().includes(q) ||
        (d.descrizione || "").toLowerCase().includes(q) ||
        (d.cig || "").toLowerCase().includes(q) ||
        (d.centro_costo || "").toLowerCase().includes(q) ||
        (d.numero || "").toLowerCase().includes(q)
      );
    });
  }, [enriched, filter, activeTab, statusFilter, yearFilter]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    enriched.forEach((d) => { if (d._date) years.add(d._date.getFullYear()); });
    return [...years].sort((a, b) => b - a);
  }, [enriched]);

  const sorted = useMemo(() => {
    if (sortCol && sortDir) {
      const dir = sortDir === "asc" ? 1 : -1;
      const getVal = (d: any): string | number | null => {
        switch (sortCol) {
          case "fornitore": return (d.fornitore || "").toLowerCase();
          case "numero": return (d.numero || "").toLowerCase();
          case "descrizione": return (d.descrizione || "").toLowerCase();
          case "cig": return (d.cig || "").toLowerCase();
          case "commessa": return getCommessaNumero(d.cig).toLowerCase();
          case "centro": return (d.centro_costo || "").toLowerCase();
          case "data_doc": {
            const dt = parseIsoOrItDate(d.data_documento);
            return dt ? dt.getTime() : null;
          }
          case "scadenza": return d._date ? d._date.getTime() : null;
          case "stato": return d._date ? d._days : null;
          case "premio": return d.importo != null ? Number(d.importo) : null;
          case "garantito": return d.importo_garantito != null ? Number(d.importo_garantito) : null;
          default: return null;
        }
      };
      return [...filtered].sort((a, b) => {
        const va = getVal(a);
        const vb = getVal(b);
        const aEmpty = va === null || va === "" || (typeof va === "number" && isNaN(va));
        const bEmpty = vb === null || vb === "" || (typeof vb === "number" && isNaN(vb));
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
        return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
      });
    }
    return [...filtered].sort((a, b) => {
      // expired/imminent first, then ascending by date, then no-date last
      if (!a._date && !b._date) return 0;
      if (!a._date) return 1;
      if (!b._date) return -1;
      return a._date.getTime() - b._date.getTime();
    });
  }, [filtered, sortCol, sortDir, getCommessaNumero]);

  const counts = useMemo(() => {
    let scaduto = 0, imminenti = 0, future = 0, senza = 0;
    enriched.forEach((d) => {
      if (!d._date) { senza++; return; }
      const days = d._days!;
      if (days < 0) scaduto++;
      else if (days <= REMINDER_DAYS) imminenti++;
      else future++;
    });
    return { totale: enriched.length, scaduto, imminenti, future, senza };
  }, [enriched]);

  // ── actions ──
  const handleExtractScadenza = useCallback(async (doc: DocumentoAcquisto) => {
    if (!doc.parsed_text) {
      toast.error("Nessun testo estratto disponibile per questo PDF");
      return;
    }
    setExtractingId(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke("extract-polizza-scadenza", {
        body: { text: doc.parsed_text },
      });
      if (error) throw error;
      const updates: Record<string, string> = {};
      if (data?.tipo_documento && !doc.tipo_documento) updates.tipo_documento = data.tipo_documento;
      if (data?.data_scadenza) {
        const m = String(data.data_scadenza).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        updates.data_scadenza = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : data.data_scadenza;
      }
      if (Object.keys(updates).length === 0) {
        toast.warning("L'AI non ha trovato una scadenza in questo documento");
      } else {
        const { error: upErr } = await supabase
          .from("documenti_acquisto" as any)
          .update(updates as any)
          .eq("id", doc.id);
        if (upErr) throw upErr;
        toast.success("Scadenza aggiornata");
        await refresh();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Errore estrazione scadenza");
    } finally {
      setExtractingId(null);
    }
  }, [refresh]);

  const handleManualDate = useCallback(async (id: string, date: Date | undefined) => {
    const iso = date ? toIso(date) : "";
    await updateField(id, "data_scadenza", iso);
  }, [updateField]);

  const openPdf = useCallback(async (doc: DocumentoAcquisto) => {
    try {
      const { data, error } = await supabase.storage
        .from("documenti-acquisto")
        .createSignedUrl(doc.storage_path, 60 * 10);
      if (error || !data?.signedUrl) throw error || new Error("URL non disponibile");
      window.open(data.signedUrl, "_blank");
    } catch {
      // Fallback: download as blob
      try {
        const { data: blob } = await supabase.storage.from("documenti-acquisto").download(doc.storage_path);
        if (!blob) { toast.error("Errore apertura PDF"); return; }
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      } catch {
        toast.error("Errore apertura PDF");
      }
    }
  }, []);

  const handleReassociaCig = useCallback(async () => {
    setReassociating(true);
    try {
      const cigSet = new Set<string>();
      commesseByCig.forEach((_v, k) => { if (k) cigSet.add(k.toUpperCase()); });
      if (cigSet.size === 0) {
        toast.error("Nessuna commessa con CIG disponibile");
        return;
      }
      let updated = 0;
      let alreadyOk = 0;
      let notFound = 0;
      const updates: { id: string; cig: string }[] = [];
      for (const d of polizze) {
        const currentCig = (d.cig || "").trim().toUpperCase();
        if (currentCig && cigSet.has(currentCig)) { alreadyOk++; continue; }
        const text = `${d.descrizione || ""}\n${d.ai_summary || ""}\n${d.file_name || ""}\n${d.parsed_text || ""}`;
        const { all, nearKeyword } = extractCigCandidates(text);
        const candidates = [...nearKeyword, ...all];
        const match = candidates.find((c) => cigSet.has(c));
        if (!match) { notFound++; continue; }
        if (match !== currentCig) updates.push({ id: d.id, cig: match });
        else alreadyOk++;
      }
      for (const u of updates) {
        const { error } = await supabase
          .from("documenti_acquisto" as any)
          .update({ cig: u.cig } as any)
          .eq("id", u.id);
        if (!error) updated++;
      }
      if (updated > 0) await refresh();
      toast.success(`Riassociazione completata: ${updated} aggiornate, ${alreadyOk} già OK, ${notFound} senza CIG riconosciuto`);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Errore riassociazione CIG");
    } finally {
      setReassociating(false);
    }
  }, [polizze, commesseByCig, refresh]);

  return (
    <div className="p-4 space-y-4">
      {/* Banner riassuntivo — clickable filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Polizze totali" value={counts.totale} icon={<ShieldCheck className="h-4 w-4" />}
          active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <SummaryCard label="Scadute" value={counts.scaduto} variant="destructive" icon={<ShieldAlert className="h-4 w-4" />}
          active={statusFilter === "scaduto"} onClick={() => setStatusFilter(statusFilter === "scaduto" ? "all" : "scaduto")} />
        <SummaryCard label={`In scadenza ≤ ${REMINDER_DAYS}gg`} value={counts.imminenti} variant="warning" icon={<AlertCircle className="h-4 w-4" />}
          active={statusFilter === "imminenti"} onClick={() => setStatusFilter(statusFilter === "imminenti" ? "all" : "imminenti")} />
        <SummaryCard label="Future" value={counts.future} icon={<ShieldCheck className="h-4 w-4" />}
          active={statusFilter === "future"} onClick={() => setStatusFilter(statusFilter === "future" ? "all" : "future")} />
        <SummaryCard label="Senza scadenza nota" value={counts.senza} variant="muted" icon={<FileText className="h-4 w-4" />}
          active={statusFilter === "senza"} onClick={() => setStatusFilter(statusFilter === "senza" ? "all" : "senza")} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* TABLE */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Elenco polizze
                {statusFilter !== "all" && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    Filtro: {statusFilter === "scaduto" ? "Scadute" : statusFilter === "imminenti" ? `≤ ${REMINDER_DAYS}gg` : statusFilter === "future" ? "Future" : "Senza scadenza"}
                    <button className="ml-1 hover:text-foreground" onClick={() => setStatusFilter("all")}>×</button>
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Cerca fornitore, CIG, descrizione…"
                  className="h-8 w-64 text-xs"
                />
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="h-8 w-[110px] text-xs">
                    <SelectValue placeholder="Anno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Tutti gli anni</SelectItem>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue placeholder="Stato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Tutti gli stati</SelectItem>
                    <SelectItem value="scaduto" className="text-xs">Scadute</SelectItem>
                    <SelectItem value="imminenti" className="text-xs">In scadenza ≤ {REMINDER_DAYS}gg</SelectItem>
                    <SelectItem value="future" className="text-xs">Future</SelectItem>
                    <SelectItem value="senza" className="text-xs">Senza scadenza</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                      <Columns3 className="h-3.5 w-3.5" /> Colonne
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="text-xs">Colonne visibili</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {ALL_COLS.map((c) => (
                      <DropdownMenuCheckboxItem
                        key={c.key}
                        checked={visibleCols.has(c.key)}
                        onCheckedChange={() => toggleCol(c.key)}
                        onSelect={(e) => e.preventDefault()}
                        className="text-xs"
                      >
                        {c.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={handleReassociaCig}
                  disabled={reassociating}
                  title="Cerca un CIG nel testo di ogni polizza e collegalo alla commessa corrispondente"
                >
                  {reassociating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Riassocia CIG
                </Button>
              </div>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-2">
              <TabsList className="h-7">
                <TabsTrigger value="all" className="text-[11px] h-6 px-2">Tutte ({enriched.length})</TabsTrigger>
                <TabsTrigger value="gara" className="text-[11px] h-6 px-2">Costi di gara ({enriched.filter((d) => d._cat === "gara").length})</TabsTrigger>
                <TabsTrigger value="commessa" className="text-[11px] h-6 px-2">Costi di commessa ({enriched.filter((d) => d._cat === "commessa").length})</TabsTrigger>
                <TabsTrigger value="altre" className="text-[11px] h-6 px-2">Altre ({enriched.filter((d) => d._cat === "altre").length})</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    {isVisible("fornitore") && <SortableTh col="fornitore" label="Fornitore" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("numero") && <SortableTh col="numero" label="N° polizza" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("descrizione") && <SortableTh col="descrizione" label="Descrizione" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("cig") && <SortableTh col="cig" label="CIG" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("commessa") && <SortableTh col="commessa" label="Commessa" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("centro") && <SortableTh col="centro" label="Centro" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("data_doc") && <SortableTh col="data_doc" label="Data doc." sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("scadenza") && <SortableTh col="scadenza" label="Scadenza" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("stato") && <SortableTh col="stato" label="Stato" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("premio") && <SortableTh col="premio" label="Premio" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} align="right" />}
                    {isVisible("garantito") && <SortableTh col="garantito" label="Importo garantito" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} align="right" />}
                    {isVisible("azioni") && <TableHead className="text-[11px] h-8 px-2 w-[100px]">Azioni</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleCols.size || 1} className="text-center text-xs text-muted-foreground py-8">
                        Nessuna polizza trovata. Carica un PDF di polizza in <Link to="/acquisti" className="text-primary underline">Acquisti → Ricevute</Link> o nel dettaglio di una commessa.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((d) => {
                      const centroDesc = d.centro_costo ? centroLabel.get(d.centro_costo) : null;
                      return (
                        <TableRow key={d.id} className="hover:bg-muted/40">
                          {isVisible("fornitore") && <TableCell className="text-xs px-2 py-1.5">{d.fornitore || "—"}</TableCell>}
                          {isVisible("numero") && <TableCell className="text-xs px-2 py-1.5 font-mono">{d.numero || "—"}</TableCell>}
                          {isVisible("descrizione") && <TableCell className="text-xs px-2 py-1.5 max-w-[260px] truncate" title={d.descrizione || ""}>{d.descrizione || "—"}</TableCell>}
                          {isVisible("cig") && <TableCell className="text-xs px-2 py-1.5 font-mono">
                            <EditableCigCell
                              value={d.cig || ""}
                              onSave={async (next) => {
                                await updateField(d.id, "cig", next);
                                toast.success("CIG aggiornato");
                              }}
                            />
                          </TableCell>}
                          {isVisible("commessa") && <TableCell className="text-xs px-2 py-1.5 font-mono">
                            {(() => {
                              const num = getCommessaNumero(d.cig);
                              if (!num) return <span className="text-muted-foreground">—</span>;
                              return <Link to={`/commesse?cig=${d.cig}`} className="text-primary hover:underline">{num}</Link>;
                            })()}
                          </TableCell>}
                          {isVisible("centro") && <TableCell className="text-xs px-2 py-1.5">
                            {d.centro_costo ? (
                              <span className="font-mono">{d.centro_costo}{centroDesc ? <span className="text-muted-foreground"> – {centroDesc}</span> : null}</span>
                            ) : "—"}
                          </TableCell>}
                          {isVisible("data_doc") && <TableCell className="text-xs px-2 py-1.5">{d.data_documento || "—"}</TableCell>}
                          {isVisible("scadenza") && <TableCell className="text-xs px-2 py-1.5">
                            <ScadenzaCell value={d._date} onChange={(date) => handleManualDate(d.id, date)} />
                          </TableCell>}
                          {isVisible("stato") && <TableCell className="text-xs px-2 py-1.5"><StatoLabel date={d._date} /></TableCell>}
                          {isVisible("premio") && <TableCell className="text-xs px-2 py-1.5 text-right font-mono">{d.importo != null ? formatCurrency(d.importo) : "—"}</TableCell>}
                          {isVisible("garantito") && <TableCell className="text-xs px-2 py-1.5 text-right font-mono text-muted-foreground">{(d as any).importo_garantito != null ? formatCurrency((d as any).importo_garantito) : "—"}</TableCell>}
                          {isVisible("azioni") && <TableCell className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-6 w-6" title="Apri PDF" onClick={() => openPdf(d)}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              {!d.data_scadenza && d.parsed_text && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  title="Estrai scadenza con AI"
                                  disabled={extractingId === d.id}
                                  onClick={() => handleExtractScadenza(d)}
                                >
                                  {extractingId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-primary" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── small components ───────────────────────────────────────────────────────
function SummaryCard({
  label, value, icon, variant, active, onClick,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  variant?: "destructive" | "warning" | "muted";
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card className={cn(
      onClick && "cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5",
      active && "ring-2 ring-primary",
      variant === "destructive" && "border-destructive/40 bg-destructive/5",
      variant === "warning" && "border-amber-500/40 bg-amber-500/5",
      variant === "muted" && "bg-muted/30",
    )} onClick={onClick}>
      <CardContent className="p-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
        <div className={cn(
          "rounded-md p-2",
          variant === "destructive" ? "bg-destructive/15 text-destructive" :
          variant === "warning" ? "bg-amber-500/15 text-amber-600" :
          "bg-primary/10 text-primary"
        )}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", className)} />;
}

function SortableTh({ col, label, sortCol, sortDir, onToggle, align }: {
  col: ColKey;
  label: string;
  sortCol: ColKey | null;
  sortDir: "asc" | "desc" | null;
  onToggle: (k: ColKey) => void;
  align?: "right";
}) {
  const active = sortCol === col && sortDir;
  return (
    <TableHead className={cn("text-[11px] h-8 px-2", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onToggle(col)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "justify-end w-full")}
        title={`Ordina per ${label}`}
      >
        {label}
        {active === "asc" ? <ArrowUp className="h-3 w-3" /> : active === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  );
}

function StatoLabel({ date }: { date: Date | null }) {
  if (!date) return <Badge variant="outline" className="text-[10px]">Senza scadenza</Badge>;
  const days = daysUntil(date);
  if (days < 0) {
    return <Badge variant="destructive" className="text-[10px] gap-1 uppercase font-semibold"><ShieldAlert className="h-3 w-3" />Scaduta da {Math.abs(days)}g</Badge>;
  }
  if (days === 0) {
    return <Badge className="text-[10px] gap-1 bg-destructive text-destructive-foreground uppercase font-semibold"><AlertCircle className="h-3 w-3" />Scade oggi</Badge>;
  }
  if (days <= REMINDER_DAYS) {
    return <Badge className="text-[10px] gap-1 bg-amber-500 hover:bg-amber-500 text-white uppercase font-semibold"><AlertCircle className="h-3 w-3" />In scadenza ({days}g)</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px] gap-1"><ShieldCheck className="h-3 w-3" />Attiva (tra {days}g)</Badge>;
}

function ScadenzaCell({ value, onChange }: { value: Date | null; onChange: (d: Date | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "font-mono hover:text-primary transition-colors text-left",
          !value && "text-muted-foreground"
        )}>
          {value ? formatIt(value) : "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={onChange}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}