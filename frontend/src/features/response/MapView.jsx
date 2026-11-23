// The map every screen uses. Leaflet loads lazily; until it does (or if it cannot start) the plain drawn map is shown.
import { Component, lazy, Suspense } from 'react'
import MiniMap from './MiniMap.jsx'

const LeafletMap = lazy(() => import('./LeafletMap.jsx'))

class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export default function MapView(props) {
  const fallback = <MiniMap points={props.points} lines={props.lines} height={props.height} label={props.label} />
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LeafletMap {...props} />
      </Suspense>
    </Boundary>
  )
}
