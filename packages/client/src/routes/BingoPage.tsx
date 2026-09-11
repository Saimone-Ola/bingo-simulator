import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SeatMap from "../components/SeatMap";
import SestinaGrid from "../components/SestinaGrid";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DEFAULT_NPC_DENSITY,
  HALL_CAPACITY,
  SEAT_REJECTION_REASONS,
  normaliseBingoRoomCode,
  type BingoActionRejectedPayload,
  type BingoClaimRejectedPayload,
  type BingoClaimTier,
  type BingoMarkingMode,
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
  type BingoRoundResult,
  type RoomBingoConfig,
  type SeatOccupancy,
} from "@bingo/shared";
import { ResponsiblePlayNotice } from "../components/ui";
import BingoContextHud, {
  Crosshair,
  HallToast,
  InteractionPrompt,
  ReadyRoster,
} from "../components/BingoContextHud";
import {
  HostPanel,
  PurchasePanel,
  ReadyPanel,
  SettingsPanel,
  PanelShell,
} from "../components/BingoHallPanels";
import TouchJoystick from "../components/TouchJoystick";
import {
  disposeHallAudio,
  playHallSfx,
  resumeHallAudio,
  setHallVolume,
  startHallAmbience,
  stopHallAmbience,
} from "../audio/hallAudio";
import {
  cancelBingoStart,
  cancelBingoRound,
  claimBingo,
  connectToBingo,
  leaveBingo,
  leaveBingoSeat,
  markBingoCell,
  purchaseBingoCards,
  reserveBingoSeat,
  setBingoReady,
  setBingoPreparing,
  startBingoGame,
  takeBingoSeat,
  updateBingoConfig,
  type BingoConnectionStatus,
} from "../net/bingoConnection";
import { useAuthStore } from "../store/auth";
import { useHallSettings } from "../store/hallSettings";
import type { InteractionFocus } from "../three/bingo/PlayerMovementController";
import type { PlayerStance } from "../three/bingo/movement";
import { SEATS, type SeatPlacement } from "../three/bingo/hallLayout";
import { MARKER_PALETTE as MARKER_COLORS } from "../three/palette";
import BingoFallback2D from "../components/BingoFallback2D";
import { BINGO_CONNECTION_COPY, type BingoConnectionIssue } from '../net/bingoProtocol';

const BingoRoomScene = lazy(() => import("../three/BingoRoomScene"));
const AvatarCustomizer = lazy(() => import("../components/AvatarCustomizer"));

const EMPTY_CONFIG: RoomBingoConfig = {
  minPlayers: 2,
  maxPlayers: HALL_CAPACITY,
  startMode: "ALL_READY",
  countdownSeconds: 10,
  cardPrice: 10,
  maxManualCards: 3,
  maxAutomaticCards: 6,
  numberCallInterval: 5_000,
  enabledEvents: [],
  crowdDensity: DEFAULT_NPC_DENSITY,
  tier: "STANDARD",
  chaosLevel: "LIGHT",
  training: false,
};

const CLAIM_REJECTION: Record<BingoClaimRejectedPayload["reason"], string> = {
  round_changed: "Il round è cambiato: controlla le nuove cartelle.",
  wrong_phase: "La dichiarazione non è disponibile in questa fase.",
  invalid_card: "La cartella scelta non è valida.",
  incomplete_result:
    "Il server ha controllato la cartella: il risultato non è ancora completo.",
  already_awarded: "Questo premio è già stato assegnato nel round.",
  claim_window_closed: "La finestra per questa estrazione è terminata.",
  event_paused:
    "Le dichiarazioni sono sospese per tutti durante questo evento.",
};

const ACTION_REJECTION: Record<BingoActionRejectedPayload["reason"], string> = {
  invalid_payload: "Richiesta non valida. Controlla quantità e impostazioni.",
  wrong_phase: "Questa azione non è disponibile nella fase corrente.",
  host_only: "Solo l’host può modificare questa impostazione.",
  minimum_players: "Non è stato raggiunto il numero minimo di partecipanti.",
  players_not_ready: "Alcuni giocatori non sono ancora pronti.",
  cards_required: "Per partecipare al round serve almeno una cartella.",
  already_purchased: "Hai già acquistato le cartelle per questo round.",
  purchase_in_progress: "Acquisto già in elaborazione.",
  insufficient_credits: "Crediti virtuali insufficienti per questo pacchetto.",
  manual_marking_only: "La segnatura è automatica in questa partita.",
  invalid_cell: "Questa casella non può essere segnata.",
  not_called: "Il numero non è ancora stato estratto.",
  configuration_locked: "Le impostazioni sono bloccate durante la partita.",
  purchase_failed:
    "Acquisto non completato. La selezione è conservata: riprova.",
  round_changed:
    "Il round è cambiato. Controlla prezzo e cartelle prima di un nuovo acquisto.",
  preparation_open: "La finestra di preparazione è ancora aperta.",
  players_disconnected:
    "Un partecipante è scollegato: attendi il rientro oppure annulla e rimborsa il round.",
  start_cancelled:
    "Partenza annullata. I partecipanti possono confermare di nuovo.",
  round_cancelling:
    "Rimborso del round in corso. Attendi la conferma del server.",
};

type OpenPanel =
  | "NONE"
  | "PURCHASE"
  | "HOST"
  | "SETTINGS"
  | "SEATS"
  | "CARDS"
  | "RESULTS"
  | "HELP";

export default function BingoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useAuthStore((state) => state.user?.id);
  const roomCode = useMemo(
    () => normaliseBingoRoomCode(searchParams.get("room") ?? "TESI-2026"),
    [searchParams],
  );

  const settings = useHallSettings();

  const [status, setStatus] = useState<BingoConnectionStatus>("connecting");
  const [connectionIssue, setConnectionIssue] = useState<BingoConnectionIssue | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<BingoSnapshotPayload | null>(null);
  const [winner, setWinner] = useState<BingoWinnerPayload | null>(null);
  const [lastResults, setLastResults] = useState<BingoRoundResult[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"info" | "error" | "prize">(
    "info",
  );
  const [now, setNow] = useState(() => Date.now());
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<BingoMarkingMode>(() =>
    localStorage.getItem("bingo-marking-mode") === "AUTOMATIC"
      ? "AUTOMATIC"
      : "MANUAL",
  );
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchaseRetryable, setPurchaseRetryable] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState(0);
  const [markerColor, setMarkerColor] = useState<string>(MARKER_COLORS[1]);
  const [hostConfig, setHostConfig] = useState<RoomBingoConfig>(EMPTY_CONFIG);
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<OpenPanel>(() =>
    localStorage.getItem("bingo-help-seen") ? "NONE" : "HELP",
  );
  // Seating is authoritative and arrives on its own message, so it lives beside
  // the snapshot rather than inside it: seats change far more often than cards.
  const [seating, setSeating] = useState<readonly SeatOccupancy[]>([]);
  const [reservations, setReservations] = useState<
    readonly { seatId: string; holderId: string; expiresAt: number }[]
  >([]);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<InteractionFocus>({
    target: null,
    seatId: null,
  });
  // Read by the round-start effect, which must not re-run every time the
  // player's gaze drifts across a chair.
  const interactionRef = useRef<InteractionFocus>({
    target: null,
    seatId: null,
  });
  interactionRef.current = interaction;
  const [focusCard, setFocusCard] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [customisingAvatar, setCustomisingAvatar] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(
    searchParams.get("view") === "2d",
  );
  const [sceneLoading, setSceneLoading] = useState(
    searchParams.get("view") !== "2d",
  );
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const previousPhase = useRef<BingoSnapshotPayload["phase"] | null>(null);

  const reducedMotion = settings.reducedMotion || systemReducedMotion;

  useEffect(() => {
    localStorage.setItem("bingo-marking-mode", mode);
  }, [mode]);
  useEffect(() => {
    setBingoPreparing(
      sceneLoading || customisingAvatar || panel === "PURCHASE",
    );
  }, [sceneLoading, customisingAvatar, panel, status]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setSystemReducedMotion(media.matches);
    apply();
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
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
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [settings.muted]);

  useEffect(() => {
    if (settings.muted) stopHallAmbience();
  }, [settings.muted]);

  useEffect(() => () => disposeHallAudio(), []);

  useEffect(() => {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) return;
    let active = true;
    setConnectionIssue(null);
    setSnapshot(null);

    void connectToBingo(accessToken, roomCode, {
      onConnectionIssue: (issue) => {
        if (!active) return;
        setConnectionIssue(issue);
        setSnapshot(null);
      },
      onStatus: (next) => active && setStatus(next),
      onSeating: (payload) => {
        if (!active) return;
        setSeating(payload.seating);
        setReservations(payload.reservations);
      },
      onSeatRejected: (payload) => {
        if (!active) return;
        setSeatError(SEAT_REJECTION_REASONS[payload.reason]);
      },
      onSnapshot: (next) => {
        if (!active) return;
        setSnapshot(next);
        if (next.results.length > 0) setLastResults(next.results);
        setSeating(next.seating);
        setReservations(next.reservations);
        setHostConfig(next.nextRoundConfig ?? next.config);
        setSelectedCard((current) =>
          Math.min(current, Math.max(0, next.myCards.length - 1)),
        );
        if (next.phase === "CARD_PURCHASE") setWinner(null);
      },
      onPurchaseConfirmed: (payload) => {
        if (!active) return;
        setPurchasePending(false);
        setPurchaseRetryable(false);
        setPurchaseError(null);
        setPanel("NONE");
        playHallSfx("purchase");
        setNoticeTone("info");
        setNotice(
          `${payload.quantity} cartelle consegnate · ${payload.totalCredits} crediti. Scegli il posto e conferma «Sono pronto».`,
        );
      },
      onPurchaseWaiting: () => {
        if (!active) return;
        setPurchasePending(false);
        setPurchaseRetryable(true);
        setPurchaseError(
          "La conferma tarda ad arrivare. Premi di nuovo per verificare lo stesso acquisto: non viene creato un secondo addebito.",
        );
      },
      onRoundCancelled: ({ round }) => {
        if (!active) return;
        setPurchasePending(false);
        setPurchaseRetryable(false);
        setPurchaseError(null);
        setPanel("NONE");
        setNoticeTone("info");
        setNotice(`Round ${round} annullato dall’host: tutti gli acquisti sono stati rimborsati. Il prossimo round richiede un nuovo acquisto.`);
      },
      onBall: (payload) => {
        if (!active) return;
        playHallSfx("ballDrop");
        // Read the live preference rather than the one captured when the room
        // was joined: muting mid-round has to silence the caller immediately.
        const audio = useHallSettings.getState();
        if ("speechSynthesis" in window && !audio.muted) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(
            `Numero ${payload.number}`,
          );
          utterance.lang = "it-IT";
          utterance.rate = 0.9;
          utterance.volume = Math.min(1, audio.volume + 0.2);
          window.speechSynthesis.speak(utterance);
        }
      },
      onWinner: (payload) => {
        if (!active) return;
        setWinner(payload);
        playHallSfx(payload.tier === "BINGO" ? "bingo" : "cinquina");
        playHallSfx("applause");
        setNoticeTone("prize");
        setNotice(
          `${payload.tier} di ${payload.displayName} · +${payload.prizeCredits} crediti`,
        );
      },
      onClaimRejected: (payload) => {
        if (!active) return;
        playHallSfx("error");
        setNoticeTone("error");
        setNotice(CLAIM_REJECTION[payload.reason]);
      },
      onActionRejected: (payload) => {
        if (!active) return;
        if (payload.action === "purchaseCards") {
          if (payload.reason === "purchase_in_progress") return;
          setPurchasePending(false);
          setPurchaseRetryable(payload.reason === "purchase_failed");
          setPurchaseError(ACTION_REJECTION[payload.reason]);
          setPanel("PURCHASE");
        }
        playHallSfx("error");
        setNoticeTone("error");
        setNotice(ACTION_REJECTION[payload.reason]);
      },
    }).catch(() => {
      if (!active) return;
      setStatus("failed");
      setNoticeTone("error");
      setNotice("Impossibile entrare nella sala. Riprova tra qualche secondo.");
    });

    return () => {
      active = false;
      void leaveBingo();
    };
    // Identity and room own the connection. Rotating a short-lived token must
    // preserve an in-flight purchase and its request ID; reconnect renews auth.
  }, [userId, roomCode, connectionAttempt]);

  const me = snapshot?.players.find(
    (player) => player.sessionId === snapshot.mySessionId,
  );
  const isHost = Boolean(
    snapshot && snapshot.mySessionId === snapshot.hostSessionId,
  );
  const phase = snapshot?.phase ?? "WAITING";
  const resultRows = snapshot?.results.length ? snapshot.results : lastResults;
  const manualMarking = me?.markingMode === "MANUAL";

  /**
   * Sitting is what the server says it is.
   *
   * This used to be local state the page flipped on its own, which meant the
   * two could disagree: pressing the key sat you down in your own view while
   * the room still had you standing, and nobody else saw you take the chair.
   * One source of truth, and it is the one that owns the seat.
   */
  const stance: PlayerStance = snapshot?.mySeatId ? "SEATED" : "STANDING";

  /** Chairs nobody is in, so the world knows which ones can be walked up to. */
  const freeSeats = useMemo(() => {
    const taken = new Set(seating.map((entry) => entry.seatId));
    const heldByOthers = new Set(
      reservations
        .filter(
          (entry) => entry.holderId !== me?.userId && entry.expiresAt > now,
        )
        .map((entry) => entry.seatId),
    );
    return SEATS.filter(
      (seat: SeatPlacement) =>
        !taken.has(seat.id) && !heldByOthers.has(seat.id),
    );
  }, [seating, reservations, me?.userId, now]);

  // Changing phase never chooses a chair or takes control of the camera.
  useEffect(() => {
    if (previousPhase.current === phase) return;
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (phase === "COUNTDOWN" || phase === "PLAYING") {
      if (!snapshot?.mySeatId) {
        setNoticeTone("info");
        setNotice(
          "La partita sta iniziando. Scegli un posto con «Siediti» oppure consulta le cartelle nel pannello.",
        );
      }
    }
    if (
      phase === "CARD_PURCHASE" &&
      previous !== null &&
      previous !== "WAITING"
    ) {
      setFocusCard(false);
    }
  }, [phase, snapshot?.mySeatId]);

  const countdownSeconds = useMemo(() => {
    if (phase !== "COUNTDOWN" || !snapshot?.countdownEndsAt) return null;
    return Math.max(0, Math.ceil((snapshot.countdownEndsAt - now) / 1_000));
  }, [phase, snapshot?.countdownEndsAt, now]);

  const secondsToNext = useMemo(() => {
    if (!snapshot?.nextDrawAt) return null;
    return Math.max(0, Math.ceil((snapshot.nextDrawAt - now) / 1_000));
  }, [snapshot?.nextDrawAt, now]);

  const markCell = useCallback(
    (cardIndex: number, cellIndex: number, marked: boolean) => {
      if (
        !snapshot ||
        !manualMarking ||
        status !== "connected" ||
        (phase !== "PLAYING" && phase !== "EVENT_ACTIVE")
      )
        return;
      playHallSfx("marker");
      markBingoCell(snapshot.round, cardIndex, cellIndex, marked);
    },
    [snapshot, manualMarking, status, phase],
  );

  const claim = useCallback(
    (tier: BingoClaimTier) => {
      if (!snapshot) return;
      claimBingo(snapshot.round, tier, selectedCard);
    },
    [snapshot, selectedCard],
  );

  const handleInteract = useCallback((focus: InteractionFocus) => {
    resumeHallAudio();
    if (focus.target === "RECEPTION") {
      setPanel((current) => (current === "PURCHASE" ? "NONE" : "PURCHASE"));
      return;
    }
    // Sitting and standing are requests, not decisions: the server owns the
    // chair and may refuse, and the refusal is what seatError reports.
    if (focus.target === "SIT" && focus.seatId) {
      setSeatError(null);
      playHallSfx("chair");
      takeBingoSeat(focus.seatId);
      return;
    }
    if (focus.target === "STAND") {
      setSeatError(null);
      playHallSfx("chair");
      leaveBingoSeat();
    }
  }, []);

  /**
   * The seat button in the HUD.
   *
   * Standing, it sits you in the chair you are actually next to — the first
   * free seat in the hall is a legitimate chair and a terrible answer, since
   * taking it teleports you forty metres across the room. With no chair in
   * reach there is nothing sensible to sit in, so it opens the map instead of
   * doing nothing.
   */
  const toggleSeat = useCallback(() => {
    if (stance === "SEATED") {
      handleInteract({ target: "STAND", seatId: snapshot?.mySeatId ?? null });
      return;
    }
    if (interaction.target === "SIT" && interaction.seatId) {
      handleInteract({ target: "SIT", seatId: interaction.seatId });
      return;
    }
    setPanel("SEATS");
  }, [stance, snapshot?.mySeatId, interaction, handleInteract]);

  const saveHostConfig = useCallback((next: RoomBingoConfig) => {
    setHostConfig(next);
    updateBingoConfig({
      startMode: next.startMode,
      countdownSeconds: next.countdownSeconds,
      numberCallInterval: next.numberCallInterval,
      crowdDensity: next.crowdDensity,
      tier: next.tier,
      chaosLevel: next.chaosLevel,
      training: next.training,
    });
  }, []);

  const confirmPurchase = useCallback(() => {
    if (!purchaseBingoCards(quantity, mode)) {
      setPurchaseError(
        "Connessione alla sala assente. Attendi il rientro prima di confermare.",
      );
      return;
    }
    setPurchasePending(true);
    setPurchaseError(null);
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
    setPanel((current) => (current === "NONE" ? "SETTINGS" : "NONE"));
  }, []);

  const celebrating =
    Boolean(winner) &&
    (phase === "PLAYING" || phase === "EVENT_ACTIVE" || phase === "RESULTS");
  const panelOpen = panel !== "NONE" || customisingAvatar;

  useEffect(() => {
    if (panelOpen && document.pointerLockElement) document.exitPointerLock();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPanel("NONE");
      setCustomisingAvatar(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [panelOpen]);

  const roundStatus = snapshot && (
    <>
      <p className="font-bold text-content-primary">
        Round {snapshot.round} · {snapshot.config.training ? "Allenamento" : "Multiplayer"}
      </p>
      <p className="mt-1 text-content-secondary">
        {me?.participation === "SPECTATOR"
          ? "Stai osservando: puoi acquistare dal prossimo round."
          : phase === "CARD_PURCHASE"
            ? snapshot.preparationEndsAt
              ? `Preparazione: ${Math.max(0, Math.ceil((snapshot.preparationEndsAt - now) / 1000))} s`
              : snapshot.config.startMode === "ALL_READY"
                ? "Si parte quando gli acquirenti sono tutti pronti."
                : "L’host avvia dopo la preparazione."
            : phase === "COUNTDOWN"
              ? `Partenza tra ${countdownSeconds} s`
              : phase === "EVENT_ACTIVE"
                ? (snapshot.activeEvent?.name ?? "Evento in sala")
                : phase === "PLAYING"
                  ? "Estrazioni in corso"
                  : "Consulta il riepilogo del round."}
      </p>
      {phase === "CARD_PURCHASE" && snapshot.startBlockedReason && (
        <p className="mt-1 text-warning-400">{ACTION_REJECTION[snapshot.startBlockedReason]}</p>
      )}
      {snapshot.claimWindow && (
        <p className="mt-2 font-bold text-accent-300">
          Ex aequo {snapshot.claimWindow.tier}: {Math.max(0, Math.ceil((snapshot.claimWindow.closesAt - now) / 1000))} s · estrazione {snapshot.claimWindow.drawIndex}
        </p>
      )}
      {snapshot.results.some((result) => result.status === "PENDING") && (
        <p className="mt-2 text-warning-400">Vincita verificata, accredito in attesa. Dettagli in Risultati.</p>
      )}
    </>
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-surface-950 text-content-primary">
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
            roundStatus={roundStatus}
          />
        ) : (
          <Suspense
            fallback={
              <div className="grid h-full place-items-center bg-surface-950">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-brand-400 shadow-hud" />
                  <p className="mt-4 text-sm text-content-primary/55">
                    Apertura della sala Bingo…
                  </p>
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
                mySeatId={snapshot.mySeatId}
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
                freeSeats={freeSeats}
                myUserId={me?.userId ?? null}
                seating={seating}
                quality={settings.quality}
                shadows={settings.shadows}
                reducedMotion={reducedMotion}
                headBob={settings.headBob}
                ambientGuests={settings.ambientGuests}
                inputEnabled={!panelOpen && status === "connected"}
                onSelectCard={setSelectedCard}
                onSelectMarker={setMarkerColor}
                onMarkCell={markCell}
                onInteract={handleInteract}
                onTargetChange={setInteraction}
                onFootstep={() => playHallSfx("footstep")}
                onRequestExitPointerLock={exitPointerLock}
                onSceneReady={() => setSceneLoading(false)}
                onSceneError={() => {
                  setSceneFailed(true);
                  setSceneLoading(false);
                }}
              />
            ) : (
              <div className="grid h-full place-items-center bg-surface-950">
                <div className="mx-4 max-w-md text-center" role="status">
                  {status !== 'failed' && <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-brand-400 shadow-hud" />}
                  <p className="mt-4 text-sm text-content-primary/55">
                    {status === 'failed' ? 'Sala temporaneamente non disponibile' : 'Ingresso in sala…'}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-content-secondary">
                    {connectionIssue ? BINGO_CONNECTION_COPY[connectionIssue] : 'Sincronizzazione con il server di gioco…'}
                  </p>
                  {status === 'failed' && <button type="button" className="mt-5 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white" onClick={() => setConnectionAttempt((value) => value + 1)}>Riprova il collegamento</button>}
                </div>
              </div>
            )}
          </Suspense>
        )}
      </div>

      {/* Slim top bar; everything else lives in the world or in the HUD. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-start justify-between gap-2 bg-gradient-to-b from-surface-950/70 to-transparent p-3 sm:flex-row sm:flex-wrap sm:p-4">
        <div className="pointer-events-auto flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => navigate("/hub")}
            aria-label="Torna alla piazza"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-content-primary/12 bg-surface-950/50 font-black backdrop-blur hover:bg-surface-950/70"
          >
            ←
          </button>
          <div className="min-w-0 rounded-xl border border-content-primary/10 bg-surface-950/45 px-3 py-1.5 backdrop-blur">
            <p className="truncate text-2xs font-black uppercase tracking-[0.2em] text-brand-300">
              {snapshot?.roomName ?? "Sala Bingo Italiano"}
            </p>
            <p className="truncate font-mono text-xs font-black text-content-primary/85">
              {roomCode}
            </p>
          </div>
        </div>

        <div className="pointer-events-auto flex w-full flex-nowrap items-center justify-start gap-1.5 overflow-x-auto whitespace-nowrap pb-1 [&>*]:shrink-0 sm:w-auto sm:flex-wrap sm:justify-end sm:overflow-visible sm:pb-0">
          <span
            className={`rounded-lg border px-2.5 py-2 text-2xs font-black uppercase tracking-[0.14em] backdrop-blur ${
              status === "connected"
                ? "border-success-400/30 bg-success-400/12 text-success-400"
                : "border-accent-300/30 bg-accent-400/12 text-accent-300"
            }`}
          >
            {status === "connected"
              ? "in sala"
              : status === "failed"
                ? "rete assente"
                : "connessione"}
          </span>
          <button
            type="button"
            onClick={() =>
              setPanel((current) => (current === "HOST" ? "NONE" : "HOST"))
            }
            className="rounded-lg border border-content-primary/12 bg-surface-950/50 px-3 py-2 text-xs font-black backdrop-blur hover:bg-surface-950/70"
          >
            ⚙ Regia
          </button>
          <button
            type="button"
            onClick={() =>
              setPanel((current) =>
                current === "SETTINGS" ? "NONE" : "SETTINGS",
              )
            }
            className="rounded-lg border border-content-primary/12 bg-surface-950/50 px-3 py-2 text-xs font-black backdrop-blur hover:bg-surface-950/70"
          >
            ▤ Opzioni
          </button>
          <button
            type="button"
            onClick={() => setCustomisingAvatar(true)}
            className="rounded-lg border border-brand-300/25 bg-brand-400/15 px-3 py-2 text-xs font-black text-brand-100 backdrop-blur hover:bg-brand-400/25"
          >
            ◉ Personaggio
          </button>
          <button
            type="button"
            onClick={() => void invite()}
            className="rounded-lg border border-content-primary/12 bg-surface-950/50 px-3 py-2 text-xs font-black backdrop-blur hover:bg-surface-950/70"
          >
            {copied ? "✓ Copiato" : "⇧ Invita"}
          </button>
          <button
            type="button"
            onClick={newRoom}
            className="rounded-lg border border-content-primary/12 bg-surface-950/50 px-3 py-2 text-xs font-black backdrop-blur hover:bg-surface-950/70"
          >
            + Sala
          </button>
          <button
            type="button"
            onClick={() => setPanel("HELP")}
            className="rounded-lg border border-surface-500 bg-surface-900 px-3 py-2 text-xs font-bold"
          >
            ? Aiuto
          </button>
          <button
            type="button"
            onClick={() => setPanel("RESULTS")}
            className="rounded-lg border border-surface-500 bg-surface-900 px-3 py-2 text-xs font-bold"
          >
            Risultati
          </button>
          {snapshot && snapshot.myCards.length > 0 && (
            <button
              type="button"
              onClick={() => setPanel("CARDS")}
              className="rounded-lg border border-brand-400 bg-surface-900 px-3 py-2 text-xs font-bold"
            >
              Le mie cartelle
            </button>
          )}
        </div>
      </header>

      {snapshot && !sceneFailed && !panelOpen && (
        <div
          className={`pointer-events-none absolute left-3 top-40 z-20 max-w-xs rounded-lg border border-surface-600 bg-surface-900/90 p-3 text-xs shadow-hud sm:top-36 ${rosterOpen ? "hidden sm:block" : ""}`}
          aria-live="polite"
        >
          {roundStatus}
        </div>
      )}

      {snapshot && sceneFailed && phase === "CARD_PURCHASE" && !panelOpen && (
        <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center">
          <ReadyPanel
            me={me}
            onToggleReady={() => setBingoReady(!me?.ready)}
            onOpenPurchase={() => setPanel("PURCHASE")}
          />
        </div>
      )}

      {snapshot && !sceneFailed && (
        <>
          <Crosshair visible={!panelOpen && stance === "STANDING"} />
          <InteractionPrompt target={panelOpen ? null : interaction.target} />

          <div className="pointer-events-none absolute inset-x-3 top-28 z-20 flex items-start gap-2 sm:contents">
          <ReadyRoster
            players={snapshot.players}
            mySessionId={snapshot.mySessionId}
            open={rosterOpen}
            onToggle={() => setRosterOpen((value) => !value)}
          />

          {/* Seat picker. Available whenever the round has not started, which
              is exactly when changing seats is harmless. */}
          {(phase === "WAITING" || phase === "CARD_PURCHASE") && (
            <div className="pointer-events-auto shrink-0 sm:absolute sm:left-3 sm:top-24 sm:z-20">
              <button
                type="button"
                onClick={() => setPanel("SEATS")}
                className="whitespace-nowrap rounded-lg border border-surface-500 bg-surface-900/80 px-3 py-2 text-2xs font-black uppercase tracking-[0.06em] text-content-secondary backdrop-blur transition-colors hover:border-brand-400 hover:text-content-primary sm:text-xs sm:tracking-[0.14em]"
              >
                {snapshot.mySeatId ? "Cambia posto" : "Scegli il posto"}
              </button>
            </div>
          )}
          </div>

          {/* Preparation happens in the room: a strip above the HUD, not a page. */}
          {phase === "CARD_PURCHASE" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-3">
              <ReadyPanel
                me={me}
                onToggleReady={() => setBingoReady(!me?.ready)}
                onOpenPurchase={() => setPanel("PURCHASE")}
              />
            </div>
          )}

          {phase === "COUNTDOWN" && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2">
              <p className="font-display text-8xl font-black text-content-primary drop-shadow-hud">
                {countdownSeconds}
              </p>
              <p className="rounded-full bg-surface-950/50 px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-brand-200 backdrop-blur">
                Tutti ai propri posti
              </p>
              {isHost && (
                <button
                  type="button"
                  onClick={cancelBingoStart}
                  className="pointer-events-auto rounded-xl border border-danger-400/35 bg-danger-500/20 px-4 py-2 text-xs font-black text-danger-400 backdrop-blur hover:bg-danger-500/30"
                >
                  Annulla partenza
                </button>
              )}
            </div>
          )}

          {(phase === "RESULTS" || phase === "ENDED") && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center px-4">
              <div className="rounded-2xl border border-accent-300/30 bg-surface-950/60 px-6 py-5 text-center backdrop-blur-md">
                <p className="text-2xs font-black uppercase tracking-[0.28em] text-accent-300">
                  Risultato verificato dal server
                </p>
                <h2 className="mt-2 font-display text-4xl font-black">
                  {snapshot.results.some((result) => result.tier === "BINGO") ? "Bingo!" : "Round concluso"}
                </h2>
                <p className="mt-1 text-sm text-content-primary/70">
                  {snapshot.results.length > 0
                    ? `${snapshot.results.length} premi verificati · consulta Risultati per vincitori, quote e accrediti.`
                    : "Nessuna vincita dichiarata in questo round."}
                </p>
                <p className="mt-3 text-xs text-content-primary/45">
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
            connected={status === "connected"}
            awardedCinquina={snapshot.awardedTiers.includes("CINQUINA")}
            awardedBingo={snapshot.awardedTiers.includes("BINGO")}
            me={me}
            onSelectCard={setSelectedCard}
            onSelectMarker={setMarkerColor}
            onClaim={claim}
            onToggleSeat={toggleSeat}
            onFocusCard={() => setFocusCard((value) => !value)}
            focusCard={focusCard}
          />

          {stance === "STANDING" && !panelOpen && (
            <div className={`pointer-events-none absolute left-3 z-20 sm:hidden ${snapshot.myCards.length > 0 ? "bottom-72" : "bottom-44"}`}>
              <TouchJoystick />
            </div>
          )}
        </>
      )}

      <HallToast
        message={notice}
        tone={noticeTone}
        onDismiss={() => setNotice(null)}
      />

      {/* Contextual panels float over the hall; the room keeps rendering. */}
      {panel !== "NONE" && snapshot && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
          {panel === "PURCHASE" && (
            <PurchasePanel
              config={snapshot.config}
              balance={me?.balance ?? 0}
              quantity={quantity}
              mode={mode}
              alreadyBought={(me?.cardCount ?? 0) > 0}
              pending={purchasePending || Boolean(me?.purchaseInProgress)}
              selectionLocked={purchaseRetryable}
              error={purchaseError}
              canPurchase={phase === "CARD_PURCHASE" && status === "connected"}
              pool={snapshot.prizePool}
              myCards={me?.cardCount ?? 0}
              onQuantity={setQuantity}
              onMode={setMode}
              onConfirm={confirmPurchase}
              onClose={() => setPanel("NONE")}
            />
          )}
          {panel === "CARDS" && (
            <PanelShell
              title="Le mie cartelle"
              subtitle={
                manualMarking
                  ? "Segnatura manuale · i segni sono un promemoria correggibile"
                  : "Assistenza attiva · il server segna, tu dichiari"
              }
              width="max-w-5xl"
              onClose={() => setPanel("NONE")}
            >
              <SestinaGrid
                cards={snapshot.myCards}
                drawnNumbers={snapshot.drawnNumbers}
                markedByCard={snapshot.myCards.map(
                  (card) => card.markedIndices,
                )}
                markStyle="CROSS"
                markColor={markerColor}
                selectedCard={selectedCard}
                onSelectCard={setSelectedCard}
                onToggleCell={
                  manualMarking &&
                  (phase === "PLAYING" || phase === "EVENT_ACTIVE")
                    ? (cardIndex, cellIndex) =>
                        markCell(
                          cardIndex,
                          cellIndex,
                          !snapshot.myCards[cardIndex]?.markedIndices.includes(
                            cellIndex,
                          ),
                        )
                    : undefined
                }
              />
              {(phase === "PLAYING" || phase === "EVENT_ACTIVE") && (
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    disabled={snapshot.awardedTiers.includes("CINQUINA")}
                    onClick={() => claim("CINQUINA")}
                    className="rounded-lg bg-brand-500 px-4 py-3 font-bold disabled:opacity-40"
                  >
                    Dichiara cinquina · cartella {selectedCard + 1}
                  </button>
                  <button
                    type="button"
                    disabled={snapshot.awardedTiers.includes("BINGO")}
                    onClick={() => claim("BINGO")}
                    className="rounded-lg bg-accent-400 px-4 py-3 font-bold text-content-inverse disabled:opacity-40"
                  >
                    Dichiara bingo
                  </button>
                </div>
              )}
            </PanelShell>
          )}

          {panel === "SEATS" && (
            <SeatMap
              seating={seating}
              reservations={reservations}
              mySeatId={snapshot.mySeatId}
              myUserId={me?.userId ?? null}
              error={seatError}
              onTake={(seatId) => {
                setSeatError(null);
                takeBingoSeat(seatId);
              }}
              onLeave={() => {
                setSeatError(null);
                leaveBingoSeat();
              }}
              onReserve={(seatId) => {
                setSeatError(null);
                reserveBingoSeat(seatId);
              }}
              onClose={() => {
                setSeatError(null);
                setPanel("NONE");
              }}
            />
          )}
          {panel === "HOST" && (
            <HostPanel
              config={hostConfig}
              isHost={isHost}
              canStart={
                phase === "CARD_PURCHASE" &&
                !snapshot.startBlockedReason &&
                status === "connected"
              }
              blockedReason={
                snapshot.startBlockedReason
                  ? ACTION_REJECTION[snapshot.startBlockedReason]
                  : null
              }
              deferred={snapshot.economicsLocked}
              onCancelRound={
                isHost &&
                (phase === "CARD_PURCHASE" || phase === "COUNTDOWN") &&
                snapshot.economicsLocked
                  ? cancelBingoRound
                  : null
              }
              onChange={saveHostConfig}
              onStart={() => {
                startBingoGame();
                setPanel("NONE");
              }}
              onClose={() => setPanel("NONE")}
            />
          )}
          {panel === "SETTINGS" && (
            <SettingsPanel onClose={() => setPanel("NONE")} />
          )}
          {panel === "HELP" && (
            <PanelShell
              title="Benvenuto in sala"
              subtitle="Sei passaggi per la prima partita"
              onClose={() => {
                localStorage.setItem("bingo-help-seen", "1");
                setPanel("NONE");
              }}
            >
              <ol className="list-decimal space-y-3 pl-5 text-sm text-content-secondary">
                <li>
                  Invita un amico con lo stesso codice sala. Per giocare da
                  solo, attiva Allenamento in Regia prima di comprare.
                </li>
                <li>
                  Acquista le cartelle scegliendo quantità e segnatura. Attendi
                  la conferma della cassa.
                </li>
                <li>
                  Scegli il posto dalla mappa o avvicinati a una sedia e premi
                  E. Poi conferma «Sono pronto».
                </li>
                <li>
                  Trascina per guardarti attorno; WASD per camminare. Da seduto,
                  «Guarda cartella» avvicina la visuale. Escape libera il mouse.
                </li>
                <li>
                  In manuale scegli il pennarello e clicca un numero: un secondo
                  clic corregge il segno. In automatico segna il server, anche
                  le cartelle nascoste.
                </li>
                <li>
                  Dichiara cinquina o bingo sulla cartella selezionata. Il
                  server controlla i numeri estratti e apre 5 secondi per gli ex
                  aequo; consulta Risultati per gli accrediti.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem("bingo-help-seen", "1");
                  setPanel("NONE");
                }}
                className="mt-5 w-full rounded-lg bg-brand-500 px-4 py-3 font-bold"
              >
                Entra in sala · salta aiuto
              </button>
            </PanelShell>
          )}
          {panel === "RESULTS" && (
            <PanelShell
              title="Risultati del round"
              subtitle="Vincite verificate dal server, solo crediti virtuali"
              onClose={() => setPanel("NONE")}
            >
              <div className="grid gap-3">
                {resultRows.length === 0 ? (
                  <p className="text-sm text-content-secondary">
                    Nessuna vincita dichiarata.
                  </p>
                ) : (
                  resultRows.map((result) => (
                    <article
                      key={result.resultId}
                      className="rounded-lg border border-surface-600 bg-surface-850 p-3"
                    >
                      <p className="font-bold text-accent-300">
                        Round {result.round} · {result.tier} ·{" "}
                        {result.displayName}
                      </p>
                      <p className="mt-1 text-sm">
                        Cartella {result.cardIndex + 1} · {result.prizeCredits}{" "}
                        cr ·{" "}
                        {result.status === "PAID"
                          ? "Accreditati"
                          : "Accredito in sospeso: retry automatico"}
                      </p>
                      <p className="mt-1 text-xs text-content-secondary">
                        Estrazione {result.drawIndex} · {result.sharedWith}{" "}
                        vincitor{result.sharedWith === 1 ? "e" : "i"} · numeri{" "}
                        {result.winningNumbers.join(", ")}
                      </p>
                    </article>
                  ))
                )}
                <p className="text-xs text-content-muted">
                  Nessun acquisto automatico nel round successivo. Gli eventuali
                  crediti residui della ripartizione seguono un ordine
                  deterministico delle cartelle.
                </p>
              </div>
            </PanelShell>
          )}
        </div>
      )}

      {customisingAvatar && (
        <Suspense
          fallback={
            <div className="absolute inset-0 z-40 grid place-items-center bg-surface-950/90 text-sm text-content-primary/60">
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
