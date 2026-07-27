import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * The handful of primitives phase 0 needs. Everything styles itself from the
 * design tokens in styles/index.css - no literal colours here, so the Claude
 * Design bundle can drop in without touching component code.
 */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-(--radius-md) px-5 py-2.5 ' +
    'text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  const variants = {
    primary:
      'bg-(--color-brand-500) text-(--color-text-primary) hover:bg-(--color-brand-700)',
    ghost:
      'border border-(--color-border-strong) text-(--color-text-secondary) hover:text-(--color-text-primary)',
  } as const;

  return (
    <button
      {...rest}
      disabled={disabled ?? loading}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {loading ? 'Attendi…' : children}
    </button>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | undefined;
}

export function Field({ label, hint, error, id, ...rest }: FieldProps) {
  const inputId = id ?? rest.name ?? label;
  return (
    <label className="flex flex-col gap-1.5" htmlFor={inputId}>
      <span className="text-sm font-medium text-(--color-text-secondary)">{label}</span>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface-sunken)
          px-3 py-2.5 text-(--color-text-primary) placeholder:text-(--color-text-muted)
          focus:border-(--color-brand-300) focus:outline-none"
      />
      {error ? (
        <span className="text-xs text-(--color-danger-500)">{error}</span>
      ) : hint ? (
        <span className="text-xs text-(--color-text-muted)">{hint}</span>
      ) : null}
    </label>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-(--radius-xl) border border-(--color-border-subtle)
        bg-(--color-surface-raised) p-6 shadow-(--shadow-panel) ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Permanent, non-dismissable footer required by the product constraints: this
 * game has no deposits, no withdrawals and no conversion to real money.
 */
export function ResponsiblePlayNotice() {
  return (
    <p className="text-center text-xs leading-relaxed text-(--color-text-muted)">
      Gioco simulato con soli crediti virtuali. Nessun deposito, nessun prelievo,
      nessuna conversione in denaro reale. Consigliato ai maggiori di 18 anni.
    </p>
  );
}
