import { useAuth } from '../../../auth/AuthContext.jsx';
import { ROLE_LABEL } from '../../../auth/roles.js';
import { hospitalApi } from '../api.js';
import { fmtSeconds, useLoad } from '../../shared/useLoad.js';

function Tile({ label, value, note, tone }) {
  return (
    <div className={`tile${tone ? ` tile-${tone}` : ''}`}>
      <p className="tile-value">{value}</p>
      <p className="tile-label">{label}</p>
      {note && <p className="hint">{note}</p>}
    </div>
  );
}

/** Feature 82: per-hospital KPIs. */
export default function DashboardPage() {
  const { user } = useAuth();
  const k = useLoad(() => hospitalApi.dashboard(), []);
  const me = useLoad(() => hospitalApi.me(), []);
  const kpis = k.data?.kpis;
  return (
    <div className="stack">
      <section aria-labelledby="kpi-h">
        <h2 id="kpi-h">{me.data?.hospital.name ?? 'Your hospital'}</h2>
        {k.error && <p className="form-error" role="alert">{k.error}</p>}
        {k.loading && !kpis && <p role="status">Loading…</p>}
        {kpis && (
          <div className="tiles">
            <Tile label="Incoming emergencies" value={kpis.incomingEmergencies} tone={kpis.incomingEmergencies ? 'warn' : undefined} />
            <Tile label="Free beds" value={kpis.freeBeds} note={`General ${kpis.freeBedsByType.general} · ICU ${kpis.freeBedsByType.icu} · CCU ${kpis.freeBedsByType.ccu}`} />
            <Tile label="Doctors on duty" value={kpis.doctorsOnDuty} note={kpis.cardiologistOnDuty ? 'Cardiologist on duty' : 'No cardiologist on duty'} tone={kpis.cardiologistOnDuty ? undefined : 'warn'} />
            <Tile label="ALS ambulances" value={kpis.ambulancesAvailable} note="Listed by the hospital" />
            <Tile label="Average response" value={fmtSeconds(kpis.avgResponseSeconds)} note={kpis.respondedCases ? `${kpis.respondedCases} answered cases` : 'No answered cases yet'} />
            <Tile label="Patients admitted" value={kpis.activeAdmissions} />
          </div>
        )}
      </section>
      <section className="glass-card" aria-labelledby="acct">
        <h2 id="acct">Your account</h2>
        <dl className="facts">
          <div><dt>Name</dt><dd>{user.name}</dd></div>
          <div><dt>Role</dt><dd>{ROLE_LABEL[user.role]}</dd></div>
        </dl>
        <p className="hint">You can only see data for your own hospital.</p>
      </section>
    </div>
  );
}
