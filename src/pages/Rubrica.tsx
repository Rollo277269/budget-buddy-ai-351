import { useState, useMemo, useCallback } from "react";
import { useRubrica, ContattoRubrica, Indirizzo, emptyIndirizzo } from "@/hooks/useRubrica";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Save, Download, Search, Users, UserCheck, UserCog, Handshake, X, Pencil, ArrowUp, ArrowDown, ArrowUpDown, MapPin, Building2 } from "lucide-react";
import { toast } from "sonner";

type SortKey = "denominazione" | "tipo" | "partita_iva" | "email" | "telefono" | "note";
type SortDir = "asc" | "desc";

const TIPO_LABELS: Record<string, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "outline" }> = {
  cliente: { label: "Cliente", icon: UserCheck, variant: "secondary" },
  fornitore: { label: "Fornitore", icon: UserCog, variant: "outline" },
  socio: { label: "Socio", icon: Handshake, variant: "default" },
};

const emptyContatto: ContattoRubrica = {
  id: "",
  denominazione: "",
  tipo: "cliente",
  partita_iva: "",
  email: "",
  pec: "",
  codice_sdi: "",
  telefono: "",
  indirizzo: "",
  note: "",
  sede_legale: { ...emptyIndirizzo },
  sede_operativa: { ...emptyIndirizzo },
};

function formatAddress(addr: Indirizzo): string {
  const parts = [
    addr.via && addr.civico ? `${addr.via} ${addr.civico}` : addr.via,
    addr.cap,
    addr.citta,
    addr.provincia ? `(${addr.provincia})` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function buildMapsUrl(addr: Indirizzo): string {
  const q = formatAddress(addr);
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
}

function hasAddress(addr: Indirizzo): boolean {
  return !!(addr.via || addr.citta || addr.cap);
}

interface AddressFieldsProps {
  label: string;
  icon: React.ElementType;
  addr: Indirizzo;
  onChange: (addr: Indirizzo) => void;
}

function AddressFields({ label, icon: Icon, addr, onChange }: AddressFieldsProps) {
  const upd = (key: keyof Indirizzo, val: string) => onChange({ ...addr, [key]: val });
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <Label className="text-xs font-semibold">{label}</Label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="col-span-2 space-y-1">
          <Label className="text-[10px] text-muted-foreground">Via</Label>
          <Input value={addr.via} onChange={(e) => upd("via", e.target.value)} placeholder="Via Roma" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">N. Civico</Label>
          <Input value={addr.civico} onChange={(e) => upd("civico", e.target.value)} placeholder="10" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">CAP</Label>
          <Input value={addr.cap} onChange={(e) => upd("cap", e.target.value)} placeholder="00100" className="h-8 text-sm" maxLength={5} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Provincia</Label>
          <Input value={addr.provincia} onChange={(e) => upd("provincia", e.target.value)} placeholder="RM" className="h-8 text-sm uppercase" maxLength={2} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Città</Label>
        <Input value={addr.citta} onChange={(e) => upd("citta", e.target.value)} placeholder="Roma" className="h-8 text-sm" />
      </div>
    </div>
  );
}

interface AddressDisplayProps {
  label: string;
  icon: React.ElementType;
  addr: Indirizzo;
}

function AddressDisplay({ label, icon: Icon, addr }: AddressDisplayProps) {
  if (!hasAddress(addr)) return null;
  const formatted = formatAddress(addr);
  const mapsUrl = buildMapsUrl(addr);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-sm text-muted-foreground">{formatted}</p>
      <div className="rounded-lg overflow-hidden border h-[200px]">
        <iframe
          src={mapsUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Mappa ${label}`}
        />
      </div>
    </div>
  );
}

export default function RubricaPage() {
  const { contatti, loading, saveContatto, deleteContatto, importFromInvoices } = useRubrica();
  const [editing, setEditing] = useState<ContattoRubrica | null>(null);
  const [detailContact, setDetailContact] = useState<ContattoRubrica | null>(null);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("denominazione");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const filtered = useMemo(() => {
    let list = contatti;
    if (filterTipo) list = list.filter((c) => c.tipo.split(",").includes(filterTipo));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.denominazione.toLowerCase().includes(q) ||
          c.partita_iva.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.note.toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort((a, b) => {
      const aVal = (a[sortKey] || "").toLowerCase();
      const bVal = (b[sortKey] || "").toLowerCase();
      const cmp = aVal.localeCompare(bVal, "it");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [contatti, search, filterTipo, sortKey, sortDir]);

  const counts = useMemo(() => ({
    totale: contatti.length,
    clienti: contatti.filter((c) => c.tipo === "cliente").length,
    fornitori: contatti.filter((c) => c.tipo === "fornitore").length,
    soci: contatti.filter((c) => c.tipo === "socio").length,
  }), [contatti]);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.denominazione.trim()) {
      toast.error("La denominazione è obbligatoria");
      return;
    }
    await saveContatto(editing);
    setEditing(null);
  }, [editing, saveContatto]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Eliminare questo contatto?")) return;
      await deleteContatto(id);
      setDetailContact(null);
    },
    [deleteContatto]
  );

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      await importFromInvoices();
    } finally {
      setImporting(false);
    }
  }, [importFromInvoices]);

  const openEdit = useCallback((c: ContattoRubrica) => {
    setDetailContact(null);
    setEditing({
      ...c,
      sede_legale: c.sede_legale || { ...emptyIndirizzo },
      sede_operativa: c.sede_operativa || { ...emptyIndirizzo },
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Rubrica</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleImport} disabled={importing}>
            <Download className="h-3.5 w-3.5 mr-1" />
            {importing ? "Importazione..." : "Importa da fatture"}
          </Button>
          <Button size="sm" onClick={() => { setDetailContact(null); setEditing({ ...emptyContatto }); }}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nuovo contatto
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => setFilterTipo("")}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{counts.totale}</p>
            <p className="text-xs text-muted-foreground">Totale</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${filterTipo === "cliente" ? "ring-1 ring-primary" : ""}`} onClick={() => setFilterTipo(filterTipo === "cliente" ? "" : "cliente")}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{counts.clienti}</p>
            <p className="text-xs text-muted-foreground">Clienti</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${filterTipo === "fornitore" ? "ring-1 ring-primary" : ""}`} onClick={() => setFilterTipo(filterTipo === "fornitore" ? "" : "fornitore")}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{counts.fornitori}</p>
            <p className="text-xs text-muted-foreground">Fornitori</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${filterTipo === "socio" ? "ring-1 ring-primary" : ""}`} onClick={() => setFilterTipo(filterTipo === "socio" ? "" : "socio")}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{counts.soci}</p>
            <p className="text-xs text-muted-foreground">Soci</p>
          </CardContent>
        </Card>
      </div>

      {/* Edit form */}
      {editing && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Denominazione *</Label>
                <Input
                  value={editing.denominazione}
                  onChange={(e) => setEditing({ ...editing, denominazione: e.target.value })}
                  placeholder="Ragione sociale o nome"
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <div className="flex gap-2">
                  {(["cliente", "fornitore", "socio"] as const).map((t) => {
                    const tipos = editing.tipo.split(",").filter(Boolean);
                    const isActive = tipos.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          const tipos = editing.tipo.split(",").filter(Boolean);
                          let next: string[];
                          if (t === "socio") {
                            if (tipos.includes("socio")) {
                              next = [];
                            } else {
                              next = ["cliente", "fornitore", "socio"];
                            }
                          } else {
                            if (tipos.includes(t)) {
                              next = tipos.filter((v) => v !== t && v !== "socio");
                            } else {
                              next = [...tipos.filter((v) => v !== "socio"), t];
                              if (next.includes("cliente") && next.includes("fornitore")) {
                                next.push("socio");
                              }
                            }
                          }
                          if (next.length === 0) next = [t];
                          setEditing({ ...editing, tipo: next.join(",") });
                        }}
                        className={`flex-1 h-9 rounded-md border text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-input hover:bg-muted"
                        }`}
                      >
                        {t === "cliente" ? "Cliente" : t === "fornitore" ? "Fornitore" : "Socio"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Partita IVA</Label>
                <Input value={editing.partita_iva} onChange={(e) => setEditing({ ...editing, partita_iva: e.target.value })} placeholder="IT01234567890" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} placeholder="email@example.com" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PEC</Label>
                <Input value={editing.pec} onChange={(e) => setEditing({ ...editing, pec: e.target.value })} placeholder="pec@pec.it" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Codice SDI</Label>
                <Input value={editing.codice_sdi} onChange={(e) => setEditing({ ...editing, codice_sdi: e.target.value })} placeholder="0000000" className="h-9 text-sm uppercase" maxLength={7} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefono</Label>
                <Input value={editing.telefono} onChange={(e) => setEditing({ ...editing, telefono: e.target.value })} placeholder="+39 ..." className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note</Label>
                <Input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="Note aggiuntive" className="h-9 text-sm" />
              </div>
            </div>

            <Separator />

            {/* Sede Legale */}
            <AddressFields
              label="Sede Legale"
              icon={Building2}
              addr={editing.sede_legale}
              onChange={(addr) => setEditing({ ...editing, sede_legale: addr })}
            />

            <Separator />

            {/* Sede Operativa */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <Label className="text-xs font-semibold">Sede Operativa</Label>
              </div>
              {hasAddress(editing.sede_legale) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setEditing({ ...editing, sede_operativa: { ...editing.sede_legale } })}
                >
                  <Building2 className="h-3 w-3 mr-1" />Copia da Sede Legale
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Via</Label>
                <Input value={editing.sede_operativa.via} onChange={(e) => setEditing({ ...editing, sede_operativa: { ...editing.sede_operativa, via: e.target.value } })} placeholder="Via Roma" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">N. Civico</Label>
                <Input value={editing.sede_operativa.civico} onChange={(e) => setEditing({ ...editing, sede_operativa: { ...editing.sede_operativa, civico: e.target.value } })} placeholder="10" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">CAP</Label>
                <Input value={editing.sede_operativa.cap} onChange={(e) => setEditing({ ...editing, sede_operativa: { ...editing.sede_operativa, cap: e.target.value } })} placeholder="00100" className="h-8 text-sm" maxLength={5} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Provincia</Label>
                <Input value={editing.sede_operativa.provincia} onChange={(e) => setEditing({ ...editing, sede_operativa: { ...editing.sede_operativa, provincia: e.target.value } })} placeholder="RM" className="h-8 text-sm uppercase" maxLength={2} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Città</Label>
              <Input value={editing.sede_operativa.citta} onChange={(e) => setEditing({ ...editing, sede_operativa: { ...editing.sede_operativa, citta: e.target.value } })} placeholder="Roma" className="h-8 text-sm" />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                <X className="h-3.5 w-3.5 mr-1" />Annulla
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="h-3.5 w-3.5 mr-1" />Salva
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome, P.IVA, email..."
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 rounded-xl border bg-card text-muted-foreground">
          <Users className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{contatti.length === 0 ? "Rubrica vuota — importa i contatti dalle fatture" : "Nessun risultato"}</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {([
                    ["denominazione", "Denominazione"],
                    ["tipo", "Tipo"],
                    ["partita_iva", "P.IVA"],
                    ["email", "Email"],
                    ["telefono", "Telefono"],
                    ["note", "Note"],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <TableHead
                      key={key}
                      className={`text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors ${key === "tipo" ? "w-[100px]" : ""}`}
                      onClick={() => toggleSort(key)}
                    >
                      <div className="flex items-center gap-1">
                        {label}
                        {sortKey === key ? (
                          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-xs w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const info = TIPO_LABELS[c.tipo] || TIPO_LABELS.cliente;
                  const Icon = info.icon;
                  return (
                    <TableRow key={c.id} className="group cursor-pointer hover:bg-muted/30" onClick={() => setDetailContact(c)}>
                      <TableCell className="text-sm font-medium py-2">{c.denominazione}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant={info.variant} className="text-[10px] gap-1">
                          <Icon className="h-3 w-3" />
                          {info.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground font-mono">{c.partita_iva || "—"}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{c.email || "—"}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{c.telefono || "—"}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground max-w-[200px] truncate">{c.note || "—"}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Modifica" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" title="Elimina" onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!detailContact} onOpenChange={(open) => { if (!open) setDetailContact(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {detailContact && (() => {
            const info = TIPO_LABELS[detailContact.tipo] || TIPO_LABELS.cliente;
            const TipoIcon = info.icon;
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-lg">
                    {detailContact.denominazione}
                  </SheetTitle>
                  <Badge variant={info.variant} className="text-xs gap-1 w-fit">
                    <TipoIcon className="h-3 w-3" />
                    {info.label}
                  </Badge>
                </SheetHeader>

                <div className="space-y-4 mt-4">
                  {/* Info generali */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Partita IVA</p>
                      <p className="font-mono">{detailContact.partita_iva || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Email</p>
                      <p>{detailContact.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">PEC</p>
                      <p>{detailContact.pec || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Codice SDI</p>
                      <p className="font-mono">{detailContact.codice_sdi || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Telefono</p>
                      <p>{detailContact.telefono || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Note</p>
                      <p>{detailContact.note || "—"}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Sede Legale */}
                  <AddressDisplay label="Sede Legale" icon={Building2} addr={detailContact.sede_legale} />

                  {/* Sede Operativa */}
                  <AddressDisplay label="Sede Operativa" icon={MapPin} addr={detailContact.sede_operativa} />

                  {!hasAddress(detailContact.sede_legale) && !hasAddress(detailContact.sede_operativa) && (
                    <p className="text-sm text-muted-foreground italic text-center py-4">
                      Nessun indirizzo inserito — modifica il contatto per aggiungere le sedi
                    </p>
                  )}

                  <Separator />

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => openEdit(detailContact)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />Modifica
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(detailContact.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />Elimina
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
