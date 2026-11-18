// Subscribes to a Socket.IO event for the component's lifetime; always calls the latest handler.
import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket.js';

export function useSocketEvent(event, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();
    const listener = (...args) => handlerRef.current(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [event]);
}
