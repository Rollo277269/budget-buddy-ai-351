import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import type { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import type { CentroCR } from "@/hooks/useCentri";
import type { XmlInvoiceRecord } from "@/hooks/useXmlInvoices";
import type { DocumentoAcquisto } from "@/hooks/useDocumentiAcquisto";
import { formatCurrency } from "@/lib/format";

/** Make a string safe for use as a folder/file name (cross-platform). */
function safeName(s: string, max = 80): string {
  return (s || "")
    .replace(/[\\\/:*?"<>|\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "_";
}

function centroFolderName(codice: string | undefined | null, centri: CentroCR[]): string {
  const code = (codice || "").trim();
  if (!code) return "00_Non_classificate";
  const c = centri.find((x) => x.codice.toUpperCase() === code.toUpperCase());
  return safeName(c ? `${code}-${c.descrizione}` : code);
}

function base64ToUint8(b64: string): Uint8Array {
  const clean = (b64 || "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(values: unknown[]): string {
  return values.map(csvEscape).join(";");
}

function fmtNum(n: number): string {
  return (Number(n) || 0).toFixed(2).replace(".", ",");
}

export interface ExportFascicoloArgs {
  commessa: {
    numero: string | number;
    oggetto?: string;
    cig?: string;
    cigDerivato?: string;
  };
  linkedSales: SaleInvoice[];
  linkedPurchases: PurchaseInvoice[];
  ricavoMap: Record<string, string>; // invoice_key -> centro_codice
  costoMap: Record<string, string>;
  centri: CentroCR[];
  extraDocs: DocumentoAcquisto[];
  xmlMapVendita: Map<string, XmlInvoiceRecord>;
  xmlMapAcquisto: Map<string, XmlInvoiceRecord>;
  fetchParsedVendita: (id: string) => Promise<any>;
  fetchParsedAcquisto: (id: string) => Promise<any>;
  /** PDF del report commessa (stesso generato dal bottone "Report"). Verrà inserito nella root del fascicolo. */
  reportPdfBlob?: Blob | null;
  onProgress?: (done: number, total: number, label?: string) => void;
}

/**
 * Build a ZIP "fascicolo di commessa" with the structure:
 *   01_Ricavi/<RC1-Lavori>/<files...>
 *   02_Costi/<CC1-...>/<files...>
 *   _RIEPILOGO.csv
 */
export async function exportFascicoloCommessa(args: ExportFascicoloArgs): Promise<void> {
  const {
    commessa, linkedSales, linkedPurchases, ricavoMap, costoMap,
    centri, extraDocs, xmlMapVendita, xmlMapAcquisto,
    fetchParsedVendita, fetchParsedAcquisto, reportPdfBlob, onProgress,
  } = args;

  const zip = new JSZip();
  const root = zip.folder(safeName(`Fascicolo_Commessa_${commessa.numero}`))!;
  const ricaviFolder = root.folder("01_Ricavi")!;
  const costiFolder = root.folder("02_Costi")!;

  type Row = {
    type: "vendita" | "acquisto" | "extra";
    folder: string;
    centro: string;
    anno: number | string;
    numero: number | string;
    data: string;
    soggetto: string;
    descrizione: string;
    imponibile: number;
    iva: number;
    totale: number;
    file: string;
  };

  // Per-folder rows for the per-folder CSV summary
  const folderRows = new Map<string, Row[]>(); // path -> rows
  const allRows: Row[] = [];

  // Approximate total ops for progress bar
  const totalOps = linkedSales.length + linkedPurchases.length + extraDocs.length + 1;
  let done = 0;
  const tick = (label?: string) => { done++; onProgress?.(done, totalOps, label); };

  // ── 1. Process SALES ──
  for (const s of linkedSales) {
    const key = `${s.anno}-${s.numero}`;
    const centroCode = ricavoMap[key] || "";
    const folderName = centroFolderName(centroCode, centri);
    const folder = ricaviFolder.folder(folderName)!;
    const folderPath = `01_Ricavi/${folderName}`;

    const xml = xmlMapVendita.get(key);
    const baseName = safeName(`${s.anno}-${String(s.numero).padStart(4, "0")}_${s.cliente || "Cliente"}`);
    let savedFile = "";

    if (xml) {
      try {
        // XML file from storage
        const { data: xmlBlob } = await supabase.storage.from("fatture-xml").download(xml.storage_path);
        if (xmlBlob) {
          const xmlBuf = await xmlBlob.arrayBuffer();
          folder.file(`${baseName}.xml`, xmlBuf);
          savedFile = `${baseName}.xml`;
        }
        // PDF allegato (if present)
        const parsed = await fetchParsedVendita(xml.id);
        const pdfAlleg = parsed?.allegati?.find((a: any) => (a.formato || "").toUpperCase() === "PDF");
        if (pdfAlleg?.base64) {
          const pdfBytes = base64ToUint8(pdfAlleg.base64);
          folder.file(`${baseName}.pdf`, pdfBytes);
          savedFile = savedFile ? `${savedFile} + .pdf` : `${baseName}.pdf`;
        }
      } catch (e) {
        console.warn(`Errore download XML vendita ${key}:`, e);
      }
    }

    const row: Row = {
      type: "vendita",
      folder: folderPath,
      centro: centroCode || "—",
      anno: s.anno,
      numero: s.numero,
      data: s.data || "",
      soggetto: s.cliente || "",
      descrizione: s.descrizione || "",
      imponibile: s.imponibile || 0,
      iva: s.imposta || 0,
      totale: s.totale || 0,
      file: savedFile,
    };
    (folderRows.get(folderPath) || folderRows.set(folderPath, []).get(folderPath)!).push(row);
    allRows.push(row);
    tick(`Vendita ${key}`);
  }

  // ── 2. Process PURCHASES ──
  for (const p of linkedPurchases) {
    const key = `${p.anno}-${p.numero}`;
    const centroCode = costoMap[key] || "";
    const folderName = centroFolderName(centroCode, centri);
    const folder = costiFolder.folder(folderName)!;
    const folderPath = `02_Costi/${folderName}`;

    const xml = xmlMapAcquisto.get(key);
    const baseName = safeName(`${p.anno}-${String(p.numero).padStart(4, "0")}_${p.fornitore || "Fornitore"}`);
    let savedFile = "";

    if (xml) {
      try {
        const { data: xmlBlob } = await supabase.storage.from("fatture-xml").download(xml.storage_path);
        if (xmlBlob) {
          const xmlBuf = await xmlBlob.arrayBuffer();
          folder.file(`${baseName}.xml`, xmlBuf);
          savedFile = `${baseName}.xml`;
        }
        const parsed = await fetchParsedAcquisto(xml.id);
        const pdfAlleg = parsed?.allegati?.find((a: any) => (a.formato || "").toUpperCase() === "PDF");
        if (pdfAlleg?.base64) {
          const pdfBytes = base64ToUint8(pdfAlleg.base64);
          folder.file(`${baseName}.pdf`, pdfBytes);
          savedFile = savedFile ? `${savedFile} + .pdf` : `${baseName}.pdf`;
        }
      } catch (e) {
        console.warn(`Errore download XML acquisto ${key}:`, e);
      }
    }

    const row: Row = {
      type: "acquisto",
      folder: folderPath,
      centro: centroCode || "—",
      anno: p.anno,
      numero: p.numero,
      data: p.data || "",
      soggetto: p.fornitore || "",
      descrizione: p.descrizione || "",
      imponibile: (p.imponibile || 0) + (p.cassa || 0),
      iva: p.imposta || 0,
      totale: (p.imponibile || 0) + (p.cassa || 0) + (p.imposta || 0),
      file: savedFile,
    };
    (folderRows.get(folderPath) || folderRows.set(folderPath, []).get(folderPath)!).push(row);
    allRows.push(row);
    tick(`Acquisto ${key}`);
  }

  // ── 3. Process EXTRA DOCS (non-fiscal receipts/PDFs) ──
  for (const d of extraDocs) {
    const centroCode = d.centro_costo || "";
    const folderName = centroFolderName(centroCode, centri);
    const folder = costiFolder.folder(folderName)!;
    const folderPath = `02_Costi/${folderName}`;

    try {
      const { data: pdfBlob } = await supabase.storage.from("documenti-acquisto").download(d.storage_path);
      if (pdfBlob) {
        const buf = await pdfBlob.arrayBuffer();
        folder.file(safeName(d.file_name || `extra_${d.id}.pdf`), buf);
      }
    } catch (e) {
      console.warn(`Errore download documento ${d.id}:`, e);
    }

    const row: Row = {
      type: "extra",
      folder: folderPath,
      centro: centroCode || "—",
      anno: (d.data_documento || "").slice(-4) || "",
      numero: d.numero || "",
      data: d.data_documento || "",
      soggetto: d.fornitore || "",
      descrizione: d.descrizione || d.ai_summary || "",
      imponibile: Number(d.importo || 0),
      iva: 0,
      totale: Number(d.importo || 0),
      file: safeName(d.file_name || ""),
    };
    (folderRows.get(folderPath) || folderRows.set(folderPath, []).get(folderPath)!).push(row);
    allRows.push(row);
    tick(`Extra ${d.file_name}`);
  }

  // ── 4. Per-folder CSV summary ──
  const HEADER = ["Tipo", "Centro", "Anno", "Numero", "Data", "Soggetto", "Descrizione", "Imponibile", "IVA", "Totale", "File"];
  for (const [path, rows] of folderRows) {
    const totImp = rows.reduce((s, r) => s + r.imponibile, 0);
    const totIva = rows.reduce((s, r) => s + r.iva, 0);
    const totTot = rows.reduce((s, r) => s + r.totale, 0);
    const lines = [
      csvLine(HEADER),
      ...rows.map((r) => csvLine([
        r.type, r.centro, r.anno, r.numero, r.data, r.soggetto, r.descrizione,
        fmtNum(r.imponibile), fmtNum(r.iva), fmtNum(r.totale), r.file,
      ])),
      csvLine(["TOTALE", "", "", "", "", "", "", fmtNum(totImp), fmtNum(totIva), fmtNum(totTot), ""]),
    ];
    const csv = "\uFEFF" + lines.join("\r\n");
    // path is like "01_Ricavi/<folder>"
    zip.folder(`${safeName(`Fascicolo_Commessa_${commessa.numero}`)}/${path}`)!.file("_riepilogo.csv", csv);
  }

  // ── 5. Global summary CSV ──
  const totRicavi = allRows.filter((r) => r.type === "vendita").reduce((s, r) => s + r.totale, 0);
  const totCosti = allRows.filter((r) => r.type !== "vendita").reduce((s, r) => s + r.totale, 0);
  const globalLines = [
    csvLine(["Commessa", commessa.numero]),
    csvLine(["Oggetto", commessa.oggetto || ""]),
    csvLine(["CIG", commessa.cig || ""]),
    csvLine(["CIG Derivato", commessa.cigDerivato || ""]),
    csvLine(["Esportato", new Date().toLocaleString("it-IT")]),
    "",
    csvLine(["Totale Ricavi", fmtNum(totRicavi)]),
    csvLine(["Totale Costi", fmtNum(totCosti)]),
    csvLine(["Saldo", fmtNum(totRicavi - totCosti)]),
    "",
    csvLine(["Cartella", ...HEADER]),
    ...allRows.map((r) => csvLine([
      r.folder, r.type, r.centro, r.anno, r.numero, r.data, r.soggetto, r.descrizione,
      fmtNum(r.imponibile), fmtNum(r.iva), fmtNum(r.totale), r.file,
    ])),
  ];
  root.file("_RIEPILOGO.csv", "\uFEFF" + globalLines.join("\r\n"));

  // ── 6. README ──
  const readme = [
    `Fascicolo commessa ${commessa.numero}`,
    commessa.oggetto || "",
    `CIG: ${commessa.cig || "—"}${commessa.cigDerivato ? "  CIG derivato: " + commessa.cigDerivato : ""}`,
    `Esportato il ${new Date().toLocaleString("it-IT")}`,
    "",
    "Struttura cartelle:",
    "  01_Ricavi/<CODICE-DESCRIZIONE>/   → fatture di vendita classificate per centro di ricavo",
    "  02_Costi/<CODICE-DESCRIZIONE>/    → fatture di acquisto e ricevute extra per centro di costo",
    "  00_Non_classificate                → fatture senza centro assegnato",
    "",
    "Ogni cartella contiene:",
    "  - file XML originali (e PDF allegato se presente in XML)",
    "  - ricevute / PDF extra (per i costi)",
    "  - _riepilogo.csv con elenco e totali",
    "",
    `Totale Ricavi: ${formatCurrency(totRicavi)}`,
    `Totale Costi:  ${formatCurrency(totCosti)}`,
    `Saldo:         ${formatCurrency(totRicavi - totCosti)}`,
  ].join("\r\n");
  root.file("LEGGIMI.txt", readme);

  // ── 6.b Report PDF (stesso del bottone "Report") ──
  if (reportPdfBlob) {
    const buf = await reportPdfBlob.arrayBuffer();
    root.file(`Report_Commessa_${safeName(String(commessa.numero))}.pdf`, buf);
  }

  tick("Generazione ZIP");

  // ── 7. Generate and download ──
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }, (meta) => {
    onProgress?.(totalOps, totalOps, `Compressione ${Math.round(meta.percent)}%`);
  });
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(blob, `Fascicolo_Commessa_${safeName(String(commessa.numero))}_${stamp}.zip`);
}