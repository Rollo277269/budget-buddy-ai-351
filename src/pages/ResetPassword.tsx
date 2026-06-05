import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash automatically and emits PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also handle the case where the session is already set
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Le password non coincidono");
      return;
    }
    if (password.length < 8) {
      toast.error("La password deve essere di almeno 8 caratteri");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password aggiornata. Accedi con la nuova password.");
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Imposta nuova password</CardTitle>
          <CardDescription>
            {ready
              ? "Inserisci la tua nuova password."
              : "Apri questa pagina dal link ricevuto via email."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pw">Nuova password</Label>
              <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw2">Conferma password</Label>
              <Input id="pw2" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!ready} />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !ready}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Aggiorna password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}