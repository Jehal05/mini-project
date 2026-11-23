/** Always on screen on the public passport page: the real emergency numbers come first. */
export default function EmergencyCalls() {
  return (
    <div className="calls" aria-label="Emergency numbers">
      <a className="btn call-btn" href="tel:112">Call 112</a>
      <a className="btn call-btn" href="tel:108">Call 108 (ambulance)</a>
    </div>
  );
}
