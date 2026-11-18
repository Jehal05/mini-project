// Socket.IO setup: clients join rooms by role (hospital:<id>, patient:<id>, admin) and can ping the server.
import { Server } from 'socket.io';
import { allowedOrigins } from '../config/cors.js';

let io = null;

const ROLES = ['patient', 'doctor', 'hospital_staff', 'hospital_admin', 'crew', 'admin'];
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigins(), methods: ['GET', 'POST'], credentials: true },
  });

  io.on('connection', (socket) => {
    console.log(`[socket] connected ${socket.id}`);

    // Client sends { role, hospitalId?, patientId? }. Phase 2 (auth) will take these
    // from the verified JWT instead of trusting the client.
    socket.on('join', (payload = {}, ack) => {
      const { role, hospitalId, patientId } = payload;
      const rooms = [];

      if (!ROLES.includes(role)) {
        const result = { ok: false, error: `role must be one of: ${ROLES.join(', ')}` };
        if (typeof ack === 'function') ack(result);
        else socket.emit('join:error', result);
        return;
      }

      if (role === 'admin') rooms.push('admin');
      if (hospitalId !== undefined) {
        if (!ID_PATTERN.test(String(hospitalId))) {
          const result = { ok: false, error: 'invalid hospitalId' };
          if (typeof ack === 'function') ack(result);
          else socket.emit('join:error', result);
          return;
        }
        rooms.push(`hospital:${hospitalId}`);
      }
      if (patientId !== undefined) {
        if (!ID_PATTERN.test(String(patientId))) {
          const result = { ok: false, error: 'invalid patientId' };
          if (typeof ack === 'function') ack(result);
          else socket.emit('join:error', result);
          return;
        }
        rooms.push(`patient:${patientId}`);
      }

      rooms.forEach((room) => socket.join(room));
      socket.data.role = role;
      console.log(`[socket] ${socket.id} (${role}) joined ${rooms.join(', ') || 'no rooms'}`);

      const result = { ok: true, rooms };
      if (typeof ack === 'function') ack(result);
      else socket.emit('joined', result);
    });

    // Connectivity test used by the "Done when" checklist.
    socket.on('ping:test', (payload) => {
      socket.emit('pong:test', {
        message: 'pong',
        echo: payload ?? null,
        serverTime: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected ${socket.id} (${reason})`);
    });
  });

  return io;
}

// Later phases import this to emit events, e.g. getIO().to(`hospital:${id}`).emit('hospital:alert', data)
export function getIO() {
  if (!io) throw new Error('Socket.IO has not been initialised yet');
  return io;
}
