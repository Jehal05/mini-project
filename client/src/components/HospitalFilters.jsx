// Features 56 and 57. Every control changes the query sent to the server.
export default function HospitalFilters({ filters, onChange, emergency, onEmergencyChange }) {
  const set = (patch) => onChange({ ...filters, ...patch });

  return (
    <div className="space-y-3 rounded-lg bg-white p-3 shadow">
      <input
        className="w-full rounded border px-3 py-2"
        placeholder="Search hospital name or area"
        value={filters.q}
        onChange={(e) => set({ q: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filters.cathLab} onChange={(e) => set({ cathLab: e.target.checked })} />
          Cath lab
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filters.cardiologist} onChange={(e) => set({ cardiologist: e.target.checked })} />
          Cardiologist on duty
        </label>
        <label className="flex items-center gap-2">
          Min free CCU beds
          <input
            type="number" min="0" max="20" className="w-14 rounded border px-1"
            value={filters.minCcuBeds}
            onChange={(e) => set({ minCcuBeds: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2">
          Radius
          <select className="rounded border px-1" value={filters.radiusKm} onChange={(e) => set({ radiusKm: e.target.value })}>
            {[5, 10, 20, 30].map((r) => <option key={r} value={r}>{r} km</option>)}
          </select>
        </label>
      </div>

      <div className="space-y-1 border-t pt-2 text-sm">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={filters.cardiacOnly} onChange={(e) => set({ cardiacOnly: e.target.checked })} />
          Cardiac-care hospitals only
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={emergency} onChange={(e) => onEmergencyChange(e.target.checked)} />
          Emergency mode (turns cardiac-care filter on)
        </label>
      </div>
    </div>
  );
}
