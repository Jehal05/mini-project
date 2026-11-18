import ActivityFeed from '../components/ActivityFeed.jsx'
import AlertsPanel from '../components/AlertsPanel.jsx'
import AmbulancePanel from '../components/AmbulancePanel.jsx'
import BedsPanel from '../components/BedsPanel.jsx'
import Card from '../components/Card.jsx'
import LiveMap from '../components/LiveMap.jsx'
import PatientTable from '../components/PatientTable.jsx'
import StatCards from '../components/StatCards.jsx'

export default function Dashboard({ onOpenPatient }) {
  return (
    <div className="flex flex-col gap-6">
      <StatCards />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <AlertsPanel onOpenPatient={onOpenPatient} />
        </div>
        <Card title="Live map" className="xl:col-span-2">
          <LiveMap height={340} />
        </Card>
      </div>
      <Card title="Patients under monitoring">
        <PatientTable onOpenPatient={onOpenPatient} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Ambulance fleet">
          <AmbulancePanel compact />
        </Card>
        <Card title="Bed availability">
          <BedsPanel />
        </Card>
        <Card title="Activity">
          <ActivityFeed />
        </Card>
      </div>
    </div>
  )
}
