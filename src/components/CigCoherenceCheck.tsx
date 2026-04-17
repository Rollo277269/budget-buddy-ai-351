import { useState } from "react";
import { ScanSearch, AlertTriangle, Check, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateInvoiceCache } from "@/hooks/useInvoiceData";

// Match 10-char alphanumeric CIG codes (uppercase letters + digits)
const CIG_REGEX = /\b[A-Z0-9]{10}\b/g;

// Tokens commonly present near a CIG in descriptions, used to boost confidence
const NEAR_CIG_KEYWORDS = ["CIG", "C.I.G", "C.I.G.", "C I G"];

interface CoherenceIssue {
  table: "fatture_acquisto" | "fatture_vendita";
  id: string;
  anno: number;
  numero: number;
  label: string;
  cigSalvato: string;
  cigsTrovati: string[]; // candidates extracted from description
  bestCandidate: string; // top suggestion (with NEAR_CIG_KEYWORDS context if possible)
  descrizione: string;
}

function extractCigsFromText(text: string): { all: string[]; nearKeyword: string[] } {
  if (!text) return { all: [], nearKeyword: [] };
  const upper = text.toUpperCase();
  const all = Array.from(new Set(upper.match(CIG_REGEX) || []));
  // Candidates that appear within ~30 chars after a CIG keyword
  const nearKeyword: string[] = [];
  for (const kw of NEAR_CIG_KEYWORDS) {
    const re = new RegExp(`${kw.replace(/\./g, "\\.")}[^A-Z0-9]{0,5}([A-Z0-9]{10})\\b`, "g");
    let m;
    while ((m = re.exec(upper)) !== null) {
      if (!nearKeyword.includes(m[1])) nearKeyword.push(m[1]);
    }
  }
  return { all, nearKeyword };
}

// Filter out CIG-like strings that are clearly not CIGs
function isPlausibleCig(s: string): boolean {
  // Must contain at least one letter AND at least one digit (real CIGs always do)
  if (!/[A-Z]/.test(s) || !/[0-9]/.test(s)) return false;
  // Avoid common false positives like fiscal codes / VAT prefixes
  return true;
}

export function CigCoherenceCheck() {
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<CoherenceIssue[] | null>(null);
  const [fixing, setFixing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const runCheck = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const [{ data: acq }, { data: ven }] = await Promise.all([
        supabase.from("fatture_acquisto").select("id, cig, fornitore, anno, numero, descrizione"),
        supabase.from("fatture_vendita").select("id, cig, cliente, anno, numero, descrizione"),
      ]);

      const found: CoherenceIssue[] = [];

      const process = (
        rows: any[],
        table: "fatture_acquisto" | "fatture_vendita",
        labelField: "fornitore" | "cliente"
      ) => {
        for (const r of rows || []) {
          const cigSalvato = (r.cig || "").trim().toUpperCase();
          const desc = (r.descrizione || "").toString();
          if (!desc) continue;
          const { all, nearKeyword } = extractCigsFromText(desc);
          const candidates = all.filter(isPlausibleCig);
          if (candidates.length === 0) continue;

          // If saved CIG exists in candidates, no discrepancy
          if (cigSalvato && candidates.includes(cigSalvato)) continue;

          // Pick best: prefer nearKeyword matches, otherwise first candidate
          const best = nearKeyword.find(isPlausibleCig) || candidates[0];

          found.push({
            table,
            id: r.id,
            anno: r.anno,
            numero: r.numero,
            label: r[labelField] || "—",
            cigSalvato: cigSalvato || "",
            cigsTrovati: candidates,
            bestCandidate: best,
            descrizione: desc,
          });
        }
      };

      process(acq || [], "fatture_acquisto", "fornitore");
      process(ven || [], "fatture_vendita", "cliente");

      // Sort: most suspicious first (saved CIG present but different)
      found.sort((a, b) => {
        const aHas = a.cigSalvato ? 1 : 0;
        const bHas = b.cigSalvato ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        return `${b.anno}-${b.numero}`.localeCompare(`${a.anno}-${a.numero}`);
      });

      setIssues(found);
      // Pre-select all where saved CIG is present and conflicts (most actionable)
      setSelected(new Set(found.filter((f) => f.cigSalvato).map((f) => `${f.table}-${f.id}`)));

      if (found.length === 0) {
        toast.success("Nessuna discordanza CIG/descrizione rilevata");
      } else {
        toast.warning(`${found.length} fatture con CIG potenzialmente discordante`);
      }
    } catch (e: any) {
      toast.error("Errore durante la verifica: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (!issues) return;
    if (selected.size === issues.length) setSelected(new Set());
    else setSelected(new Set(issues.map((i) => `${i.table}-${i.id}`)));
  };

  const applyFixes = async () => {
    if (!issues) return;
    const toFix = issues.filter((i) => selected.has(`${i.table}-${i.id}`) && i.bestCandidate);
    if (toFix.length === 0) {
      toast.info("Seleziona almeno una riga da correggere");
      return;
    }
    if (!confirm(`Aggiornare il CIG di ${toFix.length} fatture con il valore trovato in descrizione?`)) return;
    setFixing(true);
    try {
      let fixed = 0;
      for (const issue of toFix) {
        const { error } = await supabase
          .from(issue.table)
          .update({ cig: issue.bestCandidate })
          .eq("id", issue.id);
        if (!error) fixed++;
      }
      invalidateInvoiceCache();
      toast.success(`${fixed} CIG aggiornati`);
      setIssues(null);
      await runCheck();
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setFixing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="h-4 w-4" />
          Coerenza CIG ↔ Descrizione
        </CardTitle>
        <CardDescription>
          Confronta il CIG salvato sulla fattura con eventuali codici CIG (10 caratteri alfanumerici)
          presenti nel testo della descrizione/causale, evidenziando le discordanze sospette.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runCheck} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanSearch className="h-4 w-4 mr-2" />}
          Avvia verifica
        </Button>

        {issues !== null && issues.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            Nessuna discordanza rilevata fra CIG salvato e descrizione.
          </div>
        )}

        {issues !== null && issues.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-500" />
                {issues.length} discordanze. {selected.size} selezionate per correzione.
              </p>
              <div className="flex gap-2">
                <Button onClick={toggleAll} variant="outline" size="sm">
                  {selected.size === issues.length ? "Deseleziona tutti" : "Seleziona tutti"}
                </Button>
                <Button onClick={applyFixes} disabled={fixing || selected.size === 0} size="sm">
                  {fixing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Applica ({selected.size})
                </Button>
              </div>
            </div>
            <div className="rounded-md border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[80px]">Tipo</TableHead>
                    <TableHead className="w-[90px]">Fattura</TableHead>
                    <TableHead className="min-w-[140px]">Soggetto</TableHead>
                    <TableHead className="w-[120px]">CIG salvato</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[120px]">CIG da descrizione</TableHead>
                    <TableHead>Descrizione (estratto)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue) => {
                    const key = `${issue.table}-${issue.id}`;
                    const isSel = selected.has(key);
                    const hasConflict = !!issue.cigSalvato;
                    // Show short excerpt around best candidate
                    const upperDesc = issue.descrizione.toUpperCase();
                    const idx = upperDesc.indexOf(issue.bestCandidate);
                    const excerpt = idx >= 0
                      ? "…" + issue.descrizione.slice(Math.max(0, idx - 25), idx + 35) + "…"
                      : issue.descrizione.slice(0, 80) + "…";
                    return (
                      <TableRow
                        key={key}
                        className={`cursor-pointer ${isSel ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}
                        onClick={() => toggleSelect(key)}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(key)}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-pointer"
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {issue.table === "fatture_acquisto" ? "Acq" : "Vend"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {issue.anno}/{issue.numero}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[200px]">{issue.label}</TableCell>
                        <TableCell>
                          {issue.cigSalvato ? (
                            <code
                              className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                                hasConflict
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {issue.cigSalvato}
                            </code>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">vuoto</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <code className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300 font-mono w-fit">
                              {issue.bestCandidate}
                            </code>
                            {issue.cigsTrovati.length > 1 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{issue.cigsTrovati.length - 1} altri
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground max-w-[300px] truncate">
                          {excerpt}
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
