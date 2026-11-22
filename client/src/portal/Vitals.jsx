export default function Vitals({ vitals }) {
  if (!vitals) return <p className="text-sm text-slate-500">No vitals recorded yet.</p>;
  const cell = (label, value, unit) => (
    <div className="rounded bg-slate-100 p-2 text-center">
      <div className="text-lg font-bold">{value ?? '–'}<span className="text-xs font-normal"> {value != null ? unit : ''}</span></div>
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-4 gap-2">
      {cell('Heart rate', vitals.heartRate, 'bpm')}
      {cell('Blood pressure', vitals.systolic != null ? `${vitals.systolic}/${vitals.diastolic}` : null, 'mmHg')}
      {cell('SpO₂', vitals.spo2, '%')}
      {cell('Resp. rate', vitals.respiratoryRate, '/min')}
    </div>
  );
}
