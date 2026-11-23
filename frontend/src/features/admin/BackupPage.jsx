import { useState } from 'react'
import { useSave } from '../profile/useProfile.jsx'
import { adminOps } from './OpsApi.js'

const readText = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsText(file) })

/** Feature 99: download a backup, check a file, restore it. Restore replaces application data (never accounts) and needs a typed word. */
export default function BackupPage() {
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [check, setCheck] = useState(null)
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(null)
  const dl = useSave()
  const act = useSave()

  const download = async () => {
    const data = await dl.run(() => adminOps.backup())
    if (!data) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `healthtwin-backup-${data.createdAt.slice(0, 10)}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }
  const pick = async (e) => {
    const f = e.target.files?.[0]
    setCheck(null); setDone(null); setFile(null); setConfirm('')
    if (!f) return
    setName(f.name)
    let parsed
    try { parsed = JSON.parse(await readText(f)) } catch { return setCheck({ ok: false, problems: ['That file is not valid JSON'] }) }
    setFile(parsed)
    const res = await act.run(() => adminOps.checkBackup(parsed))
    if (res) setCheck(res)
  }
  const restore = async () => {
    const res = await act.run(() => adminOps.restore(file, confirm))
    if (res) { setDone(res.restored); setFile(null); setCheck(null); setConfirm('') }
  }
  return (
    <div className="stack">
      <section className="glass-card" aria-labelledby="bk-h">
        <h2 id="bk-h">Back up</h2>
        <p className="hint">Saves patients, hospitals, beds, doctors, ambulances, cases and admissions. Accounts, passwords and sign-in sessions are never included. A copy is also saved on the server each day when BACKUP_DIR is set.</p>
        {dl.error && <p className="form-error" role="alert">{dl.error}</p>}
        <button type="button" className="btn btn-primary" disabled={dl.busy} onClick={download}>Download backup</button>
      </section>
      <section className="glass-card" aria-labelledby="rs-h">
        <h2 id="rs-h">Restore</h2>
        <p className="notice">Restoring replaces the current application data with the file. The file is checked first and nothing changes if it fails.</p>
        <label htmlFor="bk-file">Backup file</label>
        <input id="bk-file" type="file" accept="application/json,.json" onChange={pick} />
        {check && (check.ok
          ? <p role="status">{name} passed its checks.</p>
          : <div role="alert" className="form-error"><p>{name} cannot be restored:</p><ul>{check.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>)}
        {check?.ok && (
          <div>
            <label htmlFor="bk-confirm">Type RESTORE to confirm</label>
            <input id="bk-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            <button type="button" className="btn btn-primary" disabled={confirm !== 'RESTORE' || act.busy} onClick={restore}>Restore data</button>
          </div>
        )}
        {act.error && <p className="form-error" role="alert">{act.error}</p>}
        {done && <p role="status">Restored: {Object.entries(done).map(([k, v]) => `${k} ${v}`).join(', ')}.</p>}
      </section>
    </div>
  )
}
