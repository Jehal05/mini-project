import { Input, Select, Checkbox } from '../ui/Form.jsx';
import { Panel } from '../ui/Surface.jsx';

// Features 56 and 57. Every control changes the query sent to the server.
export default function HospitalFilters({ filters, onChange, emergency, onEmergencyChange }) {
  const set = (patch) => onChange({ ...filters, ...patch });

  return (
    <Panel title="Narrow the list">
      <div className="space-y-3">
        <Input type="search" aria-label="Search hospital name or area" placeholder="Search hospital name or area" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
        <div className="grid grid-cols-2 gap-x-3">
          <Checkbox label="Cath lab" checked={filters.cathLab} onChange={(e) => set({ cathLab: e.target.checked })} />
          <Checkbox label="Cardiologist on duty" checked={filters.cardiologist} onChange={(e) => set({ cardiologist: e.target.checked })} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="space-y-1"><span className="block font-semibold">Free CCU beds, at least</span>
            <Input type="number" min="0" max="20" value={filters.minCcuBeds} onChange={(e) => set({ minCcuBeds: e.target.value })} />
          </label>
          <label className="space-y-1"><span className="block font-semibold">Search radius</span>
            <Select value={filters.radiusKm} onChange={(e) => set({ radiusKm: e.target.value })}>
              {[5, 10, 20, 30].map((r) => <option key={r} value={r}>{r} km</option>)}
            </Select>
          </label>
        </div>
        <div className="border-t border-line pt-2">
          <Checkbox label="Cardiac-care hospitals only" checked={filters.cardiacOnly} onChange={(e) => set({ cardiacOnly: e.target.checked })} />
          <Checkbox label="Emergency mode (also turns the cardiac filter on)" checked={emergency} onChange={(e) => onEmergencyChange(e.target.checked)} />
        </div>
      </div>
    </Panel>
  );
}
