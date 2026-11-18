// Phases 2-3 page: patient location -> hospitals ranked for a cardiac emergency (default tab) or all nearby, on a shared map.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LocationMap from '../components/LocationMap.jsx';
import HospitalList from '../components/HospitalList.jsx';
import HospitalSearch from '../components/HospitalSearch.jsx';
import LocationStatus from '../components/LocationStatus.jsx';
import RankedHospitals from '../components/RankedHospitals.jsx';
import AlternativeHospitals from '../components/AlternativeHospitals.jsx';
import CapabilityEditor from '../components/CapabilityEditor.jsx';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useSocketEvent } from '../hooks/useSocketEvent.js';
import { getNearby, rankHospitals, errorMessage } from '../api/hospitals.js';
import { haversineKm, toLatLng } from '../utils/distance.js';

const DEMO_LOCATION = { lat: 18.5308, lng: 73.8475 }; // Rahul, Shivajinagar (fictional)
const RADIUS_OPTIONS = [5, 10, 20, 30];
const MAX_RADIUS = 30;

const TABS = [
  { id: 'ranked', label: 'Best for cardiac emergency' },
  { id: 'nearby', label: 'All nearby' },
];

export default function FindHospitals() {
  const geo = useGeolocation();

  // location = { lat, lng, accuracy?, source: 'gps' | 'manual' | 'demo', via }
  const [location, setLocation] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [radiusKm, setRadiusKm] = useState(10);
  const [cardiacOnly, setCardiacOnly] = useState(false);
  const [tab, setTab] = useState('ranked');
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // Phase 2: all nearby hospitals
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Phase 3: cardiac ranking
  const [ranking, setRanking] = useState(null);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState(null);
  const [rankReloadKey, setRankReloadKey] = useState(0);
  const [exclude, setExclude] = useState([]); // [{ id, name }] hospitals that "rejected"

  const [focus, setFocus] = useState(null); // { id, latlng, nonce }
  const [extraHospital, setExtraHospital] = useState(null); // a search result outside the lists
  const [fitNonce, setFitNonce] = useState(0);
  const pendingFit = useRef(false);

  // Feature 51: a GPS fix becomes the patient location; any GPS failure switches to manual mode (52).
  useEffect(() => {
    if (geo.status === 'granted' && geo.coords) {
      pendingFit.current = true;
      setManualMode(false);
      setExclude([]);
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
    setExclude([]);
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

  const changeTab = (id) => {
    setTab(id);
    setFitNonce((n) => n + 1); // fit the hospitals of the tab now showing
  };

  const debouncedLocation = useDebouncedValue(location, location?.via === 'drag' ? 400 : 0);

  // Feature 53: all nearby hospitals.
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
        if (pendingFit.current && tabRef.current === 'nearby') {
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

  // Features 57-60: ranking, re-run on location, radius, exclusions or capacity changes.
  const excludeKey = exclude.map((e) => e.id).join(',');

  useEffect(() => {
    if (!debouncedLocation) return undefined;
    const controller = new AbortController();
    setRankLoading(true);
    setRankError(null);

    rankHospitals({
      lat: debouncedLocation.lat,
      lng: debouncedLocation.lng,
      radiusKm,
      exclude: excludeKey ? excludeKey.split(',') : [],
      signal: controller.signal,
    })
      .then((data) => {
        setRanking(data);
        setRankLoading(false);
        if (pendingFit.current && tabRef.current === 'ranked') {
          pendingFit.current = false;
          setFitNonce((n) => n + 1);
        }
      })
      .catch((err) => {
        const msg = errorMessage(err);
        if (msg === null) return;
        setRankError(msg);
        setRankLoading(false);
      });

    return () => controller.abort();
  }, [debouncedLocation, radiusKm, excludeKey, rankReloadKey]);

  // Feature 58: any capacity change anywhere -> refresh ranking and nearby list.
  useSocketEvent('hospital:capabilities', () => {
    setRankReloadKey((k) => k + 1);
    setReloadKey((k) => k + 1);
  });

  // Feature 54: instant distances for the "All nearby" list while the API call is in flight.
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

  // Everything the ranking returned, for the map and the demo controls.
  const rankedAll = useMemo(() => {
    if (!ranking) return [];
    return [
      ...ranking.top.map((i) => i.hospital),
      ...ranking.alternatives.map((i) => i.hospital),
      ...ranking.notSuitable.map((n) => n.hospital),
    ];
  }, [ranking]);

  const rankById = useMemo(
    () => Object.fromEntries((ranking?.top || []).map((i) => [i.hospital._id, i.rank])),
    [ranking]
  );
  const fadedIds = useMemo(
    () => new Set((ranking?.notSuitable || []).map((n) => n.hospital._id)),
    [ranking]
  );

  const mapHospitals = useMemo(() => {
    const base = tab === 'ranked' ? rankedAll : nearby;
    if (extraHospital && !base.some((h) => h._id === extraHospital._id)) {
      return [...base, withDistance(extraHospital)];
    }
    return base;
  }, [tab, rankedAll, nearby, extraHospital, withDistance]);

  const editorHospitals = useMemo(() => {
    const byId = new Map();
    [...rankedAll, ...nearby].forEach((h) => byId.set(h._id, h));
    return [...byId.values()];
  }, [rankedAll, nearby]);

  const selectHospital = useCallback(
    (h) => {
      setFocus({ id: h._id, latlng: toLatLng(h), nonce: Date.now() });
      const shown = tab === 'ranked' ? rankedAll : nearby;
      if (!shown.some((x) => x._id === h._id)) setExtraHospital(h);
    },
    [tab, rankedAll, nearby]
  );

  // Feature 60 demo: a hospital "rejects" -> leave it out and re-rank.
  const simulateRejection = (h) => {
    setExclude((prev) => (prev.some((e) => e.id === h._id) ? prev : [...prev, { id: h._id, name: h.name }]));
  };
  const undoRejection = (id) => setExclude((prev) => prev.filter((e) => e.id !== id));

  const noneSuitable =
    ranking && !rankLoading && !rankError && ranking.suitableCount === 0 && radiusKm >= MAX_RADIUS;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 font-bold text-primary">
            HT
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">HealthTwin AI</h1>
            <p className="text-xs text-text-muted">Find the right hospital</p>
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
            rankById={tab === 'ranked' ? rankById : {}}
            fadedIds={tab === 'ranked' ? fadedIds : null}
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
            {tab === 'nearby' && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cardiacOnly}
                  onChange={(e) => changeCardiacOnly(e.target.checked)}
                  className="h-4 w-4 accent-[#00C2FF]"
                />
                Cardiac care only
              </label>
            )}
          </section>

          <div role="tablist" aria-label="Hospital views" className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => changeTab(t.id)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  tab === t.id ? 'bg-primary text-ink-950' : 'text-text-muted hover:bg-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'ranked' ? (
            <div role="tabpanel" id="panel-ranked" aria-labelledby="tab-ranked" className="flex flex-col gap-4">
              <p className="text-xs text-text-muted">Ranking uses simulated capacity data — demo only.</p>

              {!location && (
                <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-text-muted">
                  Set your location to rank hospitals for a cardiac emergency.
                </p>
              )}

              {rankError && (
                <div role="alert" className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm">
                  <p className="font-semibold">Could not rank hospitals</p>
                  <p className="mt-1 text-text-muted">{rankError}</p>
                  <button type="button" className="btn-primary mt-3" onClick={() => setRankReloadKey((k) => k + 1)}>
                    Retry
                  </button>
                </div>
              )}

              {location && !rankError && (
                <>
                  <RankedHospitals
                    top={ranking?.top}
                    loading={rankLoading}
                    selectedId={focus?.id}
                    onSelect={selectHospital}
                    onReject={simulateRejection}
                  />

                  {noneSuitable && (
                    <p
                      role="alert"
                      className="rounded-xl border border-critical/50 bg-critical/10 p-4 text-sm font-semibold text-critical"
                    >
                      No suitable hospital within {MAX_RADIUS} km — call 112.
                    </p>
                  )}

                  {ranking && (
                    <AlternativeHospitals
                      alternatives={ranking.alternatives}
                      notSuitable={ranking.notSuitable}
                      excluded={exclude.map((e) => ({ _id: e.id, name: e.name }))}
                      suitableCount={ranking.suitableCount}
                      radiusKm={ranking.radiusKm}
                      suggestedRadiusKm={ranking.suggestedRadiusKm}
                      onWiden={changeRadius}
                      onUndo={undoRejection}
                      onSelect={selectHospital}
                    />
                  )}
                </>
              )}

              <CapabilityEditor hospitals={editorHospitals} onSaved={() => setRankReloadKey((k) => k + 1)} />
            </div>
          ) : (
            <div role="tabpanel" id="panel-nearby" aria-labelledby="tab-nearby" className="flex flex-col gap-4">
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
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
