import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

const AccountContext = createContext<{ user: User | null; loading: boolean }>({ user: null, loading: true });
export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      const { data } = await supabase.auth.getUser();
      if (alive && current === revision) { setUser(data.user); setLoading(false); }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return;
      if (event === 'SIGNED_OUT') { revision++; setUser(null); setLoading(false); }
      else { setTimeout(() => { void refresh(); }, 0); void queryClient.invalidateQueries(); }
      void router.invalidate();
    });
    void refresh();
    return () => { alive = false; subscription.unsubscribe(); };
  }, [queryClient, router]);
  return <AccountContext.Provider value={{ user, loading }}>{children}</AccountContext.Provider>;
}