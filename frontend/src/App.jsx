import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { MedicalBackground } from './design/index.js'
const ProfileLayout = lazy(() => import('./features/profile/index.js').then((m) => ({ default: m.ProfileLayout })))
const DocumentsPage = lazy(() => import('./features/profile/pages/DocumentsPage.jsx'))
const ContactsPage = lazy(() => import('./features/profile/pages/ContactsPage.jsx'))
const MedicalPage = lazy(() => import('./features/profile/pages/MedicalPage.jsx'))
const PersonalPage = lazy(() => import('./features/profile/pages/PersonalPage.jsx'))
const QrPage = lazy(() => import('./features/profile/pages/QrPage.jsx'))
const SettingsPage = lazy(() => import('./features/profile/pages/SettingsPage.jsx'))
const FullRecordPage = lazy(() => import('./features/profile/public/FullRecordPage.jsx'))
const PassportPage = lazy(() => import('./features/profile/public/PassportPage.jsx'))
const ScanPage = lazy(() => import('./features/profile/public/ScanPage.jsx'))
import { PublicOnly, RequireAuth } from './auth/guards.jsx'
import { portalPath } from './auth/roles.js'
import { useAuth } from './auth/AuthContext.jsx'
const AdminLayout = lazy(() => import('./features/admin/AdminLayout.jsx'))
const HospitalLayout = lazy(() => import('./features/hospital/HospitalLayout.jsx'))
const AdmissionPage = lazy(() => import('./features/hospital/pages/AdmissionPage.jsx'))
const AdmissionsPage = lazy(() => import('./features/hospital/pages/AdmissionsPage.jsx'))
const BedsPage = lazy(() => import('./features/hospital/pages/BedsPage.jsx'))
const DashboardPage = lazy(() => import('./features/hospital/pages/DashboardPage.jsx'))
const DoctorsPage = lazy(() => import('./features/hospital/pages/DoctorsPage.jsx'))
const IncomingPage = lazy(() => import('./features/response/pages/IncomingPage.jsx'))
const CasePage = lazy(() => import('./features/response/pages/CasePage.jsx'))
const CrewPage = lazy(() => import('./features/response/pages/CrewPage.jsx'))
const AmbulancesPage = lazy(() => import('./features/response/pages/AmbulancesPage.jsx'))
const TrackPage = lazy(() => import('./features/response/pages/TrackPage.jsx'))
const HospitalFinderPage = lazy(() => import('./features/response/pages/HospitalFinderPage.jsx'))
const EdPage = lazy(() => import('./features/hospital/pages/EdPage.jsx'))
const HistoryPage = lazy(() => import('./features/hospital/pages/HistoryPage.jsx'))
import './features/hospital/hospital.css'
import './styles/auth.css'
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
const PatientHome = lazy(() => import('./pages/PatientHome.jsx'))
const Register = lazy(() => import('./pages/Register.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
const MyMonitor = lazy(() => import('./pages/MyMonitor.jsx'))

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

/** "/" goes to the signed-in user's portal, or to login. */
function Start() {
  const { status, user } = useAuth()
  if (status === 'loading') return <PageLoading />
  return <Navigate to={status === 'authenticated' ? portalPath(user.role) : '/login'} replace />
}

/** Wraps the account, profile, hospital and admin screens so their plain CSS applies only to them. */
function Legacy() {
  return (
    <div className="ht-legacy">
      <Outlet />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Start />} />

        {/* Live monitoring screens (Daksh). Every one needs a login; the server decides what each person may see. */}
        <Route element={<RequireAuth roles={['patient']} />}>
          <Route path="/patient/monitor" element={<MyMonitor />} />
          <Route path="/patient/monitor/:code" element={<PatientDashboard />} />
        </Route>
        <Route element={<RequireAuth roles={['central_admin']} />}>
          <Route path="/presenter" element={<PresenterPanel />} />
        </Route>
        <Route path="/status/:token" element={<FamilyStatus />} />
        <Route path="/design" element={<DesignShowcase />} />

        <Route element={<Legacy />}>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>
          {/* Outside PublicOnly: someone who is signed in can still follow a reset link from their email. */}
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Public emergency passport: no login, for whoever scans the QR (feature 20, 106). */}
          <Route path="/p/:token" element={<PassportPage />} />
          <Route path="/scan" element={<ScanPage />} />

          <Route element={<RequireAuth roles={['patient']} />}>
            <Route path="/patient" element={<PatientHome />} />
            <Route path="/patient/emergency/:caseId?" element={<TrackPage />} />
            <Route path="/patient/hospitals" element={<HospitalFinderPage />} />
            <Route path="/patient/profile" element={<ProfileLayout />}>
              <Route index element={<Navigate to="personal" replace />} />
              <Route path="personal" element={<PersonalPage />} />
              <Route path="medical" element={<MedicalPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="passport" element={<QrPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route element={<RequireAuth roles={['doctor', 'hospital_staff', 'hospital_admin']} />}>
            <Route path="/p/:token/full" element={<FullRecordPage />} />
            <Route path="/hospital" element={<HospitalLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="incoming" element={<IncomingPage />} />
              <Route path="emergencies/:id" element={<CasePage />} />
              <Route path="ambulances" element={<AmbulancesPage />} />
              <Route path="crew" element={<CrewPage />} />
              <Route path="admissions" element={<AdmissionsPage />} />
              <Route path="admissions/:id" element={<AdmissionPage />} />
              <Route path="beds" element={<BedsPage />} />
              <Route path="ed" element={<EdPage />} />
              <Route path="doctors" element={<DoctorsPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
          <Route element={<RequireAuth roles={['central_admin']} />}>
            <Route path="/admin/*" element={<AdminLayout />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
