import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useInvoiceData, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { useRubrica } from "@/hooks/useRubrica";
import { formatCurrency } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SchedaSoggettoSheet } from "@/components/SchedaSoggettoSheet";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, BarChart3 } from "lucide-react";
import { SociBarChart } from "@/components/SociBarChart";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas-pro";
import logoCssr from "@/assets/logo-cssr.jpg";

async function loadLogoDataUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      try { resolve(c.toDataURL("image/jpeg", 0.92)); } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = logoCssr;
  });
}

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
  const chartsRef = useRef<HTMLDivElement>(null);
  const chartsReportRef = useRef<HTMLDivElement>(null);

  const allYears = useMemo(() => {
    const ys = new Set<number>();
    allSales.forEach((s) => s.anno && ys.add(s.anno));
    allPurchases.forEach((p) => p.anno && ys.add(p.anno));
    return Array.from(ys).sort((a, b) => b - a);
  }, [allSales, allPurchases]);

  const soci = useMemo(
    () => {
      const list = contatti.filter((c) =>
        (c.tipo || "").toLowerCase().split(",").map((t) => t.trim()).includes("socio")
      );
      // Dedup per partita IVA (stesso soggetto con denominazioni diverse)
      const seen = new Set<string>();
      const deduped = list.filter((c) => {
        const piva = (c.partita_iva || "").trim();
        if (!piva) return true;
        if (seen.has(piva)) return false;
        seen.add(piva);
        return true;
      });
      return deduped.sort((a, b) => a.denominazione.localeCompare(b.denominazione, "it"));
    },
    [contatti]
  );

  const urlYear = searchParams.get("anno");
  const urlYearFrom = searchParams.get("annoDa");
  const urlYearTo = searchParams.get("annoA");
  const urlSocio = searchParams.get("socio");
  const year: number | null = urlYear === "__all__"
    ? null
    : (urlYear && !isNaN(parseInt(urlYear, 10))
        ? parseInt(urlYear, 10)
        : (allYears[0] ?? null));
  const parseYearParam = (v: string | null): number | null =>
    v && !isNaN(parseInt(v, 10)) ? parseInt(v, 10) : null;
  const yearFrom: number | null = parseYearParam(urlYearFrom) ?? year;
  const yearTo: number | null = parseYearParam(urlYearTo) ?? year;
  const socioId: string = urlSocio && soci.some((s) => s.id === urlSocio) ? urlSocio : "__all__";

  const updateParam = (key: string, value: string | null, keepAll = false) => {
    const next = new URLSearchParams(searchParams);
    if (value == null || value === "" || (!keepAll && value === "__all__")) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const setYear = (y: string) => updateParam("anno", y, true);
  const setYearFrom = (y: string) => updateParam("annoDa", y === "__all__" ? null : y);
  const setYearTo = (y: string) => updateParam("annoA", y === "__all__" ? null : y);
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

  const inRange = (anno: number | null | undefined): boolean => {
    if (anno == null) return yearFrom == null && yearTo == null;
    if (yearFrom != null && anno < yearFrom) return false;
    if (yearTo != null && anno > yearTo) return false;
    return true;
  };

  const rows = useMemo(() => {
    const salesByYear = allSales.filter((s) => inRange(s.anno));
    const purchasesByYear = allPurchases.filter((p) => inRange(p.anno));

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
  }, [soci, allSales, allPurchases, yearFrom, yearTo]);

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
  const rangeLabel =
    yearFrom == null && yearTo == null ? "Tutti gli anni"
    : yearFrom != null && yearTo != null && yearFrom === yearTo ? String(yearFrom)
    : `${yearFrom ?? "…"} - ${yearTo ?? "…"}`;
  const baseFilename = `Soci_${rangeLabel.replace(/\s+/g, "")}${socioId === "__all__" ? "" : "_" + socioLabel.replace(/[^\w-]+/g, "_")}`;

  const exportExcel = () => {
    const header = ["Socio", "Partita IVA", "Vendite (crediti)", "Acquisti (debiti)", "IVA T1", "IVA T2", "IVA T3", "IVA T4", "IVA totale"];
    const data = rows.map((r) => [
      r.socio.denominazione,
      r.socio.partita_iva || "",
      r.vendite, r.acquisti, r.iva[0], r.iva[1], r.iva[2], r.iva[3], r.ivaTot,
    ]);
    const totalRow = ["Totale", `${rows.length} soci`, totals.vendite, totals.acquisti, totals.iva[0], totals.iva[1], totals.iva[2], totals.iva[3], totals.ivaTot];
    const ws = XLSX.utils.aoa_to_sheet([
      [`Report Soci - ${rangeLabel} - ${socioLabel}`],
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

  const exportPdf = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const logo = await loadLogoDataUrl();
    if (logo) { try { doc.addImage(logo, "JPEG", 40, 24, 40, 40); } catch {} }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Report Soci - ${rangeLabel}`, 92, 44);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(socioLabel, 92, 60);
    autoTable(doc, {
      startY: 80,
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

  const printCharts = async () => {
    const node = chartsReportRef.current ?? chartsRef.current;
    if (!node) return;
    const canvas = await html2canvas(node, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });
    const imgData = canvas.toDataURL("image/png");

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const logo = await loadLogoDataUrl();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 32;
    const titleStr = `Report Grafico Soci - ${rangeLabel}${socioId === "__all__" ? "" : " - " + socioLabel}`;

    if (logo) { try { doc.addImage(logo, "JPEG", margin, margin - 8, 40, 40); } catch {} }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(titleStr, margin + 52, margin + 6);
    doc.setTextColor(0);

    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2 - 40;
    const ratio = canvas.width / canvas.height;
    let imgW = availW;
    let imgH = imgW / ratio;
    if (imgH > availH) { imgH = availH; imgW = imgH * ratio; }
    const x = (pageW - imgW) / 2;
    const y = margin + 38;
    doc.addImage(imgData, "PNG", x, y, imgW, imgH);
    doc.save(`${baseFilename}_grafici.pdf`);
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
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={printCharts} disabled={loading || rows.length === 0}>
            <BarChart3 className="h-3.5 w-3.5 mr-1" /> Report Grafico
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
          <span className="text-xs text-muted-foreground ml-2">Dal</span>
          <Select value={yearFrom != null ? String(yearFrom) : "__all__"} onValueChange={setYearFrom}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue placeholder="Dal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">—</SelectItem>
              {allYears.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">al</span>
          <Select value={yearTo != null ? String(yearTo) : "__all__"} onValueChange={setYearTo}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue placeholder="Al" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">—</SelectItem>
              {allYears.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!loading && rows.length > 0 && (
        <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <SociBarChart
              sales={allSales.filter((s) => inRange(s.anno))}
              purchases={allPurchases.filter((p) => inRange(p.anno))}
              mode="vendite"
              onBarClick={(_, nome) => { setSelected({ nome, tipo: "cliente" }); setSheetOpen(true); }}
            />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <SociBarChart
              sales={allSales.filter((s) => inRange(s.anno))}
              purchases={allPurchases.filter((p) => inRange(p.anno))}
              mode="acquisti"
              onBarClick={(_, nome) => { setSelected({ nome, tipo: "fornitore" }); setSheetOpen(true); }}
            />
          </div>
        </div>
      )}

      {/* Off-screen container for PDF report: tutti i soci */}
      {!loading && rows.length > 0 && (
        <div
          aria-hidden
          style={{ position: "fixed", left: -10000, top: 0, width: 1600, background: "#ffffff", pointerEvents: "none" }}
        >
          <div ref={chartsReportRef} className="grid grid-cols-2 gap-3 p-2 bg-white">
            <div className="rounded-xl border bg-card p-4">
              <SociBarChart
                sales={allSales.filter((s) => inRange(s.anno))}
                purchases={allPurchases.filter((p) => inRange(p.anno))}
                mode="vendite"
                topN={9999}
                large
              />
            </div>
            <div className="rounded-xl border bg-card p-4">
              <SociBarChart
                sales={allSales.filter((s) => inRange(s.anno))}
                purchases={allPurchases.filter((p) => inRange(p.anno))}
                mode="acquisti"
                topN={9999}
                large
              />
            </div>
          </div>
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