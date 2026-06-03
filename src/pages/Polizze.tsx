import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, AlertCircle, Sparkles, Loader2, FileText, ExternalLink, Columns3, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentiAcquisto, type DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";
import { useCentriData } from "@/hooks/useCentri";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const REMINDER_DAYS = 10;

type StatusFilter = "all" | "scaduto" | "imminenti" | "future" | "senza";
type ColKey = "fornitore" | "numero" | "descrizione" | "cig" | "centro" | "data_doc" | "scadenza" | "stato" | "premio" | "garantito" | "azioni";
const ALL_COLS: { key: ColKey; label: string }[] = [
  { key: "fornitore", label: "Fornitore" },
  { key: "numero", label: "N° polizza" },
  { key: "descrizione", label: "Descrizione" },
  { key: "cig", label: "CIG" },
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
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "gara" | "commessa" | "altre">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
  }, [enriched, filter, activeTab, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // expired/imminent first, then ascending by date, then no-date last
      if (!a._date && !b._date) return 0;
      if (!a._date) return 1;
      if (!b._date) return -1;
      return a._date.getTime() - b._date.getTime();
    });
  }, [filtered]);

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

  // Calendar modifiers
  const calendarModifiers = useMemo(() => {
    const expired: Date[] = [];
    const imminent: Date[] = [];
    const future: Date[] = [];
    enriched.forEach((d) => {
      if (!d._date) return;
      const days = d._days!;
      if (days < 0) expired.push(d._date);
      else if (days <= REMINDER_DAYS) imminent.push(d._date);
      else future.push(d._date);
    });
    return { expired, imminent, future };
  }, [enriched]);

  const upcoming60 = useMemo(() => {
    return enriched
      .filter((d) => d._date && d._days! >= -30 && d._days! <= 60)
      .sort((a, b) => a._date!.getTime() - b._date!.getTime());
  }, [enriched]);

  const selectedDayItems = useMemo(() => {
    if (!selectedDate) return [];
    const iso = toIso(selectedDate);
    return enriched.filter((d) => d._date && toIso(d._date) === iso);
  }, [selectedDate, enriched]);

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

  return (
    <div className="p-4 space-y-4">
      {/* Banner riassuntivo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Polizze totali" value={counts.totale} icon={<ShieldCheck className="h-4 w-4" />} />
        <SummaryCard label="Scadute" value={counts.scaduto} variant="destructive" icon={<ShieldAlert className="h-4 w-4" />} />
        <SummaryCard label={`In scadenza ≤ ${REMINDER_DAYS}gg`} value={counts.imminenti} variant="warning" icon={<AlertCircle className="h-4 w-4" />} />
        <SummaryCard label="Senza scadenza nota" value={counts.senza} variant="muted" icon={<FileText className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* TABLE */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Elenco polizze
              </CardTitle>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Cerca fornitore, CIG, descrizione…"
                className="h-8 w-64 text-xs"
              />
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
                    <TableHead className="text-[11px] h-8 px-2">Fornitore</TableHead>
                    <TableHead className="text-[11px] h-8 px-2">N° polizza</TableHead>
                    <TableHead className="text-[11px] h-8 px-2">Descrizione</TableHead>
                    <TableHead className="text-[11px] h-8 px-2">CIG</TableHead>
                    <TableHead className="text-[11px] h-8 px-2">Centro</TableHead>
                    <TableHead className="text-[11px] h-8 px-2">Data doc.</TableHead>
                    <TableHead className="text-[11px] h-8 px-2">Scadenza</TableHead>
                    <TableHead className="text-[11px] h-8 px-2">Stato</TableHead>
                    <TableHead className="text-[11px] h-8 px-2 text-right">Premio</TableHead>
                    <TableHead className="text-[11px] h-8 px-2 text-right">Importo garantito</TableHead>
                    <TableHead className="text-[11px] h-8 px-2 w-[100px]">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-8">
                        Nessuna polizza trovata. Carica un PDF di polizza in <Link to="/acquisti" className="text-primary underline">Acquisti → Ricevute</Link> o nel dettaglio di una commessa.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((d) => {
                      const centroDesc = d.centro_costo ? centroLabel.get(d.centro_costo) : null;
                      return (
                        <TableRow key={d.id} className="hover:bg-muted/40">
                          <TableCell className="text-xs px-2 py-1.5">{d.fornitore || "—"}</TableCell>
                          <TableCell className="text-xs px-2 py-1.5 font-mono">{d.numero || "—"}</TableCell>
                          <TableCell className="text-xs px-2 py-1.5 max-w-[260px] truncate" title={d.descrizione || ""}>{d.descrizione || "—"}</TableCell>
                          <TableCell className="text-xs px-2 py-1.5 font-mono">
                            {d.cig ? (
                              <Link to={`/commesse?cig=${d.cig}`} className="text-primary hover:underline">{d.cig}</Link>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1.5">
                            {d.centro_costo ? (
                              <span className="font-mono">{d.centro_costo}{centroDesc ? <span className="text-muted-foreground"> – {centroDesc}</span> : null}</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1.5">{d.data_documento || "—"}</TableCell>
                          <TableCell className="text-xs px-2 py-1.5">
                            <ScadenzaCell value={d._date} onChange={(date) => handleManualDate(d.id, date)} />
                          </TableCell>
                          <TableCell className="text-xs px-2 py-1.5"><CountdownBadge date={d._date} /></TableCell>
                          <TableCell className="text-xs px-2 py-1.5 text-right font-mono">{d.importo != null ? formatCurrency(d.importo) : "—"}</TableCell>
                          <TableCell className="text-xs px-2 py-1.5 text-right font-mono text-muted-foreground">{(d as any).importo_garantito != null ? formatCurrency((d as any).importo_garantito) : "—"}</TableCell>
                          <TableCell className="px-2 py-1.5">
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
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* CALENDAR */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Calendario scadenze
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              modifiers={calendarModifiers}
              modifiersClassNames={{
                expired: "bg-destructive text-destructive-foreground font-bold rounded-md",
                imminent: "bg-amber-500 text-white font-bold rounded-md",
                future: "bg-primary/15 text-primary font-medium rounded-md",
              }}
              className="pointer-events-auto rounded-md border p-2 mx-auto"
            />

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <LegendDot className="bg-destructive" /> Scaduta
              <LegendDot className="bg-amber-500" /> ≤ {REMINDER_DAYS} giorni
              <LegendDot className="bg-primary/40" /> Futura
            </div>

            {selectedDate && (
              <div className="border rounded-md p-2 bg-muted/30">
                <div className="text-[11px] font-medium mb-1">
                  {formatIt(selectedDate)} — {selectedDayItems.length} polizz{selectedDayItems.length === 1 ? "a" : "e"}
                </div>
                {selectedDayItems.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground">Nessuna scadenza in questa data.</div>
                ) : (
                  <ul className="space-y-1">
                    {selectedDayItems.map((d) => (
                      <li key={d.id} className="text-[11px] flex items-center justify-between gap-2">
                        <span className="truncate" title={d.descrizione || ""}>{d.fornitore || "—"} · {d.descrizione || ""}</span>
                        <CountdownBadge date={d._date} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div>
              <div className="text-[11px] font-medium mb-1 mt-2">Prossime scadenze (60gg)</div>
              {upcoming60.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">Nessuna scadenza imminente.</div>
              ) : (
                <ul className="space-y-1 max-h-[300px] overflow-auto pr-1">
                  {upcoming60.map((d) => (
                    <li key={d.id} className="text-[11px] flex items-center justify-between gap-2 border-b border-border/40 py-1">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" title={d.descrizione || ""}>{d.fornitore || "—"}</div>
                        <div className="truncate text-muted-foreground">{d.descrizione || ""}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono">{formatIt(d._date!)}</div>
                        <CountdownBadge date={d._date} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── small components ───────────────────────────────────────────────────────
function SummaryCard({
  label, value, icon, variant,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  variant?: "destructive" | "warning" | "muted";
}) {
  return (
    <Card className={cn(
      variant === "destructive" && "border-destructive/40 bg-destructive/5",
      variant === "warning" && "border-amber-500/40 bg-amber-500/5",
      variant === "muted" && "bg-muted/30",
    )}>
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