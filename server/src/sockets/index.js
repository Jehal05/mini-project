import { Server } from 'socket.io';
import { ALL_EVENT_NAMES, ROOM_EVENTS, ROOM_TYPES } from './events.js';

let io = null;

export function roomName(type, id) {
  if (!ROOM_TYPES.includes(type)) throw new Error(`Invalid room type: ${type}`);
  if (id === undefined || id === null || String(id).trim() === '') {
    throw new Error('Room id is required');
  }
  return `${type}:${id}`;
}

export function initSocket(httpServer, { corsOrigin } = {}) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.on('connection', (socket) => {
    // Auth middleware (JWT) is added by the auth owner; until then rooms are open for development.
    socket.on(ROOM_EVENTS.JOIN, ({ type, id } = {}, ack) => {
      try {
        const room = roomName(type, id);
        socket.join(room);
        if (typeof ack === 'function') ack({ ok: true, room });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    });

    socket.on(ROOM_EVENTS.LEAVE, ({ type, id } = {}, ack) => {
      try {
        const room = roomName(type, id);
        socket.leave(room);
        if (typeof ack === 'function') ack({ ok: true, room });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.IO has not been initialised');
  return io;
}

function emitToRoom(type, id, event, payload) {
  if (!ALL_EVENT_NAMES.includes(event)) {
    throw new Error(`Unknown socket event: ${event}. Add it to sockets/events.js first.`);
  }
  getIO().to(roomName(type, id)).emit(event, payload);
}

// Other modules use these helpers and never touch raw socket code.
export const emitToHospital = (hospitalId, event, payload) => emitToRoom('hospital', hospitalId, event, payload);
export const emitToCase = (caseId, event, payload) => emitToRoom('case', caseId, event, payload);
export const emitToPatient = (patientId, event, payload) => emitToRoom('patient', patientId, event, payload);
export const emitToDoctor = (doctorId, event, payload) => emitToRoom('doctor', doctorId, event, payload);
