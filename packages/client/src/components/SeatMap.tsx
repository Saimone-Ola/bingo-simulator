import { useMemo } from 'react';
import {
  HALL_SEATS,
  HALL_TABLES,
  TABLE_CHARACTER_LABELS,
  type HallSeat,
  type SeatOccupancy,
} from '@bingo/shared';
import { Button } from './ui';

/**
 * Overhead map of the hall, for choosing a seat without walking to it.
 *
 * The brief asks for both: walk up and press, or pick from a map in two
 * clicks. This is the second, and it exists for the same reason a restaurant
 * booking page does — some people want to see the room before committing to a
 * corner of it.
 *
 * It renders occupancy the server sent and nothing it worked out for itself. A
 * seat drawn as free that the server then refuses is a worse experience than a
 * seat drawn as taken, so the map never optimistically claims anything.
 */

export interface SeatMapProps {
  seating: readonly SeatOccupancy[];
  reservations: readonly { seatId: string; holderId: string; expiresAt: number }[];
  mySeatId: string | null;
  myUserId: string | null;
  onTake: (seatId: string) => void;
  onLeave: () => void;
  onReserve: (seatId: string) => void;
  onClose: () => void;
  /** Set while a claim is in flight, so a double click cannot send twice. */
  busy?: boolean;
  error?: string | null;
}

/** Map bounds in world units, with a margin so nothing touches the edge. */
const PAD = 3.1;

function bounds() {
  const xs = HALL_TABLES.map((table) => table.x);
  const zs = HALL_TABLES.map((table) => table.z);
  return {
    minX: Math.min(...xs) - PAD,
    maxX: Math.max(...xs) + PAD,
    minZ: Math.min(...zs) - PAD,
    maxZ: Math.max(...zs) + PAD,
  };
}

export default function SeatMap({
  seating,
  reservations,
  mySeatId,
  myUserId,
  onTake,
  onLeave,
  onReserve,
  onClose,
  busy = false,
  error = null,
}: SeatMapProps) {
  const box = useMemo(bounds, []);
  const width = box.maxX - box.minX;
  const depth = box.maxZ - box.minZ;

  const occupied = useMemo(
    () => new Map(seating.map((row) => [row.seatId, row])),
    [seating],
  );
  const held = useMemo(
    () => new Map(reservations.map((row) => [row.seatId, row])),
    [reservations],
  );

  // Screen coordinates. The stage is at negative Z and the entrance at
  // positive Z, so Z maps straight to Y and the map reads the way the room
  // does when you walk in.
  const sx = (x: number) => ((x - box.minX) / width) * 100;
  const sy = (z: number) => ((z - box.minZ) / depth) * 100;

  const freeCount = HALL_SEATS.length - occupied.size;

  return (
    <div
      className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-surface-500/70 bg-surface-900/95 shadow-panel backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="seatmap-title"
    >
      <div className="flex items-start justify-between gap-3 border-b border-surface-600/70 px-4 py-3">
        <div>
          <h2 id="seatmap-title" className="font-display text-lg font-black">
            Scegli il posto
          </h2>
          <p className="text-2xs text-content-muted">
            {freeCount} liberi su {HALL_SEATS.length} · il palco è in alto
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mySeatId && (
            <Button variant="ghost" size="sm" onClick={onLeave} disabled={busy}>
              Alzati
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Chiudi la mappa">
            ✕
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mx-4 mt-3 rounded-lg border border-warning-500/50 bg-warning-500/10 px-3 py-2 text-sm text-warning-400">
          {error}
        </p>
      )}

      <div className="p-4">
        {/* The stage sits above the map rather than over it: an overlay band
            put seats underneath a label nobody could then read. */}
        <div className="mb-1.5 rounded-lg border border-brand-400/30 bg-brand-500/15 py-1 text-center text-[10px] font-black uppercase tracking-[0.24em] text-brand-300">
          Palco
        </div>
        <div
          className="relative w-full rounded-xl border border-surface-600/70 bg-surface-950/70"
          style={{ aspectRatio: `${width} / ${depth}` }}
        >
          {HALL_TABLES.map((table) => (
            <div
              key={table.index}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${sx(table.x)}%`, top: `${sy(table.z)}%` }}
            >
              <div className="grid h-9 w-9 place-items-center rounded-full border border-surface-500 bg-surface-800 text-2xs font-black text-content-secondary">
                {table.label}
              </div>
              <span className="sr-only">{TABLE_CHARACTER_LABELS[table.character]}</span>
            </div>
          ))}

          {HALL_SEATS.map((seat) => (
            <SeatDot
              key={seat.id}
              seat={seat}
              left={sx(seat.x)}
              top={sy(seat.z)}
              occupant={occupied.get(seat.id)}
              reservedBy={held.get(seat.id)?.holderId ?? null}
              isMine={seat.id === mySeatId}
              myUserId={myUserId}
              disabled={busy}
              onTake={onTake}
              onReserve={onReserve}
            />
          ))}
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-content-muted">
          <Legend className="bg-success-500" label="libero" />
          <Legend className="bg-brand-400" label="giocatore" />
          <Legend className="bg-surface-500" label="ospite della sala" />
          <Legend className="bg-warning-500" label="riservato" />
          {/* Matches how the dot is actually drawn, or the legend is a lie. */}
          <Legend className="bg-white ring-2 ring-accent-400" label="il tuo posto" />
        </ul>
        <p className="mt-2 text-2xs text-content-muted">
          Tieni premuto a lungo un posto libero — o usa il tasto destro — per riservarlo a un amico.
        </p>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </li>
  );
}

function SeatDot({
  seat,
  left,
  top,
  occupant,
  reservedBy,
  isMine,
  myUserId,
  disabled,
  onTake,
  onReserve,
}: {
  seat: HallSeat;
  left: number;
  top: number;
  occupant: SeatOccupancy | undefined;
  reservedBy: string | null;
  isMine: boolean;
  myUserId: string | null;
  disabled: boolean;
  onTake: (seatId: string) => void;
  onReserve: (seatId: string) => void;
}) {
  const mineHeld = reservedBy !== null && reservedBy === myUserId;
  const free = !occupant && (reservedBy === null || mineHeld);

  // Your seat is told apart by size and a ring as well as colour — "reserved"
  // is amber too, and colour alone is never enough to carry a distinction.
  const tone = isMine
    ? 'bg-white ring-[3px] ring-accent-400 scale-150'
    : occupant?.kind === 'NPC'
      ? 'bg-surface-500'
      : occupant
        ? 'bg-brand-400'
        : reservedBy
          ? 'bg-warning-500'
          : 'bg-success-500 hover:scale-125';

  const table = HALL_TABLES[seat.tableIndex]!;
  const label = isMine
    ? 'Il tuo posto'
    : occupant
      ? `${occupant.displayName}${occupant.kind === 'NPC' ? ' (ospite)' : ''}${occupant.disconnected ? ' — disconnesso' : ''}`
      : reservedBy
        ? 'Riservato'
        : `Libero · tavolo ${table.label}, ${TABLE_CHARACTER_LABELS[table.character]}`;

  return (
    <button
      type="button"
      disabled={disabled || (!free && !isMine)}
      title={label}
      aria-label={label}
      onClick={() => free && onTake(seat.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (free) onReserve(seat.id);
      }}
      className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform disabled:cursor-default ${tone} ${
        occupant?.disconnected ? 'opacity-50' : ''
      }`}
      style={{ left: `${left}%`, top: `${top}%` }}
    />
  );
}
