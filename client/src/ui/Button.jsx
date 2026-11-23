import Icon from './icons.jsx';

const VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  secondary: 'bg-surface text-ink border border-line hover:bg-raised',
  quiet: 'bg-transparent text-ink hover:bg-raised',
  danger: 'bg-critical text-white hover:brightness-110',
};
const SIZES = { md: 'min-h-touch px-4 text-sm', lg: 'min-h-[3.5rem] px-6 text-base', sm: 'min-h-[2.25rem] px-3 text-xs' };

export default function Button({ variant = 'primary', size = 'md', icon, busy = false, disabled, className = '', children, type = 'button', ...rest }) {
  return (
    <button type={type} disabled={disabled || busy} aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-ui font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...rest}>
      {busy ? <Icon name="refresh" size={18} className="animate-spin motion-reduce:animate-none" /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}
