// Connection state for the top-bar heartbeat. Pure reducer so it can be tested without a browser or socket.
// status: 'live' (connected), 'connecting' (trying again), 'offline' (no network or repeated failures).
export const CONNECTION_LABEL = { live: 'Live', connecting: 'Reconnecting', offline: 'Offline' };
export const CONNECTION_HELP = {
  live: 'Updates arrive instantly.',
  connecting: 'Trying to reconnect. Updates may be late.',
  offline: 'No connection. What you see may be out of date.',
};
export const MAX_ERRORS_BEFORE_OFFLINE = 3;

export const initialConnection = (connected = false) => ({ status: connected ? 'live' : 'connecting', errors: 0 });

export function connectionReducer(state, event) {
  switch (event) {
    case 'connect': return { status: 'live', errors: 0 };
    case 'disconnect': return { status: 'connecting', errors: 0 };
    case 'reconnect_attempt': return state.status === 'offline' ? state : { ...state, status: 'connecting' };
    case 'connect_error': {
      const errors = state.errors + 1;
      return { status: errors >= MAX_ERRORS_BEFORE_OFFLINE ? 'offline' : 'connecting', errors };
    }
    case 'browser_offline': return { status: 'offline', errors: state.errors };
    case 'browser_online': return { status: 'connecting', errors: 0 };
    default: return state;
  }
}
