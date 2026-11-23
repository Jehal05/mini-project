// A labelled illustration of the four chambers (a simple diagram, not an anatomical model).
const LABELS = [
  { x: 18, y: 30, text: 'Right atrium', d: 'Receives blood from the body' },
  { x: 82, y: 30, text: 'Left atrium', d: 'Receives blood from the lungs', end: true },
  { x: 24, y: 72, text: 'Right ventricle', d: 'Pumps blood to the lungs' },
  { x: 76, y: 72, text: 'Left ventricle', d: 'Pumps blood to the body', end: true },
]

export default function ChambersDiagram() {
  return (
    <figure className="m-0">
      <svg viewBox="0 0 100 100" role="img" aria-label="Diagram of the four heart chambers: right atrium, left atrium, right ventricle and left ventricle. An illustration, not a medical image." className="mx-auto h-56 w-56">
        <path d="M50 92 C18 68 6 48 6 33 A21 21 0 0 1 50 24 A21 21 0 0 1 94 33 C94 48 82 68 50 92 Z" fill="none" stroke="var(--ht-primary)" strokeWidth="1.4" />
        <path d="M50 24 V88 M10 52 H90" stroke="var(--ht-line)" strokeWidth="1" strokeDasharray="2 2" />
        {LABELS.map((l) => (
          <text key={l.text} x={l.x} y={l.y} textAnchor={l.end ? 'end' : 'start'} fontSize="5.2" fill="var(--ht-fg)" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{l.text}</text>
        ))}
      </svg>
      <figcaption className="sr-only">
        {LABELS.map((l) => `${l.text}: ${l.d}. `)}
      </figcaption>
    </figure>
  )
}
