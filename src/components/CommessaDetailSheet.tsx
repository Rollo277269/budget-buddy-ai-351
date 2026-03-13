import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { ManualLink } from "@/hooks/useCommessaLinks";
import { CssrCommessa } from "@/hooks/useCssrCommesse";
import { Link2, Link2Off, Plus, Search, X, Building2, Calendar, FileText, User } from "lucide-react";
import { formatCurrency } from "@/lib/format";

function invoiceKey(anno: number, numero: number) {
  return `${anno}-${numero}`;
}

interface Commessa {
  numero: string | number;
  oggetto: string;
  committente: string;
  assegnataria: string;
  cig: string;
  cssrData?: CssrCommessa;
}

interface CommessaDetailSheetProps {
  commessa: Commessa | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allSales: SaleInvoice[];
  allPurchases: PurchaseInvoice[];
  manualLinks: ManualLink[];
  onAddLink: (link: ManualLink) => void;
  onRemoveLink: (invoiceKey: string, invoiceType: "vendita" | "acquisto", cig: string) => void;
}

export function CommessaDetailSheet({
  commessa,
  open,
  onOpenChange,
  allSales,
  allPurchases,
  manualLinks,
  onAddLink,
  onRemoveLink,
}: CommessaDetailSheetProps) {
  const [addMode, setAddMode] = useState<"vendita" | "acquisto" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  if (!commessa) return null;

  const cigLinks = manualLinks.filter((l) => l.cig === commessa.cig);
  const manualSaleKeys = new Set(cigLinks.filter((l) => l.invoiceType === "vendita").map((l) => l.invoiceKey));
  const manualPurchaseKeys = new Set(cigLinks.filter((l) => l.invoiceType === "acquisto").map((l) => l.invoiceKey));

  const autoSales = allSales.filter((s) => s.cig === commessa.cig);
  const autoPurchases = allPurchases.filter((p) => p.cig === commessa.cig);

  const manualSales = allSales.filter((s) => manualSaleKeys.has(invoiceKey(s.anno, s.numero)) && s.cig !== commessa.cig);
  const manualPurchases = allPurchases.filter((p) => manualPurchaseKeys.has(invoiceKey(p.anno, p.numero)) && p.cig !== commessa.cig);

  const linkedSales = [...autoSales, ...manualSales];
  const linkedPurchases = [...autoPurchases, ...manualPurchases];

  const totalVendite = linkedSales.reduce((s, i) => s + i.totale, 0);
  const totalAcquisti = linkedPurchases.reduce((s, i) => s + i.totale, 0);

  const allLinkedSaleKeys = new Set([
    ...autoSales.map((s) => invoiceKey(s.anno, s.numero)),
    ...manualSaleKeys,
  ]);
  const allLinkedPurchaseKeys = new Set([
    ...autoPurchases.map((p) => invoiceKey(p.anno, p.numero)),
    ...manualPurchaseKeys,
  ]);

  const availableSales = allSales.filter((s) => !allLinkedSaleKeys.has(invoiceKey(s.anno, s.numero)));
  const availablePurchases = allPurchases.filter((p) => !allLinkedPurchaseKeys.has(invoiceKey(p.anno, p.numero)));

  const lower = searchQuery.toLowerCase();
  const filteredAvailable = addMode === "vendita"
    ? availableSales.filter((s) =>
        s.cliente.toLowerCase().includes(lower) ||
        String(s.numero).includes(lower) ||
        s.descrizione?.toLowerCase().includes(lower)
      ).slice(0, 20)
    : addMode === "acquisto"
    ? availablePurchases.filter((p) =>
        p.fornitore.toLowerCase().includes(lower) ||
        String(p.numero).includes(lower) ||
        p.descrizione?.toLowerCase().includes(lower)
      ).slice(0, 20)
    : [];

  const cssr = commessa.cssrData;
  const importoContratto = cssr?.importo_contrattuale ? parseFloat(cssr.importo_contrattuale) : null;

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setAddMode(null); setSearchQuery(""); } }}>
      <SheetContent side="right" className="w-full sm:max-w-[55vw] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">{commessa.cig}</Badge>
            Commessa #{commessa.numero}
            {cssr && <Badge variant="secondary" className="text-[10px]">CSSR</Badge>}
          </SheetTitle>
          <SheetDescription>{commessa.oggetto}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-2">
          {/* CSSR Data Section */}
          {cssr && (
            <>
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dati Commessa (CSSR)</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <CssrField icon={Building2} label="Committente" value={cssr.committente} />
                  <CssrField icon={Building2} label="Impresa Assegnataria" value={cssr.impresa_assegnataria} />
                  <CssrField icon={User} label="RUP" value={cssr.rup} />
                  <CssrField icon={User} label="Direttore Lavori" value={cssr.direttore_lavori} />
                  <CssrField icon={FileText} label="CUP" value={cssr.cup} />
                  <CssrField icon={FileText} label="N° Repertorio" value={cssr.numero_repertorio} />
                  <CssrField icon={Calendar} label="Data Contratto" value={cssr.data_contratto} />
                  <CssrField icon={Calendar} label="Scadenza Contratto" value={cssr.data_scadenza_contratto} />
                  <CssrField icon={Calendar} label="Consegna Lavori" value={cssr.data_consegna_lavori} />
                  <CssrField icon={Calendar} label="Durata" value={cssr.durata_contrattuale} />
                </div>
                <Separator />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MiniCard label="Importo Contrattuale" value={importoContratto != null && !isNaN(importoContratto) ? formatCurrency(importoContratto) : (cssr.importo_contrattuale || "—")} />
                  <MiniCard label="Base Gara" value={cssr.importo_base_gara ? (isNaN(parseFloat(cssr.importo_base_gara)) ? cssr.importo_base_gara : formatCurrency(parseFloat(cssr.importo_base_gara))) : "—"} />
                  <MiniCard label="Ribasso" value={cssr.ribasso ? `${cssr.ribasso}%` : "—"} />
                  <MiniCard label="Stato" value={cssr.stato} highlight />
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Vendite</p>
              <p className="text-sm font-bold font-mono">{formatCurrency(totalVendite)}</p>
              <p className="text-[10px] text-muted-foreground">{linkedSales.length} fatture</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Acquisti</p>
              <p className="text-sm font-bold font-mono">{formatCurrency(totalAcquisti)}</p>
              <p className="text-[10px] text-muted-foreground">{linkedPurchases.length} fatture</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p className={`text-sm font-bold font-mono ${totalVendite - totalAcquisti >= 0 ? "text-income" : "text-expense"}`}>
                {formatCurrency(totalVendite - totalAcquisti)}
              </p>
              {importoContratto != null && !isNaN(importoContratto) && importoContratto > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {Math.round((totalVendite / importoContratto) * 100)}% fatturato
                </p>
              )}
            </div>
          </div>

          {/* Fatture di Vendita */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Fatture di Vendita ({linkedSales.length})</h3>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => { setAddMode(addMode === "vendita" ? null : "vendita"); setSearchQuery(""); }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Associa manualmente
              </Button>
            </div>
            <InvoiceList
              invoices={linkedSales}
              type="vendita"
              autoKeys={new Set(autoSales.map((s) => invoiceKey(s.anno, s.numero)))}
              cig={commessa.cig}
              onRemoveLink={onRemoveLink}
            />
          </div>

          {addMode === "vendita" && (
            <LinkSearchPanel
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              items={filteredAvailable as SaleInvoice[]}
              type="vendita"
              cig={commessa.cig}
              onAdd={onAddLink}
              onClose={() => { setAddMode(null); setSearchQuery(""); }}
            />
          )}

          <Separator />

          {/* Fatture di Acquisto */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Fatture di Acquisto ({linkedPurchases.length})</h3>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => { setAddMode(addMode === "acquisto" ? null : "acquisto"); setSearchQuery(""); }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Associa manualmente
              </Button>
            </div>
            <InvoiceList
              invoices={linkedPurchases}
              type="acquisto"
              autoKeys={new Set(autoPurchases.map((p) => invoiceKey(p.anno, p.numero)))}
              cig={commessa.cig}
              onRemoveLink={onRemoveLink}
            />
          </div>

          {addMode === "acquisto" && (
            <LinkSearchPanel
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              items={filteredAvailable as PurchaseInvoice[]}
              type="acquisto"
              cig={commessa.cig}
              onAdd={onAddLink}
              onClose={() => { setAddMode(null); setSearchQuery(""); }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── CSSR field helpers ── */
function CssrField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-medium truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

function MiniCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-xs font-bold font-mono ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

/* ── Invoice list sub-component ── */
function InvoiceList({
  invoices,
  type,
  autoKeys,
  cig,
  onRemoveLink,
}: {
  invoices: (SaleInvoice | PurchaseInvoice)[];
  type: "vendita" | "acquisto";
  autoKeys: Set<string>;
  cig: string;
  onRemoveLink: (key: string, type: "vendita" | "acquisto", cig: string) => void;
}) {
  if (invoices.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Nessuna fattura collegata</p>;
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="max-h-[250px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">N°</TableHead>
              <TableHead className="text-xs">Data</TableHead>
              <TableHead className="text-xs">{type === "vendita" ? "Cliente" : "Fornitore"}</TableHead>
              <TableHead className="text-xs text-right">Totale</TableHead>
              <TableHead className="text-xs w-[80px]">Tipo</TableHead>
              <TableHead className="text-xs w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => {
              const key = invoiceKey(inv.anno, inv.numero);
              const isAuto = autoKeys.has(key);
              const counterpart = type === "vendita"
                ? (inv as SaleInvoice).cliente
                : (inv as PurchaseInvoice).fornitore;

              return (
                <TableRow key={key}>
                  <TableCell className="font-mono text-xs">{inv.numero}/{inv.anno}</TableCell>
                  <TableCell className="text-xs">{inv.data}</TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate">{counterpart}</TableCell>
                  <TableCell className="text-xs font-mono text-right">{formatCurrency(inv.totale)}</TableCell>
                  <TableCell>
                    <Badge variant={isAuto ? "secondary" : "outline"} className="text-[9px]">
                      {isAuto ? (
                        <><Link2 className="h-2.5 w-2.5 mr-0.5" />CIG</>
                      ) : (
                        <><Link2Off className="h-2.5 w-2.5 mr-0.5" />Man.</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!isAuto && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveLink(key, type, cig)}
                        title="Rimuovi associazione"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ── Search panel for manual linking ── */
function LinkSearchPanel({
  searchQuery,
  onSearchChange,
  items,
  type,
  cig,
  onAdd,
  onClose,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  items: (SaleInvoice | PurchaseInvoice)[];
  type: "vendita" | "acquisto";
  cig: string;
  onAdd: (link: ManualLink) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          autoFocus
          placeholder={`Cerca fattura di ${type} per nome, numero o descrizione...`}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 text-xs"
        />
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {searchQuery.length > 0 && (
        <div className="max-h-[200px] overflow-auto space-y-1">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Nessun risultato</p>
          ) : (
            items.map((inv) => {
              const key = invoiceKey(inv.anno, inv.numero);
              const counterpart = type === "vendita"
                ? (inv as SaleInvoice).cliente
                : (inv as PurchaseInvoice).fornitore;

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border bg-card p-2 hover:bg-muted/50 cursor-pointer"
                  onClick={() => onAdd({ invoiceKey: key, invoiceType: type, cig })}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs shrink-0">{inv.numero}/{inv.anno}</span>
                    <span className="text-xs truncate">{counterpart}</span>
                  </div>
                  <span className="text-xs font-mono shrink-0 ml-2">{formatCurrency(inv.totale)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
