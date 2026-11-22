import { io } from 'socket.io-client';

let socket = null;
export function getSocket() {
  if (!socket) socket = io({ transports: ['websocket', 'polling'] });
  return socket;
}

// Joins a room (re-joins after a reconnect) and returns a function that leaves it.
export function joinRoom(type, id) {
  const s = getSocket();
  const join = () => s.emit('room:join', { type, id });
  join();
  s.on('connect', join);
  return () => {
    s.off('connect', join);
    s.emit('room:leave', { type, id });
  };
}
