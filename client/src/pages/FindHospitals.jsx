// Phase 2 page: patient location (GPS, manual or demo) -> nearby hospitals on the map and in a ranked list, plus search.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LocationMap from '../components/LocationMap.jsx';
import HospitalList from '../components/HospitalList.jsx';
import HospitalSearch from '../components/HospitalSearch.jsx';
import LocationStatus from '../components/LocationStatus.jsx';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { getNearby, errorMessage } from '../api/hospitals.js';
import { haversineKm, toLatLng } from '../utils/distance.js';

const DEMO_LOCATION = { lat: 18.5308, lng: 73.8475 }; // Rahul, Shivajinagar (fictional)
const RADIUS_OPTIONS = [5, 10, 20, 30];

export default function FindHospitals() {
  const geo = useGeolocation();

  // location = { lat, lng, accuracy?, source: 'gps' | 'manual' | 'demo', via }
  const [location, setLocation] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [radiusKm, setRadiusKm] = useState(10);
  const [cardiacOnly, setCardiacOnly] = useState(false);

  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [focus, setFocus] = useState(null); // { id, latlng, nonce }
  const [extraHospital, setExtraHospital] = useState(null); // a search result outside the radius
  const [fitNonce, setFitNonce] = useState(0);
  const pendingFit = useRef(false);

  // Feature 51: a GPS fix becomes the patient location; any GPS failure switches to manual mode (52).
  useEffect(() => {
    if (geo.status === 'granted' && geo.coords) {
      pendingFit.current = true;
      setManualMode(false);
      setLocation({ ...geo.coords, source: 'gps', via: 'gps' });
    } else if (['denied', 'unavailable', 'timeout'].includes(geo.status)) {
      setManualMode(true);
    }
  }, [geo.status, geo.coords]);

  // Feature 52: map click or pin drag.
  const handlePick = useCallback((latlng, via) => {
    setLocation({ lat: latlng.lat, lng: latlng.lng, source: 'manual', via });
  }, []);

  const applyDemoLocation = () => {
    pendingFit.current = true;
    setManualMode(true); // keeps the pin draggable
    setLocation({ ...DEMO_LOCATION, source: 'demo', via: 'demo' });
  };

  const changeRadius = (value) => {
    pendingFit.current = true;
    setRadiusKm(value);
  };

  const changeCardiacOnly = (value) => {
    pendingFit.current = true;
    setCardiacOnly(value);
  };

  // Feature 53: ask the API whenever the location settles (drags wait 400 ms).
  const debouncedLocation = useDebouncedValue(location, location?.via === 'drag' ? 400 : 0);

  useEffect(() => {
    if (!debouncedLocation) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getNearby({
      lat: debouncedLocation.lat,
      lng: debouncedLocation.lng,
      radiusKm,
      cardiacOnly,
      signal: controller.signal,
    })
      .then((list) => {
        setHospitals(list);
        setLoading(false);
        if (pendingFit.current) {
          pendingFit.current = false;
          setFitNonce((n) => n + 1);
        }
      })
      .catch((err) => {
        const msg = errorMessage(err);
        if (msg === null) return; // superseded by a newer request
        setError(msg);
        setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedLocation, radiusKm, cardiacOnly, reloadKey]);

  // Feature 54: distances recomputed instantly from the live pin while the API call is in flight.
  const withDistance = useCallback(
    (h) => {
      if (!location) return h;
      const [lat, lng] = toLatLng(h);
      return { ...h, distanceKm: haversineKm(location.lat, location.lng, lat, lng) };
    },
    [location]
  );

  const nearby = useMemo(() => {
    if (!location) return [];
    return hospitals
      .map(withDistance)
      .filter((h) => h.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [hospitals, location, radiusKm, withDistance]);

  const mapHospitals = useMemo(() => {
    if (extraHospital && !nearby.some((h) => h._id === extraHospital._id)) {
      return [...nearby, withDistance(extraHospital)];
    }
    return nearby;
  }, [nearby, extraHospital, withDistance]);

  const selectHospital = useCallback(
    (h) => {
      setFocus({ id: h._id, latlng: toLatLng(h), nonce: Date.now() });
      if (!nearby.some((x) => x._id === h._id)) setExtraHospital(h);
    },
    [nearby]
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 font-bold text-primary">
            HT
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">HealthTwin AI</h1>
            <p className="text-xs text-text-muted">Find nearby hospitals</p>
          </div>
        </div>
        <span className="badge border border-warn/40 bg-warn/10 px-3 py-1 text-warn">
          Simulated demo data — fictional hospitals
        </span>
      </header>

      <main className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <LocationMap
            patient={location}
            hospitals={mapHospitals}
            radiusKm={radiusKm}
            manualMode={manualMode}
            onPick={handlePick}
            focus={focus}
            onSelectHospital={selectHospital}
            fitNonce={fitNonce}
          />
        </div>

        <aside className="flex flex-col gap-4 lg:col-span-2 lg:max-h-[calc(100vh-170px)] lg:overflow-y-auto lg:pr-1">
          <LocationStatus
            geo={geo}
            location={location}
            manualMode={manualMode}
            onUseGps={geo.request}
            onManual={() => setManualMode(true)}
            onDemo={applyDemoLocation}
          />

          <section className="glass flex flex-wrap items-center justify-between gap-3 p-4">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">Radius</span>
              <select
                value={radiusKm}
                onChange={(e) => changeRadius(Number(e.target.value))}
                className="rounded-lg border border-white/15 bg-ink-950/60 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              >
                {RADIUS_OPTIONS.map((km) => (
                  <option key={km} value={km}>
                    {km} km
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cardiacOnly}
                onChange={(e) => changeCardiacOnly(e.target.checked)}
                className="h-4 w-4 accent-[#00C2FF]"
              />
              Cardiac care only
            </label>
          </section>

          <HospitalSearch origin={debouncedLocation} onSelect={selectHospital} />

          <HospitalList
            hospitals={nearby}
            loading={loading}
            error={error}
            onRetry={() => setReloadKey((k) => k + 1)}
            selectedId={focus?.id}
            onSelect={selectHospital}
            radiusKm={radiusKm}
            hasLocation={Boolean(location)}
          />
        </aside>
      </main>
    </div>
  );
}
