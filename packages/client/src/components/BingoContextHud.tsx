import { useEffect, useRef, useState } from "react";
import type {
  BingoPhase,
  BingoPlayerSummary,
  ItalianBingoCard,
} from "@bingo/shared";
import type { InteractionTarget } from "../three/bingo/PlayerMovementController";
import type { PlayerStance } from "../three/bingo/movement";

/**
 * Thin heads-up display drawn over the hall.
 *
 * Deliberately small: the number, the tabellone, the player list and the round
 * status all exist in the 3D world, so the HUD only carries what a player needs
 * under their thumb — the claim buttons, the card selector and the contextual
 * prompt. Nothing here is a panel that hides the room.
 */

const PROMPT_LABEL: Record<Exclude<InteractionTarget, null>, string> = {
  RECEPTION: "acquistare le cartelle",
  SIT: "sederti al tuo posto",
  STAND: "alzarti dal tavolo",
};

export function InteractionPrompt({ target }: { target: InteractionTarget }) {
  if (!target) return null;
  return (
    <div className="pointer-events-none absolute bottom-32 left-1/2 hidden -translate-x-1/2 rounded-xl border border-content-primary/15 bg-surface-950/65 px-4 py-2 text-center text-sm font-bold text-content-primary shadow-2xl backdrop-blur sm:block">
      <kbd className="mr-2 rounded-md border border-content-primary/25 bg-content-primary/10 px-2 py-0.5 font-mono text-xs">
        E
      </kbd>
      per {PROMPT_LABEL[target]}
    </div>
  );
}

export function Crosshair({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-content-primary/60 shadow-hud"
    />
  );
}

export interface BingoContextHudProps {
  phase: BingoPhase;
  currentNumber: number | null;
  drawnCount: number;
  secondsToNext: number | null;
  countdownSeconds: number | null;
  cards: readonly ItalianBingoCard[];
  selectedCard: number;
  markerColor: string;
  markerColors: readonly string[];
  manualMarking: boolean;
  stance: PlayerStance;
  connected: boolean;
  awardedCinquina: boolean;
  awardedBingo: boolean;
  me: BingoPlayerSummary | undefined;
  onSelectCard: (index: number) => void;
  onSelectMarker: (color: string) => void;
  onClaim: (tier: "CINQUINA" | "BINGO") => void;
  onToggleSeat: () => void;
  onFocusCard: () => void;
  focusCard: boolean;
}

export default function BingoContextHud(props: BingoContextHudProps) {
  const playing = props.phase === "PLAYING" || props.phase === "EVENT_ACTIVE";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-2">
        {/* Left: draw status, mirrored from the stage screen for accessibility */}
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-content-primary/10 bg-surface-900/78 p-2 pr-4 shadow-xl backdrop-blur-md">
          <div
            className="grid h-12 w-12 place-items-center rounded-full border-2 border-content-primary/50 bg-gradient-to-br from-accent-300 via-accent-400 to-accent-600 font-display text-lg font-black text-content-inverse"
            aria-live="polite"
          >
            {props.currentNumber ?? "—"}
          </div>
          <div className="text-xs leading-tight">
            <p className="font-black uppercase tracking-[0.14em] text-info-400">
              {props.countdownSeconds !== null
                ? `Inizio tra ${props.countdownSeconds}s`
                : props.secondsToNext !== null
                  ? `Prossimo tra ${props.secondsToNext <= 0 ? "<1" : props.secondsToNext}s`
                  : "Regia server"}
            </p>
            <p className="text-content-primary/55">
              {props.drawnCount}/90 estratti
            </p>
            {props.cards.length > 0 && (
              <p className="text-content-secondary">
                {props.manualMarking
                  ? "Segni manuali"
                  : "Segnatura assistita · dichiari tu"}
              </p>
            )}
            <p
              className={
                props.connected ? "text-success-400/80" : "text-accent-300"
              }
            >
              {props.connected ? "● sincronizzato" : "○ riconnessione…"}
            </p>
          </div>
        </div>

        {/* Centre: card selector and pens */}
        {props.cards.length > 0 && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border border-content-primary/10 bg-surface-900/78 p-2 shadow-xl backdrop-blur-md">
            {props.cards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                onClick={() => props.onSelectCard(index)}
                aria-pressed={props.selectedCard === index}
                className={`h-9 w-9 rounded-lg border text-xs font-black transition ${
                  props.selectedCard === index
                    ? "border-accent-300 bg-accent-300 text-content-inverse"
                    : "border-content-primary/12 bg-content-primary/5 text-content-primary hover:bg-content-primary/12"
                }`}
              >
                {index + 1}
              </button>
            ))}
            {props.manualMarking && (
              <div className="ml-1 flex items-center gap-1 border-l border-content-primary/10 pl-2">
                {props.markerColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => props.onSelectMarker(color)}
                    aria-label={`Pennarello ${color}`}
                    aria-pressed={props.markerColor === color}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      props.markerColor === color
                        ? "scale-110 border-content-primary"
                        : "border-content-primary/25"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={props.onFocusCard}
              className={`ml-1 rounded-lg border px-2.5 py-2 text-xs font-black transition ${
                props.focusCard
                  ? "border-accent-300 bg-accent-300 text-content-inverse"
                  : "border-content-primary/12 bg-content-primary/5 text-content-primary hover:bg-content-primary/12"
              }`}
            >
              {props.focusCard ? "Guarda la sala" : "Guarda cartella"}
            </button>
          </div>
        )}

        {/* Right: seat toggle and claims */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={props.onToggleSeat}
            className="rounded-xl border border-content-primary/12 bg-surface-900/78 px-3 py-2.5 text-xs font-black text-content-primary shadow-xl backdrop-blur-md hover:bg-content-primary/10"
          >
            {props.stance === "SEATED" ? "↑ Alzati" : "↓ Siediti"}
          </button>
          {playing && (
            <>
              <button
                type="button"
                disabled={
                  !props.connected ||
                  props.awardedCinquina ||
                  props.cards.length === 0
                }
                onClick={() => props.onClaim("CINQUINA")}
                className="rounded-xl border border-info-400/40 bg-info-400/20 px-3 py-2.5 font-display text-sm font-black text-info-400 shadow-xl backdrop-blur-md transition hover:bg-info-400/30 disabled:opacity-30"
              >
                CINQUINA
              </button>
              <button
                type="button"
                disabled={
                  !props.connected ||
                  props.awardedBingo ||
                  props.cards.length === 0
                }
                onClick={() => props.onClaim("BINGO")}
                className="rounded-xl bg-gradient-to-r from-accent-300 to-accent-500 px-4 py-2.5 font-display text-base font-black text-content-inverse shadow-xl transition hover:-translate-y-0.5 disabled:opacity-30"
              >
                ★ BINGO
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact roster shown while the room prepares, collapsible so it never nags. */
export function ReadyRoster({
  players,
  mySessionId,
  open,
  onToggle,
}: {
  players: readonly BingoPlayerSummary[];
  mySessionId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const [ready, total] = players
    .filter((player) => player.participation === "PARTICIPANT")
    .reduce<
      [number, number]
    >((accumulator, player) => [accumulator[0] + (player.ready ? 1 : 0), accumulator[1] + 1], [0,
        0]);

  return (
    <div className="pointer-events-auto relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-content-primary/10 bg-surface-900/82 shadow-xl backdrop-blur-md sm:absolute sm:right-4 sm:top-20 sm:z-20 sm:w-56 sm:max-w-[70vw]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`In sala · ${ready}/${total} pronti`}
        className="flex w-full items-center justify-between gap-1 px-3 py-2 text-left text-2xs font-black uppercase tracking-[0.06em] text-brand-200 hover:bg-content-primary/5 sm:text-xs sm:tracking-[0.16em]"
      >
        <span>In sala · {ready}/{total}<span className="hidden sm:inline"> pronti</span></span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="max-h-64 overflow-y-auto border-t border-content-primary/8 px-2 py-1.5">
          {players.map((player) => (
            <li
              key={player.sessionId}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  player.ready
                    ? "bg-success-400"
                    : player.loading
                      ? "bg-accent-400"
                      : "bg-content-primary/25"
                }`}
              />
              <span
                className={`min-w-0 flex-1 truncate font-bold ${player.sessionId === mySessionId ? "text-accent-300" : "text-content-primary/85"}`}
              >
                {player.isHost && "♛ "}
                {player.displayName}
              </span>
              <span className="shrink-0 text-content-primary/40">
                {player.isNpc
                  ? "Pubblico"
                  : player.purchaseInProgress
                    ? "Acquisto…"
                    : !player.connected
                      ? "Scollegato"
                      : player.participation === "VISITOR"
                        ? "Visitatore"
                        : player.participation === "SPECTATOR"
                          ? "Spettatore"
                          : `${player.cardCount}×`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Toast for server rejections and prizes; auto-dismisses so it never blocks. */
export function HallToast({
  message,
  tone,
  onDismiss,
}: {
  message: string | null;
  tone: "info" | "error" | "prize";
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // The dismiss callback is held in a ref on purpose: the page re-renders on a
  // timer, and depending on the callback identity would restart the countdown
  // every few hundred milliseconds, leaving the toast on screen forever.
  useEffect(() => {
    if (!message) {
      setVisible(false);
      return undefined;
    }
    setVisible(true);
    const timer = window.setTimeout(
      () => {
        setVisible(false);
        dismissRef.current();
      },
      tone === "prize" ? 6_000 : 4_500,
    );
    return () => window.clearTimeout(timer);
  }, [message, tone]);

  if (!message || !visible) return null;

  const palette =
    tone === "prize"
      ? "border-accent-300/40 bg-surface-850/92 text-accent-100"
      : tone === "error"
        ? "border-danger-400/35 bg-surface-850/92 text-danger-400"
        : "border-content-primary/15 bg-surface-900/92 text-content-primary";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-20 z-50 flex justify-center px-4"
      aria-live="assertive"
    >
      <p
        className={`pointer-events-auto max-w-md rounded-2xl border px-4 py-3 text-center text-sm font-bold shadow-2xl backdrop-blur-md ${palette}`}
      >
        {message}
      </p>
    </div>
  );
}
