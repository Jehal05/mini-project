import PortalLayout from '../components/PortalLayout.jsx';
import AuditLogViewer from './AuditLogViewer.jsx';

/** Central Admin Portal shell. Hospital management, analytics and settings are added in later phases. */
export default function AdminHome() {
  return (
    <PortalLayout title="Central admin portal">
      <AuditLogViewer />
    </PortalLayout>
  );
}
