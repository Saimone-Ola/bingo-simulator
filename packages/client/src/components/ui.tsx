import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { formatCredits } from '@bingo/shared';

/**
 * Interface primitives.
 *
 * Every value here comes from a design token (see styles/tokens.css) through a
 * Tailwind utility - there are no literal colours, radii or shadows in this
 * file, so re-skinning the product never means editing components.
 */

const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/* -------------------------------------------------------------------------
 * Button
 * ---------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Text shown while `loading`; defaults to the Italian "Attendi…". */
  loadingLabel?: string;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-content-primary hover:bg-brand-400 active:bg-brand-600',
  secondary: 'bg-surface-700 text-content-primary hover:bg-surface-600 active:bg-surface-800',
  ghost:
    'border border-surface-500 text-content-secondary hover:border-brand-400 hover:text-content-primary',
  // Reserved for committing value: buy cards, claim a prize, spin.
  accent: 'bg-accent-500 text-content-inverse hover:bg-accent-400 active:bg-accent-600',
  danger: 'bg-danger-500 text-content-primary hover:bg-danger-400 active:bg-danger-600',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Attendi…',
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold',
        'transition-colors duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      ].join(' ')}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}

/* -------------------------------------------------------------------------
 * Form field
 * ---------------------------------------------------------------------- */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | undefined;
}

export function Field({ label, hint, error, id, className = '', ...rest }: FieldProps) {
  const inputId = id ?? rest.name ?? label;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-content-secondary">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          'rounded-md border bg-surface-850 px-3 py-2.5',
          'text-content-primary placeholder:text-content-muted',
          'transition-colors duration-150 focus:outline-none',
          error
            ? 'border-danger-500 focus:border-danger-400'
            : 'border-surface-600 focus:border-brand-400',
          className,
        ].join(' ')}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-content-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Containers
 * ---------------------------------------------------------------------- */

export function Panel({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'aside';
}) {
  return (
    <Tag
      className={`rounded-xl border border-surface-600 bg-surface-800 p-6 shadow-panel ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * Chrome that floats over the 3D world. Translucent plus blur so the player
 * keeps some sense of what is behind it, unlike an opaque Panel.
 */
export function HudCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-surface-600 bg-surface-800/85 px-4 py-3 shadow-hud backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Badges
 * ---------------------------------------------------------------------- */

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-surface-500 text-content-secondary',
  brand: 'border-brand-500 text-brand-300',
  success: 'border-success-500 text-success-400',
  warning: 'border-warning-500 text-warning-400',
  danger: 'border-danger-500 text-danger-400',
  info: 'border-info-500 text-info-400',
};

const BADGE_BASE =
  'inline-flex items-center rounded-sm border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`${BADGE_BASE} ${BADGE_TONES[tone]}`}>{children}</span>;
}

const RARITY_STYLES: Record<Rarity, string> = {
  common: 'border-rarity-common text-rarity-common',
  rare: 'border-rarity-rare text-rarity-rare',
  epic: 'border-rarity-epic text-rarity-epic',
  legendary: 'border-rarity-legendary text-rarity-legendary',
};

const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Comune',
  rare: 'Raro',
  epic: 'Epico',
  legendary: 'Leggendario',
};

/** One rarity scale across shop, inventory, wardrobe and prize drops. */
export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return <span className={`${BADGE_BASE} ${RARITY_STYLES[rarity]}`}>{RARITY_LABELS[rarity]}</span>;
}

/* -------------------------------------------------------------------------
 * Credits
 * ---------------------------------------------------------------------- */

/**
 * The one way credits are ever rendered: gold, tabular figures so the counter
 * does not jitter as digits change, and the unit always spelled out. The value
 * always comes from the server - nothing client side computes a balance.
 */
export function CreditAmount({
  value,
  size = 'md',
  showUnit = true,
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  showUnit?: boolean;
}) {
  const sizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-display' } as const;
  return (
    <span className={`tabular font-semibold text-accent-300 ${sizes[size]}`}>
      {formatCredits(value)}
      {showUnit && (
        <>
          {/* A real space, not just a margin: without it a screen reader
              announces "1.000crediti" as a single token. */}{' '}
          {/* em-relative so the unit stays subordinate to the number at every
              size instead of inheriting the display scale. */}
          <span className="text-[0.62em] font-normal text-accent-500">crediti</span>
        </>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * Product-mandated chrome
 * ---------------------------------------------------------------------- */

/**
 * Required by the product constraints and never dismissable: this game has no
 * deposits, no withdrawals and no conversion to real money.
 */
export function ResponsiblePlayNotice({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-xs leading-relaxed text-content-muted ${className}`}>
      Gioco simulato con soli crediti virtuali. Nessun deposito, nessun prelievo, nessuna
      conversione in denaro reale. Consigliato ai maggiori di 18 anni.
    </p>
  );
}
