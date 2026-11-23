// Small inline icon set (no icon library, no network). Every icon is decorative unless given a title.
const P = {
  'octagon-alert': <><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" /><path d="M12 7v6M12 16.5v.5" /></>,
  'triangle-alert': <><path d="M12 3 2 20h20z" /><path d="M12 10v5M12 17.5v.5" /></>,
  diamond: <><path d="M12 2 22 12 12 22 2 12z" /><path d="M12 8v5M12 15.5v.5" /></>,
  circle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></>,
  'circle-dashed': <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />,
  'heart-pulse': <><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.800-8 11-8 11z" /><path d="M3 12h4l2-3 3 6 2-3h7" /></>,
  'map-pin': <><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.500 7 12 7 12z" /><circle cx="12" cy="10" r="2.500" /></>,
  stethoscope: <><path d="M6 3v6a4 4 0 0 0 8 0V3" /><path d="M10 13v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="11" r="2" /></>,
  siren: <><path d="M6 19v-6a6 6 0 0 1 12 0v6" /><path d="M3 19h18M12 3v2M4.500 6l1.500 1.500M19.500 6 18 7.500" /></>,
  ambulance: <><path d="M2 17V7h12v10M14 10h4l4 4v3h-2" /><circle cx="7" cy="17.500" r="1.800" /><circle cx="17" cy="17.500" r="1.800" /><path d="M8 9v4M6 11h4" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 15 4-5 3 3 5-7" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.700 3.600 3 8 3s8-1.300 8-3V5M4 12c0 1.700 3.600 3 8 3s8-1.300 8-3" /></>,
  phone: <path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.500 1.500M17.500 17.500 19 19M5 19l1.500-1.500M17.500 6.500 19 5" /></>,
  moon: <path d="M20 14.500A8.500 8.500 0 0 1 9.500 4 8.500 8.500 0 1 0 20 14.500z" />,
  check: <path d="m4 12.500 5 5L20 6.500" />,
  x: <path d="m5 5 14 14M19 5 5 19" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.500v.5" /></>,
  inbox: <><path d="M3 13h5l1 3h6l1-3h5" /><path d="M5 5h14l2 8v6H3v-6z" /></>,
};

export default function Icon({ name, size = 20, title, className = '' }) {
  const body = P[name] ?? P['circle-dashed'];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {body}
    </svg>
  );
}
export const ICON_NAMES = Object.keys(P);
