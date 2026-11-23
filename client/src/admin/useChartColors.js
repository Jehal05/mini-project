import { useEffect, useState } from 'react';

const NAMES = ['ink', 'muted', 'line', 'surface', 'critical', 'high', 'moderate', 'low', 'info', 'accent'];
const read = () => {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(NAMES.map((n) => [n, `rgb(${cs.getPropertyValue(`--${n}`).trim().split(/\s+/).join(',')})`]));
};

// Chart libraries paint SVG attributes, which do not follow CSS variables everywhere, so the theme colours are
// read from the CSS variables and re-read when the theme or role changes (data-theme / data-role on <html>).
export function useChartColors() {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-role'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}
