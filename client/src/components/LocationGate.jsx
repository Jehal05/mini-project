import { GEO_MESSAGES } from '../lib/geo.js';
import Button from '../ui/Button.jsx';
import { Card } from '../ui/Surface.jsx';
import { ErrorState } from '../ui/Feedback.jsx';
import Icon from '../ui/icons.jsx';

// Feature 51. Explains why location is needed BEFORE the browser prompt, then handles every outcome.
export default function LocationGate({ geo, onUseGps, onManual }) {
  const { status, position, inaccurate, request } = geo;
  const failed = ['denied', 'timeout', 'unavailable', 'unsupported'].includes(status);

  return (
    <Card className="mx-auto mt-4 max-w-lg p-6">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent"><Icon name="map-pin" size={24} /></span>
      <h2 className="font-title mt-3 text-2xl font-semibold">Find hospitals near you</h2>
      <p className="mt-2 text-sm text-muted">
        We use your location only to find the nearest hospitals that can treat a cardiac emergency and to
        estimate how long help will take. This page does not store it.
      </p>

      {status === 'granted' && inaccurate && (
        <div className="mt-4 rounded-ui border border-moderate bg-moderate-soft p-3 text-sm text-ink">
          {GEO_MESSAGES.inaccurate} (accuracy about {Math.round(position.accuracy / 1000)} km)
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onUseGps(position)}>Use it anyway</Button>
            <Button onClick={onManual}>Drop a pin</Button>
          </div>
        </div>
      )}

      {failed && <div className="mt-4"><ErrorState title="Location not available">{GEO_MESSAGES[status]}</ErrorState></div>}

      <div className="mt-5 flex flex-wrap gap-2">
        {status !== 'unsupported' && (
          <Button size="lg" busy={status === 'requesting'} onClick={request}>
            {status === 'requesting' ? 'Getting your location' : failed ? 'Try again' : 'Share my location'}
          </Button>
        )}
        <Button size="lg" variant="secondary" onClick={onManual}>Choose location manually</Button>
      </div>
    </Card>
  );
}
