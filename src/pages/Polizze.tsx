import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, AlertCircle, Sparkles, Loader2, FileText, ExternalLink, Columns3, Check, Copy, Trash2, Upload } from "lucide-react";
import { ArrowUp, ArrowDown, ArrowUpDown, Link2 } from "lucide-react";
import { Pencil, X as XIcon } from "lucide-react";
import { extractCigCandidates } from "@/lib/cigCoherence";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentiAcquisto, type DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";
import { useCentriData } from "@/hooks/useCentri";
import { useCssrCommesse } from "@/hooks/useCssrCommesse";
import { useRubrica } from "@/hooks/useRubrica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const REMINDER_DAYS = 10;

type StatusFilter = "all" | "scaduto" | "imminenti" | "future" | "senza";
type ColKey = "fornitore" | "tipo_numero" | "descrizione" | "cig_commessa" | "centro" | "date" | "stato" | "importi" | "azioni";
const ALL_COLS: { key: ColKey; label: string }[] = [
  { key: "fornitore", label: "Fornitore" },
  { key: "tipo_numero", label: "Tipo / N° polizza" },
  { key: "descrizione", label: "Descrizione" },
  { key: "cig_commessa", label: "CIG / Commessa" },
  { key: "centro", label: "Centro" },
  { key: "date", label: "Data doc. / Scadenza" },
  { key: "stato", label: "Stato" },
  { key: "importi", label: "Premio / Importo garantito" },
  { key: "azioni", label: "Azioni" },
];
const COLS_STORAGE_KEY = "polizze-visible-cols-v2";

// ── pdfjs text extraction (lazy) ────────────────────────────────────────────
async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  return pdfjsLib;
}
async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(" ") + "\n";
  }
  return text;
}

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

type TipoPolizza = "Provvisoria" | "Definitiva" | "CAR" | "Anticipazione" | "RCT/RCO" | "Altro";

function classifyTipoPolizza(d: DocumentoAcquisto): TipoPolizza {
  const text = `${d.descrizione || ""} ${d.ai_summary || ""} ${d.file_name || ""}`.toLowerCase();
  if (/\bprovvisori/.test(text)) return "Provvisoria";
  if (/\bdefinitiv/.test(text)) return "Definitiva";
  if (/\bcar\b|all\s*risks|contractors[^a-z]*all[^a-z]*risks|tutti\s*i\s*rischi/.test(text)) return "CAR";
  if (/anticipazion/.test(text)) return "Anticipazione";
  if (/\brc[\s\/\-]?[tor]\b|rct|rco|responsabilit[aà]\s*civil/.test(text)) return "RCT/RCO";
  return "Altro";
}

function TipoPolizzaBadge({ tipo }: { tipo: TipoPolizza }) {
  const cls: Record<TipoPolizza, string> = {
    "Provvisoria": "bg-amber-100 text-amber-800 border-amber-300",
    "Definitiva": "bg-emerald-100 text-emerald-800 border-emerald-300",
    "CAR": "bg-sky-100 text-sky-800 border-sky-300",
    "Anticipazione": "bg-violet-100 text-violet-800 border-violet-300",
    "RCT/RCO": "bg-rose-100 text-rose-800 border-rose-300",
    "Altro": "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 border", cls[tipo])}>{tipo}</Badge>;
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
  const { documenti, refresh, updateField, deleteDocumento, prepareDocumento, finalizeDocumento } = useDocumentiAcquisto("acquisto");
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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const polizzaInputRef = useRef<HTMLInputElement>(null);
  const [dragOnButton, setDragOnButton] = useState(false);
  const dragCounter = useRef(0);
  // Duplicate-on-upload prompt
  const [dupPrompt, setDupPrompt] = useState<null | {
    fileName: string;
    existing: { id: string; storage_path: string; file_name: string; descrizione: string | null; importo: number | null; fornitore: string | null; created_at: string | null };
    resolve: (action: "replace" | "skip" | "cancel-all") => void;
    index: number;
    total: number;
  }>(null);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [deletingDupId, setDeletingDupId] = useState<string | null>(null);
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

  // Inline edit fornitore: lista fornitori unici tra polizze (≈ fornitori di polizze in Rubrica)
  const [editingFornitoreId, setEditingFornitoreId] = useState<string | null>(null);
  const { contatti: rubricaContatti } = useRubrica();
  const fornitoreOptions = useMemo(() => {
    const set = new Set<string>();
    // Fornitori dalla Rubrica (tipo fornitore o socio)
    rubricaContatti.forEach((c) => {
      const t = (c.tipo || "").toLowerCase();
      if (t === "fornitore" || t === "socio") {
        const n = (c.denominazione || "").trim();
        if (n) set.add(n);
      }
    });
    // Aggiungi anche i fornitori già presenti nelle polizze (fallback per nomi non ancora in Rubrica)
    polizze.forEach((d) => { const n = (d.fornitore || "").trim(); if (n) set.add(n); });
    return [...set].sort((a, b) => a.localeCompare(b, "it")).map((n) => ({ value: n, label: n }));
  }, [polizze, rubricaContatti]);
  const updateFornitore = useCallback(async (id: string, nuovo: string) => {
    if (!nuovo) return;
    try {
      setEditingFornitoreId(null);
      await updateField(id, "fornitore", nuovo);
      toast.success("Fornitore aggiornato");
    } catch (e: any) {
      toast.error(e?.message || "Errore aggiornamento fornitore");
    }
  }, [updateField]);

  // ── duplicate detection ──
  // Two polizze are considered duplicates when same CIG + same premio (importo)
  // + same scadenza (or, if scadenza missing, same data_documento).
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, DocumentoAcquisto[]>();
    for (const d of polizze) {
      const cig = (d.cig || "").trim().toUpperCase();
      const imp = d.importo != null ? Number(d.importo).toFixed(2) : "";
      const scad = (d.data_scadenza || "").trim() || (d.data_documento || "").trim();
      // Need at least cig OR scadenza OR importo to group meaningfully
      if (!cig && !scad && !imp) continue;
      const key = `${cig}|${imp}|${scad}`;
      const arr = map.get(key);
      if (arr) arr.push(d); else map.set(key, [d]);
    }
    return [...map.values()].filter((g) => g.length > 1);
  }, [polizze]);
  const duplicatesCount = useMemo(
    () => duplicateGroups.reduce((acc, g) => acc + (g.length - 1), 0),
    [duplicateGroups]
  );

  const handleDeleteDup = useCallback(async (doc: DocumentoAcquisto) => {
    if (!confirm(`Eliminare definitivamente "${doc.file_name}"?\nVerrà rimosso anche il PDF dallo storage.`)) return;
    setDeletingDupId(doc.id);
    try {
      await deleteDocumento(doc.id, doc.storage_path);
      toast.success("Duplicato eliminato");
      await refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Errore eliminazione");
    } finally {
      setDeletingDupId(null);
    }
  }, [deleteDocumento, refresh]);

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
          case "tipo_numero": return `${classifyTipoPolizza(d)} ${d.numero || ""}`.toLowerCase();
          case "descrizione": return (d.descrizione || "").toLowerCase();
          case "cig_commessa": return `${d.cig || ""} ${getCommessaNumero(d.cig)}`.toLowerCase();
          case "centro": return (d.centro_costo || "").toLowerCase();
          case "date": return d._date ? d._date.getTime() : (parseIsoOrItDate(d.data_documento)?.getTime() ?? null);
          case "stato": return d._date ? d._days : null;
          case "importi": return d.importo != null ? Number(d.importo) : (d.importo_garantito != null ? Number(d.importo_garantito) : null);
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

  // ── Upload polizze PDFs (multiple) ──
  const handleUploadPolizze = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (list.length === 0) {
      toast.error("Seleziona almeno un file PDF");
      return;
    }
    const cigSet = new Set<string>();
    commesseByCig.forEach((_v, k) => { if (k) cigSet.add(k.toUpperCase()); });

    setUploading(true);
    setUploadProgress({ done: 0, total: list.length });
    let ok = 0, associated = 0, failed = 0, skipped = 0, replaced = 0;
    let cancelAll = false;
    try {
      for (let i = 0; i < list.length; i++) {
        if (cancelAll) { skipped += list.length - i; break; }
        const file = list[i];
        try {
          const text = await extractTextFromPdf(file);
          let prep = await prepareDocumento(file, text);
          if (prep && prep.kind === "duplicate") {
            // Ask the user what to do
            const existing = prep.existing;
            const action = await new Promise<"replace" | "skip" | "cancel-all">((resolve) => {
              setDupPrompt({ fileName: file.name, existing, resolve, index: i + 1, total: list.length });
            });
            setDupPrompt(null);
            if (action === "cancel-all") { cancelAll = true; skipped++; continue; }
            if (action === "skip") { skipped++; setUploadProgress({ done: i + 1, total: list.length }); continue; }
            // replace
            prep = await prepareDocumento(file, text, {
              overwriteExistingId: existing.id,
              overwriteStoragePath: existing.storage_path,
            });
            if (prep && prep.kind === "ready") replaced++;
          }
          if (!prep || prep.kind !== "ready") { failed++; continue; }
          const prepared = prep.prepared;

          // Force tipo_documento = Polizza
          prepared.tipo_documento = "Polizza";

          // Auto-detect CIG against known commesse if missing or invalid
          const currentCig = (prepared.cig || "").trim().toUpperCase();
          if (!currentCig || !cigSet.has(currentCig)) {
            const haystack = `${prepared.descrizione || ""}\n${prepared.fornitore || ""}\n${prepared.ai_summary || ""}\n${text}`;
            const { all, nearKeyword } = extractCigCandidates(haystack);
            const candidates = [...nearKeyword, ...all];
            const match = candidates.find((c) => cigSet.has(c));
            if (match) prepared.cig = match;
          }
          if (prepared.cig && cigSet.has(prepared.cig.toUpperCase())) associated++;

          const saved = await finalizeDocumento(prepared);
          if (saved) ok++; else failed++;
        } catch (e) {
          console.error("Errore upload polizza:", file.name, e);
          failed++;
        }
        setUploadProgress({ done: i + 1, total: list.length });
      }
      const parts = [`${ok}/${list.length} caricate`, `${associated} associate`];
      if (replaced) parts.push(`${replaced} sostituite`);
      if (skipped) parts.push(`${skipped} saltate`);
      if (failed) parts.push(`${failed} errori`);
      toast.success(`Polizze: ${parts.join(" · ")}`);
      await refresh();
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setDupPrompt(null);
      if (polizzaInputRef.current) polizzaInputRef.current.value = "";
    }
  }, [commesseByCig, prepareDocumento, finalizeDocumento, refresh]);

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
                <input
                  ref={polizzaInputRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUploadPolizze(e.target.files)}
                />
                <Button
                  variant="default"
                  size="sm"
                  className={cn(
                    "h-8 text-xs gap-1 transition-all",
                    dragOnButton && "ring-2 ring-primary ring-offset-2 scale-105"
                  )}
                  onClick={() => polizzaInputRef.current?.click()}
                  disabled={uploading}
                  title="Carica o trascina qui uno o più PDF di polizza: verranno letti con AI e associati alla commessa tramite CIG"
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragOnButton(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOnButton(false); } }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    dragCounter.current = 0; setDragOnButton(false);
                    if (uploading) return;
                    const files = e.dataTransfer?.files;
                    if (files && files.length > 0) handleUploadPolizze(files);
                  }}
                >
                  {uploading
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Analisi {uploadProgress?.done ?? 0}/{uploadProgress?.total ?? 0}</>
                    : <><Upload className="h-3.5 w-3.5" />{dragOnButton ? "Rilascia per caricare" : "Carica polizze"}</>}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 text-xs gap-1",
                    duplicatesCount > 0 && "border-amber-500/60 text-amber-700 hover:text-amber-800"
                  )}
                  onClick={() => setDuplicatesOpen(true)}
                  title="Trova polizze duplicate (stesso CIG, premio e scadenza)"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicati
                  {duplicatesCount > 0 && (
                    <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0 h-4">{duplicatesCount}</Badge>
                  )}
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
                    {isVisible("tipo_numero") && <SortableTh col="tipo_numero" label="Tipo / N° polizza" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("descrizione") && <SortableTh col="descrizione" label="Descrizione" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("cig_commessa") && <SortableTh col="cig_commessa" label="CIG / Commessa" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("centro") && <SortableTh col="centro" label="Centro" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("date") && <SortableTh col="date" label="Data doc. / Scadenza" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("stato") && <SortableTh col="stato" label="Stato" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />}
                    {isVisible("importi") && <SortableTh col="importi" label="Premio / Importo garantito" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} align="right" />}
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
                          {isVisible("fornitore") && <TableCell className="text-xs px-2 py-1.5">
                            {editingFornitoreId === d.id ? (
                              <div className="flex items-center gap-1 min-w-[200px]">
                                <Combobox
                                  value={d.fornitore || ""}
                                  onValueChange={(v) => updateFornitore(d.id, v)}
                                  options={fornitoreOptions}
                                  placeholder="Seleziona fornitore"
                                  searchPlaceholder="Cerca fornitore..."
                                  className="h-7"
                                />
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingFornitoreId(null)}>
                                  <XIcon className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingFornitoreId(d.id)}
                                className="inline-flex items-center gap-1 text-left hover:text-primary group"
                                title="Modifica fornitore"
                              >
                                <span>{d.fornitore || "—"}</span>
                                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
                              </button>
                            )}
                          </TableCell>}
                          {isVisible("tipo_numero") && <TableCell className="text-xs px-2 py-1.5">
                            <div className="flex flex-col gap-0.5">
                              <TipoPolizzaBadge tipo={classifyTipoPolizza(d)} />
                              <span className="font-mono">{d.numero || "—"}</span>
                            </div>
                          </TableCell>}
                          {isVisible("descrizione") && <TableCell className="text-xs px-2 py-1.5 max-w-[260px] truncate" title={d.descrizione || ""}>{d.descrizione || "—"}</TableCell>}
                          {isVisible("cig_commessa") && <TableCell className="text-xs px-2 py-1.5 font-mono">
                            <div className="flex flex-col gap-0.5">
                              <EditableCigCell
                                value={d.cig || ""}
                                onSave={async (next) => {
                                  await updateField(d.id, "cig", next);
                                  toast.success("CIG aggiornato");
                                }}
                              />
                              {(() => {
                                const num = getCommessaNumero(d.cig);
                                if (!num) return <span className="text-muted-foreground">—</span>;
                                return <Link to={`/commesse?cig=${d.cig}`} className="text-primary hover:underline">{num}</Link>;
                              })()}
                            </div>
                          </TableCell>}
                          {isVisible("centro") && <TableCell className="text-xs px-2 py-1.5">
                            {d.centro_costo ? (
                              <span className="font-mono">{d.centro_costo}{centroDesc ? <span className="text-muted-foreground"> – {centroDesc}</span> : null}</span>
                            ) : "—"}
                          </TableCell>}
                          {isVisible("date") && <TableCell className="text-xs px-2 py-1.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-muted-foreground text-[10px]">Doc: {d.data_documento || "—"}</span>
                              <ScadenzaCell value={d._date} onChange={(date) => handleManualDate(d.id, date)} />
                            </div>
                          </TableCell>}
                          {isVisible("stato") && <TableCell className="text-xs px-2 py-1.5"><StatoLabel date={d._date} /></TableCell>}
                          {isVisible("importi") && <TableCell className="text-xs px-2 py-1.5 text-right font-mono">
                            <div className="flex flex-col gap-0.5 items-end">
                              <span>{d.importo != null ? formatCurrency(d.importo) : "—"}</span>
                              <span className="text-muted-foreground text-[10px]">Gar: {(d as any).importo_garantito != null ? formatCurrency((d as any).importo_garantito) : "—"}</span>
                            </div>
                          </TableCell>}
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

      {/* Duplicate detector dialog */}
      <Dialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-primary" />
              Polizze duplicate
            </DialogTitle>
            <DialogDescription className="text-xs">
              Polizze raggruppate per <strong>CIG + premio + scadenza</strong> identici.
              Elimina i doppioni mantenendo una sola copia per gruppo.
            </DialogDescription>
          </DialogHeader>
          {duplicateGroups.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-primary/60" />
              Nessun duplicato rilevato. 🎉
            </div>
          ) : (
            <div className="space-y-4">
              {duplicateGroups.map((group, gi) => {
                const first = group[0];
                return (
                  <div key={gi} className="rounded-md border bg-muted/20">
                    <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between gap-2">
                      <div className="text-xs">
                        <span className="font-semibold">{group.length} copie</span>
                        {first.cig && <> · CIG <span className="font-mono">{first.cig}</span></>}
                        {first.importo != null && <> · Premio <span className="font-mono">{formatCurrency(first.importo)}</span></>}
                        {first.data_scadenza && <> · Scad. <span className="font-mono">{first.data_scadenza}</span></>}
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="h-7">
                          <TableHead className="text-[11px] h-7 px-2">File</TableHead>
                          <TableHead className="text-[11px] h-7 px-2">Fornitore</TableHead>
                          <TableHead className="text-[11px] h-7 px-2">Descrizione</TableHead>
                          <TableHead className="text-[11px] h-7 px-2">Caricato il</TableHead>
                          <TableHead className="text-[11px] h-7 px-2 w-[90px]">Azioni</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.map((d, idx) => (
                          <TableRow key={d.id} className={cn("h-8", idx === 0 && "bg-primary/5")}>
                            <TableCell className="text-xs px-2 py-1 font-mono truncate max-w-[280px]" title={d.file_name}>
                              {idx === 0 && <Badge variant="secondary" className="text-[9px] mr-1">tieni</Badge>}
                              {d.file_name}
                            </TableCell>
                            <TableCell className="text-xs px-2 py-1">{d.fornitore || "—"}</TableCell>
                            <TableCell className="text-xs px-2 py-1 truncate max-w-[200px]" title={d.descrizione || ""}>{d.descrizione || "—"}</TableCell>
                            <TableCell className="text-xs px-2 py-1 font-mono text-muted-foreground">
                              {(d as any).created_at ? new Date((d as any).created_at).toLocaleDateString("it-IT") : "—"}
                            </TableCell>
                            <TableCell className="px-2 py-1">
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" className="h-6 w-6" title="Apri PDF" onClick={() => openPdf(d)}>
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Elimina questa copia"
                                  disabled={deletingDupId === d.id}
                                  onClick={() => handleDeleteDup(d)}
                                >
                                  {deletingDupId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate-on-upload prompt */}
      <Dialog open={!!dupPrompt} onOpenChange={(open) => { if (!open && dupPrompt) dupPrompt.resolve("skip"); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-amber-600" />
              Polizza già presente
            </DialogTitle>
            <DialogDescription className="text-xs">
              Il file <span className="font-mono font-semibold">{dupPrompt?.fileName}</span> esiste già in archivio
              {dupPrompt && dupPrompt.total > 1 && <> (file {dupPrompt.index} di {dupPrompt.total})</>}.
              Cosa vuoi fare?
            </DialogDescription>
          </DialogHeader>
          {dupPrompt && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div><span className="text-muted-foreground">Fornitore:</span> {dupPrompt.existing.fornitore || "—"}</div>
              <div><span className="text-muted-foreground">Descrizione:</span> {dupPrompt.existing.descrizione || "—"}</div>
              <div><span className="text-muted-foreground">Importo:</span> {dupPrompt.existing.importo != null ? formatCurrency(dupPrompt.existing.importo) : "—"}</div>
              {dupPrompt.existing.created_at && (
                <div><span className="text-muted-foreground">Caricato il:</span> {new Date(dupPrompt.existing.created_at).toLocaleString("it-IT")}</div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {dupPrompt && dupPrompt.total > 1 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => dupPrompt.resolve("cancel-all")}>
                Annulla tutti
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-xs" onClick={() => dupPrompt?.resolve("skip")}>
              Annulla
            </Button>
            <Button variant="default" size="sm" className="text-xs gap-1" onClick={() => dupPrompt?.resolve("replace")}>
              <Check className="h-3.5 w-3.5" /> Sostituisci
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

function EditableCigCell({ value, onSave }: { value: string; onSave: (next: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = async () => {
    const next = draft.trim().toUpperCase();
    if (next === (value || "").trim().toUpperCase()) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      console.error(e);
      toast.error("Errore aggiornamento CIG");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { e.preventDefault(); setDraft(value); setEditing(false); }
          }}
          disabled={saving}
          maxLength={20}
          className="h-6 px-1 text-xs font-mono w-[120px]"
        />
        <Button size="icon" variant="ghost" className="h-6 w-6" title="Salva" onClick={commit} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-primary" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" title="Annulla" onClick={() => { setDraft(value); setEditing(false); }} disabled={saving}>
          <XIcon className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1">
      {value ? (
        <Link to={`/commesse?cig=${value}`} className="text-primary hover:underline">{value}</Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Modifica CIG"
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}