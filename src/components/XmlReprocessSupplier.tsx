import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { findPurchaseMatch } from "@/hooks/useXmlInvoices";
import { parseFatturaPA } from "@/lib/fatturaPA";

interface SupplierRow { name: string; xmlCount: number; pdfCount: number; }
interface LogLine { kind: "info" | "ok" | "warn" | "err"; text: string; }

function isXmlNC(td?: string) {
  return (td || "").toUpperCase() === "TD04";
}

export function XmlReprocessSupplier() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [log, setLog] = useState<LogLine[]>([]);

  const pushLog = (line: LogLine) => setLog((prev) => [...prev, line]);

  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        // Aggregate XML acquisto suppliers
        const xmlCounts = new Map<string, number>();
        let from = 0;
        const PAGE = 1000;
        while (true) {
          const { data, error } = await supabase
            .from("fatture_xml" as any)
            .select("cedente_denominazione")
            .eq("tipo", "acquisto")
            .range(from, from + PAGE - 1);
          if (error || !data || data.length === 0) break;
          for (const r of data as any[]) {
            const n = (r.cedente_denominazione || "").trim();
            if (!n) continue;
            xmlCounts.set(n, (xmlCounts.get(n) || 0) + 1);
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
        // Aggregate PDF (documenti_acquisto) suppliers
        const pdfCounts = new Map<string, number>();
        from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("documenti_acquisto" as any)
            .select("fornitore")
            .eq("tipo", "acquisto")
            .range(from, from + PAGE - 1);
          if (error || !data || data.length === 0) break;
          for (const r of data as any[]) {
            const n = (r.fornitore || "").trim();
            if (!n) continue;
            pdfCounts.set(n, (pdfCounts.get(n) || 0) + 1);
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
        const all = new Set<string>([...xmlCounts.keys(), ...pdfCounts.keys()]);
        const rows: SupplierRow[] = Array.from(all).map((n) => ({
          name: n,
          xmlCount: xmlCounts.get(n) || 0,
          pdfCount: pdfCounts.get(n) || 0,
        }));
        rows.sort((a, b) => (b.xmlCount + b.pdfCount) - (a.xmlCount + a.pdfCount));
        setSuppliers(rows);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  const options = useMemo(
    () => suppliers.map((s) => ({
      value: s.name,
      label: `${s.name}  ·  ${s.xmlCount} XML / ${s.pdfCount} PDF`,
    })),
    [suppliers]
  );

  const selectedRow = suppliers.find((s) => s.name === selected);

  /** Re-process all XML acquisto for the selected supplier. */
  const runReprocess = async () => {
    if (!selected) return;
    setRunning(true);
    setLog([]);
    setProgress({ done: 0, total: 0 });
    try {
      // 1) Load all XML records for this supplier (including parsed_data + storage)
      const xmlRows: any[] = [];
      let from = 0;
      const PAGE = 500;
      while (true) {
        const { data, error } = await supabase
          .from("fatture_xml" as any)
          .select("id, file_name, storage_path, anno, numero, invoice_key, cedente_denominazione, data_fattura, importo_totale, parsed_data, matched, numero_documento")
          .eq("tipo", "acquisto")
          .eq("cedente_denominazione", selected)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        xmlRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      pushLog({ kind: "info", text: `Trovati ${xmlRows.length} XML del fornitore "${selected}"` });
      setProgress({ done: 0, total: xmlRows.length });

      if (xmlRows.length === 0) {
        toast.info("Nessun XML da rielaborare");
        return;
      }

      // 2) Load all fatture_acquisto rows (for matching)
      const allInvoices: any[] = [];
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("fatture_acquisto")
          .select("anno, numero, totale, fornitore, cig, tipo")
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allInvoices.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }

      // Keys already used by OTHER xml records (not the ones we're reprocessing)
      const reprocessIds = new Set(xmlRows.map((r) => r.id));
      const externallyMatched = new Set<string>();
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("fatture_xml" as any)
          .select("id, invoice_key, matched")
          .eq("tipo", "acquisto")
          .eq("matched", true)
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const r of data as any[]) {
          if (!reprocessIds.has(r.id) && r.invoice_key) externallyMatched.add(r.invoice_key);
        }
        if (data.length < 1000) break;
        from += 1000;
      }

      let rematched = 0;
      let unchanged = 0;
      let created = 0;
      let errors = 0;

      for (let i = 0; i < xmlRows.length; i++) {
        const x = xmlRows[i];
        setProgress({ done: i, total: xmlRows.length });
        try {
          // Ensure we have parsed data; re-parse from storage if missing
          let parsed: any = x.parsed_data;
          if (!parsed || !parsed.cedente) {
            const { data: dl, error: dlErr } = await supabase.storage
              .from("fatture-xml")
              .download(x.storage_path);
            if (dlErr || !dl) {
              pushLog({ kind: "warn", text: `${x.file_name}: impossibile scaricare XML` });
              errors++;
              continue;
            }
            const txt = await dl.text();
            const p = parseFatturaPA(txt);
            const { rawXml, ...rest } = p;
            parsed = rest;
          }

          const xmlAnno = x.anno || (parsed.data ? parseInt(String(parsed.data).split("-")[0] || String(parsed.data).split("/")[2] || "0") : null);
          const xmlImporto = x.importo_totale || parsed.importoTotale || null;
          const cig = parsed.cig || null;
          const numeroDoc = x.numero_documento || parsed.numero || null;

          const match = findPurchaseMatch(
            selected,
            xmlImporto,
            xmlAnno,
            numeroDoc,
            cig,
            allInvoices.map((inv) => ({
              anno: inv.anno,
              numero: inv.numero,
              totale: inv.totale,
              fornitore: inv.fornitore,
              cig: inv.cig,
              tipo: inv.tipo,
            })),
            externallyMatched
          );

          if (match) {
            const newKey = `${match.anno}-${match.numero}`;
            externallyMatched.add(newKey);
            if (x.invoice_key === newKey && x.matched) {
              unchanged++;
              pushLog({ kind: "info", text: `${x.file_name}: già associato a ${match.numero}/${match.anno}` });
            } else {
              await supabase
                .from("fatture_xml" as any)
                .update({ invoice_key: newKey, anno: match.anno, numero: match.numero, matched: true } as any)
                .eq("id", x.id);
              if (cig) {
                await supabase
                  .from("fatture_acquisto")
                  .update({ cig } as any)
                  .eq("anno", match.anno)
                  .eq("numero", match.numero)
                  .or("cig.is.null,cig.eq.");
              }
              rematched++;
              pushLog({ kind: "ok", text: `${x.file_name}: riassociato a ${match.numero}/${match.anno} (${xmlImporto?.toFixed(2)} €)` });
            }
          } else if (xmlAnno) {
            // Auto-create a new fattura_acquisto from the XML
            const { data: maxRow } = await supabase
              .from("fatture_acquisto")
              .select("numero")
              .eq("anno", xmlAnno)
              .order("numero", { ascending: false })
              .limit(1);
            const nextNumero = ((maxRow?.[0] as any)?.numero || 0) + 1;
            const imponibileTot = (parsed.riepilogoIVA || []).reduce((s: number, r: any) => s + (r.imponibile || 0), 0);
            const impostaTot = (parsed.riepilogoIVA || []).reduce((s: number, r: any) => s + (r.imposta || 0), 0);
            const isNC = isXmlNC(parsed.tipoDocumento);
            const descrizione = (parsed.linee || []).map((l: any) => l.descrizione).filter(Boolean).slice(0, 3).join(" | ");
            const scadenza = (parsed.pagamenti && parsed.pagamenti[0]?.dataScadenza) || "";
            const segno = isNC ? -1 : 1;
            const { error: insErr } = await supabase
              .from("fatture_acquisto")
              .insert({
                anno: xmlAnno,
                numero: nextNumero,
                data: parsed.data || "",
                fornitore: parsed.cedente?.denominazione || selected,
                partita_iva: parsed.cedente?.partitaIva || "",
                totale: segno * (parsed.importoTotale || 0),
                imponibile: segno * imponibileTot,
                imposta: segno * impostaTot,
                descrizione,
                cig: parsed.cig || "",
                cup: "",
                stato: "Auto da XML",
                scadenza,
                pagamento: parsed.pagamenti?.[0]?.modalita || "",
                tipo: isNC ? "Nota di credito" : "Fattura",
                righe: (parsed.linee || []) as any,
              } as any);
            if (insErr) {
              pushLog({ kind: "err", text: `${x.file_name}: errore creazione fattura — ${insErr.message}` });
              errors++;
              continue;
            }
            const newKey = `${xmlAnno}-${nextNumero}`;
            externallyMatched.add(newKey);
            allInvoices.push({
              anno: xmlAnno, numero: nextNumero,
              totale: segno * (parsed.importoTotale || 0),
              fornitore: parsed.cedente?.denominazione || selected,
              cig: parsed.cig || "", tipo: isNC ? "Nota di credito" : "Fattura",
            });
            await supabase
              .from("fatture_xml" as any)
              .update({ invoice_key: newKey, anno: xmlAnno, numero: nextNumero, matched: true } as any)
              .eq("id", x.id);
            created++;
            pushLog({ kind: "ok", text: `${x.file_name}: creata nuova fattura ${nextNumero}/${xmlAnno} (${parsed.importoTotale?.toFixed(2)} €)` });
          } else {
            pushLog({ kind: "warn", text: `${x.file_name}: anno mancante, saltato` });
            errors++;
          }
        } catch (e: any) {
          pushLog({ kind: "err", text: `${x.file_name}: ${e?.message || "errore"}` });
          errors++;
        }
      }
      setProgress({ done: xmlRows.length, total: xmlRows.length });
      const summary = `Rielaborazione completata: ${rematched} riassociati, ${created} create, ${unchanged} invariati${errors ? `, ${errors} errori` : ""}`;
      pushLog({ kind: "ok", text: summary });
      toast.success(summary);
    } catch (e: any) {
      pushLog({ kind: "err", text: `Errore generale: ${e?.message || e}` });
      toast.error(`Errore: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rielabora XML per fornitore</CardTitle>
        <CardDescription className="text-xs">
          Riapplica l'algoritmo di associazione XML → fattura per tutti i documenti di un fornitore specifico.
          Gli XML già correttamente associati restano invariati; quelli orfani vengono riassociati o, se non c'è match per importo,
          creano una nuova fattura di acquisto. Utile dopo correzioni manuali o per ripristinare abbinamenti errati.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <label className="text-xs text-muted-foreground mb-1 block">Fornitore</label>
            <Combobox
              options={options}
              value={selected}
              onChange={setSelected}
              placeholder={loadingList ? "Caricamento fornitori..." : "Cerca fornitore..."}
              disabled={loadingList || running}
            />
          </div>
          <Button onClick={runReprocess} disabled={!selected || running} size="sm">
            {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />}
            Rielabora
          </Button>
        </div>

        {selectedRow && !running && (
          <div className="flex gap-2 text-xs">
            <Badge variant="secondary">{selectedRow.xmlCount} XML</Badge>
            <Badge variant="outline">{selectedRow.pdfCount} PDF (documenti spese)</Badge>
          </div>
        )}

        {progress.total > 0 && (
          <div className="space-y-1">
            <Progress value={(progress.done / progress.total) * 100} className="h-2" />
            <div className="text-xs text-muted-foreground">{progress.done} / {progress.total}</div>
          </div>
        )}

        {log.length > 0 && (
          <div className="border rounded-md max-h-72 overflow-auto bg-muted/30 p-2 text-xs font-mono space-y-0.5">
            {log.map((l, i) => (
              <div
                key={i}
                className={
                  l.kind === "ok" ? "text-green-700 dark:text-green-400" :
                  l.kind === "warn" ? "text-yellow-700 dark:text-yellow-400" :
                  l.kind === "err" ? "text-destructive" : "text-foreground/80"
                }
              >
                {l.text}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}