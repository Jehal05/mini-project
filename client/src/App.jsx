import { useEffect, useState } from 'react';
import { useGeolocation } from './hooks/useGeolocation.js';
import { fetchRanked } from './lib/api.js';
import EmergencyBanner from './components/EmergencyBanner.jsx';
import LocationGate from './components/LocationGate.jsx';
import ManualLocationPicker from './components/ManualLocationPicker.jsx';
import HospitalFilters from './components/HospitalFilters.jsx';
import HospitalMap from './components/HospitalMap.jsx';
import RankingList from './components/RankingList.jsx';

const DEFAULT_FILTERS = { q: '', cathLab: false, cardiologist: false, minCcuBeds: '', radiusKm: 10, cardiacOnly: true };

export default function App() {
  const geo = useGeolocation();
  const [location, setLocation] = useState(null); // { lat, lng, source }
  const [manual, setManual] = useState(false);
  const [emergency, setEmergency] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [data, setData] = useState({ results: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  // Use the GPS fix automatically when it is accurate enough.
  useEffect(() => {
    if (geo.status === 'granted' && !geo.inaccurate && !location) {
      setLocation({ lat: geo.position.lat, lng: geo.position.lng, source: 'gps' });
    }
  }, [geo.status, geo.inaccurate, geo.position, location]);

  // Reload whenever the location or any filter changes (search text is debounced).
  useEffect(() => {
    if (!location) return undefined;
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const body = await fetchRanked({
          lat: location.lat,
          lng: location.lng,
          radiusKm: filters.radiusKm,
          q: filters.q.trim(),
          cathLab: filters.cathLab ? 'true' : undefined,
          cardiologist: filters.cardiologist ? 'true' : undefined,
          minCcuBeds: filters.minCcuBeds,
          cardiacOnly: String(filters.cardiacOnly),
          emergency: String(emergency),
          eta: 'true',
        });
        if (alive) setData(body);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [location, filters, emergency]);

  function changeEmergency(on) {
    setEmergency(on);
    if (on) setFilters((f) => ({ ...f, cardiacOnly: true })); // emergency mode turns the cardiac filter on
  }

  function chooseLocation(loc) {
    setLocation(loc);
    setManual(false);
  }

  let body;
  if (manual) {
    body = <ManualLocationPicker initial={location} onConfirm={chooseLocation} onBack={() => setManual(false)} />;
  } else if (!location) {
    body = <LocationGate geo={geo} onUseGps={(p) => chooseLocation({ lat: p.lat, lng: p.lng, source: 'gps' })} onManual={() => setManual(true)} />;
  } else {
    body = (
      <div className="grid gap-4 p-4 lg:grid-cols-[26rem_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Location: {location.source === 'gps' ? 'your device' : 'chosen on map'}</span>
            <button className="text-blue-700 underline" onClick={() => setManual(true)}>Change</button>
          </div>
          <HospitalFilters filters={filters} onChange={setFilters} emergency={emergency} onEmergencyChange={changeEmergency} />
          {loading && <p className="text-sm text-slate-500">Updating…</p>}
          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
          <RankingList results={data.results} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="h-[32rem] lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)]">
          <HospitalMap origin={location} results={data.results} selectedId={selectedId} onSelect={setSelectedId} radiusKm={Number(filters.radiusKm)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <EmergencyBanner emergency={emergency} />
      <header className="px-4 pt-3">
        <h1 className="text-2xl font-bold">HealthTwin AI: Nearby hospitals</h1>
      </header>
      {body}
    </div>
  );
}
