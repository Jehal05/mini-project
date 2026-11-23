import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ChartCard from './ChartCard.jsx';
import { useChartColors } from './useChartColors.js';
import { SEVERITY_LABELS, ambulanceRows, cell, hospitalRows, reasonRows, timingRows } from '../lib/analyticsView.js';

// Severity colours (from the theme) plus fill patterns, so the series differ without colour.
const PATTERN = { critical: 'solid', high: 'stripes', moderate: 'dots', low: 'cross' };
const SEV_KEYS = Object.keys(PATTERN);
const fillFor = (key, c) => (PATTERN[key] === 'solid' ? c[key] : `url(#pat-${key})`);

function Patterns({ c }) {
  return (
    <defs>
      {SEV_KEYS.map((key) => {
        const pattern = PATTERN[key]; const color = c[key];
        if (pattern === 'solid') return null;
        return (
          <pattern key={key} id={`pat-${key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={pattern === 'stripes' ? 'rotate(45)' : undefined}>
            <rect width="6" height="6" fill={c.surface} />
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
// Shared axis, grid, tooltip and legend styling from the theme colours.
const look = (c) => ({
  grid: { stroke: c.line, strokeDasharray: '3 3' },
  axis: { tick: { fill: c.muted, fontSize: 11 }, stroke: c.line },
  tip: { contentStyle: { background: c.surface, border: `1px solid ${c.line}`, borderRadius: 6, color: c.ink }, labelStyle: { color: c.ink }, itemStyle: { color: c.ink }, cursor: { fill: c.line, opacity: 0.4 } },
  legend: { formatter: (v) => <span style={{ color: c.ink }}>{v}</span> },
});
const common = { margin: { top: 8, right: 8, left: 0, bottom: 4 } };

export function CasesPerDay({ summary, loading, error }) {
  const c = useChartColors();
  const L = look(c);
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
          <Patterns c={c} />
          <CartesianGrid {...L.grid} />
          <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} {...L.axis} />
          <YAxis allowDecimals={false} {...L.axis} />
          <Tooltip {...L.tip} />
          <Legend {...L.legend} />
          {SEV_KEYS.map((k) => (
            <Bar key={k} dataKey={k} name={SEVERITY_LABELS[k]} stackId="s" fill={fillFor(k, c)} stroke={c[k]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ResponseTimes({ summary, loading, error }) {
  const c = useChartColors();
  const L = look(c);
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
          <CartesianGrid {...L.grid} />
          <XAxis dataKey="name" {...L.axis} tick={{ fill: L.axis.tick.fill, fontSize: 10 }} interval={0} />
          <YAxis {...L.axis} />
          <Tooltip {...L.tip} />
          <Legend {...L.legend} />
          <Bar dataKey="median" name="Median" fill={c.info} />
          <Bar dataKey="p90" name="90th percentile" fill={c.surface} stroke={c.info} strokeWidth={2} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function RejectionReasons({ summary, loading, error }) {
  const c = useChartColors();
  const L = look(c);
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
          <CartesianGrid {...L.grid} />
          <XAxis type="number" allowDecimals={false} {...L.axis} />
          <YAxis type="category" dataKey="name" {...L.axis} width={110} />
          <Tooltip {...L.tip} />
          <Bar dataKey="count" name="Count" fill={c.accent} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function HospitalComparison({ summary, loading, error }) {
  const c = useChartColors();
  const L = look(c);
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
          <CartesianGrid {...L.grid} />
          <XAxis dataKey="name" {...L.axis} interval={0} angle={-35} textAnchor="end" height={80} tickFormatter={(n) => n.replace('Demo ', '').slice(0, 22)} />
          <YAxis domain={[0, 100]} {...L.axis} unit="%" />
          <Tooltip {...L.tip} />
          <Bar dataKey="acceptanceRate" name="Acceptance rate" fill={c.low} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function Utilisation({ summary, loading, error }) {
  const c = useChartColors();
  const L = look(c);
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
          <CartesianGrid {...L.grid} />
          <XAxis dataKey="name" {...L.axis} interval={0} tickFormatter={(n) => n.split(' (')[0].slice(-4)} />
          <YAxis domain={[0, 100]} {...L.axis} unit="%" />
          <Tooltip {...L.tip} />
          <Bar dataKey="onTripPercent" name="On a trip" fill={c.accent} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
