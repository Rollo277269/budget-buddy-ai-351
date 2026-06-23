import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { mycommessa } from '@/integrations/mycommessa/client';

export function useMyCommessaAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = mycommessa.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    mycommessa.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    return mycommessa.auth.signInWithPassword({ email, password });
  };

  const signOut = async () => {
    return mycommessa.auth.signOut();
  };

  return { session, loading, signIn, signOut };
}