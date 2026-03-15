import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Settings, Landmark, FileText, Plus, Trash2, Save, Building2, TrendingUp, TrendingDown, Pencil, Check, X, GripVertical, Tag, ChevronDown, ChevronRight, FolderOpen, Download, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRef as useFileRef } from "react";
// ─── Conti Correnti ──────────────────────────────────────────────

import { useContiCorrenti, ContoCorrente } from "@/hooks/useContiCorrenti";

function ContiCorrentiTab() {
  const { conti, saveConto, deleteConto } = useContiCorrenti();
  const [editing, setEditing] = useState<ContoCorrente | null>(null);

  const empty: ContoCorrente = { id: "", tipo: "conto_corrente", banca: "", iban: "", intestatario: "", note: "" };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.banca || !editing.iban) {
      toast.error("Banca e IBAN sono obbligatori");
      return;
    }
    await saveConto(editing);
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    await deleteConto(id);
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
    </div>
  );
}


// ─── Regole Denominazione ────────────────────────────────────────

import { useNamingRules, NamingRule } from "@/hooks/useNamingRules";

function NamingRulesTab() {
  const { rules, saveRule, deleteRule } = useNamingRules();
  const [editing, setEditing] = useState<NamingRule | null>(null);

  const empty: NamingRule = { id: "", tipo: "", pattern: "", esempio: "" };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.tipo || !editing.pattern) {
      toast.error("Tipo documento e pattern sono obbligatori");
      return;
    }
    await saveRule(editing);
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    await deleteRule(id);
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
    </div>
  );
}

// ─── Centri di Costo / Ricavo ────────────────────────────────────

import {
  CategoriaCentro, CentroCR,
  fetchCentriFromDb, fetchCategorieFromDb,
  upsertCentro, deleteCentroDb,
  upsertCategoria, deleteCategoriaDb,
  updateCentroCodeInAssignments,
} from "@/hooks/useCentri";

function CentriCostoRicavoTab() {
  const [centri, setCentri] = useState<CentroCR[]>([]);
  const [categorie, setCategorie] = useState<CategoriaCentro[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCentriFromDb().then(setCentri);
    fetchCategorieFromDb().then((cats) => {
      setCategorie(cats);
      setExpandedCats(new Set(cats.map(c => c.id)));
    });
  }, []);

  // Editing subcategory
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCodice, setEditCodice] = useState("");
  const [editDescrizione, setEditDescrizione] = useState("");
  const [editParoleChiave, setEditParoleChiave] = useState("");

  // Adding subcategory (to a specific category or unclassified)
  const [addingToCat, setAddingToCat] = useState<string | null>(null);
  const [addingUnclassified, setAddingUnclassified] = useState<"costo" | "ricavo" | null>(null);
  const [newSubCodice, setNewSubCodice] = useState("");
  const [newSubDescrizione, setNewSubDescrizione] = useState("");
  const [newSubParoleChiave, setNewSubParoleChiave] = useState("");

  // Category editing
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatCodice, setEditCatCodice] = useState("");
  const [editCatDescrizione, setEditCatDescrizione] = useState("");

  // Adding category
  const [addingCatTo, setAddingCatTo] = useState<"costo" | "ricavo" | null>(null);
  const [newCatCodice, setNewCatCodice] = useState("");
  const [newCatDescrizione, setNewCatDescrizione] = useState("");

  // Drag state
  const dragItemRef = useRef<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);
  const [dragOverUnclassified, setDragOverUnclassified] = useState<"costo" | "ricavo" | null>(null);

  const toggleExpand = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  // ── Drag & Drop to classify ──
  const handleDropOnCategory = (catId: string) => {
    const itemId = dragItemRef.current;
    if (!itemId) return;
    const item = centri.find(c => c.id === itemId);
    if (!item || item.categoriaId === catId) { dragItemRef.current = null; setDragOverCatId(null); return; }
    const updatedItem = { ...item, categoriaId: catId };
    setCentri(prev => prev.map(c => c.id === itemId ? updatedItem : c));
    upsertCentro(updatedItem);
    dragItemRef.current = null; setDragOverCatId(null);
    const cat = categorie.find(c => c.id === catId);
    toast.success(`"${item.codice}" spostata in ${cat?.codice || "categoria"}`);
    if (!expandedCats.has(catId)) toggleExpand(catId);
  };

  const handleDropOnUnclassified = (tipo: "costo" | "ricavo") => {
    const itemId = dragItemRef.current;
    if (!itemId) return;
    const item = centri.find(c => c.id === itemId);
    if (!item || !item.categoriaId) { dragItemRef.current = null; setDragOverUnclassified(null); return; }
    const updatedItem = { ...item, categoriaId: undefined };
    setCentri(prev => prev.map(c => c.id === itemId ? updatedItem : c));
    upsertCentro(updatedItem);
    dragItemRef.current = null; setDragOverUnclassified(null);
    toast.success(`"${item.codice}" rimossa dalla categoria`);
  };

  // ── Category CRUD ──
  const handleAddCategory = (tipo: "costo" | "ricavo") => {
    if (!newCatCodice.trim() || !newCatDescrizione.trim()) {
      toast.error("Codice e descrizione categoria obbligatori"); return;
    }
    const dup = categorie.find((c) => c.codice === newCatCodice.toUpperCase());
    if (dup) { toast.error("Codice categoria già esistente"); return; }
    const cat: CategoriaCentro = { id: crypto.randomUUID(), tipo, codice: newCatCodice.toUpperCase(), descrizione: newCatDescrizione };
    setCategorie(prev => [...prev, cat]);
    upsertCategoria(cat);
    setAddingCatTo(null); setNewCatCodice(""); setNewCatDescrizione("");
    setExpandedCats((prev) => new Set([...prev, cat.id]));
    toast.success("Categoria aggiunta");
  };

  const startEditCat = (c: CategoriaCentro) => {
    setEditingCatId(c.id); setEditCatCodice(c.codice); setEditCatDescrizione(c.descrizione);
  };

  const saveEditCat = () => {
    if (!editingCatId || !editCatCodice.trim() || !editCatDescrizione.trim()) {
      toast.error("Codice e descrizione obbligatori"); return;
    }
    const dup = categorie.find((c) => c.codice === editCatCodice.toUpperCase() && c.id !== editingCatId);
    if (dup) { toast.error("Codice già esistente"); return; }
    const updated = categorie.map((c) => c.id === editingCatId ? { ...c, codice: editCatCodice.toUpperCase(), descrizione: editCatDescrizione } : c);
    setCategorie(updated);
    const editedCat = updated.find(c => c.id === editingCatId);
    if (editedCat) upsertCategoria(editedCat);
    setEditingCatId(null);
    toast.success("Categoria aggiornata");
  };

  const deleteCategory = (catId: string) => {
    const subs = centri.filter((c) => c.categoriaId === catId);
    const msg = subs.length > 0
      ? `Questa categoria contiene ${subs.length} voci. Le voci verranno spostate tra le "Non classificate". Procedere?`
      : `Eliminare la categoria?`;
    if (!confirm(msg)) return;
    const updatedCentri = centri.map((c) => c.categoriaId === catId ? { ...c, categoriaId: undefined } : c);
    setCentri(updatedCentri);
    // Update each orphaned centro in DB
    subs.forEach(s => upsertCentro({ ...s, categoriaId: undefined }));
    setCategorie(prev => prev.filter(c => c.id !== catId));
    deleteCategoriaDb(catId);
    toast.success("Categoria eliminata");
  };

  // ── Subcategory CRUD ──
  const handleAddSub = (categoriaId: string | undefined, tipo: "costo" | "ricavo") => {
    if (!newSubCodice.trim() || !newSubDescrizione.trim()) {
      toast.error("Codice e descrizione obbligatori"); return;
    }
    const dup = centri.find((c) => c.codice === newSubCodice.toUpperCase());
    if (dup) { toast.error("Codice già esistente"); return; }
    const newItem: CentroCR = {
      id: crypto.randomUUID(), tipo, categoriaId,
      codice: newSubCodice.toUpperCase(), descrizione: newSubDescrizione,
      paroleChiaveMatching: newSubParoleChiave, note: ""
    };
    setCentri(prev => [...prev, newItem]);
    upsertCentro(newItem);
    setAddingToCat(null); setAddingUnclassified(null);
    setNewSubCodice(""); setNewSubDescrizione(""); setNewSubParoleChiave("");
    toast.success("Voce aggiunta");
  };

  const startEditSub = (c: CentroCR) => {
    setEditingId(c.id); setEditCodice(c.codice); setEditDescrizione(c.descrizione); setEditParoleChiave(c.paroleChiaveMatching);
  };

  const saveEditSub = () => {
    if (!editingId || !editCodice.trim() || !editDescrizione.trim()) {
      toast.error("Codice e descrizione obbligatori"); return;
    }
    const dup = centri.find((c) => c.codice === editCodice.toUpperCase() && c.id !== editingId);
    if (dup) { toast.error("Codice già esistente"); return; }
    const old = centri.find((c) => c.id === editingId);
    const oldCodice = old?.codice;
    const newCodice = editCodice.toUpperCase();
    const updatedItem: CentroCR = {
      ...old!, codice: newCodice, descrizione: editDescrizione, paroleChiaveMatching: editParoleChiave
    };
    setCentri(prev => prev.map(c => c.id === editingId ? updatedItem : c));
    upsertCentro(updatedItem);
    // Update centro assignments if codice changed
    if (oldCodice && oldCodice !== newCodice) {
      updateCentroCodeInAssignments(oldCodice, newCodice);
    }
    setEditingId(null);
    toast.success("Voce aggiornata");
  };

  const deleteSub = (id: string) => {
    setCentri(prev => prev.filter(c => c.id !== id));
    deleteCentroDb(id);
    toast.success("Voce eliminata");
  };

  // ── Render a draggable voce row ──
  const renderVoceRow = (sub: CentroCR, indented: boolean) => (
    <TableRow
      key={sub.id}
      draggable={editingId !== sub.id}
      onDragStart={() => { dragItemRef.current = sub.id; }}
      onDragEnd={() => { dragItemRef.current = null; setDragOverCatId(null); setDragOverUnclassified(null); }}
      className="cursor-grab active:cursor-grabbing [&>td]:py-1.5"
    >
      {editingId === sub.id ? (
        <>
          <TableCell className={indented ? "pl-12" : ""}>
            <div className="flex items-center gap-2">
              <GripVertical className="w-3.5 h-3.5 opacity-30 shrink-0" />
              <Input value={editCodice} onChange={(e) => setEditCodice(e.target.value.toUpperCase())} className="h-7 text-sm font-mono" autoFocus />
            </div>
          </TableCell>
          <TableCell>
            <Input value={editDescrizione} onChange={(e) => setEditDescrizione(e.target.value)} className="h-7 text-sm" />
          </TableCell>
          <TableCell>
            <Input value={editParoleChiave} onChange={(e) => setEditParoleChiave(e.target.value)} className="h-7 text-sm" placeholder="parole chiave, separate, da virgola" />
          </TableCell>
          <TableCell>
            <div className="flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={saveEditSub}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </TableCell>
        </>
      ) : (
        <>
          <TableCell className={indented ? "pl-12" : ""}>
            <div className="flex items-center gap-2">
              <GripVertical className="w-3.5 h-3.5 opacity-30 shrink-0" />
              <span className="font-mono text-xs">{sub.codice}</span>
            </div>
          </TableCell>
          <TableCell className="text-xs">{sub.descrizione}</TableCell>
          <TableCell className="text-xs text-muted-foreground">{sub.paroleChiaveMatching || "—"}</TableCell>
          <TableCell>
            <div className="flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditSub(sub)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm(`Eliminare "${sub.codice}"?`)) deleteSub(sub.id); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </TableCell>
        </>
      )}
    </TableRow>
  );

  // ── Render add row ──
  const renderAddRow = (categoriaId: string | undefined, tipo: "costo" | "ricavo", indented: boolean) => (
    <TableRow>
      <TableCell className={indented ? "pl-12" : ""}>
        <div className="flex items-center gap-2">
          <div className="w-3.5" />
          <Input value={newSubCodice} onChange={(e) => setNewSubCodice(e.target.value.toUpperCase())} className="h-7 text-sm font-mono" placeholder="Codice..." autoFocus />
        </div>
      </TableCell>
      <TableCell>
        <Input value={newSubDescrizione} onChange={(e) => setNewSubDescrizione(e.target.value)} className="h-7 text-sm" placeholder="Descrizione..." />
      </TableCell>
      <TableCell>
        <Input value={newSubParoleChiave} onChange={(e) => setNewSubParoleChiave(e.target.value)} className="h-7 text-sm" placeholder="parole chiave, separate, da virgola" />
      </TableCell>
      <TableCell>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleAddSub(categoriaId, tipo)} disabled={!newSubCodice.trim() || !newSubDescrizione.trim()}>
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setAddingToCat(null); setAddingUnclassified(null); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  const renderTable = (tipo: "costo" | "ricavo") => {
    const cats = categorie.filter((c) => c.tipo === tipo);
    const title = tipo === "costo" ? "Centri di Costo" : "Centri di Ricavo";
    const isAddingCat = addingCatTo === tipo;
    const allItems = centri.filter((c) => c.tipo === tipo);
    const unclassified = allItems.filter((c) => !c.categoriaId || !cats.some(cat => cat.id === c.categoriaId));
    const isAddingUncl = addingUnclassified === tipo;

    return (
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b border-border ${tipo === "costo" ? "bg-destructive" : "bg-emerald-600"}`}>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-white" />
            <h3 className="font-semibold text-sm text-white">{title}</h3>
            <Badge variant="secondary" className="text-[10px]">
              {cats.length} cat · {allItems.length} voci
            </Badge>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => { setAddingUnclassified(tipo); setNewSubCodice(""); setNewSubDescrizione(""); setNewSubParoleChiave(""); }}
              disabled={isAddingUncl}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Voce
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => { setAddingCatTo(tipo); setNewCatCodice(""); setNewCatDescrizione(""); }}
              disabled={isAddingCat}>
              <FolderOpen className="w-3.5 h-3.5 mr-1" /> Categoria
            </Button>
          </div>
        </div>

        {/* Add category row */}
        {isAddingCat && (
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input value={newCatCodice} onChange={(e) => setNewCatCodice(e.target.value.toUpperCase())} className="h-8 text-sm font-mono w-28" placeholder="Codice..." autoFocus />
            <Input value={newCatDescrizione} onChange={(e) => setNewCatDescrizione(e.target.value)} className="h-8 text-sm flex-1" placeholder="Descrizione categoria..." />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 shrink-0" onClick={() => handleAddCategory(tipo)} disabled={!newCatCodice.trim() || !newCatDescrizione.trim()}>
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setAddingCatTo(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Empty state */}
        {cats.length === 0 && unclassified.length === 0 && !isAddingCat && !isAddingUncl && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Nessuna voce configurata
          </div>
        )}

        {/* Categories with drop targets */}
        {cats.map((cat) => {
          const subs = centri.filter((c) => c.categoriaId === cat.id);
          const isExpanded = expandedCats.has(cat.id);
          const isEditingCat = editingCatId === cat.id;
          const isAddingSub = addingToCat === cat.id;
          const isDragOver = dragOverCatId === cat.id;

          return (
            <div key={cat.id} className="border-b border-border last:border-b-0 group/cat">
              {/* Category row — also a drop target */}
              <div
                className={`flex items-center gap-2 px-4 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors ${isExpanded ? "bg-muted/30" : ""} ${isDragOver ? "bg-accent ring-2 ring-inset ring-primary/40" : ""}`}
                onClick={() => !isEditingCat && toggleExpand(cat.id)}
                onDragOver={(e) => { e.preventDefault(); setDragOverCatId(cat.id); setDragOverUnclassified(null); }}
                onDragLeave={() => setDragOverCatId(null)}
                onDrop={(e) => { e.preventDefault(); handleDropOnCategory(cat.id); }}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}

                {isEditingCat ? (
                  <>
                    <Input value={editCatCodice} onChange={(e) => setEditCatCodice(e.target.value.toUpperCase())} className="h-7 text-sm font-mono w-28" autoFocus onClick={(e) => e.stopPropagation()} />
                    <Input value={editCatDescrizione} onChange={(e) => setEditCatDescrizione(e.target.value)} className="h-7 text-sm flex-1" onClick={(e) => e.stopPropagation()} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 shrink-0" onClick={(e) => { e.stopPropagation(); saveEditCat(); }}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); setEditingCatId(null); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs font-semibold">{cat.codice}</span>
                    <span className="text-xs text-muted-foreground flex-1">— {cat.descrizione}</span>
                    <Badge variant="outline" className="text-[10px] mr-1">{subs.length}</Badge>
                    <div className="flex gap-0.5 shrink-0 opacity-0 group-hover/cat:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setAddingToCat(cat.id); setNewSubCodice(""); setNewSubDescrizione(""); setNewSubParoleChiave(""); if (!isExpanded) toggleExpand(cat.id); }}>
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditCat(cat)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteCategory(cat.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* Subcategories */}
              {isExpanded && (
                <div className="bg-muted/20">
                  <Table>
                    <TableHeader>
                      <TableRow>
                    <TableHead className="w-[30%] pl-12 text-[11px] h-8">Codice</TableHead>
                        <TableHead className="w-[30%] text-[11px] h-8">Descrizione</TableHead>
                        <TableHead className="text-[11px] h-8">Parole Chiave Matching</TableHead>
                        <TableHead className="w-20 h-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subs.length === 0 && !isAddingSub && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-xs">
                            Trascina qui una voce per classificarla in questa categoria
                          </TableCell>
                        </TableRow>
                      )}
                      {subs.map((sub) => renderVoceRow(sub, true))}
                      {isAddingSub && renderAddRow(cat.id, tipo, true)}
                    </TableBody>
                  </Table>
                  {!isAddingSub && subs.length > 0 && (
                    <div className="px-4 py-1.5 border-t border-border/50">
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground"
                        onClick={() => { setAddingToCat(cat.id); setNewSubCodice(""); setNewSubDescrizione(""); setNewSubParoleChiave(""); }}>
                        <Plus className="w-3 h-3 mr-1" /> Aggiungi voce
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unclassified items — drop target to remove from category */}
        {(unclassified.length > 0 || isAddingUncl) && (
          <div
            className={`border-t border-border ${dragOverUnclassified === tipo ? "bg-accent ring-2 ring-inset ring-primary/40" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOverUnclassified(tipo); setDragOverCatId(null); }}
            onDragLeave={() => setDragOverUnclassified(null)}
            onDrop={(e) => { e.preventDefault(); handleDropOnUnclassified(tipo); }}
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/40">
              <Tag className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Non classificate</span>
              <Badge variant="outline" className="text-[10px]">{unclassified.length}</Badge>
            </div>
            <Table>
              <TableBody>
                {unclassified.map((sub) => renderVoceRow(sub, false))}
                {isAddingUncl && renderAddRow(undefined, tipo, false)}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Centri di Costo e Ricavo</h3>
        <p className="text-xs text-muted-foreground">
          Configura categorie e voci per i Centri di Costo e Ricavo. Trascina le voci sulle categorie per classificarle. Per ogni voce puoi definire parole chiave (separate da virgola) per il matching automatico.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderTable("ricavo")}
        {renderTable("costo")}
      </div>
    </div>
  );
}

// ─── Export / Import ──────────────────────────────────────────────

function ExportImportSection() {
  const fileInputRef = useFileRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const [centri, categorie, conti, naming, assignments] = await Promise.all([
        supabase.from("centri_cr").select("*").then(r => r.data || []),
        supabase.from("categorie_centri").select("*").then(r => r.data || []),
        supabase.from("conti_correnti").select("*").then(r => r.data || []),
        supabase.from("naming_rules").select("*").then(r => r.data || []),
        supabase.from("centro_assignments").select("*").then(r => r.data || []),
      ]);

      const payload = {
        version: 1,
        exported_at: new Date().toISOString(),
        centri_cr: centri,
        categorie_centri: categorie,
        conti_correnti: conti,
        naming_rules: naming,
        centro_assignments: assignments,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `configurazione_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Configurazione esportata");
    } catch (e) {
      console.error("Export error:", e);
      toast.error("Errore durante l'esportazione");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.centri_cr) {
        toast.error("File non valido: formato non riconosciuto");
        return;
      }

      const confirmed = confirm(
        `Importare configurazione del ${data.exported_at?.slice(0, 10) || "?"}?\n\n` +
        `• ${data.centri_cr?.length || 0} centri C/R\n` +
        `• ${data.categorie_centri?.length || 0} categorie\n` +
        `• ${data.conti_correnti?.length || 0} conti correnti\n` +
        `• ${data.naming_rules?.length || 0} regole denominazione\n` +
        `• ${data.centro_assignments?.length || 0} assegnazioni\n\n` +
        `I dati esistenti verranno sovrascritti.`
      );
      if (!confirmed) return;

      let imported = 0;

      // Import categorie first (referenced by centri)
      if (data.categorie_centri?.length) {
        await supabase.from("categorie_centri").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        const { error } = await supabase.from("categorie_centri").insert(
          data.categorie_centri.map((r: any) => ({
            id: r.id, tipo: r.tipo, codice: r.codice, descrizione: r.descrizione || "",
          }))
        );
        if (error) console.error("Import categorie error:", error);
        else imported += data.categorie_centri.length;
      }

      if (data.centri_cr?.length) {
        await supabase.from("centri_cr").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        const { error } = await supabase.from("centri_cr").insert(
          data.centri_cr.map((r: any) => ({
            id: r.id, tipo: r.tipo, codice: r.codice, descrizione: r.descrizione || "",
            parole_chiave_matching: r.parole_chiave_matching || r.paroleChiaveMatching || "",
            note: r.note || "", categoria_id: r.categoria_id || r.categoriaId || null,
          }))
        );
        if (error) console.error("Import centri error:", error);
        else imported += data.centri_cr.length;
      }

      if (data.conti_correnti?.length) {
        await supabase.from("conti_correnti").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        const { error } = await supabase.from("conti_correnti").insert(
          data.conti_correnti.map((r: any) => ({
            id: r.id, tipo: r.tipo || "conto_corrente", banca: r.banca, iban: r.iban,
            intestatario: r.intestatario || "", note: r.note || "",
          }))
        );
        if (error) console.error("Import conti error:", error);
        else imported += data.conti_correnti.length;
      }

      if (data.naming_rules?.length) {
        await supabase.from("naming_rules").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        const { error } = await supabase.from("naming_rules").insert(
          data.naming_rules.map((r: any) => ({
            id: r.id, tipo: r.tipo, pattern: r.pattern, esempio: r.esempio || "",
          }))
        );
        if (error) console.error("Import naming error:", error);
        else imported += data.naming_rules.length;
      }

      if (data.centro_assignments?.length) {
        await supabase.from("centro_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        for (let i = 0; i < data.centro_assignments.length; i += 100) {
          const batch = data.centro_assignments.slice(i, i + 100).map((r: any) => ({
            invoice_key: r.invoice_key, tipo: r.tipo, context: r.context, centro_codice: r.centro_codice,
          }));
          const { error } = await supabase.from("centro_assignments").insert(batch);
          if (error) { console.error("Import assignments error:", error); break; }
        }
        imported += data.centro_assignments.length;
      }

      toast.success(`Importati ${imported} record. Ricarico la pagina...`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Errore durante l'importazione: file JSON non valido");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Trasferimento Configurazione
        </CardTitle>
        <CardDescription className="text-xs">
          Esporta o importa tutte le configurazioni (centri C/R, conti, regole, assegnazioni) in formato JSON per trasferirle tra dispositivi.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-3">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5 mr-1.5" />Esporta JSON
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />Importa JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </CardContent>
    </Card>
  );
}

// ─── Upload Fatture Excel ────────────────────────────────────────

import { parseExcelSales, parseExcelPurchases, seedSalesFromExcel, seedPurchasesFromExcel, invalidateInvoiceCache, SaleInvoice, PurchaseInvoice } from "@/hooks/useInvoiceData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle } from "lucide-react";

interface CollisionItem {
  key: string;
  anno: number;
  numero: number;
  tipo: string;
  existingDesc: string;
  newDesc: string;
  selected: boolean;
}

function UploadFattureSection() {
  const [uploading, setUploading] = useState(false);
  const [collisions, setCollisions] = useState<CollisionItem[]>([]);
  const [showCollisionDialog, setShowCollisionDialog] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    type: "vendita" | "acquisto";
    fileName: string;
    sales?: SaleInvoice[];
    purchases?: PurchaseInvoice[];
    newOnly: SaleInvoice[] | PurchaseInvoice[];
    colliding: SaleInvoice[] | PurchaseInvoice[];
  } | null>(null);
  const salesRef = useRef<HTMLInputElement>(null);
  const purchasesRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File, type: "vendita" | "acquisto") => {
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });

      if (type === "vendita") {
        const sales = parseExcelSales(rows);
        if (sales.length === 0) { toast.error("Nessuna fattura vendita trovata nel file"); setUploading(false); return; }
        await checkCollisionsAndProceed(sales, [], type, file.name);
      } else {
        const purchases = parseExcelPurchases(rows);
        if (purchases.length === 0) { toast.error("Nessuna fattura acquisto trovata nel file"); setUploading(false); return; }
        await checkCollisionsAndProceed([], purchases, type, file.name);
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Errore durante l'importazione del file Excel");
      setUploading(false);
    }
  };

  const checkCollisionsAndProceed = async (
    sales: SaleInvoice[], purchases: PurchaseInvoice[],
    type: "vendita" | "acquisto", fileName: string
  ) => {
    const table = type === "vendita" ? "fatture_vendita" : "fatture_acquisto";
    const items = type === "vendita" ? sales : purchases;
    const keys = items.map((i: any) => `${i.anno}-${i.numero}-${i.tipo || ""}`);

    // Fetch existing records that might collide (include more fields for completeness comparison)
    const { data: existing } = await supabase
      .from(table as any)
      .select("anno, numero, tipo, descrizione, imponibile, imposta, totale, cig, source_file")
      .or(keys.map(k => {
        const [a, n] = k.split("-");
        return `and(anno.eq.${a},numero.eq.${n})`;
      }).join(","));

    const existingMap = new Map<string, { tipo: string; descrizione: string; imponibile: number; imposta: number; totale: number; cig: string; source_file: string }>();
    (existing || []).forEach((r: any) => {
      existingMap.set(`${r.anno}-${r.numero}-${r.tipo || ""}`, {
        tipo: r.tipo, descrizione: r.descrizione,
        imponibile: Number(r.imponibile) || 0, imposta: Number(r.imposta) || 0,
        totale: Number(r.totale) || 0, cig: r.cig || "", source_file: r.source_file || "",
      });
    });

    const collidingItems: typeof items = [];
    const newItems: typeof items = [];

    items.forEach((item: any) => {
      const key = `${item.anno}-${item.numero}-${item.tipo || ""}`;
      if (existingMap.has(key)) {
        collidingItems.push(item);
      } else {
        newItems.push(item);
      }
    });

    if (collidingItems.length === 0) {
      // No collisions — import directly
      if (type === "vendita") {
        await seedSalesFromExcel(sales, fileName);
        toast.success(`Importate ${sales.length} fatture vendita`);
      } else {
        await seedPurchasesFromExcel(purchases, fileName);
        toast.success(`Importate ${purchases.length} fatture acquisto`);
      }
      invalidateInvoiceCache();
      setUploading(false);
      setTimeout(() => window.location.reload(), 800);
      return;
    }

    // Build collision list for the dialog — auto-select when new data is more complete
    const collisionList: CollisionItem[] = collidingItems.map((item: any) => {
      const key = `${item.anno}-${item.numero}`;
      const ex = existingMap.get(key)!;

      // Determine if new data is more complete/updated
      const newHasMoreFields = (
        ((item.descrizione || "").length > (ex.descrizione || "").length) ||
        (item.cig && !ex.cig) ||
        (item.imponibile && !ex.imponibile) ||
        (item.totale && !ex.totale)
      );
      const newFromDifferentFile = ex.source_file && ex.source_file !== fileName;
      // Auto-select if new data has more info, or if same source file (re-import = update)
      const autoSelect = newHasMoreFields || !newFromDifferentFile;

      return {
        key,
        anno: item.anno,
        numero: item.numero,
        tipo: item.tipo,
        existingDesc: `${ex.tipo} — ${ex.descrizione?.slice(0, 60) || "—"}`,
        newDesc: `${item.tipo} — ${(item.descrizione || "").slice(0, 60) || "—"}`,
        selected: autoSelect,
      };
    });

    setCollisions(collisionList);
    setPendingUpload({
      type, fileName,
      sales: type === "vendita" ? sales : undefined,
      purchases: type === "acquisto" ? purchases : undefined,
      newOnly: newItems,
      colliding: collidingItems,
    });
    setShowCollisionDialog(true);
  };

  const toggleCollision = (key: string) => {
    setCollisions(prev => prev.map(c => c.key === key ? { ...c, selected: !c.selected } : c));
  };

  const toggleAll = (selected: boolean) => {
    setCollisions(prev => prev.map(c => ({ ...c, selected })));
  };

  const handleConfirmCollisions = async () => {
    if (!pendingUpload) return;
    setShowCollisionDialog(false);

    try {
      const selectedKeys = new Set(collisions.filter(c => c.selected).map(c => c.key));
      const overwriteItems = (pendingUpload.colliding as any[]).filter(
        (item: any) => selectedKeys.has(`${item.anno}-${item.numero}`)
      );
      const allToSave = [...(pendingUpload.newOnly as any[]), ...overwriteItems];

      if (allToSave.length === 0) {
        toast.info("Nessun record importato");
        setUploading(false);
        return;
      }

      if (pendingUpload.type === "vendita") {
        await seedSalesFromExcel(allToSave as SaleInvoice[], pendingUpload.fileName);
      } else {
        await seedPurchasesFromExcel(allToSave as PurchaseInvoice[], pendingUpload.fileName);
      }

      const skipped = collisions.length - selectedKeys.size;
      toast.success(
        `Importati ${allToSave.length} record` +
        (skipped > 0 ? `, ${skipped} duplicati ignorati` : "")
      );
      invalidateInvoiceCache();
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Errore durante l'importazione");
    }
    setUploading(false);
    setPendingUpload(null);
  };

  const handleCancelCollisions = () => {
    setShowCollisionDialog(false);
    setUploading(false);
    setPendingUpload(null);
    setCollisions([]);
  };

  const allSelected = collisions.length > 0 && collisions.every(c => c.selected);
  const noneSelected = collisions.every(c => !c.selected);
  const newCount = pendingUpload?.newOnly?.length || 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Caricamento Fatture (Excel)
          </CardTitle>
          <CardDescription className="text-xs">
            Importa o aggiorna le fatture vendita/acquisto da file Excel. I dati verranno salvati nel database e saranno disponibili su tutti i dispositivi.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => salesRef.current?.click()}>
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? "Importazione..." : "Importa Vendite (.xlsx)"}
          </Button>
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => purchasesRef.current?.click()}>
            <TrendingDown className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? "Importazione..." : "Importa Acquisti (.xlsx)"}
          </Button>
          <input ref={salesRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "vendita"); e.target.value = ""; }} />
          <input ref={purchasesRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "acquisto"); e.target.value = ""; }} />
        </CardContent>
      </Card>

      <Dialog open={showCollisionDialog} onOpenChange={(open) => { if (!open) handleCancelCollisions(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {collisions.length} duplicati trovati
            </DialogTitle>
            <DialogDescription>
              {newCount > 0 && <span className="block text-sm mb-1">{newCount} nuovi record verranno importati automaticamente.</span>}
              Seleziona i record duplicati che vuoi <strong>sovrascrivere</strong>. Quelli non selezionati verranno ignorati.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={() => toggleAll(true)} disabled={allSelected}>
              Seleziona tutti
            </Button>
            <Button variant="outline" size="sm" onClick={() => toggleAll(false)} disabled={noneSelected}>
              Deseleziona tutti
            </Button>
          </div>

          <ScrollArea className="max-h-[350px] border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="text-xs">Anno/Num</TableHead>
                  <TableHead className="text-xs">Già presente (DB)</TableHead>
                  <TableHead className="text-xs">Nuovo (Excel)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collisions.map((c) => (
                  <TableRow key={c.key} className={c.selected ? "bg-accent/40" : ""}>
                    <TableCell>
                      <Checkbox checked={c.selected} onCheckedChange={() => toggleCollision(c.key)} />
                    </TableCell>
                    <TableCell className="text-xs font-mono">{c.anno}/{c.numero}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{c.existingDesc}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{c.newDesc}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancelCollisions}>
              Annulla importazione
            </Button>
            <Button size="sm" onClick={handleConfirmCollisions}>
              Importa {newCount + collisions.filter(c => c.selected).length} record
              {collisions.filter(c => !c.selected).length > 0 && ` (${collisions.filter(c => !c.selected).length} ignorati)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

const StrumentiPage = () => {
  return (
    <div className="p-6 space-y-6">

      <Tabs defaultValue="conti" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-xl">
          <TabsTrigger value="conti" className="text-xs">
            <Landmark className="h-3.5 w-3.5 mr-1.5" />Conti Correnti
          </TabsTrigger>
          <TabsTrigger value="centri" className="text-xs">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />Centri C/R
          </TabsTrigger>
          <TabsTrigger value="naming" className="text-xs">
            <FileText className="h-3.5 w-3.5 mr-1.5" />Denominazione file
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
      </Tabs>

      <Separator />
      <UploadFattureSection />
      <ExportImportSection />
    </div>
  );
};

export default StrumentiPage;
