// Feature 37: the cardiac risk gauge. A half-circle with three bands (Low, Moderate, High)
// and a needle. Bands use the status tokens, and the level is also written out, so meaning
// never depends on colour alone. The numbers are a simulated demonstration, not a medical score.
import { RISK_LEVELS } from '@shared/detection.js'
import { cx } from '../../design/index.js'

const CX = 100
const CY = 100
const R = 78

const polar = (score, r = R) => {
  const angle = Math.PI - (Math.min(100, Math.max(0, score)) / 100) * Math.PI // 0 -> left, 100 -> right
  return [CX + r * Math.cos(angle), CY - r * Math.sin(angle)]
}

function arc(from, to) {
  const [x1, y1] = polar(from)
  const [x2, y2] = polar(to)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const BANDS = [
  { key: 'low', from: RISK_LEVELS.low.min, to: RISK_LEVELS.moderate.min, stroke: 'stroke-normal' },
  { key: 'moderate', from: RISK_LEVELS.moderate.min, to: RISK_LEVELS.high.min, stroke: 'stroke-warning' },
  { key: 'high', from: RISK_LEVELS.high.min, to: 100, stroke: 'stroke-critical' },
]
const TEXT = { low: 'text-normal', moderate: 'text-warning', high: 'text-critical' }

/**
 * @param {number} score  0-100
 * @param {'low'|'moderate'|'high'} level  band to highlight (a Level 3 detection is always High)
 */
export function RiskGauge({ score = 0, level = 'low', size = 'md', className }) {
  const [nx, ny] = polar(score, R - 10)
  const label = RISK_LEVELS[level]?.label ?? 'Low'
  return (
    <figure className={cx('flex flex-col items-center', className)}>
      <svg
        viewBox="0 0 200 118"
        className={size === 'sm' ? 'w-28' : 'w-full max-w-[240px]'}
        role="meter"
        aria-label="Cardiac risk"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={`${score} out of 100, ${label} risk`}
      >
        {BANDS.map((b) => (
          <path
            key={b.key}
            d={arc(b.from, b.to)}
            fill="none"
            strokeWidth={14}
            strokeLinecap="butt"
            className={cx(b.stroke, b.key === level ? 'opacity-100' : 'opacity-30')}
            data-band={b.key}
            data-active={b.key === level}
          />
        ))}
        <line x1={CX} y1={CY} x2={nx} y2={ny} strokeWidth={3} strokeLinecap="round" className="stroke-fg" data-testid="needle" />
        <circle cx={CX} cy={CY} r={5} className="fill-fg" />
      </svg>
      <figcaption className="-mt-1 text-center">
        <span className="font-mono text-2xl font-semibold tabular-nums">{score}</span>
        <span className="text-xs text-fg-muted"> / 100</span>
        <span className={cx('block text-sm font-semibold', TEXT[level])}>{label} risk</span>
      </figcaption>
    </figure>
  )
}
