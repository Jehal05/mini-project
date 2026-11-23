// The Digital Twin on the patient's home. Needs the patient's own baseline from the server, so it shows only while the live
// server stream is on (the browser stand-in has no baseline to compare with). Loaded lazily.
import { useEffect, useState } from 'react';
import { fetchMonitoredPatient } from '../lib/monitorApi.js';
import { TwinCard } from './TwinCard.jsx';

export default function TwinSection({ patientId, vitals, detection }) {
  const [baseline, setBaseline] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchMonitoredPatient(patientId).then((p) => alive && setBaseline(p?.live?.baseline ?? null)).catch(() => alive && setBaseline(null));
    return () => { alive = false; };
  }, [patientId]);
  return <TwinCard patientId={patientId} live={{ vitals }} baseline={baseline} detection={detection} />;
}
