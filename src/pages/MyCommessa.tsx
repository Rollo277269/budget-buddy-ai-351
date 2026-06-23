import { useEffect, useMemo, useState } from 'react';
import { useMyCommessaAuth } from '@/hooks/useMyCommessaAuth';
import { mycommessa } from '@/integrations/mycommessa/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, LogOut, Search } from 'lucide-react';
import { toast } from 'sonner';

type CommessaRow = {
  id: string;
  titolo: string | null;
  stato_commessa: string | null;
  importo_appalto: number | null;
};

type SortKey = 'titolo' | 'stato_commessa' | 'importo_appalto';
type SortDir = 'asc' | 'desc';

export default function MyCommessaPage() {
  const { session, loading, signIn, signOut } = useMyCommessaAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<CommessaRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [search, setSearch] = useState('');
  const [statoFilter, setStatoFilter] = useState<string>('__all__');
  const [sortKey, setSortKey] = useState<SortKey>('titolo');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    if (!session) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoadingRows(true);
    mycommessa
      .from('commessa_data')
      .select('id, titolo, stato_commessa, importo_appalto')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error(`Errore caricamento commesse: ${error.message}`);
        } else {
          setRows((data ?? []) as CommessaRow[]);
        }
        setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      toast.error(`Login fallito: ${error.message}`);
    } else {
      toast.success('Accesso effettuato');
      setPassword('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Accedi a MyCommessa</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mc-email">Email</Label>
                <Input
                  id="mc-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mc-password">Password</Label>
                <Input
                  id="mc-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accedi'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fmt = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const statiDisponibili = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.stato_commessa) set.add(r.stato_commessa);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'it'));
  }, [rows]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (statoFilter !== '__all__' && (r.stato_commessa ?? '') !== statoFilter) return false;
      if (!q) return true;
      return (
        (r.titolo ?? '').toLowerCase().includes(q) ||
        (r.stato_commessa ?? '').toLowerCase().includes(q)
      );
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'it', { numeric: true }) * dir;
    });
  }, [rows, search, statoFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 inline ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 inline ml-1" />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">MyCommessa</h1>
          <p className="text-xs text-muted-foreground">{session.user.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          <LogOut className="h-4 w-4 mr-2" /> Logout
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca per titolo o stato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Select value={statoFilter} onValueChange={setStatoFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tutti gli stati</SelectItem>
            {statiDisponibili.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredSorted.length} di {rows.length}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {loadingRows ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="h-8 px-2 py-1 text-xs cursor-pointer select-none"
                    onClick={() => toggleSort('titolo')}
                  >
                    Titolo<SortIcon k="titolo" />
                  </TableHead>
                  <TableHead
                    className="h-8 px-2 py-1 text-xs cursor-pointer select-none"
                    onClick={() => toggleSort('stato_commessa')}
                  >
                    Stato<SortIcon k="stato_commessa" />
                  </TableHead>
                  <TableHead
                    className="h-8 px-2 py-1 text-xs text-right cursor-pointer select-none"
                    onClick={() => toggleSort('importo_appalto')}
                  >
                    Importo Appalto<SortIcon k="importo_appalto" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                      {rows.length === 0 ? 'Nessuna commessa visibile' : 'Nessun risultato per i filtri attivi'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSorted.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="px-2 py-1 text-xs">{r.titolo ?? '—'}</TableCell>
                      <TableCell className="px-2 py-1 text-xs">{r.stato_commessa ?? '—'}</TableCell>
                      <TableCell className="px-2 py-1 text-xs text-right">
                        {r.importo_appalto != null ? fmt.format(r.importo_appalto) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}