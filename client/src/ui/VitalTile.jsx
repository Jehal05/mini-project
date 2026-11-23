import Icon from './icons.jsx';
import Sparkline from './Sparkline.jsx';
import { VITAL_TONE, VITAL_WORD } from './vitals.js';

const SHAPE = { normal: 'circle', warning: 'diamond', critical: 'octagon-alert', unknown: 'circle-dashed' };
const TEXT = { low: 'text-low', moderate: 'text-moderate', critical: 'text-critical', neutral: 'text-muted' };

// Label first, then the number, then a status that is a shape plus a word. A tiny trend sits underneath when there is one.
export default function VitalTile({ label, value, unit, status = 'unknown', values, simulated = false, className = '' }) {
  const tone = VITAL_TONE[status] ?? 'neutral';
  return (
    <div className={`glass rounded-ui border border-line p-3 ${className}`}>
      <p className="text-xs font-semibold text-muted">{label}{simulated ? ' (simulated)' : ''}</p>
      <p className="tnum mt-1 flex items-baseline gap-1 text-ink"><span className="text-3xl font-semibold">{value ?? '–'}</span><span className="text-sm text-muted">{unit}</span></p>
      <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${TEXT[tone]}`}><Icon name={SHAPE[status] ?? SHAPE.unknown} size={14} />{VITAL_WORD[status]}</p>
      {values?.length > 1 && <div className="mt-2"><Sparkline values={values} width={120} height={28} tone={TEXT[tone]} label={`${label} trend`} /></div>}
    </div>
  );
}
