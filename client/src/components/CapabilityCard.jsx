// Feature 58: a hospital's live cardiac capability - cath lab, cardiologist, ICU/CCU beds, ALS ambulances, last update.
import { formatKm } from '../utils/distance.js';
import { timeAgo } from '../utils/time.js';

function Chip({ ok, yes, no }) {
  return (
    <span className={`badge ${ok ? 'bg-good/15 text-good' : 'bg-white/10 text-text-muted'}`}>
      {ok ? `✓ ${yes}` : `✗ ${no}`}
    </span>
  );
}

function Count({ label, value, warnWhenZero = true }) {
  const zero = !value;
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 text-center ${
        zero && warnWhenZero ? 'border-warn/40 bg-warn/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <p className={`font-mono text-base font-semibold ${zero && warnWhenZero ? 'text-warn' : 'text-text'}`}>
        {value ?? 0}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

export default function CapabilityCard({ hospital, compact = false, showName = true }) {
  const c = hospital.capabilities || {};

  return (
    <div className={compact ? '' : 'glass p-4'}>
      {showName && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold">{hospital.name}</p>
          {hospital.distanceKm !== undefined && (
            <span className="shrink-0 font-mono text-xs text-primary">{formatKm(hospital.distanceKm)}</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Chip ok={c.cathLab} yes="Cath lab" no="No cath lab" />
        <Chip ok={c.cardiologistOnDuty} yes="Cardiologist on duty" no="No cardiologist" />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Count label="ICU free" value={c.icuBedsFree} />
        <Count label="CCU free" value={c.ccuBedsFree} />
        <Count label="ALS amb." value={c.alsAmbulances} />
      </div>

      <p className="mt-2 text-[11px] text-text-muted">
        Updated {timeAgo(c.updatedAt)} · Demo data until bed and doctor modules are live
      </p>
    </div>
  );
}
