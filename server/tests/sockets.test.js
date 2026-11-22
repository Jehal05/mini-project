import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as connect } from 'socket.io-client';
import { initSocket, emitToHospital, emitToCase, roomName } from '../src/sockets/index.js';
import { EVENTS, ROOM_EVENTS } from '../src/sockets/events.js';

let httpServer;
let ioServer;
let port;
const clients = [];

function newClient() {
  const c = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return new Promise((resolve) => c.on('connect', () => resolve(c)));
}

const join = (client, type, id) =>
  new Promise((resolve) => client.emit(ROOM_EVENTS.JOIN, { type, id }, resolve));

beforeAll(async () => {
  httpServer = http.createServer();
  ioServer = initSocket(httpServer, { corsOrigin: '*' });
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  clients.forEach((c) => c.close());
  ioServer.close();
});

describe('socket rooms and emit helpers', () => {
  it('builds room names and rejects bad ones', () => {
    expect(roomName('hospital', 'abc')).toBe('hospital:abc');
    expect(() => roomName('banana', '1')).toThrow();
    expect(() => roomName('case', '')).toThrow();
  });

  it('delivers hospital events only to that hospital room', async () => {
    const a = await newClient();
    const b = await newClient();
    expect((await join(a, 'hospital', 'h1')).ok).toBe(true);
    expect((await join(b, 'hospital', 'h2')).ok).toBe(true);

    let bGot = false;
    b.on(EVENTS.HOSPITAL_ALERT, () => { bGot = true; });
    const received = new Promise((resolve) => a.on(EVENTS.HOSPITAL_ALERT, resolve));

    emitToHospital('h1', EVENTS.HOSPITAL_ALERT, { caseId: 'c1' });
    expect(await received).toEqual({ caseId: 'c1' });
    await new Promise((r) => setTimeout(r, 100));
    expect(bGot).toBe(false);
  });

  it('delivers case events to the case room', async () => {
    const c = await newClient();
    await join(c, 'case', 'c9');
    const received = new Promise((resolve) => c.on(EVENTS.AMBULANCE_STATUS, resolve));
    emitToCase('c9', EVENTS.AMBULANCE_STATUS, { status: 'en_route' });
    expect(await received).toEqual({ status: 'en_route' });
  });

  it('rejects invalid joins and unknown event names', async () => {
    const c = await newClient();
    const res = await join(c, 'nope', '1');
    expect(res.ok).toBe(false);
    expect(() => emitToHospital('h1', 'made:up', {})).toThrow(/Unknown socket event/);
  });
});
