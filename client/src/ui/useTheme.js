import { useCallback, useEffect, useState } from 'react';
import { loadTheme, resolveTheme, saveTheme, toggleTheme } from './theme.js';

const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

// Theme and role are written on <html> so the page background, dialogs and overscroll all follow them.
export function useTheme(role) {
  const [theme, setTheme] = useState(() => resolveTheme({ role, stored: loadTheme(localStorage, role), systemDark: systemDark() }));
  useEffect(() => { setTheme(resolveTheme({ role, stored: loadTheme(localStorage, role), systemDark: systemDark() })); }, [role]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.role = role;
  }, [theme, role]);
  const toggle = useCallback(() => setTheme((t) => { const n = toggleTheme(t); saveTheme(localStorage, role, n); return n; }), [role]);
  return [theme, toggle];
}
