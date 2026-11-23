import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/http.js';

const EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
const KEY = 'ht:lastActivity'; // shared across tabs so one busy tab keeps every tab signed in
const WARN_MS = 2 * 60 * 1000;
const PING_EVERY_MS = 5 * 60 * 1000;

const readShared = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
const writeShared = (t) => { try { localStorage.setItem(KEY, String(t)); } catch { /* storage unavailable */ } };

/**
 * Feature 100: ends the session after `idleMs` without activity.
 * - warns 2 minutes before, with a "Stay signed in" action;
 * - sends a light ping (at most every 5 minutes, only if the user did something) so the server's own
 *   idle clock matches what the user actually did, including reading without clicking anything.
 */
export function useActivityMonitor({ enabled, idleMs, onIdle }) {
  const last = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const dirty = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const mark = useCallback(() => {
    const now = Date.now();
    last.current = now;
    dirty.current = true;
    writeShared(now);
  }, []);

  useEffect(() => {
    if (!enabled) { setSecondsLeft(null); return undefined; }
    mark();
    let fired = false; // sign out once, even though the timer keeps ticking while the logout request is in flight
    let throttle = 0;
    const onEvent = () => { const now = Date.now(); if (now - throttle > 1000) { throttle = now; mark(); } };
    EVENTS.forEach((e) => window.addEventListener(e, onEvent, { passive: true }));

    const tick = () => {
      const now = Date.now();
      const lastSeen = Math.max(last.current, readShared());
      const idleFor = now - lastSeen;
      if (fired) return;
      if (idleFor >= idleMs) { fired = true; onIdleRef.current(); return; }
      setSecondsLeft(idleMs - idleFor <= WARN_MS ? Math.ceil((idleMs - idleFor) / 1000) : null);
      if (dirty.current && now - lastPing.current >= PING_EVERY_MS) {
        dirty.current = false;
        lastPing.current = now;
        api('/auth/me').catch(() => {}); // a failed refresh inside api() ends the session through the auth handler
      }
    };
    const timer = setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onEvent));
      document.removeEventListener('visibilitychange', tick);
      clearInterval(timer);
    };
  }, [enabled, idleMs, mark]);

  return { warning: secondsLeft !== null, secondsLeft, stayActive: mark };
}
