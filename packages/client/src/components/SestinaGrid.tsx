import { useMemo } from "react";
import { ITALIAN_CARD_COLUMNS } from "@bingo/shared";
import {
  cardToWatch,
  rankCards,
  progressLabel,
  type CardLike,
} from "../lib/sestinaLayout";

/**
 * Six cards at once, without the confusion.
 *
 * The sestina's whole difficulty is that a player cannot scan ninety numbers
 * across six grids while the caller keeps going. Two things make it workable:
 * a layout that fits — 2x3 on a desktop, a scrolling row on a phone — and one
 * card called out as the one to watch, which is computed with the same rules
 * the server scores by.
 *
 * The highlight stays off until something is actually close. A highlight that
 * is always on is a highlight that means nothing.
 */

export interface SestinaGridProps {
  cards: readonly CardLike[];
  drawnNumbers: readonly number[];
  /** Marks the player has made, per card, as cell indices. */
  markedByCard?: readonly (readonly number[])[];
  markStyle?: MarkStyle;
  markColor?: string;
  onToggleCell?: (cardIndex: number, cellIndex: number) => void;
  selectedCard?: number;
  onSelectCard?: (index: number) => void;
}

export const MARK_STYLES = ["CROSS", "CIRCLE", "CHIP", "FILL"] as const;
export type MarkStyle = (typeof MARK_STYLES)[number];

export const MARK_STYLE_LABELS: Record<MarkStyle, string> = {
  CROSS: "Croce",
  CIRCLE: "Cerchio",
  CHIP: "Gettone",
  FILL: "Riempimento",
};

export default function SestinaGrid({
  cards,
  drawnNumbers,
  markedByCard,
  markStyle = "CROSS",
  markColor = "#e2434f",
  onToggleCell,
  selectedCard,
  onSelectCard,
}: SestinaGridProps) {
  const drawn = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);
  const watch = useMemo(() => cardToWatch(cards, drawn), [cards, drawn]);
  const progress = useMemo(() => {
    const ranked = rankCards(cards, drawn);
    return new Map(ranked.map((entry) => [entry.index, entry]));
  }, [cards, drawn]);

  return (
    <div className="grid gap-2">
      {onSelectCard && (
        <div className="flex flex-wrap gap-2">
          {cards.map((_card, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={selectedCard === index}
              onClick={() => onSelectCard(index)}
              className={`rounded-lg border px-4 py-3 text-sm font-bold ${selectedCard === index ? "border-brand-300 bg-brand-500 text-content-primary" : "border-surface-500 bg-surface-850 text-content-secondary"}`}
            >
              Cartella {index + 1}
            </button>
          ))}
        </div>
      )}
      {watch && (
        <p
          aria-live="polite"
          className="rounded-lg border border-accent-400/50 bg-accent-500/15 px-3 py-1.5 text-center text-sm font-bold text-accent-300"
        >
          Cartella {watch.index + 1} · {progressLabel(watch)}
        </p>
      )}

      {/* Scrolling row on a phone, two columns of three on anything wider. */}
      <div
        className={
          selectedCard !== undefined
            ? "overflow-x-auto"
            : "-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
        }
      >
        {cards.map((card, index) =>
          selectedCard !== undefined && selectedCard !== index ? null : (
            <SestinaCard
              key={index}
              card={card}
              index={index}
              drawn={drawn}
              marked={markedByCard?.[index]}
              highlighted={watch?.index === index}
              bestRow={progress.get(index)?.bestRow ?? 0}
              markStyle={markStyle}
              markColor={markColor}
              expanded={selectedCard !== undefined}
              {...(onToggleCell ? { onToggleCell } : {})}
            />
          ),
        )}
      </div>
    </div>
  );
}

function SestinaCard({
  card,
  index,
  drawn,
  marked,
  highlighted,
  bestRow,
  markStyle,
  markColor,
  onToggleCell,
  expanded,
}: {
  card: CardLike;
  index: number;
  drawn: ReadonlySet<number>;
  marked: readonly number[] | undefined;
  highlighted: boolean;
  bestRow: number;
  markStyle: MarkStyle;
  markColor: string;
  onToggleCell?: (cardIndex: number, cellIndex: number) => void;
  expanded?: boolean;
}) {
  const markedSet = useMemo(() => new Set(marked ?? []), [marked]);

  return (
    <section
      aria-label={`Cartella ${index + 1}`}
      className={`${expanded ? "min-w-sm" : "min-w-60 sm:min-w-0"} shrink-0 snap-center rounded-xl border p-1.5 transition-colors ${
        highlighted
          ? "border-accent-400 bg-accent-500/10 shadow-glow-accent"
          : "border-surface-600 bg-surface-850"
      }`}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-2xs font-black uppercase tracking-wider text-content-muted">
          Cartella {index + 1}
        </span>
        <span className="text-2xs tabular text-content-muted">{bestRow}/5</span>
      </div>

      <div
        className="grid gap-px rounded-md bg-surface-700 p-px"
        style={{
          gridTemplateColumns: `repeat(${ITALIAN_CARD_COLUMNS}, minmax(0, 1fr))`,
        }}
      >
        {card.cells.map((value, cellIndex) => (
          <Cell
            key={cellIndex}
            value={value}
            called={value !== null && drawn.has(value)}
            marked={markedSet.has(cellIndex)}
            markStyle={markStyle}
            markColor={markColor}
            expanded={expanded}
            {...(onToggleCell && value !== null
              ? { onClick: () => onToggleCell(index, cellIndex) }
              : {})}
          />
        ))}
      </div>
    </section>
  );
}

function Cell({
  value,
  called,
  marked,
  markStyle,
  markColor,
  onClick,
  expanded,
}: {
  value: number | null;
  called: boolean;
  marked: boolean;
  markStyle: MarkStyle;
  markColor: string;
  onClick?: () => void;
  expanded?: boolean;
}) {
  if (value === null) {
    return (
      <span
        aria-hidden="true"
        className="aspect-square rounded-sm bg-surface-800/60"
      />
    );
  }

  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      aria-label={
        marked
          ? `${value}, segnato`
          : called
            ? `${value}, estratto`
            : String(value)
      }
      className={`relative grid aspect-square place-items-center rounded-sm ${expanded ? "text-xl" : "text-2xs"} font-bold tabular transition-colors ${
        marked
          ? "text-white"
          : called
            ? "bg-brand-500/25 text-content-primary"
            : "bg-surface-900 text-content-secondary"
      }`}
      style={
        marked
          ? markStyle === "FILL"
            ? { backgroundColor: markColor }
            : // A tint so a marked cell reads at a glance even at the size six
              // cards force, without anything sitting over the number.
              { backgroundColor: `${markColor}33` }
          : undefined
      }
    >
      {/*
        The number stays readable under every mark. A marker that hides what it
        marked forces the player to remember the card, which is the one thing
        the card is for.
      */}
      <span className="relative z-10">{value}</span>
      {marked && markStyle !== "FILL" && (
        <Mark style={markStyle} colour={markColor} />
      )}
    </Tag>
  );
}

function Mark({ style, colour }: { style: MarkStyle; colour: string }) {
  if (style === "CHIP") {
    return (
      <span
        aria-hidden="true"
        className="absolute inset-[15%] rounded-full opacity-70"
        style={{ backgroundColor: colour }}
      />
    );
  }
  if (style === "CIRCLE") {
    return (
      <span
        aria-hidden="true"
        className="absolute inset-[8%] rounded-full border-2"
        style={{ borderColor: colour }}
      />
    );
  }
  // Inset and thinner than it looks like it should be. A cross drawn across the
  // whole cell at full weight buries the number underneath it, and a marker
  // that hides what it marked forces the player to remember the card — which is
  // the one thing the card exists to save them from.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 10"
      className="absolute inset-0 h-full w-full opacity-80"
    >
      {/*
        Four corner ticks rather than two full diagonals. Any cross through the
        centre of the cell runs straight through the glyph, and a single digit
        disappears under it entirely — thinning the stroke only made it a
        thinner line through the number. Leaving the middle open reads as a
        cross and leaves the number alone.
      */}
      <path
        d="M1.5 1.5 L3.1 3.1 M8.5 1.5 L6.9 3.1 M1.5 8.5 L3.1 6.9 M8.5 8.5 L6.9 6.9"
        stroke={colour}
        strokeWidth="1.25"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
