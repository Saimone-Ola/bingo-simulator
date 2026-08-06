import { type SymbolShape } from '@bingo/shared';

/**
 * A slot symbol, drawn.
 *
 * Symbols used to be emoji. Emoji are rendered by the operating system, so the
 * same machine looked different on every device, the shapes could not be
 * recoloured to match a cabinet, and half of them were unreadable at reel size.
 *
 * These are inline SVG on a 24-unit grid: sharp at any size, tinted per symbol,
 * no network request and no dependency. Each is deliberately a bold silhouette
 * rather than an illustration — a symbol has to be identifiable at 32 pixels
 * while it is moving.
 */

export interface SlotSymbolProps {
  shape: SymbolShape;
  color: string;
  accent: string;
  className?: string;
  /** Accessible name; symbols on a reel are announced by name, not by shape. */
  title?: string;
}

export default function SlotSymbol({
  shape,
  color,
  accent,
  className = '',
  title,
}: SlotSymbolProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-full w-full ${className}`}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {paths(shape, color, accent)}
    </svg>
  );
}

function paths(shape: SymbolShape, color: string, accent: string) {
  switch (shape) {
    case 'circle':
      return (
        <>
          <circle cx="12" cy="12.6" r="7.6" fill={color} />
          <circle cx="9.4" cy="9.8" r="2.1" fill={accent} opacity="0.55" />
        </>
      );
    case 'cherry':
      return (
        <>
          <path d="M12 3 C9 7 6 8 5 10" stroke={accent} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M12 3 C15 7 18 8 19 10" stroke={accent} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <circle cx="6.4" cy="16.4" r="4.4" fill={color} />
          <circle cx="17.4" cy="16.8" r="4" fill={color} />
        </>
      );
    case 'wedge':
      return (
        <>
          <path d="M3 19 L12 4 L21 19 Z" fill={color} />
          <path d="M8 19 L12 12 L16 19 Z" fill={accent} opacity="0.5" />
        </>
      );
    case 'bell':
      return (
        <>
          <path d="M12 3.5 C7.6 3.5 6 7.4 6 11.6 C6 15 4.6 16 4.6 17.2 L19.4 17.2 C19.4 16 18 15 18 11.6 C18 7.4 16.4 3.5 12 3.5 Z" fill={color} />
          <circle cx="12" cy="19.4" r="2" fill={accent} />
        </>
      );
    case 'diamond':
      return (
        <>
          <path d="M12 2.6 L21 10 L12 21.4 L3 10 Z" fill={color} />
          <path d="M12 2.6 L16 10 L12 21.4 L8 10 Z" fill={accent} opacity="0.45" />
        </>
      );
    case 'star':
      return (
        <path
          d="M12 2 L14.7 8.9 L22 9.4 L16.4 14.1 L18.2 21.2 L12 17.3 L5.8 21.2 L7.6 14.1 L2 9.4 L9.3 8.9 Z"
          fill={color}
          stroke={accent}
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      );
    case 'seven':
      return (
        <path
          d="M5.6 3.4 L18.4 3.4 L18.4 7 L12.4 21 L7.6 21 L13.4 7.6 L5.6 7.6 Z"
          fill={color}
          stroke={accent}
          strokeWidth="1"
          strokeLinejoin="round"
        />
      );
    case 'crown':
      return (
        <>
          <path d="M3 18 L4.6 7 L9 12 L12 5 L15 12 L19.4 7 L21 18 Z" fill={color} />
          <rect x="3" y="18" width="18" height="2.8" rx="1" fill={accent} />
        </>
      );
    case 'skull':
      return (
        <>
          <path d="M12 3 C7 3 4 6.6 4 11 C4 13.8 5.4 15.4 6.6 16.4 L6.6 20 L17.4 20 L17.4 16.4 C18.6 15.4 20 13.8 20 11 C20 6.6 17 3 12 3 Z" fill={color} />
          <circle cx="9" cy="11" r="2.1" fill={accent} />
          <circle cx="15" cy="11" r="2.1" fill={accent} />
        </>
      );
    case 'rocket':
      return (
        <>
          <path d="M12 2 C15.4 5.4 16.6 10 16.6 14 L7.4 14 C7.4 10 8.6 5.4 12 2 Z" fill={color} />
          <path d="M7.4 12 L4 17.4 L7.4 16.4 Z M16.6 12 L20 17.4 L16.6 16.4 Z" fill={accent} />
          <circle cx="12" cy="9" r="2.1" fill={accent} />
        </>
      );
    case 'planet':
      return (
        <>
          <circle cx="12" cy="11.4" r="6.4" fill={color} />
          <ellipse cx="12" cy="13" rx="10.6" ry="3" fill="none" stroke={accent} strokeWidth="1.7" />
        </>
      );
    case 'anchor':
      return (
        <>
          <circle cx="12" cy="4.6" r="2.4" fill="none" stroke={color} strokeWidth="1.9" />
          <path d="M12 7 L12 21" stroke={color} strokeWidth="2.1" strokeLinecap="round" />
          <path d="M6 10 L18 10" stroke={accent} strokeWidth="1.9" strokeLinecap="round" />
          <path d="M4.4 15 C4.4 19.4 8 21.4 12 21.4 C16 21.4 19.6 19.4 19.6 15" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" />
        </>
      );
    case 'shell':
      return (
        <>
          <path d="M12 20.6 C5.6 20.6 2.6 15.4 2.6 10.6 C2.6 6.2 6.6 3.4 12 3.4 C17.4 3.4 21.4 6.2 21.4 10.6 C21.4 15.4 18.4 20.6 12 20.6 Z" fill={color} />
          <path d="M12 4 L12 20 M7.4 5.4 L9.4 19.6 M16.6 5.4 L14.6 19.6" stroke={accent} strokeWidth="1.1" fill="none" />
        </>
      );
    case 'leaf':
      return (
        <>
          <path d="M20 3.4 C9.4 3.4 3.4 8.4 3.4 15 C3.4 18 5 20.2 5 20.2 C5 20.2 8.6 13 20 3.4 Z" fill={color} />
          <path d="M5 20.2 C9 12.6 14 7.4 20 3.4" stroke={accent} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </>
      );
    case 'flame':
      return (
        <>
          <path d="M12 2 C13.4 6.4 18 7.6 18 13 C18 17.4 15.4 21 12 21 C8.6 21 6 17.4 6 13 C6 9.4 8.6 8.6 9.4 5.4 C10.4 7.4 11.4 7 12 2 Z" fill={color} />
          <path d="M12 11 C12.8 13.4 14 13.8 14 16 C14 18 13.2 19.6 12 19.6 C10.8 19.6 10 18 10 16 C10 14 11.4 13.4 12 11 Z" fill={accent} />
        </>
      );
    case 'eye':
      return (
        <>
          <path d="M1.6 12 C4.6 6.6 8.4 4.6 12 4.6 C15.6 4.6 19.4 6.6 22.4 12 C19.4 17.4 15.6 19.4 12 19.4 C8.4 19.4 4.6 17.4 1.6 12 Z" fill={color} />
          <circle cx="12" cy="12" r="3.6" fill={accent} />
        </>
      );
    case 'scarab':
      return (
        <>
          <ellipse cx="12" cy="13.4" rx="5.6" ry="7" fill={color} />
          <circle cx="12" cy="5.4" r="2.6" fill={color} />
          <path d="M12 7 L12 20 M6.4 9 L2.6 6.4 M17.6 9 L21.4 6.4 M6.4 16 L2.6 18.6 M17.6 16 L21.4 18.6" stroke={accent} strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </>
      );
    case 'coin':
      return (
        <>
          <circle cx="12" cy="12" r="8.4" fill={color} />
          <circle cx="12" cy="12" r="5.4" fill="none" stroke={accent} strokeWidth="1.5" />
        </>
      );
    case 'clover':
      return (
        <>
          {[
            [12, 7.6],
            [16.4, 12],
            [12, 16.4],
            [7.6, 12],
          ].map(([cx, cy]) => (
            <circle key={`${cx}:${cy}`} cx={cx} cy={cy} r="3.6" fill={color} />
          ))}
          <path d="M12 14 L12 21.4" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case 'bar':
      return (
        <>
          <rect x="2.4" y="8" width="19.2" height="8" rx="1.6" fill={color} />
          <rect x="4.6" y="10.4" width="14.8" height="3.2" rx="0.8" fill={accent} />
        </>
      );
    case 'joker':
      return (
        <>
          <path d="M12 2.6 L16.4 7 L21 8 L18 12 L21 16 L16.4 17 L12 21.4 L7.6 17 L3 16 L6 12 L3 8 L7.6 7 Z" fill={color} />
          <circle cx="12" cy="12" r="2.8" fill={accent} />
        </>
      );
    case 'burst':
      return (
        <path
          d="M12 1.6 L14 9 L21.4 7 L16.6 12 L21.4 17 L14 15 L12 22.4 L10 15 L2.6 17 L7.4 12 L2.6 7 L10 9 Z"
          fill={color}
          stroke={accent}
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      );
    default:
      return <circle cx="12" cy="12" r="7.6" fill={color} />;
  }
}
