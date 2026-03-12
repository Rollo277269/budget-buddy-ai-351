// Parser for Italian FatturaPA XML format

export interface FatturaPALinea {
  numero: number;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  prezzoTotale: number;
  aliquotaIVA: number;
}

export interface FatturaPAPagamento {
  condizioni: string;
  modalita: string;
  importo: number;
  dataScadenza: string;
  iban: string;
}

export interface FatturaPAAllegato {
  nome: string;
  formato: string;
  descrizione: string;
  base64: string;
}

export interface FatturaPAData {
  // Cedente/Prestatore (seller)
  cedente: {
    denominazione: string;
    partitaIva: string;
    codiceFiscale: string;
    indirizzo: string;
    cap: string;
    comune: string;
    provincia: string;
    nazione: string;
  };
  // Cessionario/Committente (buyer)
  cessionario: {
    denominazione: string;
    partitaIva: string;
    codiceFiscale: string;
    indirizzo: string;
    cap: string;
    comune: string;
    provincia: string;
    nazione: string;
  };
  // Header
  tipoDocumento: string;
  divisa: string;
  data: string;
  numero: string;
  // Totals
  importoTotale: number;
  // Lines
  linee: FatturaPALinea[];
  // Riepilogo IVA
  riepilogoIVA: { aliquota: number; imponibile: number; imposta: number; }[];
  // Payment
  pagamenti: FatturaPAPagamento[];
  // Attachments
  allegati: FatturaPAAllegato[];
  // Causale
  causale: string[];
  // Raw XML
  rawXml: string;
}

function getText(el: Element | null, tag: string): string {
  if (!el) return "";
  const node = el.getElementsByTagName(tag)[0];
  return node?.textContent?.trim() || "";
}

function getNum(el: Element | null, tag: string): number {
  const v = getText(el, tag);
  return v ? parseFloat(v) : 0;
}

function findElement(doc: Document, ...tags: string[]): Element | null {
  for (const tag of tags) {
    // Try with namespace prefix patterns
    const patterns = [tag, `ns2:${tag}`, `ns3:${tag}`, `p:${tag}`];
    for (const p of patterns) {
      const els = doc.getElementsByTagName(p);
      if (els.length > 0) return els[0];
    }
    // Try with wildcard namespace
    const all = doc.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      if (all[i].localName === tag) return all[i];
    }
  }
  return null;
}

function findAllElements(parent: Element | Document | null, tag: string): Element[] {
  if (!parent) return [];
  const results: Element[] = [];
  const all = parent.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === tag) results.push(all[i]);
  }
  return results;
}

function parseAnagrafica(el: Element | null) {
  if (!el) return { denominazione: "", partitaIva: "", codiceFiscale: "", indirizzo: "", cap: "", comune: "", provincia: "", nazione: "" };
  const sede = findAllElements(el, "Sede")[0] || findAllElements(el, "StabileOrganizzazione")[0];
  return {
    denominazione: getText(el, "Denominazione") || `${getText(el, "Nome")} ${getText(el, "Cognome")}`.trim(),
    partitaIva: getText(el, "IdCodice"),
    codiceFiscale: getText(el, "CodiceFiscale"),
    indirizzo: sede ? getText(sede, "Indirizzo") : "",
    cap: sede ? getText(sede, "CAP") : "",
    comune: sede ? getText(sede, "Comune") : "",
    provincia: sede ? getText(sede, "Provincia") : "",
    nazione: sede ? getText(sede, "Nazione") : "",
  };
}

export function parseFatturaPA(xmlString: string): FatturaPAData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  const cedentePrestatore = findElement(doc, "CedentePrestatore");
  const cessionarioCommittente = findElement(doc, "CessionarioCommittente");
  const datiGenerali = findElement(doc, "DatiGeneraliDocumento");
  const datiBeniServizi = findElement(doc, "DatiBeniServizi");

  // Parse lines
  const lineeEls = findAllElements(doc, "DettaglioLinee");
  const linee: FatturaPALinea[] = lineeEls.map((l) => ({
    numero: getNum(l, "NumeroLinea"),
    descrizione: getText(l, "Descrizione"),
    quantita: getNum(l, "Quantita"),
    prezzoUnitario: getNum(l, "PrezzoUnitario"),
    prezzoTotale: getNum(l, "PrezzoTotale"),
    aliquotaIVA: getNum(l, "AliquotaIVA"),
  }));

  // Parse IVA summary
  const riepilogoEls = findAllElements(doc, "DatiRiepilogo");
  const riepilogoIVA = riepilogoEls.map((r) => ({
    aliquota: getNum(r, "AliquotaIVA"),
    imponibile: getNum(r, "ImponibileImporto"),
    imposta: getNum(r, "Imposta"),
  }));

  // Parse payments
  const pagamentoEls = findAllElements(doc, "DettaglioPagamento");
  const pagamenti: FatturaPAPagamento[] = pagamentoEls.map((p) => ({
    condizioni: getText(doc, "CondizioniPagamento"),
    modalita: getText(p, "ModalitaPagamento"),
    importo: getNum(p, "ImportoPagamento"),
    dataScadenza: getText(p, "DataScadenzaPagamento"),
    iban: getText(p, "IBAN"),
  }));

  // Parse attachments
  const allegatoEls = findAllElements(doc, "Allegati");
  const allegati: FatturaPAAllegato[] = allegatoEls.map((a) => ({
    nome: getText(a, "NomeAttachment"),
    formato: getText(a, "FormatoAttachment"),
    descrizione: getText(a, "DescrizioneAttachment"),
    base64: getText(a, "Attachment"),
  }));

  // Causale
  const causaleEls = findAllElements(doc, "Causale");
  const causale = causaleEls.map((c) => c.textContent?.trim() || "");

  return {
    cedente: parseAnagrafica(cedentePrestatore),
    cessionario: parseAnagrafica(cessionarioCommittente),
    tipoDocumento: getText(datiGenerali, "TipoDocumento"),
    divisa: getText(datiGenerali, "Divisa"),
    data: getText(datiGenerali, "Data"),
    numero: getText(datiGenerali, "Numero"),
    importoTotale: getNum(datiGenerali, "ImportoTotaleDocumento"),
    linee,
    riepilogoIVA,
    pagamenti,
    allegati,
    causale,
    rawXml: xmlString,
  };
}

export function extractInvoiceNumber(numero: string): number {
  // Try to extract numeric part from strings like "FV/001", "123", "001/2024"
  const match = numero.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

export function extractInvoiceYear(data: string): number {
  // Date format: YYYY-MM-DD
  const match = data.match(/(\d{4})/);
  return match ? parseInt(match[1]) : 0;
}
