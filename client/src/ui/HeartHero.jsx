import { Component, Suspense, lazy, useCallback, useEffect, useState } from 'react';
import Heart2D from './Heart2D.jsx';
import { detectCapabilities, shouldUse3D } from '../lib/heartMode.js';

const Heart3D = lazy(() => import('./Heart3D.jsx'));

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * The big heart. 3D on a capable device that allows motion, otherwise the flat illustration (also shown while 3D loads
 * and if it fails). `bpm` drives the beat. It is a picture, labelled as simulated, never a medical image.
 */
export default function HeartHero({ bpm, variant = 'solid', className = '', simulated = true }) {
  const [use3D, setUse3D] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setUse3D(shouldUse3D(detectCapabilities())); }, []);
  const fail = useCallback(() => setFailed(true), []);
  const flat = <Heart2D bpm={bpm} variant={variant} />;
  return (
    <div role="img" aria-label={`Illustration of a heart beating at ${bpm ?? 'a resting'} beats per minute${simulated ? ' (simulated)' : ''}`} className={`relative ${className}`}>
      {use3D && !failed ? (
        <Boundary onFail={fail} fallback={flat}><Suspense fallback={flat}><Heart3D bpm={bpm} variant={variant} onFail={fail} /></Suspense></Boundary>
      ) : flat}
    </div>
  );
}
