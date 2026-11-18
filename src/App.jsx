import { useEffect, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import Sidebar from './components/Sidebar.jsx'
import { useHospital } from './sim/HospitalContext.jsx'
import { beep } from './utils/ui.js'
import AmbulancesView from './views/AmbulancesView.jsx'
import Dashboard from './views/Dashboard.jsx'
import MapView from './views/MapView.jsx'
import PatientsView from './views/PatientsView.jsx'

export default function App() {
  const { state } = useHospital()
  const [view, setView] = useState('dashboard')
  const [selectedId, setSelectedId] = useState('P-001')
  const [soundOn, setSoundOn] = useState(true)

  const openPatient = (id) => {
    setSelectedId(id)
    setView('patients')
  }

  // Beep when a new alert comes in.
  const seenAlerts = useRef(0)
  useEffect(() => {
    if (state.alerts.length > seenAlerts.current && soundOn) beep()
    seenAlerts.current = state.alerts.length
  }, [state.alerts.length, soundOn])

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800">
      <Sidebar view={view} onChange={setView} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header soundOn={soundOn} onToggleSound={() => setSoundOn((s) => !s)} />
        <main className="flex-1 overflow-y-auto p-6">
          {view === 'dashboard' && <Dashboard onOpenPatient={openPatient} />}
          {view === 'patients' && <PatientsView selectedId={selectedId} onSelect={setSelectedId} />}
          {view === 'map' && <MapView />}
          {view === 'ambulances' && <AmbulancesView onOpenPatient={openPatient} />}
        </main>
      </div>
    </div>
  )
}
