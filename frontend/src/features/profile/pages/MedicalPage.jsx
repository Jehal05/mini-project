import CrudSection from '../CrudSection.jsx';
import { CARDIAC_LABELS } from '../constants.js';
import ReportsSection from '../ReportsSection.jsx';

const SEVERITY = [['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']];
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

export default function MedicalPage() {
  return (
    <div className="stack">
      <CrudSection section="cardiacConditions" title="Cardiac history"
        fields={[
          { name: 'type', label: 'Condition', type: 'select', options: Object.entries(CARDIAC_LABELS) },
          { name: 'year', label: 'Year', type: 'number' },
          { name: 'notes', label: 'Notes' },
        ]}
        describe={(c) => `${CARDIAC_LABELS[c.type] ?? c.type}${c.year ? ` (${c.year})` : ''}`} />
      <CrudSection section="medicalConditions" title="Existing conditions"
        fields={[{ name: 'name', label: 'Condition' }, { name: 'notes', label: 'Notes' }]}
        describe={(c) => c.name} />
      <CrudSection section="allergies" title="Allergies" noneLabel="no known allergies"
        fields={[{ name: 'allergen', label: 'Allergen' }, { name: 'reaction', label: 'Reaction' }, { name: 'severity', label: 'Severity', type: 'select', options: SEVERITY }]}
        describe={(a) => `${a.allergen}${a.reaction ? ` — ${a.reaction}` : ''} (${a.severity})`}
        badge={(a) => a.severity === 'severe' && <span className="pill pill-red">Severe</span>} />
      <CrudSection section="medications" title="Medications" noneLabel="no regular medicines"
        note="Common blood thinners are flagged automatically. You can also flag one yourself."
        fields={[{ name: 'drug', label: 'Drug' }, { name: 'dose', label: 'Dose' }, { name: 'frequency', label: 'Frequency' }, { name: 'isBloodThinner', label: 'This is a blood thinner', type: 'checkbox' }]}
        describe={(m) => `${m.drug}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? `, ${m.frequency}` : ''}`}
        badge={(m) => m.isBloodThinner && <span className="pill pill-amber">Blood thinner</span>} />
      <CrudSection section="hospitalizations" title="Previous hospitalizations"
        fields={[{ name: 'hospital', label: 'Hospital' }, { name: 'admittedOn', label: 'Admitted on', type: 'date' }, { name: 'dischargedOn', label: 'Discharged on', type: 'date' }, { name: 'reason', label: 'Reason' }]}
        describe={(h) => `${h.hospital}${h.admittedOn ? `, ${day(h.admittedOn)}` : ''}${h.dischargedOn ? ` to ${day(h.dischargedOn)}` : ''}${h.reason ? ` — ${h.reason}` : ''}`} />
      <CrudSection section="familyHistory" title="Family history"
        fields={[{ name: 'relative', label: 'Relative' }, { name: 'condition', label: 'Condition' }, { name: 'ageAtDiagnosis', label: 'Age at diagnosis', type: 'number' }]}
        describe={(f) => `${f.relative}: ${f.condition}${f.ageAtDiagnosis !== undefined ? ` (age ${f.ageAtDiagnosis})` : ''}`} />
      <ReportsSection />
    </div>
  );
}
