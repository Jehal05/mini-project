import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../api/http.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import { useActivityMonitor } from '../auth/useActivityMonitor.js';
import IdleWarning from '../components/IdleWarning.jsx';

const MIN = 60 * 1000;
const IDLE = 30 * MIN;
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setAccessToken('tok');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setAccessToken(null); });

const setup = (props = {}) => {
  const onIdle = vi.fn();
  const view = renderHook(() => useActivityMonitor({ enabled: true, idleMs: IDLE, onIdle, ...props }));
  return { onIdle, ...view };
};

describe('feature 100: 30-minute idle sign-out (browser side)', () => {
  it('does nothing while the user is recently active, warns in the last 2 minutes, then signs out at 30', async () => {
    const { result, onIdle } = setup();
    await advance(27 * MIN);
    expect(result.current.warning).toBe(false);
    expect(onIdle).not.toHaveBeenCalled();

    await advance(2 * MIN);
    expect(result.current.warning).toBe(true);
    expect(result.current.secondsLeft).toBeLessThanOrEqual(120);
    expect(result.current.secondsLeft).toBeGreaterThan(0);
    expect(onIdle).not.toHaveBeenCalled();

    await advance(1.5 * MIN);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('any real activity starts the clock again', async () => {
    const { result, onIdle } = setup();
    await advance(29 * MIN);
    expect(result.current.warning).toBe(true);
    act(() => { window.dispatchEvent(new Event('keydown')); });
    await advance(10 * 1000);
    expect(result.current.warning).toBe(false);
    await advance(20 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('"Stay signed in" counts as activity', async () => {
    const { result, onIdle } = setup();
    await advance(29 * MIN);
    act(() => result.current.stayActive());
    await advance(10 * 1000);
    expect(result.current.warning).toBe(false);
    await advance(25 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('activity in another tab keeps this tab signed in', async () => {
    const { onIdle } = setup();
    await advance(25 * MIN);
    localStorage.setItem('ht:lastActivity', String(Date.now())); // what the other tab writes
    await advance(20 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
    await advance(15 * MIN);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('is inert when the user is signed out', async () => {
    const { result, onIdle } = setup({ enabled: false });
    await advance(60 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
    expect(result.current.warning).toBe(false);
  });

  it('stops listening when it unmounts', async () => {
    const { onIdle, unmount } = setup();
    unmount();
    await advance(60 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('pings the server about every 5 minutes while the user is active, so the server idle clock agrees', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{"user":{}}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    await advance(6 * MIN); // no activity since sign-in marker was set at mount... mount counts as activity
    const afterFirst = fetchMock.mock.calls.length;
    expect(afterFirst).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/me$/);

    await advance(10 * MIN); // idle: no new activity, so no new pings
    expect(fetchMock.mock.calls.length).toBe(afterFirst);

    act(() => { window.dispatchEvent(new Event('pointerdown')); });
    await advance(5.2 * MIN);
    expect(fetchMock.mock.calls.length).toBe(afterFirst + 1);
  });
});

describe('IdleWarning banner', () => {
  const renderBanner = (value) => render(<AuthContext.Provider value={value}><IdleWarning /></AuthContext.Provider>);

  it('shows nothing normally', () => {
    renderBanner({ idleWarning: false });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the countdown and a working "Stay signed in" button', async () => {
    vi.useRealTimers();
    const stayActive = vi.fn();
    renderBanner({ idleWarning: true, secondsLeft: 95, stayActive });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1:35');
    await userEvent.setup().click(screen.getByRole('button', { name: /stay signed in/i }));
    expect(stayActive).toHaveBeenCalledTimes(1);
  });

  it('pads the seconds', () => {
    vi.useRealTimers();
    renderBanner({ idleWarning: true, secondsLeft: 61, stayActive: () => {} });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1:01');
  });
});
