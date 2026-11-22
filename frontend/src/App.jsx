import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { MedicalBackground } from './design/index.js'

// Pages load on demand so the first screen downloads only what it needs (review 10).
const PatientDashboard = lazy(() => import('./pages/PatientDashboard.jsx'))
const PresenterPanel = lazy(() => import('./pages/PresenterPanel.jsx'))
const DesignShowcase = lazy(() => import('./pages/DesignShowcase.jsx'))
const FamilyStatus = lazy(() => import('./pages/FamilyStatus.jsx'))

function PageLoading() {
  return (
    <MedicalBackground portal="patient">
      <p className="px-6 py-10 text-sm text-fg-muted" role="status">
        Loading…
      </p>
    </MedicalBackground>
  )
}

// Temporary routes until Jehal's login and role guards (Phase 2) decide who sees what.
export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/patient/HT-2026-0001" replace />} />
        <Route path="/patient/:code" element={<PatientDashboard />} />
        <Route path="/presenter" element={<PresenterPanel />} />
        <Route path="/status/:token" element={<FamilyStatus />} />
        <Route path="/design" element={<DesignShowcase />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
