import AlertsPanel from '../components/AlertsPanel.jsx'
import AmbulancePanel from '../components/AmbulancePanel.jsx'
import Card from '../components/Card.jsx'
import LiveMap from '../components/LiveMap.jsx'

export default function AmbulancesView({ onOpenPatient }) {
  return (
    <div className="flex flex-col gap-6">
      <Card title="Ambulance fleet">
        <AmbulancePanel />
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <AlertsPanel onOpenPatient={onOpenPatient} />
        <Card title="Routes">
          <LiveMap height={420} />
        </Card>
      </div>
    </div>
  )
}
