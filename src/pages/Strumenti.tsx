import { useState, useEffect, useCallback, useRef } from "react";
import { Settings, Landmark, FileText, CalendarClock, Plus, Trash2, Save, AlertTriangle, Clock, CheckCircle2, Building2, TrendingUp, TrendingDown, Pencil, Check, X, GripVertical, Tag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { formatCurrency } from "@/lib/format";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { toast } from "sonner";

// ─── Conti Correnti ──────────────────────────────────────────────

interface ContoCorrente {
  id: string;
  tipo: "conto_corrente" | "carta_credito" | "finanziamento" | "crediti_fiscali";
  banca: string;
  iban: string;
  intestatario: string;
  note: string;
}

const CONTI_KEY = "conti-correnti";

function loadConti(): ContoCorrente[] {
  try {return JSON.parse(localStorage.getItem(CONTI_KEY) || "[]");}
  catch {return [];}
}

function saveConti(conti: ContoCorrente[]) {
  localStorage.setItem(CONTI_KEY, JSON.stringify(conti));
}

function ContiCorrentiTab() {
  const [conti, setConti] = useState<ContoCorrente[]>(loadConti);
  const [editing, setEditing] = useState<ContoCorrente | null>(null);

  const empty: ContoCorrente = { id: "", tipo: "conto_corrente", banca: "", iban: "", intestatario: "", note: "" };

  const handleSave = () => {
    if (!editing) return;
    if (!editing.banca || !editing.iban) {
      toast.error("Banca e IBAN sono obbligatori");
      return;
    }
    const updated = editing.id ?
    conti.map((c) => c.id === editing.id ? editing : c) :
    [...conti, { ...editing, id: crypto.randomUUID() }];
    setConti(updated);
    saveConti(updated);
    setEditing(null);
    toast.success(editing.id ? "Conto aggiornato" : "Conto aggiunto");
  };

  const handleDelete = (id: string) => {
    const updated = conti.filter((c) => c.id !== id);
    setConti(updated);
    saveConti(updated);
    toast.success("Conto eliminato");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Conti Correnti</h3>
          <p className="text-xs text-muted-foreground">Gestisci i dati dei conti correnti bancari</p>
        </div>
        <Button size="sm" onClick={() => setEditing({ ...empty })}>
          <Plus className="h-3.5 w-3.5 mr-1" />Aggiungi
        </Button>
      </div>

      {editing &&
      <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo *</Label>
                <select
                value={editing.tipo}
                onChange={(e) => setEditing({ ...editing, tipo: e.target.value as ContoCorrente["tipo"] })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                
                  <option value="conto_corrente">Conto Corrente</option>
                  <option value="carta_credito">Carta di Credito</option>
                  <option value="finanziamento">Finanziamento</option>
                  <option value="crediti_fiscali">Crediti Fiscali</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Banca / Emittente *</Label>
                <Input value={editing.banca} onChange={(e) => setEditing({ ...editing, banca: e.target.value })} placeholder="Nome banca o emittente" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{editing.tipo === "carta_credito" ? "Numero Carta" : "IBAN"} *</Label>
                <Input value={editing.iban} onChange={(e) => setEditing({ ...editing, iban: e.target.value.toUpperCase() })} placeholder={editing.tipo === "carta_credito" ? "**** **** **** 1234" : "IT60X0542811101000000123456"} className="h-9 text-sm font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Intestatario</Label>
                <Input value={editing.intestatario} onChange={(e) => setEditing({ ...editing, intestatario: e.target.value })} placeholder="Ragione sociale" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note</Label>
                <Input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="Note aggiuntive" className="h-9 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Annulla</Button>
              <Button size="sm" onClick={handleSave}><Save className="h-3.5 w-3.5 mr-1" />Salva</Button>
            </div>
          </CardContent>
        </Card>
      }

      {conti.length === 0 && !editing ?
      <div className="flex flex-col items-center justify-center h-40 rounded-xl border bg-card text-muted-foreground">
          <Landmark className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Nessun conto corrente configurato</p>
        </div> :

      <div className="grid gap-3">
          {conti.map((c) =>
        <Card key={c.id} className="group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{c.banca}</p>
                      <Badge variant="outline" className="text-[10px]">{{ conto_corrente: "C/C", carta_credito: "Carta", finanziamento: "Finanz.", crediti_fiscali: "Cred. Fiscali" }[c.tipo]}</Badge>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground">{c.iban}</p>
                    {c.intestatario && <p className="text-xs text-muted-foreground">{c.intestatario}</p>}
                    {c.note && <p className="text-xs text-muted-foreground italic">{c.note}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(c)}>
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
        )}
        </div>
      }
    </div>);

}

// ─── Regole Denominazione ────────────────────────────────────────

interface NamingRule {
  id: string;
  tipo: string;
  pattern: string;
  esempio: string;
}

const RULES_KEY = "naming-rules";

function loadRules(): NamingRule[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RULES_KEY) || "null");
    if (saved) return saved;
  } catch {}
  return [
  { id: "1", tipo: "Fattura Vendita", pattern: "FV_{ANNO}_{NUMERO}_{CLIENTE}", esempio: "FV_2024_001_RossiSRL" },
  { id: "2", tipo: "Fattura Acquisto", pattern: "FA_{ANNO}_{NUMERO}_{FORNITORE}", esempio: "FA_2024_042_BianchiSPA" },
  { id: "3", tipo: "Estratto Conto", pattern: "EC_{BANCA}_{MESE}_{ANNO}", esempio: "EC_Intesa_01_2024" }];

}

function saveRules(rules: NamingRule[]) {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

function NamingRulesTab() {
  const [rules, setRules] = useState<NamingRule[]>(loadRules);
  const [editing, setEditing] = useState<NamingRule | null>(null);

  const empty: NamingRule = { id: "", tipo: "", pattern: "", esempio: "" };

  const handleSave = () => {
    if (!editing) return;
    if (!editing.tipo || !editing.pattern) {
      toast.error("Tipo documento e pattern sono obbligatori");
      return;
    }
    const updated = editing.id ?
    rules.map((r) => r.id === editing.id ? editing : r) :
    [...rules, { ...editing, id: crypto.randomUUID() }];
    setRules(updated);
    saveRules(updated);
    setEditing(null);
    toast.success("Regola salvata");
  };

  const handleDelete = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    saveRules(updated);
    toast.success("Regola eliminata");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Regole di Denominazione</h3>
          <p className="text-xs text-muted-foreground">Definisci le convenzioni per i nomi dei file caricati</p>
        </div>
        <Button size="sm" onClick={() => setEditing({ ...empty })}>
          <Plus className="h-3.5 w-3.5 mr-1" />Aggiungi
        </Button>
      </div>

      {editing &&
      <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo Documento *</Label>
                <Input value={editing.tipo} onChange={(e) => setEditing({ ...editing, tipo: e.target.value })} placeholder="Es. Fattura Vendita" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pattern *</Label>
                <Input value={editing.pattern} onChange={(e) => setEditing({ ...editing, pattern: e.target.value })} placeholder="Es. FV_{ANNO}_{NUMERO}" className="h-9 text-sm font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Esempio</Label>
                <Input value={editing.esempio} onChange={(e) => setEditing({ ...editing, esempio: e.target.value })} placeholder="Es. FV_2024_001_RossiSRL" className="h-9 text-sm font-mono" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Annulla</Button>
              <Button size="sm" onClick={handleSave}><Save className="h-3.5 w-3.5 mr-1" />Salva</Button>
            </div>
          </CardContent>
        </Card>
      }

      <div className="text-xs text-muted-foreground rounded-lg border bg-muted/30 p-3">
        <p className="font-medium mb-1">Variabili disponibili:</p>
        <div className="flex flex-wrap gap-2">
          {["{ANNO}", "{MESE}", "{NUMERO}", "{CLIENTE}", "{FORNITORE}", "{BANCA}", "{CIG}", "{DATA}"].map((v) =>
          <Badge key={v} variant="outline" className="font-mono text-[10px]">{v}</Badge>
          )}
        </div>
      </div>

      {rules.length === 0 && !editing ?
      <div className="flex flex-col items-center justify-center h-40 rounded-xl border bg-card text-muted-foreground">
          <FileText className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Nessuna regola configurata</p>
        </div> :

      <div className="space-y-2">
          {rules.map((r) =>
        <Card key={r.id} className="group">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <Badge variant="secondary" className="text-[10px] shrink-0">{r.tipo}</Badge>
                  <span className="text-xs font-mono truncate">{r.pattern}</span>
                  {r.esempio &&
              <>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-xs text-muted-foreground font-mono truncate">{r.esempio}</span>
                    </>
              }
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(r)}>
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
        )}
        </div>
      }
    </div>);

}

// ─── Centri di Costo / Ricavo ────────────────────────────────────

interface CentroCR {
  id: string;
  tipo: "costo" | "ricavo";
  codice: string;
  descrizione: string;
  paroleChiaveMatching: string;
  note: string;
}

const CENTRI_KEY = "centri-costo-ricavo";

function loadCentri(): CentroCR[] {
  try {return JSON.parse(localStorage.getItem(CENTRI_KEY) || "[]");}
  catch {return [];}
}

function saveCentri(centri: CentroCR[]) {
  localStorage.setItem(CENTRI_KEY, JSON.stringify(centri));
}

function CentriCostoRicavoTab() {
  const [centri, setCentri] = useState<CentroCR[]>(loadCentri);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCodice, setEditCodice] = useState("");
  const [editDescrizione, setEditDescrizione] = useState("");
  const [editParoleChiave, setEditParoleChiave] = useState("");
  const [editNote, setEditNote] = useState("");
  const [addingTo, setAddingTo] = useState<"costo" | "ricavo" | null>(null);
  const [newCodice, setNewCodice] = useState("");
  const [newDescrizione, setNewDescrizione] = useState("");
  const [newParoleChiave, setNewParoleChiave] = useState("");
  const [newNote, setNewNote] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragItemRef = useRef<string | null>(null);

  const startEdit = (c: CentroCR) => {
    setEditingId(c.id);
    setEditCodice(c.codice);
    setEditDescrizione(c.descrizione);
    setEditParoleChiave(c.paroleChiaveMatching);
    setEditNote(c.note);
  };

  const cancelEdit = () => {setEditingId(null);};

  const saveEdit = () => {
    if (!editingId || !editCodice.trim() || !editDescrizione.trim()) {
      toast.error("Codice e descrizione sono obbligatori");
      return;
    }
    const duplicate = centri.find((c) => c.codice === editCodice.toUpperCase() && c.id !== editingId);
    if (duplicate) {toast.error("Codice già esistente");return;}
    const updated = centri.map((c) =>
    c.id === editingId ?
    { ...c, codice: editCodice.toUpperCase(), descrizione: editDescrizione, paroleChiaveMatching: editParoleChiave, note: editNote } :
    c
    );
    setCentri(updated);
    saveCentri(updated);
    setEditingId(null);
    toast.success("Centro aggiornato");
  };

  const handleAdd = (tipo: "costo" | "ricavo") => {
    if (!newCodice.trim() || !newDescrizione.trim()) {
      toast.error("Codice e descrizione sono obbligatori");
      return;
    }
    const duplicate = centri.find((c) => c.codice === newCodice.toUpperCase());
    if (duplicate) {toast.error("Codice già esistente");return;}
    const newCentro: CentroCR = {
      id: crypto.randomUUID(),
      tipo,
      codice: newCodice.toUpperCase(),
      descrizione: newDescrizione,
      paroleChiaveMatching: newParoleChiave,
      note: newNote
    };
    const updated = [...centri, newCentro];
    setCentri(updated);
    saveCentri(updated);
    setAddingTo(null);
    setNewCodice("");setNewDescrizione("");setNewParoleChiave("");setNewNote("");
    toast.success("Centro aggiunto");
  };

  const cancelAdd = () => {
    setAddingTo(null);
    setNewCodice("");setNewDescrizione("");setNewResponsabile("");setNewNote("");
  };

  const handleDelete = (id: string) => {
    const updated = centri.filter((c) => c.id !== id);
    setCentri(updated);
    saveCentri(updated);
    toast.success("Centro eliminato");
  };

  const handleReorder = (dragId: string, dropId: string, items: CentroCR[]) => {
    const dragIdx = items.findIndex((c) => c.id === dragId);
    const dropIdx = items.findIndex((c) => c.id === dropId);
    if (dragIdx === -1 || dropIdx === -1 || dragIdx === dropIdx) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    const otherItems = centri.filter((c) => c.tipo !== items[0]?.tipo);
    const updated = [...otherItems, ...reordered];
    setCentri(updated);
    saveCentri(updated);
  };

  const renderTable = (tipo: "costo" | "ricavo") => {
    const items = centri.filter((c) => c.tipo === tipo);
    const isAdding = addingTo === tipo;
    const title = tipo === "costo" ? "Centri di Costo" : "Centri di Ricavo";

    return (
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <div className={`flex items-center justify-between px-4 py-3 border-b border-border ${tipo === "costo" ? "bg-destructive" : "bg-emerald-600"}`}>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-white" />
            <h3 className="font-semibold text-sm text-white">{title}</h3>
            <Badge variant="secondary" className="text-[10px]">
              {items.length}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {setAddingTo(tipo);setNewCodice("");setNewDescrizione("");setNewResponsabile("");setNewNote("");}}
            disabled={isAdding}>
            
            <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-[25%]">Codice</TableHead>
              <TableHead className="w-[30%]">Descrizione</TableHead>
              <TableHead>Responsabile</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && !isAdding &&
            <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                  Nessun centro configurato
                </TableCell>
              </TableRow>
            }
            {items.map((c) =>
            <TableRow
              key={c.id}
              draggable={editingId !== c.id}
              onDragStart={() => {dragItemRef.current = c.id;}}
              onDragOver={(e) => {e.preventDefault();setDragOverId(c.id);}}
              onDrop={() => {if (dragItemRef.current) handleReorder(dragItemRef.current, c.id, items);dragItemRef.current = null;setDragOverId(null);}}
              onDragEnd={() => {dragItemRef.current = null;setDragOverId(null);}}
              className={dragOverId === c.id ? "bg-accent" : ""}>
              
                {editingId === c.id ?
              <>
                    <TableCell className="w-8 cursor-grab"><GripVertical className="w-4 h-4 opacity-30" /></TableCell>
                    <TableCell>
                      <Input value={editCodice} onChange={(e) => setEditCodice(e.target.value.toUpperCase())} className="h-8 text-sm font-mono" autoFocus />
                    </TableCell>
                    <TableCell>
                      <Input value={editDescrizione} onChange={(e) => setEditDescrizione(e.target.value)} className="h-8 text-sm" />
                    </TableCell>
                    <TableCell>
                      <Input value={editResponsabile} onChange={(e) => setEditResponsabile(e.target.value)} className="h-8 text-sm" />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={saveEdit}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </> :

              <>
                    <TableCell className="w-8 cursor-grab"><GripVertical className="w-4 h-4 opacity-30" /></TableCell>
                    <TableCell className="font-mono text-sm font-semibold">{c.codice}</TableCell>
                    <TableCell className="text-sm">{c.descrizione}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.responsabile || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {if (confirm(`Eliminare "${c.codice} - ${c.descrizione}"?`)) handleDelete(c.id);}}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </>
              }
              </TableRow>
            )}
            {isAdding &&
            <TableRow>
                <TableCell />
                <TableCell>
                  <Input value={newCodice} onChange={(e) => setNewCodice(e.target.value.toUpperCase())} className="h-8 text-sm font-mono" placeholder="Codice..." autoFocus />
                </TableCell>
                <TableCell>
                  <Input value={newDescrizione} onChange={(e) => setNewDescrizione(e.target.value)} className="h-8 text-sm" placeholder="Descrizione..." />
                </TableCell>
                <TableCell>
                  <Input value={newResponsabile} onChange={(e) => setNewResponsabile(e.target.value)} className="h-8 text-sm" placeholder="Responsabile..." />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleAdd(tipo)} disabled={!newCodice.trim() || !newDescrizione.trim()}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelAdd}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            }
          </TableBody>
        </Table>
      </div>);

  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Centri di Costo e Ricavo</h3>
        <p className="text-xs text-muted-foreground">Configura i Centri di Costo e di Ricavo. Per ogni centro puoi definire delle parole chiave (separate da virgola) per l'assegnamento automatico delle fatture caricate. Ad es. materiale, cemento, calcestruzzo

        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderTable("costo")}
        {renderTable("ricavo")}
      </div>
    </div>);

}

// ─── Scadenzario ─────────────────────────────────────────────────



function parseDate(d: string): Date | null {
  if (!d) return null;
  const parts = d.split("/");
  if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return null;
}

interface ScadenzaRow {
  tipo: "credito" | "debito";
  numero: string;
  soggetto: string;
  totale: number;
  scadenza: string;
  scadenzaDate: Date | null;
  giorniRimasti: number;
  stato: "scaduta" | "in_scadenza" | "regolare";
  cig: string;
}

const scadenzaCols: ColumnDef<ScadenzaRow>[] = [
{
  key: "stato", label: "Stato", sortable: true, filterable: true,
  render: (r) => {
    if (r.stato === "scaduta") return <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Scaduta</Badge>;
    if (r.stato === "in_scadenza") return <Badge className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] text-[10px]"><Clock className="h-3 w-3 mr-1" />In scadenza</Badge>;
    return <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Regolare</Badge>;
  }
},
{
  key: "tipo", label: "Tipo", sortable: true, filterable: true,
  render: (r) => <Badge variant={r.tipo === "credito" ? "secondary" : "outline"} className="text-[10px]">{r.tipo === "credito" ? "Credito" : "Debito"}</Badge>
},
{ key: "numero", label: "N° Fattura", sortable: true, render: (r) => <span className="text-xs font-mono">{r.numero}</span> },
{ key: "soggetto", label: "Soggetto", filterable: true, render: (r) => <span className="text-xs truncate max-w-[200px] block">{r.soggetto}</span> },
{ key: "scadenza", label: "Scadenza", sortable: true, render: (r) => <span className="text-xs">{r.scadenza}</span> },
{
  key: "giorniRimasti", label: "Giorni", sortable: true, align: "right",
  render: (r) =>
  <span className={`text-xs font-mono font-medium ${r.giorniRimasti < 0 ? "text-destructive" : r.giorniRimasti <= 30 ? "text-[hsl(var(--warning))]" : "text-muted-foreground"}`}>
        {r.giorniRimasti < 0 ? `${Math.abs(r.giorniRimasti)}g fa` : `${r.giorniRimasti}g`}
      </span>

},
{
  key: "totale", label: "Importo", sortable: true, align: "right",
  render: (r) => <span className={`text-xs font-mono font-medium ${r.tipo === "credito" ? "text-income" : "text-expense"}`}>{formatCurrency(r.totale)}</span>
},
{ key: "cig", label: "CIG", filterable: true, defaultHidden: true, render: (r) => r.cig ? <span className="text-xs font-mono">{r.cig}</span> : <span className="text-xs text-muted-foreground">—</span> }];


function ScadenzarioTab() {
  const { allSales, allPurchases, loading } = useInvoiceData();

  const rows: ScadenzaRow[] = (() => {
    if (loading) return [];
    const now = new Date();
    const result: ScadenzaRow[] = [];

    const getStato = (stato: string, scadDate: Date | null): ScadenzaRow["stato"] => {
      const s = stato.toLowerCase();
      if (s.includes("scadut")) return "scaduta";
      if (s.includes("scadere")) return "in_scadenza";
      if (!scadDate) return "regolare";
      const days = (scadDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (days < 0) return "scaduta";
      if (days <= 30) return "in_scadenza";
      return "regolare";
    };

    allSales.forEach((s) => {
      const d = parseDate(s.scadenza || s.data);
      const days = d ? Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 9999;
      const stato = getStato(s.stato, d);
      if (stato !== "regolare") {
        result.push({ tipo: "credito", numero: `${s.numero}/${s.anno}`, soggetto: s.cliente, totale: s.totale, scadenza: s.scadenza || s.data, scadenzaDate: d, giorniRimasti: days, stato, cig: s.cig });
      }
    });

    allPurchases.forEach((p) => {
      const d = parseDate(p.scadenza || p.data);
      const days = d ? Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 9999;
      const stato = getStato(p.stato, d);
      if (stato !== "regolare") {
        result.push({ tipo: "debito", numero: `${p.numero}/${p.anno}`, soggetto: p.fornitore, totale: p.totale, scadenza: p.scadenza || p.data, scadenzaDate: d, giorniRimasti: days, stato, cig: p.cig });
      }
    });

    return result.sort((a, b) => a.giorniRimasti - b.giorniRimasti);
  })();

  const totCrediti = rows.filter((r) => r.tipo === "credito").reduce((s, r) => s + r.totale, 0);
  const totDebiti = rows.filter((r) => r.tipo === "debito").reduce((s, r) => s + r.totale, 0);
  const scadute = rows.filter((r) => r.stato === "scaduta").length;
  const inScadenza = rows.filter((r) => r.stato === "in_scadenza").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>);

  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Scadenzario</h3>
        <p className="text-xs text-muted-foreground">Fatture scadute e in scadenza entro 30 giorni</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Scadute</p>
            <p className="text-xl font-bold text-destructive">{scadute}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">In Scadenza</p>
            <p className="text-xl font-bold text-[hsl(var(--warning))]">{inScadenza}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Crediti aperti</p>
            <p className="text-lg font-bold font-mono text-income">{formatCurrency(totCrediti)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Debiti aperti</p>
            <p className="text-lg font-bold font-mono text-expense">{formatCurrency(totDebiti)}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable<ScadenzaRow>
        columns={scadenzaCols}
        data={rows}
        rowKey={(r) => `${r.tipo}-${r.numero}`} />
      
    </div>);

}

// ─── Main Page ───────────────────────────────────────────────────

const StrumentiPage = () => {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Strumenti</h2>
        <p className="text-sm text-muted-foreground">Configurazione e utilità</p>
      </div>

      <Tabs defaultValue="conti" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="conti" className="text-xs">
            <Landmark className="h-3.5 w-3.5 mr-1.5" />Conti Correnti
          </TabsTrigger>
          <TabsTrigger value="centri" className="text-xs">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />Centri C/R
          </TabsTrigger>
          <TabsTrigger value="naming" className="text-xs">
            <FileText className="h-3.5 w-3.5 mr-1.5" />Denominazione
          </TabsTrigger>
          <TabsTrigger value="scadenzario" className="text-xs">
            <CalendarClock className="h-3.5 w-3.5 mr-1.5" />Scadenzario
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conti">
          <ContiCorrentiTab />
        </TabsContent>
        <TabsContent value="centri">
          <CentriCostoRicavoTab />
        </TabsContent>
        <TabsContent value="naming">
          <NamingRulesTab />
        </TabsContent>
        <TabsContent value="scadenzario">
          <ScadenzarioTab />
        </TabsContent>
      </Tabs>
    </div>);

};

export default StrumentiPage;