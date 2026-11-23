import { useEffect, useReducer } from 'react';
import { getSocket } from './socket.js';
import { connectionReducer, initialConnection } from './connection.js';

// 'live' | 'connecting' | 'offline' for the shared Socket.IO connection.
export function useConnection() {
  const [state, dispatch] = useReducer(connectionReducer, undefined, () => initialConnection(false));
  useEffect(() => {
    const s = getSocket();
    const on = (name) => () => dispatch(name);
    const h = { connect: on('connect'), disconnect: on('disconnect'), connect_error: on('connect_error') };
    const attempt = on('reconnect_attempt');
    const off = on('browser_offline'); const online = on('browser_online');
    Object.entries(h).forEach(([e, fn]) => s.on(e, fn));
    s.io.on('reconnect_attempt', attempt);
    window.addEventListener('offline', off); window.addEventListener('online', online);
    if (s.connected) dispatch('connect');
    if (!navigator.onLine) dispatch('browser_offline');
    return () => {
      Object.entries(h).forEach(([e, fn]) => s.off(e, fn));
      s.io.off('reconnect_attempt', attempt);
      window.removeEventListener('offline', off); window.removeEventListener('online', online);
    };
  }, []);
  return state.status;
}
