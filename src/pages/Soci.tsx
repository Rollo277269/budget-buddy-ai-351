import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useRubrica } from "@/hooks/useRubrica";
import { formatCurrency } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SchedaSoggettoSheet } from "@/components/SchedaSoggettoSheet";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const year: number | null = urlYear === "__all__"
    ? null
    : (urlYear && !isNaN(parseInt(urlYear, 10))
        ? parseInt(urlYear, 10)
        : (allYears[0] ?? null));
  const socioId: string = urlSocio && soci.some((s) => s.id === urlSocio) ? urlSocio : "__all__";

  const updateParam = (key: string, value: string | null, keepAll = false) => {
    const next = new URLSearchParams(searchParams);
    if (value == null || value === "" || (!keepAll && value === "__all__")) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const setYear = (y: string) => updateParam("anno", y, true);
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
    const salesByYear = year == null ? allSales : allSales.filter((s) => s.anno === year);
    const purchasesByYear = year == null ? allPurchases : allPurchases.filter((p) => p.anno === year);

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

  const socioLabel = socioId === "__all__"
    ? "Tutti i soci"
    : (soci.find((s) => s.id === socioId)?.denominazione ?? "");
  const baseFilename = `Soci_${year ?? "tutti"}${socioId === "__all__" ? "" : "_" + socioLabel.replace(/[^\w-]+/g, "_")}`;

  const exportExcel = () => {
    const header = ["Socio", "Partita IVA", "Vendite (crediti)", "Acquisti (debiti)", "IVA T1", "IVA T2", "IVA T3", "IVA T4", "IVA totale"];
    const data = rows.map((r) => [
      r.socio.denominazione,
      r.socio.partita_iva || "",
      r.vendite, r.acquisti, r.iva[0], r.iva[1], r.iva[2], r.iva[3], r.ivaTot,
    ]);
    const totalRow = ["Totale", `${rows.length} soci`, totals.vendite, totals.acquisti, totals.iva[0], totals.iva[1], totals.iva[2], totals.iva[3], totals.ivaTot];
    const ws = XLSX.utils.aoa_to_sheet([
      [`Report Soci - Anno ${year ?? ""} - ${socioLabel}`],
      [],
      header,
      ...data,
      totalRow,
    ]);
    ws["!cols"] = [{ wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Soci");
    XLSX.writeFile(wb, `${baseFilename}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Report Soci - Anno ${year ?? ""}`, 40, 40);
    doc.setFontSize(10);
    doc.text(socioLabel, 40, 58);
    autoTable(doc, {
      startY: 75,
      head: [["Socio", "P. IVA", "Vendite", "Acquisti", "IVA T1", "IVA T2", "IVA T3", "IVA T4", "IVA totale"]],
      body: rows.map((r) => [
        r.socio.denominazione,
        r.socio.partita_iva || "",
        fmt(r.vendite), fmt(r.acquisti), fmt(r.iva[0]), fmt(r.iva[1]), fmt(r.iva[2]), fmt(r.iva[3]), fmt(r.ivaTot),
      ]),
      foot: [["Totale", `${rows.length} soci`, fmt(totals.vendite), fmt(totals.acquisti), fmt(totals.iva[0]), fmt(totals.iva[1]), fmt(totals.iva[2]), fmt(totals.iva[3]), fmt(totals.ivaTot)]],
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      footStyles: { fillColor: [219, 234, 254], textColor: 0, fontStyle: "bold" },
      columnStyles: {
        2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
        5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" },
      },
    });
    doc.save(`${baseFilename}.pdf`);
  };

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
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportExcel} disabled={loading || rows.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportPdf} disabled={loading || rows.length === 0}>
            <FileText className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
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