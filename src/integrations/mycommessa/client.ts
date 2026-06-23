import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_MYCOMMESSA_URL as string;
const KEY = import.meta.env.VITE_MYCOMMESSA_PUBLISHABLE_KEY as string;

export const mycommessa = createClient(URL, KEY, {
  auth: {
    storage: localStorage,
    storageKey: 'mycommessa-auth',
    persistSession: true,
    autoRefreshToken: true,
  },
});