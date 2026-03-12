import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { XmlInvoiceRecord } from "@/hooks/useXmlInvoices";
import { XmlMatchSection } from "@/components/XmlMatchSection";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { FatturaPAData } from "@/lib/fatturaPA";
import { formatCurrency } from "@/lib/format";
import { FileText, Download, Trash2 } from "lucide-react";

interface Props {
  record: XmlInvoiceRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (id: string, storagePath: string) => void;
  invoices?: (SaleInvoice | PurchaseInvoice)[];
  xmlMap?: Map<string, XmlInvoiceRecord>;
  tipo?: "vendita" | "acquisto";
  onManualMatch?: (xmlId: string, anno: number, numero: number) => void;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/50">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right max-w-[60%]">{value || "—"}</span>
    </div>
  );
}

export function XmlInvoiceSheet({ record, open, onOpenChange, onDelete }: Props) {
  if (!record) return null;
  const parsed = record.parsed_data as FatturaPAData | null;

  const handleDownloadAttachment = (base64: string, nome: string, formato: string) => {
    const byteChars = atob(base64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArray], { type: formato === "PDF" ? "application/pdf" : "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4" />
            {record.file_name}
            {record.matched ? (
              <Badge className="text-[10px]">Associata</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">Non associata</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {parsed ? (
          <Tabs defaultValue="generale" className="mt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="generale" className="text-[11px]">Generale</TabsTrigger>
              <TabsTrigger value="linee" className="text-[11px]">Linee</TabsTrigger>
              <TabsTrigger value="pagamento" className="text-[11px]">Pagamento</TabsTrigger>
              <TabsTrigger value="xml" className="text-[11px]">XML</TabsTrigger>
            </TabsList>

            <TabsContent value="generale" className="space-y-4 mt-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">DOCUMENTO</h4>
                <DetailRow label="Tipo" value={parsed.tipoDocumento} />
                <DetailRow label="Numero" value={parsed.numero} />
                <DetailRow label="Data" value={parsed.data} />
                <DetailRow label="Divisa" value={parsed.divisa} />
                <DetailRow label="Importo Totale" value={formatCurrency(parsed.importoTotale)} />
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">CEDENTE / PRESTATORE</h4>
                <DetailRow label="Denominazione" value={parsed.cedente.denominazione} />
                <DetailRow label="P.IVA" value={parsed.cedente.partitaIva} />
                <DetailRow label="C.F." value={parsed.cedente.codiceFiscale} />
                <DetailRow label="Indirizzo" value={`${parsed.cedente.indirizzo}, ${parsed.cedente.cap} ${parsed.cedente.comune} (${parsed.cedente.provincia})`} />
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">CESSIONARIO / COMMITTENTE</h4>
                <DetailRow label="Denominazione" value={parsed.cessionario.denominazione} />
                <DetailRow label="P.IVA" value={parsed.cessionario.partitaIva} />
                <DetailRow label="C.F." value={parsed.cessionario.codiceFiscale} />
                <DetailRow label="Indirizzo" value={`${parsed.cessionario.indirizzo}, ${parsed.cessionario.cap} ${parsed.cessionario.comune} (${parsed.cessionario.provincia})`} />
              </div>

              {parsed.causale.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">CAUSALE</h4>
                  {parsed.causale.map((c, i) => (
                    <p key={i} className="text-xs text-foreground">{c}</p>
                  ))}
                </div>
              )}

              {/* Riepilogo IVA */}
              {parsed.riepilogoIVA.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">RIEPILOGO IVA</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px] h-8">Aliquota</TableHead>
                        <TableHead className="text-[11px] h-8 text-right">Imponibile</TableHead>
                        <TableHead className="text-[11px] h-8 text-right">Imposta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.riepilogoIVA.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs py-1">{r.aliquota}%</TableCell>
                          <TableCell className="text-xs py-1 text-right font-mono">{formatCurrency(r.imponibile)}</TableCell>
                          <TableCell className="text-xs py-1 text-right font-mono">{formatCurrency(r.imposta)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Allegati */}
              {parsed.allegati.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">ALLEGATI</h4>
                  {parsed.allegati.map((a, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-border/50">
                      <div>
                        <span className="text-xs font-medium">{a.nome}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">{a.formato}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => handleDownloadAttachment(a.base64, a.nome, a.formato)}>
                        <Download className="h-3 w-3 mr-1" />Scarica
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="linee" className="mt-4">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] h-8">N°</TableHead>
                      <TableHead className="text-[11px] h-8">Descrizione</TableHead>
                      <TableHead className="text-[11px] h-8 text-right">Qtà</TableHead>
                      <TableHead className="text-[11px] h-8 text-right">Prezzo</TableHead>
                      <TableHead className="text-[11px] h-8 text-right">Totale</TableHead>
                      <TableHead className="text-[11px] h-8 text-right">IVA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.linee.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs py-1.5">{l.numero}</TableCell>
                        <TableCell className="text-xs py-1.5 max-w-[200px]">{l.descrizione}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{l.quantita || "—"}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{formatCurrency(l.prezzoUnitario)}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right font-mono">{formatCurrency(l.prezzoTotale)}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right">{l.aliquotaIVA}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="pagamento" className="mt-4 space-y-3">
              {parsed.pagamenti.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun dato di pagamento disponibile</p>
              ) : (
                parsed.pagamenti.map((p, i) => (
                  <div key={i} className="border rounded-md p-3 space-y-1">
                    <DetailRow label="Condizioni" value={p.condizioni} />
                    <DetailRow label="Modalità" value={p.modalita} />
                    <DetailRow label="Importo" value={formatCurrency(p.importo)} />
                    <DetailRow label="Scadenza" value={p.dataScadenza} />
                    {p.iban && <DetailRow label="IBAN" value={<span className="font-mono text-[11px]">{p.iban}</span>} />}
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="xml" className="mt-4">
              <ScrollArea className="h-[500px]">
                <pre className="text-[10px] font-mono bg-muted p-3 rounded-md whitespace-pre-wrap break-all">
                  {parsed.rawXml || "XML raw non disponibile (salvato senza raw per risparmiare spazio). Scarica il file originale."}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-sm text-muted-foreground mt-4">Dati XML non disponibili</p>
        )}

        <div className="mt-4 flex gap-2">
          {onDelete && (
            <Button size="sm" variant="destructive" onClick={() => { onDelete(record.id, record.storage_path); onOpenChange(false); }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />Elimina
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
