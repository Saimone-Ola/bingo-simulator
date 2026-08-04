import { useMemo } from 'react';
import type { BingoClaimTier, BingoSnapshotPayload } from '@bingo/shared';

/**
 * Flat fallback for browsers that cannot give us WebGL.
 *
 * This is a safety net, not the intended experience: it keeps a player who
 * cannot render the hall fully able to play — same cards, same claims, same
 * server verification — with a plain DOM table and the tabellone.
 */
export default function BingoFallback2D({
  snapshot,
  selectedCard,
  markerColor,
  onSelectCard,
  onMarkCell,
  onClaim,
}: {
  snapshot: BingoSnapshotPayload | null;
  selectedCard: number;
  markerColor: string;
  onSelectCard: (index: number) => void;
  onMarkCell: (cardIndex: number, cellIndex: number, marked: boolean) => void;
  onClaim: (tier: BingoClaimTier) => void;
}) {
  const drawn = useMemo(() => new Set(snapshot?.drawnNumbers ?? []), [snapshot?.drawnNumbers]);
  const card = snapshot?.myCards[selectedCard] ?? snapshot?.myCards[0];
  const marked = useMemo(() => new Set(card?.markedIndices ?? []), [card?.markedIndices]);
  const manual =
    snapshot?.players.find((player) => player.sessionId === snapshot.mySessionId)?.markingMode ===
    'MANUAL';
  const playing = snapshot?.phase === 'PLAYING' || snapshot?.phase === 'EVENT_ACTIVE';

  if (!snapshot) {
    return (
      <div className="grid h-full place-items-center bg-[#0a0714] text-sm text-white/55">
        Connessione alla sala…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0d0918] px-4 pb-40 pt-24">
      <div className="mx-auto max-w-3xl">
        <p className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-100">
          La grafica 3D non è disponibile su questo dispositivo. Stai giocando nella vista
          semplificata: le regole e la verifica del server sono identiche.
        </p>

        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-white/50 bg-gradient-to-br from-amber-200 via-amber-400 to-orange-600 font-display text-3xl font-black text-[#3a1702]">
            {snapshot.currentNumber ?? '—'}
          </div>
          <div className="text-sm">
            <p className="font-black text-white">{snapshot.roomName}</p>
            <p className="text-white/50">{snapshot.drawnNumbers.length}/90 numeri estratti</p>
          </div>
        </div>

        {/* Tabellone */}
        <div className="mt-4 grid grid-cols-15 gap-1 rounded-2xl border border-white/10 bg-black/25 p-3">
          {Array.from({ length: 90 }, (_value, index) => index + 1).map((number) => (
            <span
              key={number}
              className={`grid aspect-square place-items-center rounded text-[10px] font-black ${
                number === snapshot.currentNumber
                  ? 'bg-amber-300 text-[#2a1602]'
                  : drawn.has(number)
                    ? 'bg-violet-500/50 text-white'
                    : 'bg-white/5 text-white/35'
              }`}
            >
              {number}
            </span>
          ))}
        </div>

        {snapshot.myCards.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {snapshot.myCards.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectCard(index)}
                aria-pressed={selectedCard === index}
                className={`rounded-lg border px-3 py-2 text-xs font-black ${
                  selectedCard === index
                    ? 'border-amber-200 bg-amber-300 text-[#2b1703]'
                    : 'border-white/12 bg-white/5 text-white'
                }`}
              >
                Cartella {index + 1}
              </button>
            ))}
          </div>
        )}

        {card ? (
          <div className="mt-4 rounded-xl border-[6px] border-[#ece1c5] bg-[#f8f0da] p-2">
            <div className="grid grid-cols-9 gap-1">
              {card.cells.map((number, cellIndex) => {
                const isMarked = marked.has(cellIndex);
                const isDrawn = number !== null && drawn.has(number);
                const wrong = isMarked && !isDrawn;
                if (number === null) {
                  return (
                    <div
                      key={cellIndex}
                      className="aspect-[1.1] rounded bg-[#d7c8aa]/55"
                      aria-hidden="true"
                    />
                  );
                }
                return (
                  <button
                    key={cellIndex}
                    type="button"
                    disabled={!manual || !playing}
                    onClick={() => onMarkCell(selectedCard, cellIndex, !isMarked)}
                    className={`relative aspect-[1.1] rounded border-2 font-display text-lg font-black text-[#2b2115] ${
                      isDrawn ? 'border-amber-500 bg-[#fff7dd]' : 'border-[#b9a986] bg-[#fffaf0]'
                    }`}
                  >
                    {number}
                    {isMarked && (
                      <span
                        className="absolute inset-[14%] rounded-full border-4 opacity-75"
                        style={{ borderColor: wrong ? '#ef4444' : markerColor }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-white/45">
            Nessuna cartella per questo round.
          </p>
        )}

        {playing && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={snapshot.awardedTiers.includes('CINQUINA')}
              onClick={() => onClaim('CINQUINA')}
              className="flex-1 rounded-xl border border-cyan-300/35 bg-cyan-400/15 px-4 py-3 font-display font-black text-cyan-100 disabled:opacity-35"
            >
              CINQUINA
            </button>
            <button
              type="button"
              disabled={snapshot.awardedTiers.includes('BINGO')}
              onClick={() => onClaim('BINGO')}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-3 font-display text-lg font-black text-[#281502] disabled:opacity-35"
            >
              ★ BINGO
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
