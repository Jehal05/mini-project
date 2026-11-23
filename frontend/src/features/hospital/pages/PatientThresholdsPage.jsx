// Feature 36: a doctor looks up a patient by code and overrides the detection thresholds for that patient only.
import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { detectionApi } from '../../detection/api.js'
import ThresholdEditor from '../../detection/ThresholdEditor.jsx'

export default function PatientThresholdsPage() {
  const { role } = useOutletContext() ?? {}
  const [code, setCode] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const canEdit = role === 'doctor'

  async function load(e) {
    e.preventDefault()
    setError(''); setData(null)
    try { setData({ code: code.trim(), ...(await detectionApi.patientThresholds(code.trim())) }) } catch (err) { setError(err.status === 404 ? `No patient with ID ${code.trim()}.` : err.message) }
  }
  const reload = async () => setData({ code: data.code, ...(await detectionApi.patientThresholds(data.code)) })

  return (
    <section className="glass-card" aria-labelledby="pt-h">
      <h2 id="pt-h">Patient thresholds</h2>
      <p className="subtitle">Set different demo thresholds for one patient, for example a known low resting heart rate. Only doctors can change them.</p>
      <form onSubmit={load} className="filters" aria-label="Find patient">
        <label>Patient ID<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HT-2026-0001" required /></label>
        <button type="submit" className="btn btn-primary">Load</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {data && (
        <>
          <p>{data.override && Object.keys(data.override).length ? 'This patient has an override.' : 'This patient uses the global thresholds.'}</p>
          {canEdit ? (
            <ThresholdEditor key={JSON.stringify(data.effective)} current={data.effective} compare={data.globalThresholds}
              onSave={async (o) => { await detectionApi.savePatientThresholds(data.code, o); await reload() }}
              onReset={async () => { await detectionApi.savePatientThresholds(data.code, {}); await reload() }}
              saveLabel="Save for this patient" resetLabel="Use global thresholds" />
          ) : <p className="hint">Ask a doctor to change this patient's thresholds.</p>}
        </>
      )}
    </section>
  )
}
