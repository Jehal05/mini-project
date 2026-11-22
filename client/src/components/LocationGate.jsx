import { GEO_MESSAGES } from '../lib/geo.js';

// Feature 51. Explains why location is needed BEFORE the browser prompt, then handles every outcome.
export default function LocationGate({ geo, onUseGps, onManual }) {
  const { status, position, inaccurate, request } = geo;
  const failed = ['denied', 'timeout', 'unavailable', 'unsupported'].includes(status);

  return (
    <div className="mx-auto mt-10 max-w-lg rounded-lg bg-white p-6 shadow">
      <h2 className="text-xl font-bold">Find hospitals near you</h2>
      <p className="mt-2 text-sm text-slate-600">
        We use your location only to find the nearest hospitals that can treat a cardiac emergency and to
        estimate how long help will take. It is not stored by this page.
      </p>

      {status === 'granted' && inaccurate && (
        <div className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900">
          {GEO_MESSAGES.inaccurate} (accuracy about {Math.round(position.accuracy / 1000)} km)
          <div className="mt-2 flex gap-2">
            <button className="rounded bg-slate-200 px-3 py-1" onClick={() => onUseGps(position)}>Use it anyway</button>
            <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={onManual}>Drop a pin</button>
          </div>
        </div>
      )}

      {failed && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800">{GEO_MESSAGES[status]}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {status !== 'unsupported' && (
          <button
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={status === 'requesting'}
            onClick={request}
          >
            {status === 'requesting' ? 'Getting your location…' : failed ? 'Try again' : 'Share my location'}
          </button>
        )}
        <button className="rounded border border-slate-300 px-4 py-2" onClick={onManual}>
          Choose location manually
        </button>
      </div>
    </div>
  );
}
