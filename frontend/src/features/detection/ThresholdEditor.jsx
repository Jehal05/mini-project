// Feature 36: edit the demo thresholds. Shows every vital's normal range and critical bounds, saves only what differs
// from `compare` (the defaults for the global page, the global values for one patient), and can reset to that base.
import { useMemo, useState } from 'react'
import { DEFAULT_THRESHOLDS, VITAL_KEYS } from '@shared/vitals.js'

const CRIT = [['below', 'critical below'], ['above', 'critical above'], ['atOrAbove', 'critical at or above']]
const toForm = (t) => Object.fromEntries(VITAL_KEYS.map((k) => [k, { lo: String(t[k].normal[0]), hi: String(t[k].normal[1]), ...Object.fromEntries(CRIT.filter(([c]) => DEFAULT_THRESHOLDS[k].critical[c] !== undefined || t[k].critical[c] !== undefined).map(([c]) => [c, String(t[k].critical[c] ?? '')])) }]))

/** Overrides: only the vitals whose numbers differ from `compare`. */
export function diffThresholds(form, compare) {
  const out = {}
  for (const k of VITAL_KEYS) {
    const f = form[k]
    const normal = [Number(f.lo), Number(f.hi)]
    const critical = Object.fromEntries(CRIT.filter(([c]) => f[c] !== undefined && f[c] !== '').map(([c]) => [c, Number(f[c])]))
    const same = normal[0] === compare[k].normal[0] && normal[1] === compare[k].normal[1] && CRIT.every(([c]) => (critical[c] ?? undefined) === compare[k].critical[c])
    if (!same) out[k] = { normal, critical }
  }
  return out
}

export default function ThresholdEditor({ current, compare, onSave, onReset, saveLabel = 'Save thresholds', resetLabel = 'Reset to defaults' }) {
  const [form, setForm] = useState(() => toForm(current))
  const [state, setState] = useState({ busy: false, error: '', ok: '' })
  const set = (k, field) => (e) => setForm((f) => ({ ...f, [k]: { ...f[k], [field]: e.target.value } }))
  const invalid = useMemo(() => VITAL_KEYS.some((k) => Object.values(form[k]).some((v) => v === '' ? false : !Number.isFinite(Number(v))) || form[k].lo === '' || form[k].hi === ''), [form])

  async function run(fn, ok) {
    setState({ busy: true, error: '', ok: '' })
    try { await fn(); setState({ busy: false, error: '', ok }) } catch (e) { setState({ busy: false, error: [e.message, ...(e.errors ?? [])].filter((v, i, a) => a.indexOf(v) === i).join(' · '), ok: '' }) }
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(() => onSave(diffThresholds(form, compare)), 'Saved. Detection uses the new values from the next reading.') }} aria-label="Detection thresholds">
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th scope="col">Vital</th><th scope="col">Normal low</th><th scope="col">Normal high</th><th scope="col">Critical below</th><th scope="col">Critical above</th><th scope="col">Critical at or above</th></tr></thead>
          <tbody>
            {VITAL_KEYS.map((k) => {
              const d = DEFAULT_THRESHOLDS[k]
              return (
                <tr key={k}>
                  <th scope="row">{d.label} <span className="hint">({d.unit})</span></th>
                  {['lo', 'hi'].map((f) => <td key={f}><input aria-label={`${d.label} normal ${f === 'lo' ? 'low' : 'high'}`} inputMode="decimal" value={form[k][f]} onChange={set(k, f)} size={5} /></td>)}
                  {CRIT.map(([c, label]) => <td key={c}>{form[k][c] !== undefined ? <input aria-label={`${d.label} ${label}`} inputMode="decimal" value={form[k][c]} onChange={set(k, c)} size={5} /> : <span className="hint">n/a</span>}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">Demo thresholds, not clinical criteria. A critical bound must sit outside the normal range.</p>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.ok && <p className="hint" role="status">{state.ok}</p>}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={state.busy || invalid}>{saveLabel}</button>
        <button type="button" className="btn btn-secondary" disabled={state.busy} onClick={() => run(async () => { await onReset(); setForm(toForm(compare)) }, 'Reset.')}>{resetLabel}</button>
      </div>
    </form>
  )
}
