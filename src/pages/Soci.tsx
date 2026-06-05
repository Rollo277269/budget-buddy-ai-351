import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useRubrica } from "@/hooks/useRubrica";
import { formatCurrency } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SchedaSoggettoSheet } from "@/components/SchedaSoggettoSheet";

function parseYear(d: string): number | null {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length === 3) {
    const y = parseInt(parts[2], 10);
    return isNaN(y) ? null : y;
  }
  return null;
}

function parseMonth(d: string): number | null {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length === 3) {
    const m = parseInt(parts[1], 10);
    return isNaN(m) || m < 1 || m > 12 ? null : m;
  }
  return null;
}

const norm = (s: string) => (s || "").trim().toLowerCase();

export default function SociPage() {
  const { contatti, loading: loadingRubrica } = useRubrica();
  const { allSales, allPurchases, loading: loadingInvoices } = useInvoiceData();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<{ nome: string; tipo: "cliente" | "fornitore" } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const allYears = useMemo(() => {
    const ys = new Set<number>();
    allSales.forEach((s) => s.anno && ys.add(s.anno));
    allPurchases.forEach((p) => p.anno && ys.add(p.anno));
    return Array.from(ys).sort((a, b) => b - a);
  }, [allSales, allPurchases]);

  const soci = useMemo(
    () => contatti
      .filter((c) => (c.tipo || "").toLowerCase().split(",").map((t) => t.trim()).includes("socio"))
      .sort((a, b) => a.denominazione.localeCompare(b.denominazione, "it")),
    [contatti]
  );

  const urlYear = searchParams.get("anno");
  const urlSocio = searchParams.get("socio");
  const year: number | null = urlYear && !isNaN(parseInt(urlYear, 10))
    ? parseInt(urlYear, 10)
    : (allYears[0] ?? null);
  const socioId: string = urlSocio && soci.some((s) => s.id === urlSocio) ? urlSocio : "__all__";

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value == null || value === "" || value === "__all__") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const setYear = (y: number) => updateParam("anno", String(y));
  const setSocioId = (id: string) => updateParam("socio", id);

  // Seed default year in URL once data is loaded, so shared links carry it explicitly.
  useEffect(() => {
    if (!urlYear && allYears.length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set("anno", String(allYears[0]));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allYears.length]);

  const rows = useMemo(() => {
    if (year == null) return [];
    const salesByYear = allSales.filter((s) => s.anno === year);
    const purchasesByYear = allPurchases.filter((p) => p.anno === year);

    const list = socioId === "__all__" ? soci : soci.filter((s) => s.id === socioId);
    return list.map((socio) => {
      const nameKey = norm(socio.denominazione);
      const pivaKey = (socio.partita_iva || "").trim();

      const matchSale = (s: SaleInvoice) =>
        norm(s.cliente) === nameKey || (!!pivaKey && ((s as any).partitaIva || "").trim() === pivaKey);
      const matchPurchase = (p: PurchaseInvoice) =>
        norm(p.fornitore) === nameKey || (!!pivaKey && ((p as any).partitaIva || "").trim() === pivaKey);

      const vendite = salesByYear.filter(matchSale).reduce((a, s) => a + (s.totale || 0), 0);
      const acquisti = purchasesByYear.filter(matchPurchase).reduce((a, p) => a + (p.totale || 0), 0);

      const iva = [0, 0, 0, 0];
      for (const p of purchasesByYear) {
        if (!matchPurchase(p)) continue;
        const m = parseMonth(p.data);
        if (!m) continue;
        const q = Math.floor((m - 1) / 3);
        iva[q] += p.imposta || 0;
      }
      const ivaTot = iva[0] + iva[1] + iva[2] + iva[3];

      return { socio, vendite, acquisti, iva, ivaTot };
    });
  }, [soci, allSales, allPurchases, year]);

  const totals = useMemo(() => {
    const t = { vendite: 0, acquisti: 0, iva: [0, 0, 0, 0], ivaTot: 0 };
    rows.forEach((r) => {
      t.vendite += r.vendite;
      t.acquisti += r.acquisti;
      t.iva[0] += r.iva[0];
      t.iva[1] += r.iva[1];
      t.iva[2] += r.iva[2];
      t.iva[3] += r.iva[3];
      t.ivaTot += r.ivaTot;
    });
    return t;
  }, [rows]);

  const loading = loadingRubrica || loadingInvoices;

  const fmt = (v: number) => (Math.abs(v) < 0.005 ? "—" : formatCurrency(v));

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Soci</h1>
          <p className="text-xs text-muted-foreground">
            Aggregati per soggetto con etichetta &quot;Socio&quot; in Rubrica
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Socio</span>
          <Select value={socioId} onValueChange={setSocioId}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue placeholder="Tutti i soci" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">Tutti i soci</SelectItem>
              {soci.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.denominazione}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-2">Anno</span>
          <Select value={year != null ? String(year) : ""} onValueChange={(v) => setYear(parseInt(v, 10))}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              {allYears.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-xs">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Direzione */}
      {!loading && kpi && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              KPI Direzione {year}
            </h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-xs">
                  Indicatori derivati dalle fatture. Quote ammissione e avvalimenti
                  richiedono un dato dedicato non ancora presente in DB.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Quota Soci su Vendite
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold font-mono">{pct(kpi.quotaSociVendite)}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {fmt(kpi.totVenditeSoci)} / {fmt(kpi.totVendite)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Quota Soci su Acquisti
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold font-mono">{pct(kpi.quotaSociAcquisti)}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {fmt(kpi.totAcquistiSoci)} / {fmt(kpi.totAcquisti)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Soci attivi
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold font-mono">{kpi.sociAttivi}</div>
                <div className="text-[10px] text-muted-foreground">su {soci.length} totali</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Quota Ammissione / Avvalimenti
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-sm font-semibold text-muted-foreground">N/D</div>
                <div className="text-[10px] text-muted-foreground">
                  Manca dato dedicato in archivio
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quota lavori per Socio */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold">
                Quota lavori per Socio · {year}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {kpi.perSocio.length === 0 && (
                <div className="text-xs text-muted-foreground">Nessun socio.</div>
              )}
              {kpi.perSocio.map((s) => {
                const quotaV = kpi.totVendite > 0 ? s.vendite / kpi.totVendite : 0;
                const quotaA = kpi.totAcquisti > 0 ? s.acquisti / kpi.totAcquisti : 0;
                return (
                  <div key={s.id} className="flex items-center gap-3 text-xs">
                    <div className="w-48 truncate" title={s.nome}>{s.nome}</div>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-income"
                        style={{ width: `${Math.min(100, quotaV * 100)}%` }}
                      />
                    </div>
                    <div className="w-16 text-right font-mono">{pct(quotaV)}</div>
                    <div className="w-24 text-right font-mono text-muted-foreground">
                      {fmt(s.vendite)}
                    </div>
                    <div className="w-20 text-right font-mono text-expense text-[10px]">
                      acq {pct(quotaA)}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="border rounded-md bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-muted/50 z-10 min-w-[240px]">
                Socio
              </th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">Vendite (crediti)</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">Acquisti (debiti)</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">IVA T1</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">IVA T2</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">IVA T3</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">IVA T4</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap bg-muted">IVA totale</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-6">
                  Caricamento…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-6">
                  Nessun socio in Rubrica. Imposta tipo = &quot;socio&quot; sui contatti.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.socio.id} className="border-b hover:bg-muted/30">
                  <td className="px-2 py-1 sticky left-0 bg-card hover:bg-muted/30 z-10">
                    <button
                      className="text-left text-primary hover:underline"
                      onClick={() => {
                        setSelected({ nome: r.socio.denominazione, tipo: r.vendite >= r.acquisti ? "cliente" : "fornitore" });
                        setSheetOpen(true);
                      }}
                    >
                      {r.socio.denominazione}
                    </button>
                    {r.socio.partita_iva && (
                      <span className="ml-2 text-[10px] text-muted-foreground font-mono">{r.socio.partita_iva}</span>
                    )}
                  </td>
                  <td className="text-right px-2 py-1 font-mono whitespace-nowrap text-income">{fmt(r.vendite)}</td>
                  <td className="text-right px-2 py-1 font-mono whitespace-nowrap text-expense">{fmt(r.acquisti)}</td>
                  <td className="text-right px-2 py-1 font-mono whitespace-nowrap">{fmt(r.iva[0])}</td>
                  <td className="text-right px-2 py-1 font-mono whitespace-nowrap">{fmt(r.iva[1])}</td>
                  <td className="text-right px-2 py-1 font-mono whitespace-nowrap">{fmt(r.iva[2])}</td>
                  <td className="text-right px-2 py-1 font-mono whitespace-nowrap">{fmt(r.iva[3])}</td>
                  <td className="text-right px-2 py-1 font-mono font-semibold whitespace-nowrap bg-muted/30">
                    {fmt(r.ivaTot)}
                  </td>
                </tr>
              ))}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot className="sticky bottom-0">
              <tr className="bg-primary/5 font-semibold border-t-2 border-primary/40">
                <td className="px-2 py-1.5 sticky left-0 bg-primary/5 z-10">Totale ({rows.length} soci)</td>
                <td className="text-right px-2 py-1.5 font-mono whitespace-nowrap text-income">{fmt(totals.vendite)}</td>
                <td className="text-right px-2 py-1.5 font-mono whitespace-nowrap text-expense">{fmt(totals.acquisti)}</td>
                <td className="text-right px-2 py-1.5 font-mono whitespace-nowrap">{fmt(totals.iva[0])}</td>
                <td className="text-right px-2 py-1.5 font-mono whitespace-nowrap">{fmt(totals.iva[1])}</td>
                <td className="text-right px-2 py-1.5 font-mono whitespace-nowrap">{fmt(totals.iva[2])}</td>
                <td className="text-right px-2 py-1.5 font-mono whitespace-nowrap">{fmt(totals.iva[3])}</td>
                <td className="text-right px-2 py-1.5 font-mono font-bold whitespace-nowrap bg-muted/40">
                  {fmt(totals.ivaTot)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <SchedaSoggettoSheet
        tipo={selected?.tipo ?? "cliente"}
        nome={selected?.nome ?? null}
        allSales={allSales}
        allPurchases={allPurchases}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}