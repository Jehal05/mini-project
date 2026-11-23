import Icon from './icons.jsx';

const LOOK = { warning: { text: 'text-moderate', line: 'rgb(var(--moderate))', icon: 'diamond', word: 'Warning' }, alert: { text: 'text-critical', line: 'rgb(var(--critical))', icon: 'octagon-alert', word: 'Alert' } };

/**
 * A label with a line to a point on the picture. Place it inside a `relative` box.
 * from: where the line starts on the picture, in percent [x, y]. side: which edge the label sits on.
 * The tone is a shape and a word as well as a colour.
 */
export default function CalloutLabel({ from, side = 'right', top = 20, tone = 'warning', title, children }) {
  const look = LOOK[tone] ?? LOOK.warning;
  const [x, y] = from;
  const labelX = side === 'right' ? 100 : 0;
  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        <line x1={x} y1={y} x2={labelX} y2={top + 6} stroke={look.line} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <circle cx={x} cy={y} r="1.2" fill={look.line} />
      </svg>
      <div style={{ top: `${top}%` }} className={`glass absolute max-w-[46%] rounded-ui border border-line p-2 text-xs ${side === 'right' ? 'right-0' : 'left-0'}`}>
        <p className={`flex items-center gap-1 font-semibold ${look.text}`}><Icon name={look.icon} size={14} />{look.word}: {title}</p>
        {children && <p className="mt-0.5 text-muted">{children}</p>}
      </div>
    </>
  );
}
