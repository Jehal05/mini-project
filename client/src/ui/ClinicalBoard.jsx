import HeartHero from './HeartHero.jsx';
import VitalTile from './VitalTile.jsx';
import CalloutLabel from './CalloutLabel.jsx';
import { Card } from './Surface.jsx';
import { classifyVital } from './vitals.js';
import { findings, simulatedAnalysis } from '../lib/clinicalView.js';
import { seriesOf } from '../lib/vitalsTrend.js';

/**
 * The clinician layout: vitals down the left, a hologram heart with callouts in the middle, and the people-facing facts on the right
 * (pass them as `right`). Below 1280px it stacks (heart, vitals, then the rest). Only real readings are shown; the hologram is a picture.
 */
export default function ClinicalBoard({ vitals, history = [], header, right, children }) {
  const hr = seriesOf(history, 'heartRate');
  const bp = vitals?.systolic != null && vitals?.diastolic != null ? `${vitals.systolic}/${vitals.diastolic}` : null;
  const list = findings(vitals);
  return (
    <div className="space-y-4">
      {header}
      <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_21rem]">
        <section aria-label="Vitals" className="order-2 grid grid-cols-2 content-start gap-3 xl:order-1 xl:grid-cols-1">
          <VitalTile label="Heart rate" value={vitals?.heartRate} unit="bpm" status={classifyVital('heartRate', vitals?.heartRate)} values={hr} />
          <VitalTile label="Blood pressure" value={bp} unit="mmHg" status={classifyVital('systolic', vitals?.systolic)} />
          <VitalTile label="SpO₂" value={vitals?.spo2} unit="%" status={classifyVital('spo2', vitals?.spo2)} />
          <VitalTile label="Breathing" value={vitals?.respiratoryRate} unit="/min" status={classifyVital('respiratoryRate', vitals?.respiratoryRate)} />
        </section>

        <Card className="order-1 p-4 xl:order-2">
          <div className="relative mx-auto aspect-square w-full max-w-md">
            <HeartHero bpm={vitals?.heartRate} variant="holo" simulated={false} className="h-full w-full" />
            {list.map((f) => (
              <CalloutLabel key={f.key} from={f.from} side={f.side} top={f.top} tone={f.tone} title={f.label}>{f.value} {f.unit}, {f.direction} range</CalloutLabel>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-muted">Illustration only. It is not a scan of this patient.</p>
        </Card>

        <div className="order-3 space-y-4">
          {right}
          <Card className="p-4">
            <h3 className="font-title text-base font-semibold">Simulated analysis</h3>
            <ul className="mt-2 space-y-1 text-sm">{simulatedAnalysis(vitals).map((l) => <li key={l}>{l}</li>)}</ul>
            <p className="mt-2 text-xs text-muted">Simulated for this demo. Not a diagnosis and not clinical advice.</p>
          </Card>
        </div>
      </div>
      {children}
    </div>
  );
}
