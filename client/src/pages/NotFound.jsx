import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';

export default function NotFound() {
  return (
    <AuthShell title="Page not found" subtitle="404">
      <p>That page does not exist.</p>
      <div className="actions"><Link className="btn btn-primary" to="/">Back to start</Link></div>
    </AuthShell>
  );
}
