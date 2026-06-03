import { useState } from "react";
import { ScanSearch, AlertTriangle, Check, Loader2, ArrowRight, Trash2, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface XmlIssue {
  id: string;
  tipo: "acquisto" | "vendita";
  expectedTipo: "acquisto" | "vendita";
  anno: number | null;
  numero_documento: string;
  data_fattura: string | null;
  cedente: string;
  cessionario: string;
  importo: number | null;
  file_name: string;
  reason: string;
}

function normalize(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function XmlClassificationCheck() {
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<XmlIssue[] | null>(null);
  const [fixing, setFixing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkFixing, setBulkFixing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selfNames, setSelfNames] = useState<string[]>([]);

  const runCheck = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      // Paginate to bypass 1000 row limit
      const all: any[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("fatture_xml")
          .select("id, tipo, anno, numero_documento, data_fattura, cedente_denominazione, cessionario_denominazione, importo_totale, file_name")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // Determine "self" denomination(s): names that appear as cessionario in acquisto
      // and cedente in vendita XMLs. We pick the most frequent ones.
      const counts: Record<string, { asSelf: number; asOther: number }> = {};
      for (const r of all) {
        const ced = normalize(r.cedente_denominazione);
        const ces = normalize(r.cessionario_denominazione);
        if (r.tipo === "acquisto") {
          if (ces) (counts[ces] ||= { asSelf: 0, asOther: 0 }).asSelf++;
          if (ced) (counts[ced] ||= { asSelf: 0, asOther: 0 }).asOther++;
        } else if (r.tipo === "vendita") {
          if (ced) (counts[ced] ||= { asSelf: 0, asOther: 0 }).asSelf++;
          if (ces) (counts[ces] ||= { asSelf: 0, asOther: 0 }).asOther++;
        }
      }
      // A name is "self" if it appears strongly as self and rarely (or never)
      // as the counterparty side relative to its self count.
      const candidates = Object.entries(counts)
        .filter(([, c]) => c.asSelf >= 3 && c.asSelf > c.asOther * 3)
        .sort((a, b) => b[1].asSelf - a[1].asSelf)
        .map(([n]) => n);
      const self = new Set(candidates.slice(0, 3)); // tolerate up to 3 self spellings
      setSelfNames(Array.from(self));

      if (self.size === 0) {
        toast.warning("Impossibile determinare la denominazione aziendale: troppe poche fatture XML caricate.");
        setIssues([]);
        return;
      }

      const found: XmlIssue[] = [];
      for (const r of all) {
        const ced = normalize(r.cedente_denominazione);
        const ces = normalize(r.cessionario_denominazione);
        if (!ced && !ces) continue;

        if (r.tipo === "acquisto") {
          // Acquisto: cedente = fornitore (NON self), cessionario = self
          if (ced && self.has(ced)) {
            found.push({
              id: r.id,
              tipo: "acquisto",
              expectedTipo: "vendita",
              anno: r.anno,
              numero_documento: r.numero_documento || "",
              data_fattura: r.data_fattura,
              cedente: r.cedente_denominazione || "",
              cessionario: r.cessionario_denominazione || "",
              importo: r.importo_totale,
              file_name: r.file_name,
              reason: "Caricato come acquisto ma il cedente è l'azienda stessa",
            });
          }
        } else if (r.tipo === "vendita") {
          // Vendita: cedente = self, cessionario = cliente (NON self)
          if (ces && self.has(ces) && ced && !self.has(ced)) {
            found.push({
              id: r.id,
              tipo: "vendita",
              expectedTipo: "acquisto",
              anno: r.anno,
              numero_documento: r.numero_documento || "",
              data_fattura: r.data_fattura,
              cedente: r.cedente_denominazione || "",
              cessionario: r.cessionario_denominazione || "",
              importo: r.importo_totale,
              file_name: r.file_name,
              reason: "Caricato come vendita ma il cessionario è l'azienda stessa",
            });
          }
        }
      }

      found.sort((a, b) => (b.data_fattura || "").localeCompare(a.data_fattura || ""));
      setIssues(found);
      setSelected(new Set(found.map((f) => f.id)));
      if (found.length === 0) toast.success("Nessun XML con classificazione errata");
      else toast.warning(`${found.length} XML con classificazione potenzialmente errata`);
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () => {
    if (!issues) return;
    if (selected.size === issues.length) setSelected(new Set());
    else setSelected(new Set(issues.map((i) => i.id)));
  };

  const applyReclassify = async () => {
    if (!issues) return;
    const toFix = issues.filter((i) => selected.has(i.id));
    if (toFix.length === 0) return toast.info("Seleziona almeno una riga");
    if (!confirm(`Riclassificare ${toFix.length} XML invertendo acquisto/vendita?`)) return;
    setFixing(true);
    try {
      let fixed = 0;
      for (const i of toFix) {
        const { error } = await supabase
          .from("fatture_xml")
          .update({ tipo: i.expectedTipo })
          .eq("id", i.id);
        if (!error) fixed++;
      }
      toast.success(`${fixed} XML riclassificati`);
      await runCheck();
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setFixing(false);
    }
  };

  // Bulk reclassify ALL flagged issues in one shot, batched per target tipo.
  const applyReclassifyAll = async () => {
    if (!issues || issues.length === 0) return;
    const toAcq = issues.filter((i) => i.expectedTipo === "acquisto").map((i) => i.id);
    const toVen = issues.filter((i) => i.expectedTipo === "vendita").map((i) => i.id);
    const msg = [
      toVen.length ? `${toVen.length} → vendita` : "",
      toAcq.length ? `${toAcq.length} → acquisto` : "",
    ].filter(Boolean).join("  •  ");
    if (!confirm(`Riclassificare in massa tutti i ${issues.length} XML segnalati?\n${msg}`)) return;
    setBulkFixing(true);
    try {
      let fixed = 0;
      // Update in chunks to avoid huge `in()` lists.
      const chunk = 200;
      const update = async (ids: string[], tipo: "acquisto" | "vendita") => {
        for (let i = 0; i < ids.length; i += chunk) {
          const slice = ids.slice(i, i + chunk);
          const { error } = await supabase
            .from("fatture_xml")
            .update({ tipo, matched: false })
            .in("id", slice);
          if (error) throw error;
          fixed += slice.length;
        }
      };
      if (toVen.length) await update(toVen, "vendita");
      if (toAcq.length) await update(toAcq, "acquisto");
      toast.success(`${fixed} XML riclassificati`);
      await runCheck();
    } catch (e: any) {
      toast.error("Errore durante la riclassificazione: " + e.message);
    } finally {
      setBulkFixing(false);
    }
  };

  const applyDelete = async () => {
    if (!issues) return;
    const toDel = issues.filter((i) => selected.has(i.id));
    if (toDel.length === 0) return toast.info("Seleziona almeno una riga");
    if (!confirm(`Eliminare ${toDel.length} XML errati? (irreversibile)`)) return;
    setDeleting(true);
    try {
      const ids = toDel.map((i) => i.id);
      const { error } = await supabase.from("fatture_xml").delete().in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} XML eliminati`);
      await runCheck();
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="h-4 w-4" />
          Coerenza Classificazione XML
        </CardTitle>
        <CardDescription>
          Confronta il tipo documento (acquisto/vendita) con cedente e cessionario per individuare
          XML caricati nella sezione sbagliata (es. fatture di vendita finite tra gli acquisti).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={runCheck} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanSearch className="h-4 w-4 mr-2" />}
            Avvia verifica
          </Button>
          {issues !== null && issues.length > 0 && (
            <Button onClick={applyReclassifyAll} disabled={bulkFixing} size="sm">
              {bulkFixing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Riclassifica tutti ({issues.length})
            </Button>
          )}
          {issues !== null && issues.length > 0 && (
            <Button
              onClick={applyDelete}
              disabled={deleting || selected.size === 0}
              size="sm"
              variant="destructive"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Elimina selezionati ({selected.size})
            </Button>
          )}
          {selfNames.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Azienda riconosciuta:&nbsp;
              {selfNames.map((n) => (
                <code key={n} className="px-1.5 py-0.5 rounded bg-muted font-mono mr-1">{n}</code>
              ))}
            </div>
          )}
        </div>

        {issues !== null && issues.length > 0 && (() => {
          const toVen = issues.filter((i) => i.expectedTipo === "vendita").length;
          const toAcq = issues.filter((i) => i.expectedTipo === "acquisto").length;
          return (
            <div className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/30">
              Anteprima riclassificazione:&nbsp;
              {toVen > 0 && <><strong>{toVen}</strong> XML da Acquisto → Vendita</>}
              {toVen > 0 && toAcq > 0 && <>&nbsp;·&nbsp;</>}
              {toAcq > 0 && <><strong>{toAcq}</strong> XML da Vendita → Acquisto</>}
            </div>
          );
        })()}

        {issues !== null && issues.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Check className="h-4 w-4" /> Nessuna anomalia rilevata.
          </div>
        )}

        {issues !== null && issues.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 inline mr-1 text-destructive" />
                {issues.length} anomalie. {selected.size} selezionate.
              </p>
              <div className="flex gap-2">
                <Button onClick={toggleAll} variant="outline" size="sm">
                  {selected.size === issues.length ? "Deseleziona tutti" : "Seleziona tutti"}
                </Button>
                <Button onClick={applyReclassify} disabled={fixing || selected.size === 0} size="sm">
                  {fixing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Riclassifica ({selected.size})
                </Button>
                <Button
                  onClick={applyDelete}
                  disabled={deleting || selected.size === 0}
                  size="sm"
                  variant="destructive"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Elimina ({selected.size})
                </Button>
              </div>
            </div>
            <div className="rounded-md border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[80px]">Attuale</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[80px]">Atteso</TableHead>
                    <TableHead className="w-[110px]">Numero</TableHead>
                    <TableHead className="w-[100px]">Data</TableHead>
                    <TableHead className="min-w-[180px]">Cedente</TableHead>
                    <TableHead className="min-w-[180px]">Cessionario</TableHead>
                    <TableHead className="w-[110px] text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((i) => {
                    const isSel = selected.has(i.id);
                    return (
                      <TableRow
                        key={i.id}
                        className={`cursor-pointer ${isSel ? "bg-accent/40" : ""}`}
                        onClick={() => toggleSelect(i.id)}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(i.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-[10px]">
                            {i.tipo === "acquisto" ? "Acq" : "Vend"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {i.expectedTipo === "acquisto" ? "Acq" : "Vend"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{i.numero_documento || "—"}</TableCell>
                        <TableCell className="text-xs">{i.data_fattura || "—"}</TableCell>
                        <TableCell className="text-xs truncate max-w-[240px]" title={i.cedente}>
                          {i.cedente || "—"}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[240px]" title={i.cessionario}>
                          {i.cessionario || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {typeof i.importo === "number"
                            ? i.importo.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}