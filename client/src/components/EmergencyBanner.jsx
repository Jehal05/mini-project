// Disclaimer is always shown. In emergency mode the Call 112 / Call 108 buttons stay visible too.
export default function EmergencyBanner({ emergency, showDisclaimer = true }) {
  return (
    <div>
      {emergency && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-red-700 px-4 py-2 text-white">
          <span className="font-semibold">Emergency mode: if someone needs help now, call immediately.</span>
          <div className="flex gap-2">
            <a href="tel:112" className="rounded bg-white px-3 py-1 font-bold text-red-700">Call 112</a>
            <a href="tel:108" className="rounded bg-white px-3 py-1 font-bold text-red-700">Call 108</a>
          </div>
        </div>
      )}
      {showDisclaimer && (
        <p className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900">
          Simulated data for demonstration. Not a medical device.
        </p>
      )}
    </div>
  );
}
