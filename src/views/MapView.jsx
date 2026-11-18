import Card from '../components/Card.jsx'
import LiveMap from '../components/LiveMap.jsx'

export default function MapView() {
  return (
    <Card
      title="Live map: patients, ambulances and hospital"
      action={
        <div className="flex gap-3 text-xs text-slate-500">
          <span>🟢 normal</span>
          <span>🟠 warning</span>
          <span>🔴 critical</span>
          <span>🚑 ambulance</span>
        </div>
      }
    >
      <LiveMap height="calc(100vh - 220px)" />
    </Card>
  )
}
