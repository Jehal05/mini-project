import { Navigate, Route, Routes } from 'react-router-dom';
import { ProfileLayout } from './features/profile/index.js';
import DocumentsPage from './features/profile/pages/DocumentsPage.jsx';
import ContactsPage from './features/profile/pages/ContactsPage.jsx';
import MedicalPage from './features/profile/pages/MedicalPage.jsx';
import PersonalPage from './features/profile/pages/PersonalPage.jsx';
import QrPage from './features/profile/pages/QrPage.jsx';
import SettingsPage from './features/profile/pages/SettingsPage.jsx';
import FullRecordPage from './features/profile/public/FullRecordPage.jsx';
import PassportPage from './features/profile/public/PassportPage.jsx';
import ScanPage from './features/profile/public/ScanPage.jsx';
import { PublicOnly, RequireAuth } from './auth/guards.jsx';
import { portalPath } from './auth/roles.js';
import { useAuth } from './auth/AuthContext.jsx';
import AdminLayout from './features/admin/AdminLayout.jsx';
import HospitalLayout from './features/hospital/HospitalLayout.jsx';
import AdmissionPage from './features/hospital/pages/AdmissionPage.jsx';
import AdmissionsPage from './features/hospital/pages/AdmissionsPage.jsx';
import BedsPage from './features/hospital/pages/BedsPage.jsx';
import DashboardPage from './features/hospital/pages/DashboardPage.jsx';
import DoctorsPage from './features/hospital/pages/DoctorsPage.jsx';
import EdPage from './features/hospital/pages/EdPage.jsx';
import HistoryPage from './features/hospital/pages/HistoryPage.jsx';
import './features/hospital/hospital.css';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import PatientHome from './pages/PatientHome.jsx';
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';

/** "/" goes to the signed-in user's portal, or to login. (Daksh's landing page replaces this later.) */
function Start() {
  const { status, user } = useAuth();
  if (status === 'loading') return <div className="center-screen" role="status">Loading…</div>;
  return <Navigate to={status === 'authenticated' ? portalPath(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Start />} />

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
        <Route path="/patient/profile" element={<ProfileLayout />}>
          <Route index element={<Navigate to="personal" replace />} />
          <Route path="personal" element={<PersonalPage />} />
          <Route path="medical" element={<MedicalPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="passport" element={<QrPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="/patient/*" element={<PatientHome />} />
      </Route>
      <Route element={<RequireAuth roles={['doctor', 'hospital_staff', 'hospital_admin']} />}>
        <Route path="/p/:token/full" element={<FullRecordPage />} />
        <Route path="/hospital" element={<HospitalLayout />}>
          <Route index element={<DashboardPage />} />
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
    </Routes>
  );
}
