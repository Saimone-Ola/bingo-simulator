import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  normaliseBingoRoomCode,
  type BingoActionRejectedPayload,
  type BingoClaimRejectedPayload,
  type BingoClaimTier,
  type BingoMarkingMode,
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
  type RoomBingoConfig,
} from '@bingo/shared';
import { ResponsiblePlayNotice } from '../components/ui';
import BingoContextHud, {
  Crosshair,
  HallToast,
  InteractionPrompt,
  ReadyRoster,
} from '../components/BingoContextHud';
import {
  HostPanel,
  PurchasePanel,
  ReadyPanel,
  SettingsPanel,
} from '../components/BingoHallPanels';
import TouchJoystick from '../components/TouchJoystick';
import {
  disposeHallAudio,
  playHallSfx,
  resumeHallAudio,
  setHallVolume,
  startHallAmbience,
  stopHallAmbience,
} from '../audio/hallAudio';
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
import { useHallSettings } from '../store/hallSettings';
import type { InteractionTarget } from '../three/bingo/PlayerMovementController';
import type { PlayerStance } from '../three/bingo/movement';
import { MARKER_COLORS } from '../three/BingoRoomScene';
import BingoFallback2D from '../components/BingoFallback2D';

const BingoRoomScene = lazy(() => import('../three/BingoRoomScene'));
const AvatarCustomizer = lazy(() => import('../components/AvatarCustomizer'));

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

type OpenPanel = 'NONE' | 'PURCHASE' | 'HOST' | 'SETTINGS';

export default function BingoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((state) => state.accessToken);
  const roomCode = useMemo(
    () => normaliseBingoRoomCode(searchParams.get('room') ?? 'TESI-2026'),
    [searchParams],
  );

  const settings = useHallSettings();

  const [status, setStatus] = useState<BingoConnectionStatus>('connecting');
  const [snapshot, setSnapshot] = useState<BingoSnapshotPayload | null>(null);
  const [winner, setWinner] = useState<BingoWinnerPayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'info' | 'error' | 'prize'>('info');
  const [now, setNow] = useState(() => Date.now());
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<BingoMarkingMode>('MANUAL');
  const [selectedCard, setSelectedCard] = useState(0);
  const [markerColor, setMarkerColor] = useState<string>(MARKER_COLORS[1]);
  const [hostConfig, setHostConfig] = useState<RoomBingoConfig>(EMPTY_CONFIG);
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<OpenPanel>('NONE');
  const [stance, setStance] = useState<PlayerStance>('STANDING');
  const [interaction, setInteraction] = useState<InteractionTarget>(null);
  const [focusCard, setFocusCard] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(true);
  const [customisingAvatar, setCustomisingAvatar] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const previousPhase = useRef<BingoSnapshotPayload['phase'] | null>(null);

  const reducedMotion = settings.reducedMotion || systemReducedMotion;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setSystemReducedMotion(media.matches);
    apply();
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  // Audio needs a gesture before it will start; the first click anywhere in the
  // hall is that gesture, and the ambience follows the saved preferences.
  useEffect(() => {
    setHallVolume(settings.volume, settings.muted);
  }, [settings.volume, settings.muted]);

  useEffect(() => {
    const start = () => {
      resumeHallAudio();
      if (!settings.muted) startHallAmbience();
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
  }, [settings.muted]);

  useEffect(() => {
    if (settings.muted) stopHallAmbience();
  }, [settings.muted]);

  useEffect(() => () => disposeHallAudio(), []);

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
        playHallSfx('ballDrop');
        // Read the live preference rather than the one captured when the room
        // was joined: muting mid-round has to silence the caller immediately.
        const audio = useHallSettings.getState();
        if ('speechSynthesis' in window && !audio.muted) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(`Numero ${payload.number}`);
          utterance.lang = 'it-IT';
          utterance.rate = 0.9;
          utterance.volume = Math.min(1, audio.volume + 0.2);
          window.speechSynthesis.speak(utterance);
        }
      },
      onWinner: (payload) => {
        if (!active) return;
        setWinner(payload);
        playHallSfx(payload.tier === 'BINGO' ? 'bingo' : 'cinquina');
        playHallSfx('applause');
        setNoticeTone('prize');
        setNotice(`${payload.tier} di ${payload.displayName} · +${payload.prizeCredits} crediti`);
      },
      onClaimRejected: (payload) => {
        if (!active) return;
        playHallSfx('error');
        setNoticeTone('error');
        setNotice(CLAIM_REJECTION[payload.reason]);
      },
      onActionRejected: (payload) => {
        if (!active) return;
        playHallSfx('error');
        setNoticeTone('error');
        setNotice(ACTION_REJECTION[payload.reason]);
      },
    }).catch(() => {
      if (!active) return;
      setStatus('failed');
      setNoticeTone('error');
      setNotice('Impossibile entrare nella sala. Riprova tra qualche secondo.');
    });

    return () => {
      active = false;
      void leaveBingo();
    };
    // Only the token and the room code may rebuild this connection: anything
    // else in here would drop the player out of the hall on a settings change.
  }, [accessToken, roomCode]);

  const me = snapshot?.players.find((player) => player.sessionId === snapshot.mySessionId);
  const isHost = Boolean(snapshot && snapshot.mySessionId === snapshot.hostSessionId);
  const phase = snapshot?.phase ?? 'WAITING';
  const manualMarking = me?.markingMode === 'MANUAL';

  // Sit the player down automatically once the round starts, and let them back
  // up when the room returns to preparation.
  useEffect(() => {
    if (previousPhase.current === phase) return;
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (phase === 'COUNTDOWN' || phase === 'PLAYING') {
      setStance('SEATED');
      setPanel('NONE');
    }
    if (phase === 'CARD_PURCHASE' && previous !== null && previous !== 'WAITING') {
      setFocusCard(false);
    }
  }, [phase]);

  const countdownSeconds = useMemo(() => {
    if (phase !== 'COUNTDOWN' || !snapshot?.countdownEndsAt) return null;
    return Math.max(0, Math.ceil((snapshot.countdownEndsAt - now) / 1_000));
  }, [phase, snapshot?.countdownEndsAt, now]);

  const secondsToNext = useMemo(() => {
    if (!snapshot?.nextDrawAt) return null;
    return Math.max(0, Math.ceil((snapshot.nextDrawAt - now) / 1_000));
  }, [snapshot?.nextDrawAt, now]);

  const markCell = useCallback(
    (cardIndex: number, cellIndex: number, marked: boolean) => {
      if (!snapshot || !manualMarking) return;
      playHallSfx('marker');
      markBingoCell(snapshot.round, cardIndex, cellIndex, marked);
    },
    [snapshot, manualMarking],
  );

  const claim = useCallback(
    (tier: BingoClaimTier) => {
      if (!snapshot) return;
      claimBingo(snapshot.round, tier, selectedCard);
    },
    [snapshot, selectedCard],
  );

  const toggleSeat = useCallback(() => {
    playHallSfx('chair');
    setStance((current) => (current === 'SEATED' ? 'STANDING' : 'SEATED'));
  }, []);

  const handleInteract = useCallback(
    (target: InteractionTarget) => {
      resumeHallAudio();
      if (target === 'RECEPTION') {
        setPanel((current) => (current === 'PURCHASE' ? 'NONE' : 'PURCHASE'));
        return;
      }
      if (target === 'SIT' || target === 'STAND') toggleSeat();
    },
    [toggleSeat],
  );

  const saveHostConfig = useCallback((next: RoomBingoConfig) => {
    setHostConfig(next);
    updateBingoConfig({
      startMode: next.startMode,
      countdownSeconds: next.countdownSeconds,
      numberCallInterval: next.numberCallInterval,
      npcCount: next.npcCount,
      tier: next.tier,
      chaosLevel: next.chaosLevel,
    });
  }, []);

  const confirmPurchase = useCallback(() => {
    purchaseBingoCards(quantity, mode);
    playHallSfx('purchase');
    setPanel('NONE');
  }, [quantity, mode]);

  const invite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  };

  const newRoom = () => {
    const code = `TESI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    navigate(`/bingo?room=${code}`);
  };

  const exitPointerLock = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
      return;
    }
    setPanel((current) => (current === 'NONE' ? 'SETTINGS' : 'NONE'));
  }, []);

  const celebrating = Boolean(winner) && (phase === 'PLAYING' || phase === 'EVENT_ACTIVE' || phase === 'RESULTS');
  const panelOpen = panel !== 'NONE' || customisingAvatar;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0a0714] text-white">
      {/* The hall itself: mounted for the entire session, never replaced. */}
      <div className="absolute inset-0">
        {sceneFailed ? (
          <BingoFallback2D
            snapshot={snapshot}
            selectedCard={selectedCard}
            markerColor={markerColor}
            onSelectCard={setSelectedCard}
            onMarkCell={markCell}
            onClaim={claim}
          />
        ) : (
          <Suspense
            fallback={
              <div className="grid h-full place-items-center bg-[#0a0714]">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-violet-400 shadow-[0_0_45px_#8b5cf6]" />
                  <p className="mt-4 text-sm text-white/55">Apertura della sala Bingo…</p>
                </div>
              </div>
            }
          >
            {snapshot ? (
              <BingoRoomScene
                phase={snapshot.phase}
                roomName={snapshot.roomName}
                roomCode={snapshot.roomCode}
                cardPrice={snapshot.config.cardPrice}
                maxPlayers={snapshot.config.maxPlayers}
                players={snapshot.players}
                mySessionId={snapshot.mySessionId}
                myCards={snapshot.myCards}
                currentNumber={snapshot.currentNumber}
                drawnNumbers={snapshot.drawnNumbers}
                activeEvent={snapshot.activeEvent}
                countdownSeconds={countdownSeconds}
                celebrating={celebrating}
                selectedCard={selectedCard}
                markerColor={markerColor}
                manualMarking={Boolean(manualMarking)}
                focusCard={focusCard}
                stance={stance}
                quality={settings.quality}
                shadows={settings.shadows}
                reducedMotion={reducedMotion}
                headBob={settings.headBob}
                ambientGuests={settings.ambientGuests}
                inputEnabled={!panelOpen}
                onSelectCard={setSelectedCard}
                onSelectMarker={setMarkerColor}
                onMarkCell={markCell}
                onInteract={handleInteract}
                onTargetChange={setInteraction}
                onFootstep={() => playHallSfx('footstep')}
                onRequestExitPointerLock={exitPointerLock}
                onSceneError={() => setSceneFailed(true)}
              />
            ) : (
              <div className="grid h-full place-items-center bg-[#0a0714]">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-violet-400 shadow-[0_0_45px_#8b5cf6]" />
                  <p className="mt-4 text-sm text-white/55">Ingresso in sala…</p>
                  <p className="mt-1 text-xs text-white/35">Sincronizzazione con la regia server</p>
                </div>
              </div>
            )}
          </Suspense>
        )}
      </div>

      {/* Slim top bar; everything else lives in the world or in the HUD. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/hub')}
            aria-label="Torna alla piazza"
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/12 bg-black/50 font-black backdrop-blur hover:bg-black/70"
          >
            ←
          </button>
          <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 backdrop-blur">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-300">
              {snapshot?.roomName ?? 'Sala Bingo Italiano'}
            </p>
            <p className="font-mono text-xs font-black text-white/85">{roomCode}</p>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
          <span
            className={`rounded-lg border px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur ${
              status === 'connected'
                ? 'border-emerald-300/30 bg-emerald-400/12 text-emerald-200'
                : 'border-amber-300/30 bg-amber-400/12 text-amber-200'
            }`}
          >
            {status === 'connected' ? 'in sala' : status === 'failed' ? 'rete assente' : 'connessione'}
          </span>
          <button
            type="button"
            onClick={() => setPanel((current) => (current === 'HOST' ? 'NONE' : 'HOST'))}
            className="rounded-lg border border-white/12 bg-black/50 px-3 py-2 text-[11px] font-black backdrop-blur hover:bg-black/70"
          >
            ⚙ Regia
          </button>
          <button
            type="button"
            onClick={() => setPanel((current) => (current === 'SETTINGS' ? 'NONE' : 'SETTINGS'))}
            className="rounded-lg border border-white/12 bg-black/50 px-3 py-2 text-[11px] font-black backdrop-blur hover:bg-black/70"
          >
            ▤ Opzioni
          </button>
          <button
            type="button"
            onClick={() => setCustomisingAvatar(true)}
            className="rounded-lg border border-violet-300/25 bg-violet-400/15 px-3 py-2 text-[11px] font-black text-violet-100 backdrop-blur hover:bg-violet-400/25"
          >
            ◉ Personaggio
          </button>
          <button
            type="button"
            onClick={() => void invite()}
            className="rounded-lg border border-white/12 bg-black/50 px-3 py-2 text-[11px] font-black backdrop-blur hover:bg-black/70"
          >
            {copied ? '✓ Copiato' : '⇧ Invita'}
          </button>
          <button
            type="button"
            onClick={newRoom}
            className="rounded-lg border border-white/12 bg-black/50 px-3 py-2 text-[11px] font-black backdrop-blur hover:bg-black/70"
          >
            + Sala
          </button>
        </div>
      </header>

      {snapshot && !sceneFailed && (
        <>
          <Crosshair visible={!panelOpen && stance === 'STANDING'} />
          <InteractionPrompt target={panelOpen ? null : interaction} />

          <ReadyRoster
            players={snapshot.players}
            mySessionId={snapshot.mySessionId}
            open={rosterOpen}
            onToggle={() => setRosterOpen((value) => !value)}
          />

          {/* Preparation happens in the room: a strip above the HUD, not a page. */}
          {phase === 'CARD_PURCHASE' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-3">
              <ReadyPanel
                me={me}
                onToggleReady={() => setBingoReady(!me?.ready)}
                onOpenPurchase={() => setPanel('PURCHASE')}
              />
            </div>
          )}

          {phase === 'COUNTDOWN' && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2">
              <p className="font-display text-8xl font-black text-white drop-shadow-[0_8px_30px_rgb(0_0_0_/_0.9)]">
                {countdownSeconds}
              </p>
              <p className="rounded-full bg-black/50 px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-violet-200 backdrop-blur">
                Tutti ai propri posti
              </p>
              {isHost && (
                <button
                  type="button"
                  onClick={cancelBingoStart}
                  className="pointer-events-auto rounded-xl border border-red-300/35 bg-red-500/20 px-4 py-2 text-xs font-black text-red-100 backdrop-blur hover:bg-red-500/30"
                >
                  Annulla partenza
                </button>
              )}
            </div>
          )}

          {(phase === 'RESULTS' || phase === 'ENDED') && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center px-4">
              <div className="rounded-2xl border border-amber-200/30 bg-black/60 px-6 py-5 text-center backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">
                  Risultato verificato dal server
                </p>
                <h2 className="mt-2 font-display text-4xl font-black">
                  {winner ? `${winner.tier}!` : 'Round concluso'}
                </h2>
                {winner && (
                  <p className="mt-1 text-sm text-white/70">
                    {winner.displayName} · {winner.prizeCredits} crediti virtuali
                  </p>
                )}
                <p className="mt-3 text-xs text-white/45">
                  La sala prepara il round successivo, resta pure al tuo posto.
                </p>
              </div>
            </div>
          )}

          <BingoContextHud
            phase={snapshot.phase}
            currentNumber={snapshot.currentNumber}
            drawnCount={snapshot.drawnNumbers.length}
            secondsToNext={secondsToNext}
            countdownSeconds={countdownSeconds}
            cards={snapshot.myCards}
            selectedCard={selectedCard}
            markerColor={markerColor}
            markerColors={MARKER_COLORS}
            manualMarking={Boolean(manualMarking)}
            stance={stance}
            connected={status === 'connected'}
            awardedCinquina={snapshot.awardedTiers.includes('CINQUINA')}
            awardedBingo={snapshot.awardedTiers.includes('BINGO')}
            me={me}
            onSelectCard={setSelectedCard}
            onSelectMarker={setMarkerColor}
            onClaim={claim}
            onToggleSeat={toggleSeat}
            onFocusCard={() => setFocusCard((value) => !value)}
            focusCard={focusCard}
          />

          <div className="pointer-events-none absolute bottom-28 left-3 z-20 sm:hidden">
            <TouchJoystick />
          </div>
        </>
      )}

      <HallToast message={notice} tone={noticeTone} onDismiss={() => setNotice(null)} />

      {/* Contextual panels float over the hall; the room keeps rendering. */}
      {panel !== 'NONE' && snapshot && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
          {panel === 'PURCHASE' && (
            <PurchasePanel
              config={snapshot.config}
              balance={me?.balance ?? 0}
              quantity={quantity}
              mode={mode}
              alreadyBought={(me?.cardCount ?? 0) > 0}
              onQuantity={setQuantity}
              onMode={setMode}
              onConfirm={confirmPurchase}
              onClose={() => setPanel('NONE')}
            />
          )}
          {panel === 'HOST' && (
            <HostPanel
              config={hostConfig}
              isHost={isHost}
              canStart={(me?.cardCount ?? 0) > 0}
              onChange={saveHostConfig}
              onStart={() => {
                startBingoGame();
                setPanel('NONE');
              }}
              onClose={() => setPanel('NONE')}
            />
          )}
          {panel === 'SETTINGS' && <SettingsPanel onClose={() => setPanel('NONE')} />}
        </div>
      )}

      {customisingAvatar && (
        <Suspense
          fallback={
            <div className="absolute inset-0 z-40 grid place-items-center bg-[#080713]/90 text-sm text-white/60">
              Apertura atelier…
            </div>
          }
        >
          <AvatarCustomizer onClose={() => setCustomisingAvatar(false)} />
        </Suspense>
      )}

      <ResponsiblePlayNotice className="pointer-events-none absolute bottom-0 left-1/2 z-10 hidden -translate-x-1/2 px-4 pb-1 text-center opacity-60 lg:block" />
    </main>
  );
}
