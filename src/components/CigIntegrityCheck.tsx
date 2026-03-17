import { useState } from "react";
import { ShieldCheck, AlertTriangle, Check, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CigIssue {
  table: "fatture_acquisto" | "fatture_vendita";
  id: string;
  cig: string;
  length: number;
  label: string; // fornitore or cliente
  anno: number;
  numero: number;
  suggestions: string[]; // similar 10-char CIGs
  fix: string; // user-chosen fix value
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

export function CigIntegrityCheck() {
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<CigIssue[] | null>(null);
  const [fixing, setFixing] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    try {
      // Load all CIGs from both tables
      const [{ data: acq }, { data: ven }] = await Promise.all([
        supabase.from("fatture_acquisto").select("id, cig, fornitore, anno, numero"),
        supabase.from("fatture_vendita").select("id, cig, cliente, anno, numero"),
      ]);

      // Collect all valid 10-char CIGs as reference
      const validCigs = new Set<string>();
      for (const r of [...(acq || []), ...(ven || [])]) {
        const c = r.cig?.trim();
        if (c && c.length === 10) validCigs.add(c.toUpperCase());
      }
      const validArr = Array.from(validCigs);

      const found: CigIssue[] = [];

      // Check purchases
      for (const r of acq || []) {
        const c = r.cig?.trim();
        if (!c || c.length === 10) continue;
        const upper = c.toUpperCase();
        const suggestions = validArr
          .filter((v) => levenshtein(upper, v) <= 2)
          .sort((a, b) => levenshtein(upper, a) - levenshtein(upper, b))
          .slice(0, 5);
        found.push({
          table: "fatture_acquisto",
          id: r.id,
          cig: c,
          length: c.length,
          label: r.fornitore || "—",
          anno: r.anno,
          numero: r.numero,
          suggestions,
          fix: suggestions[0] || "",
        });
      }

      // Check sales
      for (const r of ven || []) {
        const c = r.cig?.trim();
        if (!c || c.length === 10) continue;
        const upper = c.toUpperCase();
        const suggestions = validArr
          .filter((v) => levenshtein(upper, v) <= 2)
          .sort((a, b) => levenshtein(upper, a) - levenshtein(upper, b))
          .slice(0, 5);
        found.push({
          table: "fatture_vendita",
          id: r.id,
          cig: c,
          length: c.length,
          label: r.cliente || "—",
          anno: r.anno,
          numero: r.numero,
          suggestions,
          fix: suggestions[0] || "",
        });
      }

      setIssues(found);
      if (found.length === 0) {
        toast.success("Tutti i CIG sono validi (10 caratteri)");
      } else {
        toast.warning(`Trovati ${found.length} CIG anomali`);
      }
    } catch (e: any) {
      toast.error("Errore durante la verifica: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateFix = (idx: number, value: string) => {
    setIssues((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], fix: value };
      return next;
    });
  };

  const removeIssue = (idx: number) => {
    setIssues((prev) => prev ? prev.filter((_, i) => i !== idx) : prev);
  };

  const applyFixes = async () => {
    if (!issues) return;
    const toFix = issues.filter((i) => i.fix.trim().length > 0);
    if (toFix.length === 0) {
      toast.info("Nessuna correzione da applicare");
      return;
    }
    setFixing(true);
    try {
      let fixed = 0;
      for (const issue of toFix) {
        const { error } = await supabase
          .from(issue.table)
          .update({ cig: issue.fix.trim().toUpperCase() })
          .eq("id", issue.id);
        if (!error) fixed++;
      }
      toast.success(`${fixed} CIG corretti con successo`);
      // Re-run check
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
          <ShieldCheck className="h-4 w-4" />
          Verifica integrità CIG
        </CardTitle>
        <CardDescription>
          Controlla che tutti i codici CIG abbiano 10 caratteri e suggerisce correzioni per quelli anomali.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runCheck} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          Avvia verifica
        </Button>

        {issues !== null && issues.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            Tutti i CIG sono corretti (10 caratteri).
          </div>
        )}

        {issues !== null && issues.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-500" />
                {issues.length} CIG anomali trovati. Modifica il valore corretto e applica.
              </p>
              <Button onClick={applyFixes} disabled={fixing} size="sm">
                {fixing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Applica correzioni
              </Button>
            </div>
            <div className="rounded-md border overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Tabella</TableHead>
                    <TableHead>Fattura</TableHead>
                    <TableHead>Soggetto</TableHead>
                    <TableHead>CIG attuale</TableHead>
                    <TableHead className="w-[50px]">Len</TableHead>
                    <TableHead>Suggerimenti</TableHead>
                    <TableHead>Correzione</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue, idx) => (
                    <TableRow key={`${issue.table}-${issue.id}`}>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {issue.table === "fatture_acquisto" ? "Acquisto" : "Vendita"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {issue.anno}/{issue.numero}
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">
                        {issue.label}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-destructive/10 text-destructive px-1 py-0.5 rounded">
                          {issue.cig}
                        </code>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={issue.length === 10 ? "default" : "destructive"} className="text-[10px]">
                          {issue.length}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {issue.suggestions.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">nessuno</span>
                          )}
                          {issue.suggestions.map((s) => (
                            <button
                              key={s}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                              onClick={() => updateFix(idx, s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 text-xs font-mono w-[120px]"
                          value={issue.fix}
                          onChange={(e) => updateFix(idx, e.target.value)}
                          maxLength={10}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeIssue(idx)}
                          title="Ignora"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
