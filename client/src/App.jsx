import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicOnly, RequireAuth } from './auth/guards.jsx';
import { portalPath } from './auth/roles.js';
import { useAuth } from './auth/AuthContext.jsx';
import AdminHome from './pages/AdminHome.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import HospitalHome from './pages/HospitalHome.jsx';
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

      <Route element={<RequireAuth roles={['patient']} />}>
        <Route path="/patient/*" element={<PatientHome />} />
      </Route>
      <Route element={<RequireAuth roles={['doctor', 'hospital_staff', 'hospital_admin']} />}>
        <Route path="/hospital/*" element={<HospitalHome />} />
      </Route>
      <Route element={<RequireAuth roles={['central_admin']} />}>
        <Route path="/admin/*" element={<AdminHome />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
