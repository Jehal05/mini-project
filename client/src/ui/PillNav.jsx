import Icon from './icons.jsx';

// Floating bottom bar for phones. The active item is a bright circle with its name beside it; the others are icons that
// still have a name for screen readers and a tooltip. Arrow keys are not needed: each item is a normal button.
export default function PillNav({ items, value, onChange, label = 'Sections' }) {
  return (
    <nav aria-label={label} className="pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-3 md:hidden">
      <ul className="glass pointer-events-auto flex items-center gap-1 rounded-full border border-line p-1.5 shadow-lift">
        {items.map((n) => {
          const on = n.id === value;
          return (
            <li key={n.id}>
              <button type="button" onClick={() => onChange(n.id)} aria-current={on ? 'page' : undefined} aria-label={n.label} title={n.label}
                className={`flex min-h-touch items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors ${on ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}>
                <Icon name={n.icon} size={22} />{on && <span>{n.label}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
