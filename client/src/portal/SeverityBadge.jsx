const STYLES = {
  critical: 'bg-red-700 text-white',
  high: 'bg-orange-500 text-white',
  moderate: 'bg-amber-300 text-slate-900',
  low: 'bg-green-200 text-slate-900',
};

export default function SeverityBadge({ severity, riskScore }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold uppercase ${STYLES[severity] || 'bg-slate-200'}`}>
      {severity}
      {riskScore != null && <span className="font-normal normal-case opacity-90">· risk {riskScore}</span>}
    </span>
  );
}
