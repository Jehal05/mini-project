import { SeverityBadge as Badge } from '../ui/Surface.jsx';

// Shape + word + colour (never colour alone). Optional risk score after it.
export default function SeverityBadge({ severity, riskScore, solid = false }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Badge severity={severity} solid={solid} />
      {riskScore != null && <span className="tnum text-xs text-muted">risk {riskScore}</span>}
    </span>
  );
}
