import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Field from '../../../components/Field.jsx'
import { useSave } from '../../profile/useProfile.jsx'
import { useLoad } from '../../shared/useLoad.js'
import { canManage } from '../../hospital/HospitalLayout.jsx'
import { responseApi } from '../api.js'
import { useSocketEvents } from '../hooks.js'

const LABEL = { available: 'Available', dispatched: 'Dispatched', on_trip: 'On trip', maintenance: 'Maintenance' }

/** Features 71, 72: register vehicles, set them available or in maintenance, live counts. */
export default function AmbulancesPage() {
  const { role } = useOutletContext()
  const manage = canManage(role)
  const fleet = useLoad(() => responseApi.ambulances(), [])
  const [f, setF] = useState({ vehicleNumber: '', type: 'ALS', crew: '', equipment: '' })
  const save = useSave()
  useSocketEvents({ 'ambulance:status': fleet.reload, 'ambulance:assigned': fleet.reload })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const add = async (e) => {
    e.preventDefault()
    const body = { vehicleNumber: f.vehicleNumber, type: f.type, crew: f.crew.split(',').map((n) => n.trim()).filter(Boolean).map((name) => ({ name })), equipment: f.equipment.split(',').map((n) => n.trim()).filter(Boolean) }
    if (await save.run(() => responseApi.addAmbulance(body))) { setF({ vehicleNumber: '', type: 'ALS', crew: '', equipment: '' }); fleet.reload() }
  }
  const counts = fleet.data?.counts
  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="amb-h">
        <h2 id="amb-h">Ambulances</h2>
        {counts && <div className="tiles">{Object.entries(LABEL).map(([k, l]) => <div className="tile" key={k}><p className="tile-value">{counts[k]}</p><p className="tile-label">{l}</p></div>)}</div>}
        {fleet.error && <p className="form-error" role="alert">{fleet.error}</p>}
        {fleet.data?.items.length === 0 && <p className="hint">No ambulances registered yet.</p>}
        <ul className="item-list">
          {fleet.data?.items.map((a) => (
            <li key={a._id}>
              <span><strong>{a.vehicleNumber}</strong> <span className="pill">{a.type}</span> {a.crew?.map((m) => m.name).join(', ')} <span className="hint">{a.equipment?.join(', ')}</span></span>
              <span>{LABEL[a.status]}{manage && ['available', 'maintenance'].includes(a.status) && <> <button type="button" className="btn btn-secondary" onClick={async () => { if (await save.run(() => responseApi.setAmbulance(a._id, a.status === 'available' ? 'maintenance' : 'available'))) fleet.reload() }}>{a.status === 'available' ? 'Set to maintenance' : 'Set available'}</button></>}</span>
            </li>
          ))}
        </ul>
      </section>
      {manage && (
        <section className="glass-card" aria-labelledby="reg-h">
          <h2 id="reg-h">Register an ambulance</h2>
          <form onSubmit={add} noValidate>
            <Field label="Vehicle number" value={f.vehicleNumber} onChange={set('vehicleNumber')} error={save.fields.vehicleNumber} />
            <Field label="Type">{(id) => <select id={id} value={f.type} onChange={set('type')}><option value="ALS">ALS (advanced life support)</option><option value="BLS">BLS (basic life support)</option></select>}</Field>
            <Field label="Crew (names, separated by commas)" value={f.crew} onChange={set('crew')} />
            <Field label="Equipment (separated by commas)" value={f.equipment} onChange={set('equipment')} />
            {save.error && <p className="form-error" role="alert">{save.error}</p>}
            <button type="submit" className="btn btn-primary" disabled={save.busy}>Register</button>
          </form>
        </section>
      )}
    </div>
  )
}
