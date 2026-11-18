// One shared Socket.IO connection for the whole app (a module singleton, so React StrictMode cannot open two).
import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}
