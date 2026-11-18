import { forwardRef } from 'react'
import { cx } from '../cx.js'

const VARIANTS = {
  primary: 'bg-primary text-primary-fg hover:brightness-110 shadow-[0_0_24px_-6px_var(--ht-primary)]',
  secondary: 'bg-surface-strong text-fg border border-line backdrop-blur-md hover:bg-surface',
  ghost: 'bg-transparent text-fg hover:bg-surface',
  // Red is reserved for emergencies: use only for SOS, Reject on the takeover screen, and Call 112/108.
  danger: 'bg-critical-solid text-critical-fg hover:brightness-110',
}

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
}

/**
 * Button. Variants: primary | secondary | ghost | danger. Sizes: sm | md | lg.
 * Pass `loading` to disable it and show a spinner.
 */
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center font-semibold transition select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
})

/** The big round SOS button with a slow pulse ring (feature 41 uses this). */
export function SosButton({ className, children = 'SOS', label = 'Send emergency SOS', ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(
        'ht-pulse-ring relative inline-flex h-28 w-28 items-center justify-center rounded-full',
        'bg-critical-solid text-2xl font-extrabold tracking-wider text-critical-fg',
        'shadow-[0_0_40px_-4px_var(--ht-critical)] transition hover:brightness-110 active:scale-95',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
