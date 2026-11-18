import { Navigate, Route, Routes } from 'react-router-dom'
import PatientDashboard from './pages/PatientDashboard.jsx'
import PresenterPanel from './pages/PresenterPanel.jsx'
import DesignShowcase from './pages/DesignShowcase.jsx'

// Temporary routes until Jehal's login and role guards (Phase 2) decide who sees what.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/patient/HT-2026-0001" replace />} />
      <Route path="/patient/:code" element={<PatientDashboard />} />
      <Route path="/presenter" element={<PresenterPanel />} />
      <Route path="/design" element={<DesignShowcase />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
