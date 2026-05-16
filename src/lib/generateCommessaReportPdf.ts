import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import logoAgis from "@/assets/logo-agis.png";

/**
 * Genera un PDF (A4 landscape, margini 2/1/1,5/1 cm) a partire dal DOM `.pdf-report`,
 * mantenendo la stessa struttura "1 sezione = 1 pagina" usata dal bottone "Report".
 * Aggiunge footer su ogni pagina: AGIS logo a sx, "Report generato da ... data/ora"
 * al centro, "pagina/totale" a destra.
 */
export async function generateCommessaReportPdfBlob(
  onProgress?: (done: number, total: number, label?: string) => void
): Promise<Blob | null> {
  const reportEl = document.querySelector<HTMLElement>(".pdf-report");
  if (!reportEl) return null;

  // Forza la stessa resa CSS del print: aggiungiamo print-report-dialog,
  // ma evitiamo `window.print()` lavorando off-screen.
  document.body.classList.add("print-report", "print-report-dialog", "print-capture");

  // Stile inline override: rendiamo visibile off-screen
  const originalStyle = reportEl.getAttribute("style") || "";
  reportEl.setAttribute(
    "style",
    [
      "display: block !important",
      "visibility: visible !important",
      "position: fixed !important",
      "top: 0 !important",
      "left: -20000px !important",
      "width: 277mm !important", // area utile (297 - 1 - 1 = 295, ma usiamo 277 = 297 - 2*10mm margin)
      "background: white !important",
      "color: #1a1a1a !important",
      "padding: 0 !important",
      "margin: 0 !important",
      "z-index: -1 !important",
      "font-family: var(--font-sans), 'Segoe UI', system-ui, sans-serif",
      "line-height: 1.5",
    ].join("; ")
  );

  // Stile injection per il rendering off-screen (i media-print non si applicano)
  const styleEl = document.createElement("style");
  styleEl.id = "pdf-capture-style";
  styleEl.textContent = `
    body.print-capture .pdf-report .pdf-footer { display: none !important; }
    body.print-capture .pdf-report .pdf-page {
      page-break-before: auto !important;
      break-before: auto !important;
      padding: 6mm 0 !important;
      box-sizing: border-box !important;
      width: 100% !important;
    }
    body.print-capture .pdf-report .pdf-header {
      display: flex; align-items: center; gap: 16px;
      border-bottom: 3px solid #1e3a5f;
      padding-bottom: 14px; margin-bottom: 18px;
    }
    body.print-capture .pdf-report .pdf-header h1 {
      margin: 0; font-size: 22px; font-weight: 700;
      line-height: 1.2; color: #1e3a5f;
    }
    body.print-capture .pdf-report .pdf-header p { margin: 4px 0 0; font-size: 12px; color: #666; }
    body.print-capture .pdf-report .pdf-meta {
      display: flex; gap: 14px; flex-wrap: wrap; font-size: 10px;
      color: #888; padding: 6px 10px; background: #f5f7fa; border-radius: 4px;
    }
    body.print-capture .pdf-report .pdf-logo-cssr {
      display: block; height: 40px !important; width: auto !important;
      max-height: 40px !important; max-width: 150px !important; object-fit: contain;
    }
    body.print-capture .pdf-report .pdf-section h2 {
      font-size: 13px; color: #1e3a5f; border-bottom: 1.5px solid #1e3a5f;
      padding-bottom: 4px; margin: 0 0 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    body.print-capture .pdf-report .pdf-section { margin-bottom: 14px; }
    body.print-capture .pdf-report .pdf-table-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;
    }
    body.print-capture .pdf-report .pdf-charts-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 10px; background: white;
    }
    body.print-capture .pdf-report .pdf-chart-card {
      border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; background: white;
      display: flex; flex-direction: column; align-items: center;
    }
    body.print-capture .pdf-report .pdf-chart-card h3 {
      margin: 0 0 6px 0; font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.4px; color: #1e3a5f; align-self: flex-start;
    }
    body.print-capture .pdf-report .pdf-data-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    }
    body.print-capture .pdf-report .pdf-data-item {
      background: #f5f7fa; padding: 6px 8px; border-radius: 3px;
      display: flex; flex-direction: column; gap: 2px;
    }
    body.print-capture .pdf-report .pdf-data-label {
      font-size: 8px; text-transform: uppercase; color: #888; letter-spacing: 0.4px; font-weight: 600;
    }
    body.print-capture .pdf-report .pdf-data-value { font-size: 11px; color: #1a1a1a; font-weight: 600; }
    body.print-capture .pdf-report .pdf-table {
      width: 100%; border-collapse: collapse; font-size: 9.5px;
    }
    body.print-capture .pdf-report .pdf-table th, body.print-capture .pdf-report .pdf-table td {
      padding: 4px 6px; border-bottom: 1px solid #e6e9ee; text-align: left;
    }
    body.print-capture .pdf-report .pdf-table .is-right { text-align: right; }
    body.print-capture .pdf-report .pdf-table th {
      background: #1e3a5f; color: white; font-size: 9px; text-transform: uppercase;
      letter-spacing: 0.3px; font-weight: 700;
    }
    body.print-capture .pdf-report .pdf-table tbody tr:nth-child(even) { background: #f9fafb; }
    body.print-capture .pdf-report .is-positive { color: #166534; font-weight: 600; }
    body.print-capture .pdf-report .is-negative { color: #b91c1c; font-weight: 600; }
    body.print-capture .pdf-report .pdf-bar-chart { display: flex; flex-direction: column; gap: 4px; }
    body.print-capture .pdf-report .pdf-bar-row { display: flex; align-items: center; gap: 8px; font-size: 9.5px; }
    body.print-capture .pdf-report .pdf-bar-label { width: 110px; flex-shrink: 0; font-weight: 600; }
    body.print-capture .pdf-report .pdf-bar-tracks { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    body.print-capture .pdf-report .pdf-bar {
      height: 14px; display: flex; align-items: center; justify-content: flex-end;
      padding: 0 6px; border-radius: 2px; color: white; font-size: 8.5px; font-weight: 600;
      min-width: 30px;
    }
    body.print-capture .pdf-report .pdf-bar.is-positive { background: #166534; }
    body.print-capture .pdf-report .pdf-bar.is-negative { background: #b91c1c; }
    body.print-capture .pdf-report .pdf-bar-value { white-space: nowrap; }
    body.print-capture .pdf-report .pdf-bar-legend { display: flex; gap: 14px; margin-top: 6px; font-size: 9px; }
    body.print-capture .pdf-report .pdf-legend-item { display: flex; align-items: center; gap: 4px; }
    body.print-capture .pdf-report .pdf-legend-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    body.print-capture .pdf-report .pdf-legend-swatch.is-positive { background: #166534; }
    body.print-capture .pdf-report .pdf-legend-swatch.is-negative { background: #b91c1c; }
    body.print-capture .pdf-report .pdf-progress-wrap { display: flex; flex-direction: column; gap: 6px; }
    body.print-capture .pdf-report .pdf-progress-info {
      display: flex; justify-content: space-between; font-size: 10px; color: #555;
    }
    body.print-capture .pdf-report .pdf-progress-track {
      height: 14px; background: #e6e9ee; border-radius: 7px; overflow: hidden;
    }
    body.print-capture .pdf-report .pdf-progress-fill { height: 100%; background: linear-gradient(90deg,#1e3a5f,#3b82f6); }
    body.print-capture .pdf-report .pdf-table-total td { font-weight: 700; background: #eef2f7; border-top: 2px solid #1e3a5f; }
    body.print-capture .pdf-report .pdf-desc-cell { max-width: 250px; }
    body.print-capture .pdf-report .pdf-kpi-row {
      display: grid; grid-template-columns: repeat(9, minmax(0, 1fr));
      gap: 6px; margin-bottom: 14px;
    }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-card {
      border: 1px solid #d0d5dd; border-radius: 5px; padding: 6px 8px;
      background: #ffffff; border-left-width: 3px;
    }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-card.is-income { border-left-color: #15803d; }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-card.is-expense { border-left-color: #dc2626; }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-card.is-primary { border-left-color: #1e3a5f; }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-card.is-warn { border-left-color: #d97706; }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-label {
      font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.04em;
      color: #6b7280; font-weight: 600;
    }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-value {
      margin: 2px 0 0; font-size: 12px; font-weight: 700; font-family: monospace;
    }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-card.is-income .pdf-kpi-value { color: #15803d; }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-card.is-expense .pdf-kpi-value { color: #dc2626; }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-card.is-primary .pdf-kpi-value { color: #1e3a5f; }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-card.is-warn .pdf-kpi-value { color: #d97706; }
    body.print-capture .pdf-report .pdf-kpi-row .pdf-kpi-sub {
      margin: 1px 0 0; font-size: 7px; color: #9ca3af; line-height: 1.2;
    }
  `;
  document.head.appendChild(styleEl);

  // Attendi un repaint
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const restore = () => {
    reportEl.setAttribute("style", originalStyle);
    document.body.classList.remove("print-report", "print-report-dialog", "print-capture");
    styleEl.remove();
  };

  try {
    const pages = Array.from(reportEl.querySelectorAll<HTMLElement>(".pdf-page"));
    if (pages.length === 0) { restore(); return null; }

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = 297, pageH = 210;
    const mLeft = 10, mRight = 10, mTop = 20, mBottom = 15;
    const contentW = pageW - mLeft - mRight; // 277
    const contentH = pageH - mTop - mBottom; // 175

    const total = pages.length;
    const stamp = new Date().toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // Pre-carica il logo AGIS come dataURL
    const agisDataUrl: string | null = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d")!.drawImage(img, 0, 0);
        try { resolve(c.toDataURL("image/png")); } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = logoAgis;
    });

    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, total, `Pagina ${i + 1}/${total}`);
      const el = pages[i];

      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: el.scrollWidth,
      });

      const imgRatio = canvas.width / canvas.height;
      let w = contentW;
      let h = w / imgRatio;
      if (h > contentH) { h = contentH; w = h * imgRatio; }

      if (i > 0) pdf.addPage("a4", "landscape");
      const x = mLeft + (contentW - w) / 2;
      const y = mTop;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", x, y, w, h);

      // Footer
      const footerY = pageH - mBottom + 6;
      pdf.setDrawColor(30, 58, 95);
      pdf.setLineWidth(0.4);
      pdf.line(mLeft, pageH - mBottom + 2, pageW - mRight, pageH - mBottom + 2);
      pdf.setFontSize(8);
      pdf.setTextColor(120);

      // Logo AGIS a sinistra
      if (agisDataUrl) {
        try { pdf.addImage(agisDataUrl, "PNG", mLeft, footerY - 3.5, 12, 3.5); } catch {}
      }
      // Centro: data/ora
      const centerText = `Report generato da Gestione Commesse — ${stamp}`;
      pdf.text(centerText, pageW / 2, footerY, { align: "center" });
      // Destra: pagina/totale
      pdf.text(`${i + 1} / ${total}`, pageW - mRight, footerY, { align: "right" });
    }

    onProgress?.(total, total, "PDF pronto");
    const blob = pdf.output("blob");
    restore();
    return blob;
  } catch (e) {
    restore();
    throw e;
  }
}
