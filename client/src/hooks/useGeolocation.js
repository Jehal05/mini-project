// Feature 51: browser GPS. Asks only when request() is called, and turns every failure into a clear status.
import { useCallback, useState } from 'react';

const ERRORS = {
  1: ['denied', 'Location permission was denied. Set your location manually on the map.'],
  2: ['unavailable', 'Your location could not be found. Set it manually on the map.'],
  3: ['timeout', 'Finding your location took too long. Try again or set it manually.'],
};

export function useGeolocation() {
  const [state, setState] = useState({ coords: null, status: 'idle', error: null });

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ coords: null, status: 'unavailable', error: 'This browser does not support location.' });
      return;
    }
    // Browsers only allow GPS on https or localhost.
    if (!window.isSecureContext) {
      setState({
        coords: null,
        status: 'unavailable',
        error: 'Location needs https (or localhost). Set your location manually on the map.',
      });
      return;
    }

    setState((s) => ({ ...s, status: 'locating', error: null }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          },
          status: 'granted',
          error: null,
        });
      },
      (err) => {
        const [status, error] = ERRORS[err.code] || ['unavailable', err.message];
        setState({ coords: null, status, error });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  return { ...state, request };
}
