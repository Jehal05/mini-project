import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ChartCard from './ChartCard.jsx';
import { SEVERITY_LABELS, ambulanceRows, cell, hospitalRows, reasonRows, timingRows } from '../lib/analyticsView.js';

// Severity colours plus fill patterns, so the series differ without colour.
const SEV = {
  critical: { color: '#b91c1c', pattern: 'solid' },
  high: { color: '#c2410c', pattern: 'stripes' },
  moderate: { color: '#a16207', pattern: 'dots' },
  low: { color: '#1d4ed8', pattern: 'cross' },
};
const fillFor = (key) => (SEV[key].pattern === 'solid' ? SEV[key].color : `url(#pat-${key})`);

function Patterns() {
  return (
    <defs>
      {Object.entries(SEV).map(([key, { color, pattern }]) => {
        if (pattern === 'solid') return null;
        return (
          <pattern key={key} id={`pat-${key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={pattern === 'stripes' ? 'rotate(45)' : undefined}>
            <rect width="6" height="6" fill="#fff" />
            {pattern === 'stripes' && <rect width="3" height="6" fill={color} />}
            {pattern === 'dots' && <circle cx="3" cy="3" r="1.8" fill={color} />}
            {pattern === 'cross' && <path d="M0 0L6 6M6 0L0 6" stroke={color} strokeWidth="1.2" />}
          </pattern>
        );
      })}
    </defs>
  );
}

const H = 260;
const common = { margin: { top: 8, right: 8, left: 0, bottom: 4 } };

export function CasesPerDay({ summary, loading, error }) {
  const rows = summary?.casesPerDay || [];
  return (
    <ChartCard
      title="Cases per day, by severity"
      loading={loading}
      error={error}
      empty={!rows.some((d) => d.total > 0)}
      columns={['Date', ...Object.values(SEVERITY_LABELS), 'Total']}
      rows={rows.map((d) => [d.date, d.critical, d.high, d.moderate, d.low, d.total])}
    >
      <ResponsiveContainer width="100%" height={H}>
        <BarChart data={rows} {...common}>
          <Patterns />
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
          <Legend />
          {Object.keys(SEV).map((k) => (
            <Bar key={k} dataKey={k} name={SEVERITY_LABELS[k]} stackId="s" fill={fillFor(k)} stroke={SEV[k].color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ResponseTimes({ summary, loading, error }) {
  const rows = timingRows(summary?.responseTimes);
  return (
    <ChartCard
      title="Response times (minutes from detection)"
      description="Median and 90th percentile. Hidden when fewer than 3 cases."
      loading={loading}
      error={error}
      empty={!rows.some((r) => r.median !== null || r.masked)}
      columns={['Step', 'Median', '90th percentile', 'Cases']}
      rows={rows.map((r) => [r.name, cell(r.median, r.masked, ' min'), cell(r.p90, r.masked, ' min'), cell(r.n, r.masked)])}
    >
      <ResponsiveContainer width="100%" height={H}>
        <BarChart data={rows} {...common}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={10} interval={0} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          <Bar dataKey="median" name="Median" fill="#1d4ed8" />
          <Bar dataKey="p90" name="90th percentile" fill="#fff" stroke="#1d4ed8" strokeWidth={2} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function RejectionReasons({ summary, loading, error }) {
  const rows = reasonRows(summary?.rejectionReasons);
  return (
    <ChartCard
      title="Rejection and no-answer reasons"
      loading={loading}
      error={error}
      empty={!rows.length}
      columns={['Reason', 'Count']}
      rows={rows.map((r) => [r.name, cell(r.count, r.masked)])}
    >
      <ResponsiveContainer width="100%" height={H}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 8, left: 40, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} fontSize={11} />
          <YAxis type="category" dataKey="name" fontSize={11} width={110} />
          <Tooltip />
          <Bar dataKey="count" name="Count" fill="#7c3aed" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function HospitalComparison({ summary, loading, error }) {
  const rows = hospitalRows(summary?.hospitals);
  return (
    <ChartCard
      title="Hospital acceptance rate"
      description="Share of alerts a hospital accepted. Hospitals with fewer than 3 alerts are hidden."
      loading={loading}
      error={error}
      empty={!rows.length}
      columns={['Hospital', 'Alerts', 'Acceptance', 'Average response']}
      rows={rows.map((h) => [h.name, cell(h.notified, h.masked), cell(h.acceptanceRate, h.masked, '%'), cell(h.avgResponseMin, h.masked, ' min')])}
    >
      <ResponsiveContainer width="100%" height={H}>
        <BarChart data={rows} {...common}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={10} interval={0} tickFormatter={(n) => n.replace('Demo ', '').slice(0, 14)} />
          <YAxis domain={[0, 100]} fontSize={11} unit="%" />
          <Tooltip />
          <Bar dataKey="acceptanceRate" name="Acceptance rate" fill="#15803d" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function Utilisation({ summary, loading, error }) {
  const rows = ambulanceRows(summary?.ambulances);
  return (
    <ChartCard
      title="Ambulance utilisation"
      description="Share of the date range spent on a trip. Maintenance time is not recorded, so the rest is shown as 'not on a trip'."
      loading={loading}
      error={error}
      empty={!rows.length}
      columns={['Ambulance', 'Trips', 'On a trip', 'Not on a trip']}
      rows={(summary?.ambulances || []).map((a) => [`${a.vehicleNumber} (${a.type})`, cell(a.trips, a.masked), cell(a.onTripPercent, a.masked, '%'), cell(a.notOnTripPercent, a.masked, '%')])}
    >
      <ResponsiveContainer width="100%" height={H}>
        <BarChart data={rows} {...common}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={10} interval={0} tickFormatter={(n) => n.replace('MH12-DEMO-', '')} />
          <YAxis domain={[0, 100]} fontSize={11} unit="%" />
          <Tooltip />
          <Bar dataKey="onTripPercent" name="On a trip" fill="#0f766e" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
