import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Mail, Trash2, RefreshCcw, UserPlus, Shield, Eye, KeyRound, Copy, Wand2, Eye as EyeIcon, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUserRole } from "@/hooks/useUserRole";

type UserRow = {
  id: string;
  email: string;
  roles: string[];
  invited_at?: string;
  last_sign_in_at?: string;
  confirmed_at?: string;
};

async function invoke(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export default function UtentiTab() {
  const { isAdmin, loading: loadingRole } = useUserRole();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "admin">("viewer");
  const [busy, setBusy] = useState(false);

  const [pwdUser, setPwdUser] = useState<UserRow | null>(null);
  const [pwdValue, setPwdValue] = useState("");
  const [pwdShow, setPwdShow] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);

  const redirectTo = `${window.location.origin}/auth`;

  const load = async () => {
    setLoading(true);
    try {
      const res = await invoke("list_users");
      setUsers(res.users || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (loadingRole) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Solo gli amministratori possono gestire gli utenti.
        </CardContent>
      </Card>
    );
  }

  const handleInvite = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error("Email non valida");
      return;
    }
    setBusy(true);
    try {
      await invoke("invite", { email: e, role, redirectTo });
      toast.success(`Invito inviato a ${e}`);
      setEmail("");
      setRole("viewer");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSetRole = async (u: UserRow, newRole: "viewer" | "admin") => {
    if (!confirm(`Cambiare ruolo di ${u.email} in ${newRole}?`)) return;
    try {
      await invoke("set_role", { userId: u.id, role: newRole });
      toast.success("Ruolo aggiornato");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async (u: UserRow) => {
    if (!confirm(`Eliminare definitivamente l'utente ${u.email}?`)) return;
    try {
      await invoke("delete_user", { userId: u.id });
      toast.success("Utente eliminato");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleResend = async (u: UserRow) => {
    try {
      await invoke("resend_invite", { email: u.email, redirectTo });
      toast.success("Invito reinviato");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const openPwd = (u: UserRow) => {
    setPwdUser(u);
    setPwdValue("");
    setPwdShow(true);
  };

  const handleGeneratePwd = async () => {
    if (!pwdUser) return;
    setPwdBusy(true);
    try {
      const res = await invoke("generate_password", { userId: pwdUser.id });
      setPwdValue(res.password);
      setPwdShow(true);
      toast.success("Password generata e impostata");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPwdBusy(false);
    }
  };

  const handleSetPwd = async () => {
    if (!pwdUser) return;
    if (pwdValue.length < 8) { toast.error("Min 8 caratteri"); return; }
    setPwdBusy(true);
    try {
      await invoke("set_password", { userId: pwdUser.id, password: pwdValue });
      toast.success("Password aggiornata");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPwdBusy(false);
    }
  };

  const copyPwd = async () => {
    if (!pwdValue) return;
    await navigator.clipboard.writeText(pwdValue);
    toast.success("Copiata negli appunti");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Invita nuovo utente</CardTitle>
          <CardDescription className="text-xs">
            L'utente riceverà via email un link di invito provvisorio. Per impostazione predefinita
            avrà accesso in <strong>sola lettura</strong> (viewer).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px] space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@esempio.com"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ruolo</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "viewer" | "admin")}
                className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="viewer">Viewer (sola lettura)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button onClick={handleInvite} disabled={busy} size="sm">
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
              Invita
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Utenti</CardTitle>
            <CardDescription className="text-xs">
              Gestisci ruoli, reinvia inviti o rimuovi accessi.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] h-8">Email</TableHead>
                  <TableHead className="text-[11px] h-8">Ruolo</TableHead>
                  <TableHead className="text-[11px] h-8">Stato</TableHead>
                  <TableHead className="text-[11px] h-8">Ultimo accesso</TableHead>
                  <TableHead className="text-[11px] h-8 text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const userRole = u.roles.includes("admin") ? "admin" : "viewer";
                  const confirmed = !!u.confirmed_at;
                  return (
                    <TableRow key={u.id} className="text-xs">
                      <TableCell className="py-1.5">{u.email}</TableCell>
                      <TableCell className="py-1.5">
                        {userRole === "admin" ? (
                          <Badge className="gap-1"><Shield className="h-3 w-3" />admin</Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />viewer</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {confirmed
                          ? <Badge variant="outline" className="text-[10px]">attivo</Badge>
                          : <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600">in attesa</Badge>}
                      </TableCell>
                      <TableCell className="py-1.5 text-muted-foreground">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("it-IT") : "—"}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          {userRole === "viewer" ? (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSetRole(u, "admin")}>
                              Rendi admin
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSetRole(u, "viewer")}>
                              Rendi viewer
                            </Button>
                          )}
                          {!confirmed && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Reinvia invito" onClick={() => handleResend(u)}>
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Imposta password" onClick={() => openPwd(u)}>
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Elimina utente" onClick={() => handleDelete(u)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                      Nessun utente.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pwdUser} onOpenChange={(o) => { if (!o) { setPwdUser(null); setPwdValue(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Imposta password</DialogTitle>
            <DialogDescription className="text-xs">
              Per sicurezza le password non sono visualizzabili (sono salvate solo come hash).
              Puoi però <strong>impostarne una nuova</strong> o <strong>generarne una casuale</strong> e
              comunicarla all'utente, che dovrà cambiarla al primo accesso.
              <br />Utente: <strong>{pwdUser?.email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nuova password</Label>
              <div className="relative">
                <Input
                  type={pwdShow ? "text" : "password"}
                  value={pwdValue}
                  onChange={(e) => setPwdValue(e.target.value)}
                  placeholder="min 8 caratteri"
                  className="pr-20 font-mono"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPwdShow((v) => !v)}>
                    {pwdShow ? <EyeOff className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={copyPwd} disabled={!pwdValue} title="Copia">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleGeneratePwd} disabled={pwdBusy} className="w-full">
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              Genera e imposta password casuale
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwdUser(null)}>Chiudi</Button>
            <Button onClick={handleSetPwd} disabled={pwdBusy || pwdValue.length < 8}>
              {pwdBusy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salva password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}