import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  normaliseBingoRoomCode,
  type BingoActionRejectedPayload,
  type BingoClaimRejectedPayload,
  type BingoMarkingMode,
  type BingoRoomTier,
  type BingoSnapshotPayload,
  type BingoStartMode,
  type BingoWinnerPayload,
  type RoomBingoConfig,
} from '@bingo/shared';
import { ResponsiblePlayNotice } from '../components/ui';
import { SceneBoundary } from '../components/SceneBoundary';
import {
  cancelBingoStart,
  claimBingo,
  connectToBingo,
  leaveBingo,
  markBingoCell,
  purchaseBingoCards,
  setBingoReady,
  startBingoGame,
  updateBingoConfig,
  type BingoConnectionStatus,
} from '../net/bingoConnection';
import { useAuthStore } from '../store/auth';
import type { BingoMarkInteraction } from '../three/BingoRoomScene';

const BingoRoomScene = lazy(() => import('../three/BingoRoomScene'));

const EMPTY_CONFIG: RoomBingoConfig = {
  minPlayers: 2,
  maxPlayers: 20,
  startMode: 'ALL_READY',
  countdownSeconds: 10,
  cardPrice: 10,
  maxManualCards: 3,
  maxAutomaticCards: 6,
  numberCallInterval: 5_000,
  enabledEvents: [],
  npcCount: 1,
  tier: 'STANDARD',
  chaosLevel: 'LIGHT',
};

const PHASE_LABEL: Record<BingoSnapshotPayload['phase'], string> = {
  WAITING: 'Ingresso',
  CARD_PURCHASE: 'Preparazione',
  COUNTDOWN: 'Partenza',
  PLAYING: 'Partita in corso',
  EVENT_ACTIVE: 'Evento attivo',
  RESULTS: 'Risultati',
  ENDED: 'Fine round',
};

const CLAIM_REJECTION: Record<BingoClaimRejectedPayload['reason'], string> = {
  round_changed: 'Il round è cambiato: controlla le nuove cartelle.',
  wrong_phase: 'La dichiarazione non è disponibile in questa fase.',
  invalid_card: 'La cartella scelta non è valida.',
  incomplete_result: 'Il server ha controllato la cartella: il risultato non è ancora completo.',
  already_awarded: 'Questo premio è già stato assegnato nel round.',
};

const ACTION_REJECTION: Record<BingoActionRejectedPayload['reason'], string> = {
  invalid_payload: 'Richiesta non valida. Controlla quantità e impostazioni.',
  wrong_phase: 'Questa azione non è disponibile nella fase corrente.',
  host_only: 'Solo l’host può modificare questa impostazione.',
  minimum_players: 'Non è stato raggiunto il numero minimo di partecipanti.',
  players_not_ready: 'Alcuni giocatori non sono ancora pronti.',
  cards_required: 'Ogni giocatore deve acquistare almeno una cartella.',
  already_purchased: 'Hai già acquistato le cartelle per questo round.',
  purchase_in_progress: 'Acquisto già in elaborazione.',
  insufficient_credits: 'Crediti virtuali insufficienti per questo pacchetto.',
  manual_marking_only: 'La segnatura è automatica in questa partita.',
  invalid_cell: 'Questa casella non può essere segnata.',
  not_called: 'Il numero non è ancora stato estratto.',
  configuration_locked: 'Le impostazioni sono bloccate durante la partita.',
};

const ROOM_COPY: Record<BingoRoomTier, { title: string; subtitle: string; accent: string }> = {
  ECONOMY: {
    title: 'Sala Sprint',
    subtitle: 'Ritmo rapido, costo ridotto',
    accent: 'from-emerald-400 to-cyan-500',
  },
  STANDARD: {
    title: 'Sala Classica',
    subtitle: 'L’esperienza italiana principale',
    accent: 'from-violet-400 to-indigo-600',
  },
  PREMIUM: {
    title: 'Sala Gran Galà',
    subtitle: 'Atmosfera elegante, premi virtuali maggiori',
    accent: 'from-amber-300 to-orange-500',
  },
};

function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.6rem] border border-white/10 bg-[#15132b]/86 shadow-[0_24px_80px_-32px_rgb(0_0_0_/_0.9)] backdrop-blur-xl ${className}`}
    >
      {children}
    </section>
  );
}

function StatusPill({
  status,
  phase,
}: {
  status: BingoConnectionStatus;
  phase?: BingoSnapshotPayload['phase'];
}) {
  const connected = status === 'connected';
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em]">
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_14px_#34d399]' : 'bg-amber-400'}`} />
      {connected ? PHASE_LABEL[phase ?? 'WAITING'] : status === 'failed' ? 'Rete assente' : 'Connessione'}
    </div>
  );
}

function NumberBall({ number, large = false }: { number: number; large?: boolean }) {
  return (
    <div
      className={`relative grid shrink-0 place-items-center rounded-full border-[5px] border-white/70 bg-[radial-gradient(circle_at_30%_22%,#fff_0_8%,#fff1b7_9%,#ffbe3d_42%,#e86616_78%,#8d2508_100%)] font-display font-black text-[#341300] shadow-[inset_-16px_-18px_24px_rgb(76_17_0_/_0.35),inset_10px_10px_18px_rgb(255_255_255_/_0.7),0_22px_65px_-20px_rgb(255_131_28_/_0.95)] ${large ? 'h-40 w-40 text-6xl sm:h-48 sm:w-48 sm:text-7xl' : 'h-12 w-12 text-base'}`}
      aria-label={`Numero ${number}`}
    >
      <span>{number}</span>
      {large && <span className="absolute bottom-6 text-[9px] uppercase tracking-[0.24em] opacity-60">Bingo 90</span>}
    </div>
  );
}

function PlayersPanel({ snapshot }: { snapshot: BingoSnapshotPayload }) {
  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Tavolo condiviso</p>
          <h2 className="mt-1 font-display text-xl font-black">Partecipanti</h2>
        </div>
        <span className="rounded-full bg-white/7 px-3 py-1 text-xs font-black">
          {snapshot.players.length}/{snapshot.config.maxPlayers}
        </span>
      </div>
      <div className="grid gap-2">
        {snapshot.players.map((player) => (
          <div
            key={player.sessionId}
            className="flex items-center gap-3 rounded-2xl border border-white/7 bg-black/18 p-2.5"
          >
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl font-black text-white ${player.isNpc ? 'bg-gradient-to-br from-amber-400 to-orange-600' : 'bg-gradient-to-br from-violet-400 to-indigo-700'}`}>
              {player.isNpc ? 'AI' : player.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-black">{player.displayName}</p>
                {player.isHost && <span title="Host">♛</span>}
              </div>
              <p className="text-[10px] text-white/50">
                {player.isNpc ? 'NPC della sala' : `Lv. ${player.level}`} · {player.cardCount} cartell{player.cardCount === 1 ? 'a' : 'e'}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-[9px] font-black uppercase tracking-wider ${player.loading ? 'text-amber-300' : player.ready ? 'text-emerald-300' : 'text-white/45'}`}>
                {player.loading ? 'Carica…' : player.ready ? 'Pronto' : 'In attesa'}
              </p>
              <p className="mt-0.5 text-[9px] text-white/35">
                {player.markingMode === 'AUTOMATIC' ? 'Auto' : 'Manuale'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function HostSettings({
  config,
  onChange,
}: {
  config: RoomBingoConfig;
  onChange: (config: RoomBingoConfig) => void;
}) {
  const update = <K extends keyof RoomBingoConfig>(key: K, value: RoomBingoConfig[K]) => {
    const next = { ...config, [key]: value };
    onChange(next);
  };

  return (
    <Panel className="p-5">
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Regia host</p>
        <h2 className="mt-1 font-display text-xl font-black">Impostazioni partita</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-bold text-white/65">
          Sistema di partenza
          <select
            value={config.startMode}
            onChange={(event) => update('startMode', event.target.value as BingoStartMode)}
            className="rounded-xl border border-white/10 bg-[#0c0b1c] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-violet-400"
          >
            <option value="HOST">Manuale dall’host</option>
            <option value="ALL_READY">Quando tutti sono pronti</option>
            <option value="TIMER">Timer programmato</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-white/65">
          Sala
          <select
            value={config.tier}
            onChange={(event) => update('tier', event.target.value as BingoRoomTier)}
            className="rounded-xl border border-white/10 bg-[#0c0b1c] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-violet-400"
          >
            <option value="ECONOMY">Economica</option>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium virtuale</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-white/65">
          Conto alla rovescia
          <select
            value={config.countdownSeconds}
            onChange={(event) => update('countdownSeconds', Number(event.target.value))}
            className="rounded-xl border border-white/10 bg-[#0c0b1c] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-violet-400"
          >
            <option value={5}>5 secondi (demo)</option>
            <option value={30}>30 secondi</option>
            <option value={60}>60 secondi</option>
            <option value={90}>90 secondi</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-white/65">
          Livello di caos
          <select
            value={config.chaosLevel}
            onChange={(event) => update('chaosLevel', event.target.value as RoomBingoConfig['chaosLevel'])}
            className="rounded-xl border border-white/10 bg-[#0c0b1c] px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-violet-400"
          >
            <option value="CLASSIC">Classico</option>
            <option value="LIGHT">Leggero</option>
            <option value="CHAOTIC">Caotico</option>
            <option value="ABSURD">Assurdo</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-white/65">
          NPC ai posti liberi: {config.npcCount}
          <input
            type="range"
            min={0}
            max={6}
            value={config.npcCount}
            onChange={(event) => update('npcCount', Number(event.target.value))}
            className="accent-violet-400"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-white/65">
          Ritmo chiamata: {(config.numberCallInterval / 1_000).toFixed(1)} s
          <input
            type="range"
            min={2_500}
            max={12_000}
            step={500}
            value={config.numberCallInterval}
            onChange={(event) => update('numberCallInterval', Number(event.target.value))}
            className="accent-amber-400"
          />
        </label>
      </div>
    </Panel>
  );
}

function PurchasePanel({
  snapshot,
  quantity,
  mode,
  onQuantity,
  onMode,
}: {
  snapshot: BingoSnapshotPayload;
  quantity: number;
  mode: BingoMarkingMode;
  onQuantity: (quantity: number) => void;
  onMode: (mode: BingoMarkingMode) => void;
}) {
  const me = snapshot.players.find((player) => player.sessionId === snapshot.mySessionId);
  const limit =
    mode === 'MANUAL' ? snapshot.config.maxManualCards : snapshot.config.maxAutomaticCards;
  const total = quantity * snapshot.config.cardPrice;
  const alreadyBought = (me?.cardCount ?? 0) > 0;

  return (
    <Panel className="overflow-hidden">
      <div className={`bg-gradient-to-r ${ROOM_COPY[snapshot.config.tier].accent} px-5 py-4 text-[#150e25]`}>
        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Acquisto con soli crediti virtuali</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-black">{ROOM_COPY[snapshot.config.tier].title}</h2>
            <p className="text-xs font-bold opacity-70">{ROOM_COPY[snapshot.config.tier].subtitle}</p>
          </div>
          <p className="text-lg font-black">{snapshot.config.cardPrice} crediti / cartella</p>
        </div>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_17rem]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">1. Modalità di segnatura</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(['MANUAL', 'AUTOMATIC'] as const).map((option) => (
              <button
                key={option}
                type="button"
                disabled={alreadyBought}
                onClick={() => {
                  onMode(option);
                  onQuantity(Math.min(quantity, option === 'MANUAL' ? snapshot.config.maxManualCards : snapshot.config.maxAutomaticCards));
                }}
                className={`rounded-2xl border p-4 text-left transition ${mode === option ? 'border-violet-300 bg-violet-400/15 shadow-[0_0_30px_-14px_#a78bfa]' : 'border-white/8 bg-white/3 hover:bg-white/6'} disabled:opacity-60`}
              >
                <p className="font-display text-lg font-black">{option === 'MANUAL' ? '✎ Manuale' : '✦ Automatica'}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/55">
                  {option === 'MANUAL'
                    ? 'Sei tu a segnare: puoi anche commettere e correggere errori.'
                    : 'Il server evidenzia soltanto i numeri realmente estratti.'}
                </p>
              </button>
            ))}
          </div>

          <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-white/55">2. Scegli il pacchetto</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 3, 6].map((count) => (
              <button
                key={count}
                type="button"
                disabled={alreadyBought || count > limit}
                onClick={() => onQuantity(count)}
                className={`min-w-20 rounded-xl border px-4 py-3 font-display text-lg font-black transition ${quantity === count ? 'border-amber-300 bg-amber-300 text-[#241406]' : 'border-white/10 bg-white/4 hover:bg-white/8'} disabled:cursor-not-allowed disabled:opacity-25`}
              >
                × {count}
              </button>
            ))}
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 text-xs font-bold text-white/55">
              Altro
              <input
                type="number"
                min={1}
                max={limit}
                disabled={alreadyBought}
                value={quantity}
                onChange={(event) => onQuantity(Math.max(1, Math.min(limit, Number(event.target.value) || 1)))}
                className="w-12 bg-transparent py-3 text-center text-base font-black text-white outline-none"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-white/45">
            Limite {mode === 'MANUAL' ? 'manuale' : 'automatico'}: {limit} cartelle.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/22 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Riepilogo</p>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between"><dt className="text-white/55">Quantità</dt><dd className="font-black">{quantity}</dd></div>
            <div className="flex justify-between"><dt className="text-white/55">Costo unitario</dt><dd className="font-black">{snapshot.config.cardPrice}</dd></div>
            <div className="flex justify-between border-t border-white/8 pt-2"><dt className="text-white/75">Totale</dt><dd className="font-display text-xl font-black text-amber-300">{total} cr</dd></div>
            <div className="flex justify-between"><dt className="text-white/55">Saldo dopo</dt><dd className={`font-black ${(me?.balance ?? 0) - total < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{(me?.balance ?? 0) - total} cr</dd></div>
          </dl>
          <button
            type="button"
            disabled={alreadyBought || total > (me?.balance ?? 0)}
            onClick={() => purchaseBingoCards(quantity, mode)}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-3 font-display text-base font-black text-[#241406] shadow-[0_14px_35px_-18px_#fb923c] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {alreadyBought ? '✓ Cartelle acquistate' : 'Conferma acquisto'}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function Countdown({ snapshot, now }: { snapshot: BingoSnapshotPayload; now: number }) {
  const seconds = Math.max(0, Math.ceil(((snapshot.countdownEndsAt ?? now) - now) / 1_000));
  return (
    <Panel className="relative overflow-hidden p-8 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgb(124_58_237_/_0.28),transparent_58%)]" />
      <div className="relative">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">Tutti ai propri posti</p>
        <div className="mx-auto mt-5 grid h-48 w-48 place-items-center rounded-full border-8 border-violet-300/25 bg-black/25 font-display text-8xl font-black text-white shadow-[0_0_80px_-20px_#8b5cf6]">
          {seconds}
        </div>
        <h2 className="mt-5 font-display text-3xl font-black">La partita sta per iniziare</h2>
        <p className="mt-2 text-sm text-white/55">Cartelle bloccate · Seed server verificato · Sincronizzazione attiva</p>
        {snapshot.mySessionId === snapshot.hostSessionId && (
          <button
            type="button"
            onClick={cancelBingoStart}
            className="mt-5 rounded-xl border border-red-300/35 bg-red-400/10 px-5 py-2.5 text-sm font-black text-red-200 hover:bg-red-400/20"
          >
            Annulla conto alla rovescia
          </button>
        )}
      </div>
    </Panel>
  );
}


function playMarkerSound(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(165, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(95, context.currentTime + 0.055);
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.065);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.07);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch {
    // Audio feedback is progressive enhancement; marking must always continue.
  }
}

function ImmersiveGame({
  snapshot,
  selectedCard,
  onSelectedCard,
  markerColor,
  onMarkerColor,
  now,
  reducedMotion,
  onClassicView,
}: {
  snapshot: BingoSnapshotPayload;
  selectedCard: number;
  onSelectedCard: (index: number) => void;
  markerColor: string;
  onMarkerColor: (color: string) => void;
  now: number;
  reducedMotion: boolean;
  onClassicView: () => void;
}) {
  const [focusCard, setFocusCard] = useState(false);
  const [lastMark, setLastMark] = useState<BingoMarkInteraction | null>(null);
  const card = snapshot.myCards[selectedCard] ?? snapshot.myCards[0];
  const me = snapshot.players.find((player) => player.sessionId === snapshot.mySessionId);
  const seconds = Math.max(0, Math.ceil(((snapshot.nextDrawAt ?? now) - now) / 1_000));
  const manual = me?.markingMode === 'MANUAL';

  const markCell = (cellIndex: number, marked: boolean) => {
    if (!manual || !card) return;
    playMarkerSound();
    setLastMark({ cellIndex, token: Date.now() });
    markBingoCell(snapshot.round, selectedCard, cellIndex, marked);
  };

  return (
    <section
      className="relative min-h-[650px] overflow-hidden rounded-[1.8rem] border border-violet-300/20 bg-[#0c0914] shadow-[0_28px_100px_-28px_rgb(0_0_0_/_0.95)]"
      aria-label="Sala Bingo 3D in prima persona"
    >
      <div className="absolute inset-0">
        <SceneBoundary>
          <Suspense
            fallback={
              <div className="grid h-full place-items-center bg-[#0c0914] text-sm text-white/55">
                Preparazione della sala 3D…
              </div>
            }
          >
            <BingoRoomScene
              card={card}
              cardIndex={selectedCard}
              currentNumber={snapshot.currentNumber}
              drawnNumbers={snapshot.drawnNumbers}
              players={snapshot.players}
              manualMarking={manual}
              markerColor={markerColor}
              focusCard={focusCard}
              reducedMotion={reducedMotion}
              lastMark={lastMark}
              onMarkCell={markCell}
              onSelectMarker={onMarkerColor}
            />
          </Suspense>
        </SceneBoundary>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 bg-gradient-to-b from-black/72 via-black/25 to-transparent p-4 sm:p-5">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111020]/78 p-2.5 pr-4 shadow-xl backdrop-blur-xl">
          <div className="grid h-16 w-16 place-items-center rounded-full border-4 border-white/55 bg-gradient-to-br from-amber-200 via-amber-400 to-orange-600 font-display text-2xl font-black text-[#3a1702] shadow-[0_0_35px_-12px_#f59e0b]">
            {snapshot.currentNumber ?? '—'}
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Regia server</p>
            <p className="font-display text-lg font-black">Prossimo tra {seconds === 0 ? '<1' : seconds}s</p>
            <p className="text-[10px] text-white/45">{snapshot.drawnNumbers.length}/90 estratti</p>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setFocusCard((value) => !value)}
            className={`rounded-xl border px-4 py-2.5 text-xs font-black shadow-xl backdrop-blur-xl transition ${focusCard ? 'border-amber-200 bg-amber-300 text-[#2d1703]' : 'border-white/12 bg-black/55 text-white hover:bg-black/75'}`}
          >
            {focusCard ? '↑ Guarda il palco' : '↓ Concentrati sulla cartella'}
          </button>
          <button
            type="button"
            onClick={onClassicView}
            className="rounded-xl border border-white/12 bg-black/55 px-4 py-2.5 text-xs font-black shadow-xl backdrop-blur-xl hover:bg-black/75"
          >
            Vista classica 2D
          </button>
        </div>
      </div>

      {!focusCard && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/55 shadow-[0_0_8px_#fff]" />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/55 to-transparent px-4 pb-4 pt-20 sm:px-5 sm:pb-5">
        <div className="pointer-events-auto grid gap-3 rounded-2xl border border-white/10 bg-[#111020]/82 p-3 shadow-2xl backdrop-blur-xl lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="mr-1">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-300">
                {manual ? 'Interazione manuale' : 'Segnatura automatica'}
              </p>
              <p className="text-[10px] text-white/45">
                {focusCard
                  ? manual
                    ? 'Premi direttamente i numeri sulla cartella 3D.'
                    : 'Il server segna i numeri corretti.'
                  : 'Trascina per guardarti intorno · frecce/WASD · controller.'}
              </p>
            </div>

            {snapshot.myCards.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectedCard(index)}
                className={`rounded-lg border px-3 py-2 text-[11px] font-black transition ${selectedCard === index ? 'border-amber-200 bg-amber-300 text-[#2b1703]' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                Cartella {index + 1}
              </button>
            ))}

            {manual && (
              <div className="ml-1 flex items-center gap-1.5 rounded-lg border border-white/8 bg-black/25 px-2 py-1.5">
                {['#ef4444', '#2563eb', '#16a34a', '#7c3aed'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onMarkerColor(color)}
                    aria-label={`Scegli pennarello ${color}`}
                    className={`h-7 w-7 rounded-full border-2 transition ${markerColor === color ? 'scale-110 border-white' : 'border-white/20'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={snapshot.awardedTiers.includes('CINQUINA')}
              onClick={() => claimBingo(snapshot.round, 'CINQUINA', selectedCard)}
              className="rounded-xl border border-cyan-300/35 bg-cyan-400/15 px-4 py-3 font-display text-sm font-black text-cyan-100 hover:bg-cyan-400/25 disabled:opacity-35"
            >
              CINQUINA
            </button>
            <button
              type="button"
              disabled={snapshot.awardedTiers.includes('BINGO')}
              onClick={() => claimBingo(snapshot.round, 'BINGO', selectedCard)}
              className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-5 py-3 font-display text-lg font-black text-[#281502] shadow-[0_12px_30px_-16px_#fb923c] hover:-translate-y-0.5 disabled:opacity-35"
            >
              ★ BINGO
            </button>
          </div>
        </div>

        <div className="mt-2 flex min-h-8 items-center justify-center gap-1.5">
          {snapshot.drawnNumbers.slice(-5).reverse().map((number) => (
            <span key={number} className="grid h-8 w-8 place-items-center rounded-full border-2 border-white/50 bg-amber-300 text-[11px] font-black text-[#351703] shadow-lg">
              {number}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function GameTable({
  snapshot,
  selectedCard,
  onSelectedCard,
  markerColor,
  onMarkerColor,
  now,
}: {
  snapshot: BingoSnapshotPayload;
  selectedCard: number;
  onSelectedCard: (index: number) => void;
  markerColor: string;
  onMarkerColor: (color: string) => void;
  now: number;
}) {
  const card = snapshot.myCards[selectedCard] ?? snapshot.myCards[0];
  const drawn = useMemo(() => new Set(snapshot.drawnNumbers), [snapshot.drawnNumbers]);
  const seconds = Math.max(0, Math.ceil(((snapshot.nextDrawAt ?? now) - now) / 1_000));
  const me = snapshot.players.find((player) => player.sessionId === snapshot.mySessionId);
  const marked = new Set(card?.markedIndices ?? []);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel className="overflow-hidden">
        <div className="grid gap-5 border-b border-white/8 bg-black/18 p-5 md:grid-cols-[13rem_1fr]">
          <div className="grid min-h-56 place-items-center rounded-[1.8rem] border border-amber-300/18 bg-[radial-gradient(circle_at_center,#3c235c,#100d23_72%)] p-4">
            {snapshot.currentNumber ? (
              <div className="grid place-items-center gap-3" aria-live="assertive">
                <NumberBall number={snapshot.currentNumber} large />
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Numero estratto</p>
              </div>
            ) : (
              <p className="font-display text-2xl font-black text-white/45">Prima estrazione…</p>
            )}
          </div>
          <div className="flex min-w-0 flex-col justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Regia server · Round {snapshot.round}</p>
                  <h2 className="mt-1 font-display text-2xl font-black">
                    Prossimo numero tra {seconds === 0 ? '<1' : seconds} s
                  </h2>
                  <p className="mt-1 text-xs text-white/50">
                    {me?.markingMode === 'MANUAL'
                      ? 'Scegli un pennarello e premi le caselle. Gli errori restano visibili e possono essere cancellati.'
                      : 'Segnatura automatica attiva: vengono marcati solo i numeri verificati.'}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  ● Sincronizzato
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/7">
                <div className="h-full bg-gradient-to-r from-violet-500 via-cyan-400 to-amber-300 transition-all" style={{ width: `${(snapshot.drawnNumbers.length / 90) * 100}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-white/40">
                <span>{snapshot.drawnNumbers.length} estratti</span><span>90 totali</span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Ultimi numeri</p>
              <div className="flex min-h-12 flex-wrap gap-2">
                {snapshot.drawnNumbers.slice(-5).reverse().map((number) => <NumberBall key={number} number={number} />)}
                {snapshot.drawnNumbers.length === 0 && <p className="self-center text-xs text-white/35">Lo storico apparirà qui.</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[linear-gradient(135deg,rgb(83_50_33_/_0.55),rgb(30_19_32_/_0.9))] p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {snapshot.myCards.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectedCard(index)}
                  className={`rounded-xl border px-4 py-2 text-xs font-black transition ${selectedCard === index ? 'border-amber-200 bg-amber-300 text-[#2b1805]' : 'border-white/10 bg-black/25 hover:bg-white/8'}`}
                >
                  Cartella {index + 1}
                </button>
              ))}
            </div>
            {me?.markingMode === 'MANUAL' && (
              <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-white/45">Pennarello</span>
                {['#ef4444', '#2563eb', '#16a34a', '#7c3aed'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onMarkerColor(color)}
                    aria-label={`Pennarello ${color}`}
                    className={`h-6 w-6 rounded-full border-2 transition ${markerColor === color ? 'scale-110 border-white' : 'border-white/20'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </div>

          {card ? (
            <div className="mx-auto max-w-[860px] rounded-xl border-[6px] border-[#ece1c5] bg-[#f8f0da] p-2 shadow-[0_24px_50px_-24px_#000] sm:p-3">
              <div className="mb-2 grid grid-cols-9 gap-1">
                {['1–9', '10', '20', '30', '40', '50', '60', '70', '80–90'].map((label) => (
                  <div key={label} className="py-1 text-center text-[8px] font-black uppercase text-[#6b5434] sm:text-[10px]">{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-9 gap-1" aria-label={`Cartella italiana ${selectedCard + 1}`}>
                {card.cells.map((number, cellIndex) => {
                  const isMarked = marked.has(cellIndex);
                  const isDrawn = number !== null && drawn.has(number);
                  const wrong = isMarked && !isDrawn;
                  return number === null ? (
                    <div key={cellIndex} className="aspect-[1.12] rounded-md bg-[#d7c8aa]/55" aria-hidden="true" />
                  ) : (
                    <button
                      key={cellIndex}
                      type="button"
                      disabled={me?.markingMode !== 'MANUAL'}
                      onClick={() => markBingoCell(snapshot.round, selectedCard, cellIndex, !isMarked)}
                      className={`relative aspect-[1.12] overflow-hidden rounded-md border-2 font-display text-base font-black text-[#2b2115] transition sm:text-2xl ${isDrawn ? 'border-amber-500 bg-[#fff7dd]' : 'border-[#b9a986] bg-[#fffaf0]'} ${me?.markingMode === 'MANUAL' ? 'hover:-translate-y-0.5 hover:shadow-md' : 'cursor-default'}`}
                    >
                      {number}
                      {isMarked && (
                        <span
                          className={`absolute inset-[12%] rounded-full border-[5px] opacity-75 ${wrong ? 'border-dashed' : ''}`}
                          style={{ borderColor: wrong ? '#ef4444' : markerColor, transform: `rotate(${(cellIndex % 5) - 2}deg)` }}
                        />
                      )}
                      {wrong && <span className="absolute right-0.5 top-0 text-[8px] font-black text-red-600">!</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-white/15 text-sm text-white/45">Nessuna cartella assegnata.</div>
          )}
          <div className="mx-auto mt-3 flex max-w-[860px] items-center justify-between text-[10px] text-white/40">
            <span>Seed pubblico: {snapshot.seedHash}</span>
            <span>{me?.markingMode === 'AUTOMATIC' ? '✦ Modalità automatica' : '✎ Modalità manuale'}</span>
          </div>
        </div>
      </Panel>

      <div className="grid content-start gap-3">
        <Panel className="p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Dichiarazioni</p>
          <button
            type="button"
            disabled={snapshot.awardedTiers.includes('CINQUINA')}
            onClick={() => claimBingo(snapshot.round, 'CINQUINA', selectedCard)}
            className="mt-3 w-full rounded-xl border border-cyan-300/25 bg-cyan-400/12 px-4 py-4 font-display text-xl font-black text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-35"
          >
            CINQUINA
          </button>
          <button
            type="button"
            disabled={snapshot.awardedTiers.includes('BINGO')}
            onClick={() => claimBingo(snapshot.round, 'BINGO', selectedCard)}
            className="mt-2 w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-5 font-display text-2xl font-black text-[#281502] shadow-[0_18px_45px_-20px_#fb923c] transition hover:-translate-y-0.5 disabled:opacity-35"
          >
            ★ BINGO
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            Il server verifica i numeri estratti sulla cartella originale. Le caselle segnate nel browser non possono falsificare la vincita.
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Montepremi virtuale</p>
          <p className="mt-1 font-display text-3xl font-black text-amber-300">{snapshot.potCredits} cr</p>
          <p className="mt-1 text-[10px] text-white/40">Nessun valore monetario reale o convertibile.</p>
        </Panel>
      </div>
    </div>
  );
}

export default function BingoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((state) => state.accessToken);
  const roomCode = useMemo(
    () => normaliseBingoRoomCode(searchParams.get('room') ?? 'TESI-2026'),
    [searchParams],
  );

  const [status, setStatus] = useState<BingoConnectionStatus>('connecting');
  const [snapshot, setSnapshot] = useState<BingoSnapshotPayload | null>(null);
  const [winner, setWinner] = useState<BingoWinnerPayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<BingoMarkingMode>('MANUAL');
  const [selectedCard, setSelectedCard] = useState(0);
  const [markerColor, setMarkerColor] = useState('#2563eb');
  const [hostConfig, setHostConfig] = useState<RoomBingoConfig>(EMPTY_CONFIG);
  const [copied, setCopied] = useState(false);
  const [immersive, setImmersive] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;

    void connectToBingo(accessToken, roomCode, {
      onStatus: (next) => active && setStatus(next),
      onSnapshot: (next) => {
        if (!active) return;
        setSnapshot(next);
        setHostConfig(next.config);
        setSelectedCard((current) => Math.min(current, Math.max(0, next.myCards.length - 1)));
        if (next.phase === 'CARD_PURCHASE') setWinner(null);
      },
      onBall: (payload) => {
        if (!active) return;
        setNotice(null);
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(`Numero ${payload.number}`);
          utterance.lang = 'it-IT';
          utterance.rate = 0.9;
          utterance.volume = 0.85;
          window.speechSynthesis.speak(utterance);
        }
      },
      onWinner: (payload) => {
        if (!active) return;
        setWinner(payload);
        setNotice(null);
      },
      onClaimRejected: (payload) => active && setNotice(CLAIM_REJECTION[payload.reason]),
      onActionRejected: (payload) => active && setNotice(ACTION_REJECTION[payload.reason]),
    }).catch(() => {
      if (active) {
        setStatus('failed');
        setNotice('Impossibile entrare nella sala. Riprova tra qualche secondo.');
      }
    });

    return () => {
      active = false;
      void leaveBingo();
    };
  }, [accessToken, roomCode]);

  const me = snapshot?.players.find((player) => player.sessionId === snapshot.mySessionId);
  const isHost = snapshot?.mySessionId === snapshot?.hostSessionId;

  const saveHostConfig = (next: RoomBingoConfig) => {
    setHostConfig(next);
    updateBingoConfig({
      startMode: next.startMode,
      countdownSeconds: next.countdownSeconds,
      numberCallInterval: next.numberCallInterval,
      npcCount: next.npcCount,
      tier: next.tier,
      chaosLevel: next.chaosLevel,
    });
  };

  const invite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  };

  const newRoom = () => {
    const code = `TESI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    navigate(`/bingo?room=${code}`);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080713] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_0%,rgb(124_58_237_/_0.24),transparent_35%),radial-gradient(circle_at_90%_20%,rgb(245_158_11_/_0.13),transparent_28%),linear-gradient(#080713,#0d0b1d)]" />

      <header className="relative z-10 border-b border-white/8 bg-black/22 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-7">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/hub')} className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 font-black hover:bg-white/10" aria-label="Torna alla piazza">←</button>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-300">BingoVerse · Sala multiplayer</p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl font-black sm:text-2xl">{snapshot?.roomName ?? 'Sala Bingo Italiano'}</h1>
                <span className="rounded-md bg-violet-400/15 px-2 py-1 font-mono text-[10px] font-black text-violet-200">{roomCode}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} phase={snapshot?.phase} />
            <button type="button" onClick={invite} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black hover:bg-white/10">{copied ? '✓ Link copiato' : '⇧ Invita amici'}</button>
            <button type="button" onClick={newRoom} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black hover:bg-white/10">+ Nuova sala</button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1540px] px-4 py-5 lg:px-7">
        {!snapshot ? (
          <Panel className="grid min-h-[60vh] place-items-center p-8 text-center">
            <div>
              <div className="mx-auto h-14 w-14 animate-pulse rounded-full bg-violet-400 shadow-[0_0_45px_#8b5cf6]" />
              <h2 className="mt-5 font-display text-2xl font-black">Preparazione della sala</h2>
              <p className="mt-2 text-sm text-white/45">Sincronizzazione con la regia server…</p>
            </div>
          </Panel>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid content-start gap-5">
              {snapshot.phase === 'CARD_PURCHASE' && (
                <>
                  <PurchasePanel snapshot={snapshot} quantity={quantity} mode={mode} onQuantity={setQuantity} onMode={setMode} />
                  <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
                    {isHost ? (
                      <HostSettings config={hostConfig} onChange={saveHostConfig} />
                    ) : (
                      <Panel className="p-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Configurazione host</p>
                        <h2 className="mt-1 font-display text-xl font-black">{ROOM_COPY[snapshot.config.tier].title}</h2>
                        <p className="mt-2 text-sm text-white/50">
                          Partenza: {snapshot.config.startMode === 'HOST' ? 'manuale' : snapshot.config.startMode === 'ALL_READY' ? 'tutti pronti' : 'programmata'} · Caos: {snapshot.config.chaosLevel.toLowerCase()}.
                        </p>
                      </Panel>
                    )}
                    <Panel className="p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Il tuo stato</p>
                      <p className="mt-2 text-sm text-white/55">Saldo virtuale</p>
                      <p className="font-display text-3xl font-black text-amber-300">{me?.balance ?? 0} cr</p>
                      <button
                        type="button"
                        disabled={(me?.cardCount ?? 0) === 0}
                        onClick={() => setBingoReady(!me?.ready)}
                        className={`mt-4 w-full rounded-xl px-4 py-3 font-display text-base font-black transition disabled:opacity-35 ${me?.ready ? 'border border-white/10 bg-white/7 text-white' : 'bg-emerald-400 text-[#08251b] shadow-[0_15px_35px_-18px_#34d399]'}`}
                      >
                        {me?.ready ? 'Annulla pronto' : '✓ Sono pronto'}
                      </button>
                      {isHost && snapshot.config.startMode === 'HOST' && (
                        <button
                          type="button"
                          disabled={(me?.cardCount ?? 0) === 0}
                          onClick={startBingoGame}
                          className="mt-2 w-full rounded-xl bg-gradient-to-r from-violet-400 to-indigo-600 px-4 py-3 font-display font-black shadow-[0_15px_35px_-18px_#8b5cf6] disabled:opacity-35"
                        >
                          Avvia partita
                        </button>
                      )}
                    </Panel>
                  </div>
                </>
              )}

              {snapshot.phase === 'COUNTDOWN' && <Countdown snapshot={snapshot} now={now} />}

              {(snapshot.phase === 'PLAYING' || snapshot.phase === 'EVENT_ACTIVE') && (
                immersive ? (
                  <ImmersiveGame
                    snapshot={snapshot}
                    selectedCard={selectedCard}
                    onSelectedCard={setSelectedCard}
                    markerColor={markerColor}
                    onMarkerColor={setMarkerColor}
                    now={now}
                    reducedMotion={reducedMotion}
                    onClassicView={() => setImmersive(false)}
                  />
                ) : (
                  <div className="grid gap-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setImmersive(true)}
                        className="rounded-xl border border-violet-300/25 bg-violet-400/12 px-4 py-2.5 text-xs font-black text-violet-100 hover:bg-violet-400/20"
                      >
                        Entra nella sala 3D
                      </button>
                    </div>
                    <GameTable snapshot={snapshot} selectedCard={selectedCard} onSelectedCard={setSelectedCard} markerColor={markerColor} onMarkerColor={setMarkerColor} now={now} />
                  </div>
                )
              )}

              {(snapshot.phase === 'RESULTS' || snapshot.phase === 'ENDED') && (
                <Panel className="relative grid min-h-[60vh] place-items-center overflow-hidden p-8 text-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgb(245_158_11_/_0.24),transparent_55%)]" />
                  <div className="relative">
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">Risultato verificato dal server</p>
                    <h2 className="mt-4 font-display text-5xl font-black">{winner ? `${winner.tier}!` : 'Round concluso'}</h2>
                    {winner && (
                      <>
                        <p className="mt-3 text-xl font-black">{winner.displayName}</p>
                        <p className="mt-2 text-sm text-white/55">Premio virtuale: {winner.prizeCredits} crediti</p>
                      </>
                    )}
                    <p className="mt-5 text-sm text-white/45">La sala prepara automaticamente il round successivo.</p>
                  </div>
                </Panel>
              )}
            </div>
            <PlayersPanel snapshot={snapshot} />
          </div>
        )}
      </div>

      {(notice || winner) && snapshot?.phase !== 'RESULTS' && snapshot?.phase !== 'ENDED' && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4" aria-live="assertive">
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              if (winner?.tier === 'CINQUINA') setWinner(null);
            }}
            className={`max-w-xl rounded-2xl border px-5 py-4 text-center shadow-2xl backdrop-blur-xl ${winner ? 'border-amber-200/35 bg-[#3b2409]/95 text-amber-100' : 'border-red-300/25 bg-[#26131b]/95 text-red-100'}`}
          >
            {winner ? (
              <>
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Premio convalidato</span>
                <strong className="mt-1 block font-display text-xl">{winner.tier} di {winner.displayName} · +{winner.prizeCredits} cr</strong>
              </>
            ) : notice}
          </button>
        </div>
      )}

      <ResponsiblePlayNotice className="relative z-10 mx-auto max-w-5xl px-4 pb-5" />
    </main>
  );
}
