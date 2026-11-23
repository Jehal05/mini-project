import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket, joinRoom } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';
import { fetchDoctorCases } from '../lib/doctorApi.js';
import { appendReading } from '../lib/vitalsTrend.js';
import { prioritizeCases, DEFAULT_CONFIG } from '../lib/priority.js';

// The doctor's own cases, kept current from Socket.IO. Joins the doctor room (to hear about a new assignment)
// and the room of every assigned case (to hear about vitals, checklist and timer changes).
// The server only sends the latest vitals, so a short history is built here for the trend line.
export function useDoctorCases(doctorId) {
  const [doctor, setDoctor] = useState(null);
  const [cases, setCases] = useState({});
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newAssignment, setNewAssignment] = useState(null);
  const ids = useRef([]);

  const note = useCallback((c) => {
    if (c.latestVitals) setHistory((h) => ({ ...h, [c.id]: appendReading(h[c.id] ?? [], c.latestVitals) }));
  }, []);
  const upsert = useCallback((c) => { setCases((prev) => ({ ...prev, [c.id]: { ...prev[c.id], ...c } })); note(c); }, [note]);

  const reload = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    try {
      const data = await fetchDoctorCases(doctorId);
      setDoctor(data.doctor);
      setCases(Object.fromEntries(data.results.map((c) => [c.id, c])));
      data.results.forEach(note);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [doctorId, note]);

  useEffect(() => { setCases({}); setHistory({}); setDoctor(null); setNewAssignment(null); reload(); }, [doctorId, reload]);

  // Doctor room: a new assignment arrives as a hospital:alert of type doctor_assignment.
  useEffect(() => {
    if (!doctorId) return undefined;
    const socket = getSocket();
    const leave = joinRoom('doctor', doctorId);
    const onAlert = (p) => { if (p?.type === 'doctor_assignment') { setNewAssignment(p.message ?? 'You have a new case.'); reload(); } };
    socket.on(EVENTS.HOSPITAL_ALERT, onAlert);
    socket.on('connect', reload);
    return () => { socket.off(EVENTS.HOSPITAL_ALERT, onAlert); socket.off('connect', reload); leave(); };
  }, [doctorId, reload]);

  // One room per assigned case.
  const caseIds = useMemo(() => Object.keys(cases).sort().join(','), [cases]);
  useEffect(() => {
    ids.current = caseIds ? caseIds.split(',') : [];
    if (!ids.current.length) return undefined;
    const socket = getSocket();
    const leaves = ids.current.map((id) => joinRoom('case', id));
    const onUpdate = (c) => { if (ids.current.includes(c.id)) upsert(c); };
    socket.on(EVENTS.CASE_UPDATE, onUpdate);
    return () => { socket.off(EVENTS.CASE_UPDATE, onUpdate); leaves.forEach((l) => l()); };
  }, [caseIds, upsert]);

  // Severity is a hard tier, then the weighted score (same rule as the server, see lib/priority.js).
  const open = Object.values(cases);
  const config = open.find((c) => c.priority?.config)?.priority.config || DEFAULT_CONFIG;
  const list = prioritizeCases(open, { config }).map((x) => ({ ...x.case, priority: x.priority }));
  return { doctor, cases: list, history, loading, error, upsert, reload, newAssignment, clearAssignment: () => setNewAssignment(null) };
}
