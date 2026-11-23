import { useEffect, useSyncExternalStore } from 'react';
import { getSession, restore, subscribe } from './session.js';

// { status: 'loading' | 'out' | 'in', user }. Restores the session once when the app opens.
export function useSession() {
  const snap = useSyncExternalStore(subscribe, () => `${getSession().status}:${getSession().user?.id ?? ''}`);
  useEffect(() => { if (getSession().status === 'loading') restore(); }, []);
  void snap;
  return getSession();
}
