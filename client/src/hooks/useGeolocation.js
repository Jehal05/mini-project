import { useCallback, useState } from 'react';
import { mapGeoError, isInaccurate } from '../lib/geo.js';

// Feature 51. Status: idle | requesting | granted | denied | timeout | unavailable | unsupported
// Nothing is requested until request() is called, so the screen can explain why first.
export function useGeolocation() {
  const [state, setState] = useState({ status: 'idle', position: null, inaccurate: false });

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'unsupported', position: null, inaccurate: false });
      return;
    }
    setState((s) => ({ ...s, status: 'requesting' }));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          status: 'granted',
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
          inaccurate: isInaccurate(pos.coords.accuracy),
        }),
      (err) => setState({ status: mapGeoError(err.code), position: null, inaccurate: false }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  return { ...state, request };
}
