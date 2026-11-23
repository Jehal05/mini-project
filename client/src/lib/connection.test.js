import { describe, it, expect } from 'vitest';
import { connectionReducer, initialConnection, CONNECTION_LABEL, MAX_ERRORS_BEFORE_OFFLINE } from './connection.js';

const run = (events, start = initialConnection(false)) => events.reduce(connectionReducer, start);

describe('connection state', () => {
  it('starts reconnecting until the socket says it is connected', () => {
    expect(initialConnection(false).status).toBe('connecting');
    expect(initialConnection(true).status).toBe('live');
  });
  it('goes live on connect, and back to connecting on disconnect', () => {
    expect(run(['connect']).status).toBe('live');
    expect(run(['connect', 'disconnect']).status).toBe('connecting');
  });
  it('turns offline after repeated errors and recovers on connect', () => {
    const errs = Array(MAX_ERRORS_BEFORE_OFFLINE - 1).fill('connect_error');
    expect(run(errs).status).toBe('connecting');
    expect(run([...errs, 'connect_error']).status).toBe('offline');
    expect(run([...errs, 'connect_error', 'connect']).status).toBe('live');
  });
  it('a reconnect attempt does not hide being offline', () => {
    expect(run(['browser_offline', 'reconnect_attempt']).status).toBe('offline');
    expect(run(['browser_offline', 'browser_online']).status).toBe('connecting');
  });
  it('ignores unknown events and always has a text label', () => {
    expect(run(['whatever']).status).toBe('connecting');
    expect(Object.keys(CONNECTION_LABEL)).toEqual(['live', 'connecting', 'offline']);
  });
});
