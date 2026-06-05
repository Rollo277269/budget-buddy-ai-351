import { useMemo, useState } from "react";
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

  const allYears = useMemo(() => {
    const ys = new Set<number>();
    allSales.forEach((s) => s.anno && ys.add(s.anno));
    allPurchases.forEach((p) => p.anno && ys.add(p.anno));
    return Array.from(ys).sort((a, b) => b - a);
  }, [allSales, allPurchases]);

  const [year, setYear] = useState<number | null>(null);

  // default year = max available, set once
  if (year === null && allYears.length > 0) {
    setYear(allYears[0]);
  }

  const soci = useMemo(
    () => contatti.filter((c) => c.tipo === "socio").sort((a, b) => a.denominazione.localeCompare(b.denominazione, "it")),
    [contatti]
  );

  const rows = useMemo(() => {
    if (year == null) return [];
    const salesByYear = allSales.filter((s) => s.anno === year);
    const purchasesByYear = allPurchases.filter((p) => p.anno === year);

    return soci.map((socio) => {
      const nameKey = norm(socio.denominazione);
      const pivaKey = (socio.partita_iva || "").trim();

      const matchSale = (s: SaleInvoice) =>
        norm(s.cliente) === nameKey || (!!pivaKey && (s.partita_iva || "").trim() === pivaKey);
      const matchPurchase = (p: PurchaseInvoice) =>
        norm(p.fornitore) === nameKey || (!!pivaKey && (p.partita_iva || "").trim() === pivaKey);

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
          <span className="text-xs text-muted-foreground">Anno</span>
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