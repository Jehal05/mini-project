// Feature 36: the central admin edits every detection threshold, the baseline limits and the risk weights.
// Every change goes to the audit log on the server and appears in the change list below.
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_THRESHOLDS, VITAL_KEYS } from '@shared/vitals.js'
import { detectionApi } from '../detection/api.js'
import ThresholdEditor from '../detection/ThresholdEditor.jsx'

const UNIT = { pct: '% change', drop: 'points drop', abs: 'absolute change' }
const num = (v) => (v === '' ? NaN : Number(v))

function Weights({ config, defaults, reload }) {
  const eff = config.effective.riskWeights
  const [w, setW] = useState(() => ({ ...Object.fromEntries(Object.entries(eff).filter(([k]) => k !== 'levelBonus').map(([k, v]) => [k, String(v)])), l1: String(eff.levelBonus[1]), l2: String(eff.levelBonus[2]), l3: String(eff.levelBonus[3]) }))
  const [s, setS] = useState({ busy: false, error: '', ok: '' })
  const keys = Object.keys(w).filter((k) => !/^l[123]$/.test(k))
  async function save(e) {
    e.preventDefault()
    setS({ busy: true, error: '', ok: '' })
    try {
      const out = {}
      for (const k of keys) if (num(w[k]) !== defaults.riskWeights[k]) out[k] = num(w[k])
      const lb = { 1: num(w.l1), 2: num(w.l2), 3: num(w.l3) }
      if ([1, 2, 3].some((l) => lb[l] !== defaults.riskWeights.levelBonus[l])) out.levelBonus = lb
      await detectionApi.saveConfig({ riskWeights: out })
      setS({ busy: false, error: '', ok: 'Saved.' }); reload()
    } catch (err) { setS({ busy: false, error: [err.message, ...(err.errors ?? [])].join(' · '), ok: '' }) }
  }
  return (
    <form onSubmit={save} aria-label="Risk score weights" className="filters">
      {keys.map((k) => <label key={k}>{k}<input inputMode="decimal" value={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.value })} size={6} /></label>)}
      {['l1', 'l2', 'l3'].map((k, i) => <label key={k}>Level {i + 1} bonus<input inputMode="decimal" value={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.value })} size={6} /></label>)}
      {s.error && <p className="form-error" role="alert">{s.error}</p>}{s.ok && <p className="hint" role="status">{s.ok}</p>}
      <button type="submit" className="btn btn-primary" disabled={s.busy}>Save risk weights</button>
    </form>
  )
}

function Baselines({ config, defaults, reload }) {
  const eff = config.effective.baselineLimits
  const [b, setB] = useState(() => Object.fromEntries(VITAL_KEYS.map((k) => [k, String(Object.values(eff[k])[0])])))
  const [s, setS] = useState({ busy: false, error: '', ok: '' })
  async function save(e) {
    e.preventDefault()
    setS({ busy: true, error: '', ok: '' })
    try {
      const out = {}
      for (const k of VITAL_KEYS) { const kind = Object.keys(defaults.baselineLimits[k])[0]; if (num(b[k]) !== defaults.baselineLimits[k][kind]) out[k] = { [kind]: num(b[k]) } }
      await detectionApi.saveConfig({ baselineLimits: out })
      setS({ busy: false, error: '', ok: 'Saved.' }); reload()
    } catch (err) { setS({ busy: false, error: [err.message, ...(err.errors ?? [])].join(' · '), ok: '' }) }
  }
  return (
    <form onSubmit={save} aria-label="Baseline change limits" className="filters">
      {VITAL_KEYS.map((k) => <label key={k}>{DEFAULT_THRESHOLDS[k].label} ({UNIT[Object.keys(defaults.baselineLimits[k])[0]]})<input inputMode="decimal" value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} size={6} /></label>)}
      {s.error && <p className="form-error" role="alert">{s.error}</p>}{s.ok && <p className="hint" role="status">{s.ok}</p>}
      <button type="submit" className="btn btn-primary" disabled={s.busy}>Save baseline limits</button>
    </form>
  )
}

export default function DetectionSettingsPage() {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => detectionApi.config().then((c) => { setConfig(c); setError('') }).catch((e) => setError(e.message)), [])
  useEffect(() => { reload() }, [reload])
  if (error) return <p className="form-error" role="alert">{error}</p>
  if (!config) return <p role="status">Loading settings…</p>
  const defaults = config.defaults
  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="th-h">
        <h2 id="th-h">Detection thresholds</h2>
        <p className="subtitle">Applies to every patient unless a doctor sets an override for one.</p>
        <ThresholdEditor key={JSON.stringify(config.effective.thresholds)} current={config.effective.thresholds} compare={DEFAULT_THRESHOLDS} onSave={async (o) => { await detectionApi.saveConfig({ thresholds: o }); await reload() }} onReset={async () => { await detectionApi.saveConfig({ thresholds: {} }); await reload() }} />
      </section>
      <section className="glass-card" aria-labelledby="bl-h"><h2 id="bl-h">Change from the patient's own baseline</h2><p className="subtitle">How far from a patient's 24-hour baseline counts as a large change, even inside the normal range.</p><Baselines key={JSON.stringify(config.effective.baselineLimits)} config={config} defaults={defaults} reload={reload} /></section>
      <section className="glass-card" aria-labelledby="rw-h"><h2 id="rw-h">Risk score weights</h2><p className="subtitle">Points added to the 0 to 100 cardiac risk score.</p><Weights key={JSON.stringify(config.effective.riskWeights)} config={config} defaults={defaults} reload={reload} /></section>
      <section className="glass-card" aria-labelledby="ch-h">
        <h2 id="ch-h">Recent changes</h2>
        {config.changes?.length ? <ol className="item-list">{[...config.changes].reverse().map((c, i) => <li key={i}><span><strong>{c.summary}</strong> <span className="hint">({c.scope})</span></span><span className="hint">{new Date(c.at).toLocaleString()} · {c.actorRole}</span></li>)}</ol> : <p className="hint">No changes yet. Defaults are in use.</p>}
      </section>
    </div>
  )
}
