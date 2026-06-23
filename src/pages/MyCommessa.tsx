import { useEffect, useState } from 'react';
import { useMyCommessaAuth } from '@/hooks/useMyCommessaAuth';
import { mycommessa } from '@/integrations/mycommessa/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';

type CommessaRow = {
  id: string;
  titolo: string | null;
  stato_commessa: string | null;
  importo_appalto: number | null;
};

export default function MyCommessaPage() {
  const { session, loading, signIn, signOut } = useMyCommessaAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<CommessaRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

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
                  <TableHead className="h-8 px-2 py-1 text-xs">Titolo</TableHead>
                  <TableHead className="h-8 px-2 py-1 text-xs">Stato</TableHead>
                  <TableHead className="h-8 px-2 py-1 text-xs text-right">Importo Appalto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                      Nessuna commessa visibile
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
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