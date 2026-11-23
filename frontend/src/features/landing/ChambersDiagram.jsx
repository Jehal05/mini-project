// A labelled illustration of the heart and its four chambers (a simplified drawing, not a medical image).
const LABELS = [
  { x: 6, y: 74, tx: 82, ty: 76, text: 'Right atrium', d: 'Receives blood from the body' },
  { x: 6, y: 120, tx: 100, ty: 112, text: 'Right ventricle', d: 'Pumps blood to the lungs' },
  { x: 254, y: 74, tx: 176, ty: 64, text: 'Left atrium', d: 'Receives blood from the lungs', end: true },
  { x: 254, y: 130, tx: 160, ty: 118, text: 'Left ventricle', d: 'Pumps blood to the body', end: true },
]

export default function ChambersDiagram() {
  return (
    <figure className="m-0">
      <svg viewBox="0 0 260 170" role="img" aria-label="Drawing of the heart with its four chambers labelled: right atrium, right ventricle, left atrium and left ventricle. An illustration, not a medical image." className="mx-auto h-64 w-full max-w-md">
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* great vessels */}
          <path d="M126 58 V32 C126 14 160 8 172 26 C178 36 180 46 180 58" fill="none" stroke="var(--ht-critical)" strokeWidth="13" opacity="0.9" />
          <path d="M112 62 C108 44 100 34 84 30" fill="none" stroke="var(--ht-primary)" strokeWidth="10" opacity="0.85" />
          <path d="M112 62 C116 44 140 36 160 40" fill="none" stroke="var(--ht-primary)" strokeWidth="9" opacity="0.7" />
          <path d="M84 70 V24" fill="none" stroke="var(--ht-primary)" strokeWidth="9" opacity="0.85" />
          {/* chambers */}
          <path d="M72 70 C70 56 90 52 106 60 L110 98 C96 106 74 98 72 70 Z" fill="var(--ht-primary)" opacity="0.55" stroke="var(--ht-fg)" strokeWidth="1" />
          <path d="M150 56 C168 46 192 54 192 70 C192 82 176 86 158 80 Z" fill="var(--ht-primary)" opacity="0.7" stroke="var(--ht-fg)" strokeWidth="1" />
          <path d="M106 60 C124 58 136 70 138 90 L142 150 C118 142 100 124 104 100 Z" fill="var(--ht-critical)" opacity="0.6" stroke="var(--ht-fg)" strokeWidth="1" />
          <path d="M138 66 C170 60 200 76 196 106 C192 130 164 148 142 156 C130 140 134 100 138 66 Z" fill="var(--ht-critical)" opacity="0.9" stroke="var(--ht-fg)" strokeWidth="1" />
          {/* coronary artery */}
          <path d="M124 64 C126 90 130 120 140 150" fill="none" stroke="var(--ht-fg)" strokeWidth="1.6" opacity="0.7" />
        </g>
        {LABELS.map((l) => (
          <g key={l.text}>
            <line x1={l.end ? l.x - 2 : l.x + 66} y1={l.y - 3} x2={l.tx} y2={l.ty} stroke="var(--ht-line)" strokeWidth="0.8" />
            <text x={l.x} y={l.y} textAnchor={l.end ? 'end' : 'start'} fontSize="8.5" fill="var(--ht-fg)" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{l.text}</text>
          </g>
        ))}
      </svg>
      <figcaption className="sr-only">
        {LABELS.map((l) => `${l.text}: ${l.d}. `)}
      </figcaption>
    </figure>
  )
}
