import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { idbClearAll, idbMeta, CACHE_KEYS } from "@/lib/idbCache";
import { toast } from "sonner";

interface VitalRow {
  id: string;
  metric_name: string;
  value: number;
  rating: string;
  pathname: string;
  session_id: string;
  navigation_type: string;
  created_at: string;
}

const METRICS = ["LCP", "FCP", "TTFB", "INP", "CLS"] as const;
type MetricName = (typeof METRICS)[number];

// Recommended thresholds from web.dev
const THRESHOLDS: Record<MetricName, { good: number; poor: number; unit: string }> = {
  LCP: { good: 2500, poor: 4000, unit: "ms" },
  FCP: { good: 1800, poor: 3000, unit: "ms" },
  TTFB: { good: 800, poor: 1800, unit: "ms" },
  INP: { good: 200, poor: 500, unit: "ms" },
  CLS: { good: 0.1, poor: 0.25, unit: "" },
};

function formatValue(name: string, v: number): string {
  if (name === "CLS") return v.toFixed(3);
  return `${Math.round(v)} ms`;
}

function ratingColor(rating: string): string {
  if (rating === "good") return "bg-green-600 text-white";
  if (rating === "needs-improvement") return "bg-yellow-500 text-black";
  if (rating === "poor") return "bg-red-600 text-white";
  return "bg-muted text-foreground";
}

export default function DiagnosticaPage() {
  const [rows, setRows] = useState<VitalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheInfo, setCacheInfo] = useState<{ key: string; updatedAt: number | null }[]>([]);

  const loadCacheInfo = async () => {
    const entries = await Promise.all(
      Object.values(CACHE_KEYS).map(async (k) => {
        const m = await idbMeta(k);
        return { key: k, updatedAt: m?.updatedAt ?? null };
      })
    );
    setCacheInfo(entries);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("web_vitals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (!error && data) setRows(data as VitalRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadCacheInfo(); }, []);

  const clearLocalCache = async () => {
    if (!confirm("Svuotare la cache locale (IndexedDB)? L'app ricaricherà i dati dal database.")) return;
    await idbClearAll();
    toast.success("Cache locale svuotata. Ricarica la pagina per ripopolarla.");
    loadCacheInfo();
  };

  const purge = async () => {
    if (!confirm("Cancellare tutte le metriche raccolte?")) return;
    const { error } = await supabase.from("web_vitals").delete().not("id", "is", null);
    if (!error) load();
  };

  // KPI per metrica: media, p75, conteggio
  const kpiByMetric = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of rows) {
      if (!map.has(r.metric_name)) map.set(r.metric_name, []);
      map.get(r.metric_name)!.push(Number(r.value));
    }
    const out: Record<string, { avg: number; p75: number; count: number }> = {};
    for (const [name, vals] of map.entries()) {
      const sorted = [...vals].sort((a, b) => a - b);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1] ?? 0;
      out[name] = { avg, p75, count: vals.length };
    }
    return out;
  }, [rows]);

  // Tabella: media per pagina + metrica
  const byPage = useMemo(() => {
    const map = new Map<string, Record<string, { sum: number; n: number }>>();
    for (const r of rows) {
      if (!map.has(r.pathname)) map.set(r.pathname, {});
      const bucket = map.get(r.pathname)!;
      if (!bucket[r.metric_name]) bucket[r.metric_name] = { sum: 0, n: 0 };
      bucket[r.metric_name].sum += Number(r.value);
      bucket[r.metric_name].n += 1;
    }
    return Array.from(map.entries())
      .map(([path, metrics]) => ({ path, metrics }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [rows]);

  const recent = rows.slice(0, 30);

  return (
    <div className="p-6 space-y-6 bg-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            Misurazione automatica delle metriche di performance reali (Core Web Vitals) dell'utente.
            Le soglie seguono gli standard di Google web.dev.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Aggiorna
          </Button>
          <Button variant="outline" size="sm" onClick={purge}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Svuota
          </Button>
          <Button variant="outline" size="sm" onClick={clearLocalCache}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Svuota cache locale
          </Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="text-xs font-semibold mb-2">Cache locale (IndexedDB)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {cacheInfo.map((c) => (
            <div key={c.key} className="flex items-center justify-between border rounded px-2 py-1">
              <span className="font-medium">{c.key}</span>
              <span className="text-muted-foreground">
                {c.updatedAt ? new Date(c.updatedAt).toLocaleString("it-IT") : "—"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Caricamento metriche…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Nessuna metrica registrata. Naviga qualche pagina e ricarica.
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {METRICS.map((m) => {
              const k = kpiByMetric[m];
              const t = THRESHOLDS[m];
              if (!k) {
                return (
                  <Card key={m} className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m}</div>
                    <div className="text-2xl font-semibold mt-1 text-muted-foreground">—</div>
                    <div className="text-[10px] text-muted-foreground mt-1">nessun dato</div>
                  </Card>
                );
              }
              const rating = k.p75 <= t.good ? "good" : k.p75 <= t.poor ? "needs-improvement" : "poor";
              return (
                <Card key={m} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m}</div>
                    <Badge className={`text-[9px] ${ratingColor(rating)} border-transparent`}>{rating}</Badge>
                  </div>
                  <div className="text-2xl font-semibold mt-1">{formatValue(m, k.p75)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    p75 · media {formatValue(m, k.avg)} · {k.count} campioni
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    soglia good ≤ {m === "CLS" ? t.good : `${t.good} ms`}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Per-page table */}
          <Card className="p-3">
            <div className="text-xs font-semibold mb-2">Media per pagina</div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-1 font-medium">Pagina</th>
                    {METRICS.map((m) => (
                      <th key={m} className="px-2 py-1 font-medium text-right">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byPage.map((row) => (
                    <tr key={row.path} className="border-b last:border-0">
                      <td className="px-2 py-1 font-mono text-[11px]">{row.path}</td>
                      {METRICS.map((m) => {
                        const v = row.metrics[m];
                        if (!v) return <td key={m} className="px-2 py-1 text-right text-muted-foreground">—</td>;
                        const avg = v.sum / v.n;
                        const t = THRESHOLDS[m];
                        const rating = avg <= t.good ? "good" : avg <= t.poor ? "needs-improvement" : "poor";
                        const color = rating === "good" ? "text-green-600 dark:text-green-400"
                          : rating === "needs-improvement" ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400";
                        return (
                          <td key={m} className={`px-2 py-1 text-right tabular-nums ${color}`}>
                            {formatValue(m, avg)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Recent samples */}
          <Card className="p-3">
            <div className="text-xs font-semibold mb-2">Ultime misurazioni</div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-1 font-medium">Quando</th>
                    <th className="px-2 py-1 font-medium">Pagina</th>
                    <th className="px-2 py-1 font-medium">Metrica</th>
                    <th className="px-2 py-1 font-medium text-right">Valore</th>
                    <th className="px-2 py-1 font-medium">Rating</th>
                    <th className="px-2 py-1 font-medium">Sessione</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-2 py-1 text-muted-foreground">{new Date(r.created_at).toLocaleString("it-IT")}</td>
                      <td className="px-2 py-1 font-mono text-[11px]">{r.pathname}</td>
                      <td className="px-2 py-1">{r.metric_name}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatValue(r.metric_name, Number(r.value))}</td>
                      <td className="px-2 py-1">
                        <Badge className={`text-[9px] ${ratingColor(r.rating)} border-transparent`}>{r.rating}</Badge>
                      </td>
                      <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{r.session_id.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}