// Flat heart illustration. Used on phones that are low on power, when WebGL is missing, when motion is reduced, and while
// the 3D heart loads. It beats (lub-dub) at the real rate unless motion is reduced.
import { beatSeconds } from '../lib/ecg.js';

export default function Heart2D({ bpm, variant = 'solid', className = '' }) {
  const holo = variant === 'holo';
  const fill = (id) => (holo ? 'none' : `url(#${id})`);
  const stroke = holo ? 'rgb(var(--accent))' : 'rgba(0,0,0,0.25)';
  return (
    <svg viewBox="0 0 300 300" aria-hidden="true" className={`lubdub mx-auto block h-full w-full ${className}`} style={{ '--beat': `${beatSeconds(bpm)}s` }}>
      <defs>
        <radialGradient id="h2-body" cx="38%" cy="30%" r="80%"><stop offset="0" stopColor="#ff5a52" /><stop offset="0.5" stopColor="#c2161d" /><stop offset="1" stopColor="#5e060c" /></radialGradient>
        <linearGradient id="h2-vessel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e23a3a" /><stop offset="1" stopColor="#7d0a10" /></linearGradient>
      </defs>
      <g strokeWidth={holo ? 2 : 1.5} stroke={stroke} strokeLinejoin="round">
        {/* great vessels */}
        <path d="M150 105 C145 55 175 25 215 38 C240 46 246 78 232 100 L214 96 C220 80 214 68 200 66 C176 62 172 84 176 112 Z" fill={fill('h2-vessel')} />
        <path d="M118 108 C108 70 92 52 72 56 C60 58 58 74 68 80 C84 90 96 104 104 124 Z" fill={fill('h2-vessel')} />
        <path d="M96 96 C90 70 112 40 136 36 C150 34 152 50 140 58 C124 68 120 86 122 108 Z" fill={fill('h2-vessel')} />
        {/* chambers */}
        <path d="M208 120 C240 128 252 168 236 208 C222 244 180 270 150 278 C128 262 112 226 120 186 C126 152 170 112 208 120 Z" fill={fill('h2-body')} />
        <path d="M112 128 C84 134 62 168 70 208 C80 246 118 268 150 278 C132 248 128 206 136 172 C142 148 140 130 112 128 Z" fill={fill('h2-body')} />
        <path d="M172 112 C190 100 216 108 226 124 C206 118 186 122 172 112 Z M100 124 C112 108 136 106 150 116 C134 122 116 124 100 124 Z" fill={fill('h2-vessel')} />
      </g>
      {/* coronary vessels */}
      <g fill="none" stroke={holo ? 'rgb(var(--accent))' : '#ff8a80'} strokeWidth="3" strokeLinecap="round" opacity="0.75">
        <path d="M176 128 C196 160 200 200 186 244" /><path d="M158 132 C150 170 148 214 158 256" /><path d="M126 140 C110 170 104 204 118 240" />
      </g>
    </svg>
  );
}
