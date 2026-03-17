import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Trash2, Check, X, Calendar, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { useRateFinanziamento, RataFinanziamento } from "@/hooks/useRateFinanziamento";
import { toast } from "sonner";

interface Props {
  contoId: string;
  bancaName: string;
}

function parseDate(val: any): string {
  if (!val) return "";
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  const s = String(val).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.substring(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}

function findCol(headers: string[], ...patterns: string[]): number {
  return headers.findIndex(h => {
    const low = (h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return patterns.some(p => low.includes(p));
  });
}

interface EditingRata {
  id: string;
  numero_rata: string;
  data_scadenza: string;
  importo_rata: string;
  importo_capitale: string;
  importo_interessi: string;
  debito_residuo: string;
  note: string;
}

function rataToEditing(r: RataFinanziamento): EditingRata {
  return {
    id: r.id,
    numero_rata: String(r.numero_rata),
    data_scadenza: r.data_scadenza,
    importo_rata: String(r.importo_rata),
    importo_capitale: String(r.importo_capitale),
    importo_interessi: String(r.importo_interessi),
    debito_residuo: String(r.debito_residuo),
    note: r.note,
  };
}

export function PianoAmmortamentoUpload({ contoId, bancaName }: Props) {
  const { rate, loading, importRate, togglePagata, updateRata, deleteRateForConto } = useRateFinanziamento(contoId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingRata, setEditingRata] = useState<EditingRata | null>(null);

  const handleFile = async (file: File) => {
    const { read, utils } = await import("xlsx");
    const data = await file.arrayBuffer();
    const wb = read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = utils.sheet_to_json(ws, { header: 1 });

    if (rows.length < 2) {
      toast.error("Il file non contiene dati sufficienti");
      return;
    }

    const headers = rows[0].map((h: any) => String(h || ""));
    const iRata = findCol(headers, "rata", "nrata", "numerata", "nr");
    const iData = findCol(headers, "scadenza", "data", "datascadenza");
    const iImporto = findCol(headers, "importorata", "rata", "totalerata", "importo");
    const iCapitale = findCol(headers, "capitale", "quotacapitale");
    const iInteressi = findCol(headers, "interessi", "quotainteressi");
    const iResiduo = findCol(headers, "residuo", "debitoresiduo", "capitalresiduo");

    if (iData === -1 && iImporto === -1) {
      toast.error("Colonne non riconosciute. Servono almeno 'Data Scadenza' e 'Importo Rata'.");
      return;
    }

    const parsed: Omit<RataFinanziamento, "id">[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const importo = Number(r[iImporto !== -1 ? iImporto : 0]) || 0;
      if (importo === 0) continue;

      parsed.push({
        conto_id: contoId,
        numero_rata: iRata !== -1 ? (Number(r[iRata]) || i) : i,
        data_scadenza: parseDate(r[iData !== -1 ? iData : 0]),
        importo_rata: importo,
        importo_capitale: iCapitale !== -1 ? (Number(r[iCapitale]) || 0) : 0,
        importo_interessi: iInteressi !== -1 ? (Number(r[iInteressi]) || 0) : 0,
        debito_residuo: iResiduo !== -1 ? (Number(r[iResiduo]) || 0) : 0,
        pagata: false,
        note: "",
      });
    }

    if (parsed.length === 0) {
      toast.error("Nessuna rata trovata nel file");
      return;
    }

    await importRate(contoId, parsed);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleSaveEdit = async () => {
    if (!editingRata) return;
    await updateRata(editingRata.id, {
      numero_rata: parseInt(editingRata.numero_rata) || 0,
      data_scadenza: editingRata.data_scadenza,
      importo_rata: parseFloat(editingRata.importo_rata) || 0,
      importo_capitale: parseFloat(editingRata.importo_capitale) || 0,
      importo_interessi: parseFloat(editingRata.importo_interessi) || 0,
      debito_residuo: parseFloat(editingRata.debito_residuo) || 0,
      note: editingRata.note,
    });
    setEditingRata(null);
  };

  if (loading) return null;

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">Piano di Ammortamento</span>
          {rate.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{rate.length} rate</Badge>
          )}
        </div>
        <div className="flex gap-1">
          {rate.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => deleteRateForConto(contoId)}>
              <Trash2 className="h-3 w-3 mr-1" />Elimina piano
            </Button>
          )}
        </div>
      </div>

      {rate.length === 0 ? (
        <div
          className={`flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <FileSpreadsheet className="h-6 w-6 text-muted-foreground/50 mb-1" />
          <p className="text-xs text-muted-foreground">Trascina un file Excel o clicca per caricare il piano</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead className="text-right">Rata</TableHead>
                    <TableHead className="text-right">Capitale</TableHead>
                    <TableHead className="text-right">Interessi</TableHead>
                    <TableHead className="text-right">Residuo</TableHead>
                    <TableHead className="w-16 text-center">Pagata</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rate.map((r) => {
                    const isEditing = editingRata?.id === r.id;
                    const isOverdue = !r.pagata && (() => {
                      const parts = r.data_scadenza.split("/");
                      if (parts.length === 3) {
                        const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                        return d < new Date();
                      }
                      return false;
                    })();

                    if (isEditing) {
                      return (
                        <TableRow key={r.id} className="bg-accent/30">
                          <TableCell className="p-1">
                            <Input
                              value={editingRata.numero_rata}
                              onChange={(e) => setEditingRata({ ...editingRata, numero_rata: e.target.value })}
                              className="h-7 text-xs text-center w-12"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              value={editingRata.data_scadenza}
                              onChange={(e) => setEditingRata({ ...editingRata, data_scadenza: e.target.value })}
                              className="h-7 text-xs w-24"
                              placeholder="dd/mm/yyyy"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              value={editingRata.importo_rata}
                              onChange={(e) => setEditingRata({ ...editingRata, importo_rata: e.target.value })}
                              className="h-7 text-xs text-right w-20"
                              type="number"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              value={editingRata.importo_capitale}
                              onChange={(e) => setEditingRata({ ...editingRata, importo_capitale: e.target.value })}
                              className="h-7 text-xs text-right w-20"
                              type="number"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              value={editingRata.importo_interessi}
                              onChange={(e) => setEditingRata({ ...editingRata, importo_interessi: e.target.value })}
                              className="h-7 text-xs text-right w-20"
                              type="number"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              value={editingRata.debito_residuo}
                              onChange={(e) => setEditingRata({ ...editingRata, debito_residuo: e.target.value })}
                              className="h-7 text-xs text-right w-20"
                              type="number"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell className="text-center p-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-primary" onClick={handleSaveEdit}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                          <TableCell className="p-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => setEditingRata(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return (
                      <TableRow key={r.id} className={r.pagata ? "opacity-50" : isOverdue ? "bg-destructive/5" : ""}>
                        <TableCell className="text-center text-xs font-mono">{r.numero_rata}</TableCell>
                        <TableCell className="text-xs">{r.data_scadenza}</TableCell>
                        <TableCell className="text-right text-xs font-mono font-medium">{formatCurrency(r.importo_rata)}</TableCell>
                        <TableCell className="text-right text-xs font-mono text-muted-foreground">{r.importo_capitale ? formatCurrency(r.importo_capitale) : "—"}</TableCell>
                        <TableCell className="text-right text-xs font-mono text-muted-foreground">{r.importo_interessi ? formatCurrency(r.importo_interessi) : "—"}</TableCell>
                        <TableCell className="text-right text-xs font-mono text-muted-foreground">{r.debito_residuo ? formatCurrency(r.debito_residuo) : "—"}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-6 w-6 p-0 ${r.pagata ? "text-green-600" : "text-muted-foreground"}`}
                            onClick={() => togglePagata(r.id, !r.pagata)}
                          >
                            {r.pagata ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:!opacity-100"
                            onClick={() => setEditingRata(rataToEditing(r))}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
              <span className="text-xs text-muted-foreground">
                {rate.filter(r => r.pagata).length}/{rate.length} pagate
              </span>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3 w-3 mr-1" />Ricarica piano
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
