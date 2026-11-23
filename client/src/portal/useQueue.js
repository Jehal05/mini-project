import { useCallback, useEffect, useState } from 'react';
import { getSocket, joinRoom } from '../lib/socket.js';
import { EVENTS } from '../lib/events.js';
import { portalFetch } from '../lib/portalApi.js';
import { prioritizeCases, sortNewest, DEFAULT_CONFIG } from '../lib/priority.js';

// Feature 62: the live queue. Loads once, then stays current from Socket.IO events (no reload needed).
// Feature 95: the order comes from lib/priority.js (a mirror of the server). the 30 s timer forces a re-render, which re-sorts, so wait time keeps counting.
export function useQueue(hospitalId, { sort = 'priority', origin = null } = {}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const [cases, setCases] = useState({});
  const [notices, setNotices] = useState([]);
  const [error, setError] = useState('');

  const upsert = useCallback((c) => setCases((prev) => ({ ...prev, [c.id]: { ...prev[c.id], ...c } })), []);
  const remove = useCallback((id) => setCases((prev) => { const { [id]: _gone, ...rest } = prev; return rest; }), []);
  const addNotice = (text) => setNotices((n) => [...n.slice(-4), { id: Date.now() + Math.random(), text }]);

  const reload = useCallback(async () => {
    try {
      const data = await portalFetch(hospitalId, `/hospitals/${hospitalId}/cases`);
      setCases(Object.fromEntries(data.results.map((c) => [c.id, c])));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [hospitalId]);

  useEffect(() => {
    if (!hospitalId) return undefined;
    reload();
    const socket = getSocket();
    const leave = joinRoom('hospital', hospitalId);

    const onAlert = (c) => upsert(c);
    const onUpdate = (c) => upsert(c);
    const onAccepted = (p) => {
      if (p.acceptedByAnotherHospital) {
        remove(p.caseId);
        addNotice('Accepted by another hospital. Case removed from your queue.');
      } else {
        upsert({ id: p.caseId, status: 'accepted', acceptedBy: hospitalId, respondBy: null });
      }
    };
    const onRejected = (p) => {
      if (p.hospitalId === hospitalId) remove(p.caseId);
    };

    socket.on(EVENTS.HOSPITAL_ALERT, onAlert);
    socket.on(EVENTS.CASE_UPDATE, onUpdate);
    socket.on(EVENTS.EMERGENCY_ACCEPTED, onAccepted);
    socket.on(EVENTS.EMERGENCY_REJECTED, onRejected);
    socket.on('connect', reload); // catch up after a dropped connection

    return () => {
      socket.off(EVENTS.HOSPITAL_ALERT, onAlert);
      socket.off(EVENTS.CASE_UPDATE, onUpdate);
      socket.off(EVENTS.EMERGENCY_ACCEPTED, onAccepted);
      socket.off(EVENTS.EMERGENCY_REJECTED, onRejected);
      socket.off('connect', reload);
      leave();
    };
  }, [hospitalId, reload, upsert, remove]);

  const open = Object.values(cases).filter((c) => c.severity);
  const config = open.find((c) => c.priority?.config)?.priority.config || DEFAULT_CONFIG;
  const ordered =
    sort === 'newest'
      ? sortNewest(open).map((c) => ({ ...c, priority: prioritizeCases([c], { origin, config })[0].priority }))
      : prioritizeCases(open, { origin, config }).map((x) => ({ ...x.case, priority: x.priority }));

  return {
    cases: ordered,
    notices,
    dismissNotice: (id) => setNotices((n) => n.filter((x) => x.id !== id)),
    error,
    upsert,
    remove,
    reload,
  };
}
