// Status helpers shared by every screen. Pure, tested in tokens.test.js.
// Severity always shows a SHAPE and a WORD as well as a colour.
export const SEVERITIES = ['critical', 'high', 'moderate', 'low'];

const META = {
  critical: { label: 'Critical', icon: 'octagon-alert', tone: 'critical', rank: 4 },
  high: { label: 'High', icon: 'triangle-alert', tone: 'high', rank: 3 },
  moderate: { label: 'Moderate', icon: 'diamond', tone: 'moderate', rank: 2 },
  low: { label: 'Low', icon: 'circle', tone: 'low', rank: 1 },
};
export const severityMeta = (s) => META[s] ?? { label: 'Unknown', icon: 'circle-dashed', tone: 'neutral', rank: 0 };

// Full class names must appear literally so Tailwind keeps them.
const TONES = {
  critical: { soft: 'bg-critical-soft text-critical', solid: 'bg-critical text-white', bar: 'bg-critical', text: 'text-critical', ring: 'border-critical' },
  high: { soft: 'bg-high-soft text-high', solid: 'bg-high text-white', bar: 'bg-high', text: 'text-high', ring: 'border-high' },
  moderate: { soft: 'bg-moderate-soft text-moderate', solid: 'bg-moderate text-white', bar: 'bg-moderate', text: 'text-moderate', ring: 'border-moderate' },
  low: { soft: 'bg-low-soft text-low', solid: 'bg-low text-white', bar: 'bg-low', text: 'text-low', ring: 'border-low' },
  info: { soft: 'bg-info-soft text-info', solid: 'bg-info text-white', bar: 'bg-info', text: 'text-info', ring: 'border-info' },
  accent: { soft: 'bg-accent/10 text-accent', solid: 'bg-accent text-accent-ink', bar: 'bg-accent', text: 'text-accent', ring: 'border-accent' },
  neutral: { soft: 'bg-raised text-muted', solid: 'bg-ink text-surface', bar: 'bg-muted', text: 'text-muted', ring: 'border-line' },
};
export const toneClasses = (tone) => TONES[tone] ?? TONES.neutral;

// Case status in plain words, with a tone.
const STATUS = {
  pending: { label: 'Waiting for a hospital', tone: 'moderate' },
  accepted: { label: 'Accepted', tone: 'low' },
  ambulance_assigned: { label: 'Ambulance dispatched', tone: 'info' },
  en_route: { label: 'On the way to hospital', tone: 'info' },
  arrived: { label: 'Arrived at hospital', tone: 'low' },
  closed: { label: 'Closed', tone: 'neutral' },
};
export const statusMeta = (s) => STATUS[s] ?? { label: String(s ?? 'Unknown').replace(/_/g, ' '), tone: 'neutral' };

// Ambulance status for the fleet board.
const FLEET = {
  available: { label: 'Available', tone: 'low' },
  reserved: { label: 'Reserved', tone: 'moderate' },
  dispatched: { label: 'Dispatched', tone: 'info' },
  on_trip: { label: 'On a trip', tone: 'accent' },
  maintenance: { label: 'In maintenance', tone: 'neutral' },
};
export const fleetMeta = (s) => FLEET[s] ?? { label: s, tone: 'neutral' };
