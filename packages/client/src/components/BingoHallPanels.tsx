import type {
  BingoMarkingMode,
  BingoPlayerSummary,
  BingoRoomTier,
  BingoStartMode,
  PrizeBreakdown,
  RoomBingoConfig,
} from "@bingo/shared";
import PrizePoolPanel from "./PrizePoolPanel";
import {
  QUALITY_PRESETS,
  useHallSettings,
  type HallQuality,
} from "../store/hallSettings";

/**
 * Small contextual panels that float over the hall.
 *
 * Every one of these is deliberately a card, not a page: the 3D room stays
 * visible and interactive behind them, which is the difference between
 * "preparing inside the hall" and "a lobby screen with a render behind it".
 */

export function PanelShell({
  title,
  subtitle,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <section
      role="dialog"
      aria-label={title}
      aria-modal="true"
      className={`pointer-events-auto max-h-full w-full ${width} overflow-y-auto rounded-xl border border-surface-500 bg-surface-900 shadow-panel`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-content-primary/8 px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-black text-content-primary">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-content-primary/50">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi pannello"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-content-primary/12 bg-content-primary/5 text-sm font-black text-content-primary hover:bg-content-primary/12"
        >
          ✕
        </button>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

export function PurchasePanel({
  config,
  balance,
  quantity,
  mode,
  alreadyBought,
  pending,
  selectionLocked,
  error,
  canPurchase,
  pool,
  myCards,
  onQuantity,
  onMode,
  onConfirm,
  onClose,
}: {
  config: RoomBingoConfig;
  balance: number;
  quantity: number;
  mode: BingoMarkingMode;
  alreadyBought: boolean;
  pending: boolean;
  selectionLocked: boolean;
  error: string | null;
  canPurchase: boolean;
  /** Live pool from the server; the panel never computes one of its own. */
  pool: PrizeBreakdown;
  myCards: number;
  onQuantity: (quantity: number) => void;
  onMode: (mode: BingoMarkingMode) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const limit =
    mode === "MANUAL" ? config.maxManualCards : config.maxAutomaticCards;
  const total = quantity * config.cardPrice;
  const remaining = balance - total;

  return (
    <PanelShell
      title="Cassa della sala"
      subtitle="Acquisto con soli crediti virtuali, senza valore reale"
      onClose={onClose}
    >
      <div className="grid gap-4">
        <PrizePoolPanel pool={pool} myCards={myCards} />
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          {(["MANUAL", "AUTOMATIC"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              disabled={alreadyBought || pending || selectionLocked}
              onClick={() => {
                onMode(option);
                onQuantity(
                  Math.min(
                    quantity,
                    option === "MANUAL"
                      ? config.maxManualCards
                      : config.maxAutomaticCards,
                  ),
                );
              }}
              className={`min-w-0 rounded-xl border p-3 text-left transition-[border-color,box-shadow] ${
                mode === option
                  ? "border-brand-300 bg-brand-400/18"
                  : "border-content-primary/10 bg-content-primary/4 hover:bg-content-primary/8"
              } disabled:opacity-50`}
            >
              <p className="font-display text-sm font-black text-content-primary">
                {option === "MANUAL" ? "✎ Manuale" : "✦ Automatica"}
              </p>
              <p className="mt-1 text-xs leading-snug text-content-primary/55">
                {option === "MANUAL"
                  ? "Segni tu i numeri sulle cartelle in tavola."
                  : "Il server segna solo i numeri realmente estratti."}
              </p>
            </button>
          ))}
        </div>

        <div>
          <p className="mb-2 text-2xs font-black uppercase tracking-[0.16em] text-content-primary/45">
            Quantità · massimo {limit}
          </p>
          <div className="grid grid-cols-3 gap-2 min-[380px]:grid-cols-6">
            {Array.from({ length: limit }, (_value, index) => index + 1).map(
              (count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={quantity === count}
                  disabled={alreadyBought || pending || selectionLocked}
                  onClick={() => onQuantity(count)}
                  className={`h-11 min-w-0 rounded-xl border font-display text-base font-black transition-[border-color,box-shadow] ${
                    quantity === count
                      ? "border-brand-300 bg-brand-500 text-content-primary shadow-glow-brand"
                      : "border-content-primary/12 bg-content-primary/5 text-content-primary hover:bg-content-primary/10"
                  } disabled:opacity-30`}
                >
                  {count}
                </button>
              ),
            )}
          </div>
        </div>

        <dl className="grid gap-1.5 rounded-xl border border-content-primary/10 bg-surface-950/25 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-content-primary/55">Costo unitario</dt>
            <dd className="font-black text-content-primary">
              {config.cardPrice} cr
            </dd>
          </div>
          <div className="flex justify-between border-t border-content-primary/8 pt-1.5">
            <dt className="text-content-primary/75">Totale</dt>
            <dd className="font-display text-lg font-black text-accent-300">
              {total} cr
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-content-primary/55">Saldo dopo</dt>
            <dd
              className={`font-black ${remaining < 0 ? "text-danger-400" : "text-success-400"}`}
            >
              {remaining} cr
            </dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={alreadyBought || pending || remaining < 0 || !canPurchase}
          onClick={onConfirm}
          className="w-full rounded-xl bg-gradient-to-r from-accent-300 to-accent-500 px-4 py-3 font-display text-base font-black text-content-inverse shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending
            ? "Acquisto in elaborazione…"
            : alreadyBought
              ? "✓ Cartelle già sul tavolo"
              : "Conferma acquisto"}
        </button>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger-500 bg-surface-900 p-3 text-sm text-danger-400"
          >
            {error}
          </p>
        )}
        {!canPurchase && !alreadyBought && (
          <p className="text-sm text-warning-400">
            Gli acquisti sono chiusi. Potrai partecipare dal prossimo round.
          </p>
        )}
        <p className="text-xs leading-relaxed text-content-secondary">
          {quantity === 6
            ? "Sestina: sei cartelle con copertura completa dei numeri da 1 a 90."
            : `${quantity} cartell${quantity === 1 ? "a" : "e"} per questo round.`}{" "}
          Cinquina e bingo si dichiarano sempre con i pulsanti. In manuale i
          segni sono un promemoria: puoi correggerli e non sostituiscono i
          numeri estratti.
        </p>
        <p className="text-center text-xs text-content-primary/40">
          Le cartelle compaiono sul tuo tavolo: raggiungi il posto e siediti.
        </p>
      </div>
    </PanelShell>
  );
}

/** Words rather than a bare number: "4 ospiti" was never what this meant. */
const CROWD_DENSITY_LABELS: Record<number, string> = {
  0: "Sala vuota",
  1: "Quasi deserta",
  2: "Tranquilla",
  3: "Normale",
  4: "Animata",
  5: "Affollata",
  6: "Tutto esaurito",
};

export function HostPanel({
  config,
  isHost,
  canStart,
  blockedReason,
  deferred,
  onCancelRound,
  onChange,
  onStart,
  onClose,
}: {
  config: RoomBingoConfig;
  isHost: boolean;
  canStart: boolean;
  blockedReason: string | null;
  deferred: boolean;
  onCancelRound: (() => void) | null;
  onChange: (config: RoomBingoConfig) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const update = <K extends keyof RoomBingoConfig>(
    key: K,
    value: RoomBingoConfig[K],
  ) => {
    onChange({ ...config, [key]: value });
  };

  const selectClass =
    "w-full rounded-lg border border-content-primary/12 bg-surface-850 px-3 py-2 text-sm font-bold text-content-primary outline-none focus:border-brand-400 disabled:opacity-50";

  return (
    <PanelShell
      title="Regia della sala"
      subtitle={
        isHost
          ? "Solo l’host può modificare queste impostazioni"
          : "Impostazioni scelte dall’host"
      }
      onClose={onClose}
    >
      {deferred && (
        <p className="mb-3 rounded-lg bg-surface-850 p-3 text-sm text-warning-400">
          Acquisti iniziati: queste modifiche valgono dal prossimo round. Il
          prezzo delle cartelle attuali resta invariato.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="col-span-full flex items-center gap-3 rounded-lg border border-surface-600 p-3 text-sm text-content-primary">
          <input
            type="checkbox"
            checked={config.training}
            disabled={!isHost}
            onChange={(event) => update("training", event.target.checked)}
            className="h-5 w-5 accent-brand-500"
          />
          Allenamento in solitaria (nessun bot avversario)
        </label>
        <label className="grid gap-1 text-xs font-bold text-content-primary/60">
          Partenza
          <select
            disabled={!isHost}
            value={config.startMode}
            onChange={(event) =>
              update("startMode", event.target.value as BingoStartMode)
            }
            className={selectClass}
          >
            <option value="HOST">Manuale dall’host</option>
            <option value="ALL_READY">Quando tutti sono pronti</option>
            <option value="TIMER">Timer programmato</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-content-primary/60">
          Sala
          <select
            disabled={!isHost}
            value={config.tier}
            onChange={(event) =>
              update("tier", event.target.value as BingoRoomTier)
            }
            className={selectClass}
          >
            <option value="ECONOMY">Economica</option>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium virtuale</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-content-primary/60">
          Conto alla rovescia
          <select
            disabled={!isHost}
            value={config.countdownSeconds}
            onChange={(event) =>
              update("countdownSeconds", Number(event.target.value))
            }
            className={selectClass}
          >
            <option value={5}>5 secondi (demo)</option>
            <option value={10}>10 secondi</option>
            <option value={30}>30 secondi</option>
            <option value={60}>60 secondi</option>
            <option value={90}>90 secondi</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-content-primary/60">
          Livello di caos
          <select
            disabled={!isHost}
            value={config.chaosLevel}
            onChange={(event) =>
              update(
                "chaosLevel",
                event.target.value as RoomBingoConfig["chaosLevel"],
              )
            }
            className={selectClass}
          >
            <option value="CLASSIC">Classico</option>
            <option value="LIGHT">Leggero</option>
            <option value="CHAOTIC">Caotico</option>
            <option value="ABSURD">Assurdo</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-content-primary/60">
          Affluenza in sala:{" "}
          {CROWD_DENSITY_LABELS[config.crowdDensity] ?? "Normale"}
          <input
            type="range"
            min={0}
            max={6}
            disabled={!isHost}
            value={config.crowdDensity}
            onChange={(event) =>
              update("crowdDensity", Number(event.target.value))
            }
            className="accent-brand-400"
          />
          <span className="text-2xs font-normal text-content-primary/40">
            La sala si riempie da sola secondo l'ora del giorno. Questo la
            scala.
          </span>
        </label>
        <label className="grid gap-1 text-xs font-bold text-content-primary/60">
          Ritmo chiamata: {(config.numberCallInterval / 1_000).toFixed(1)} s
          <input
            type="range"
            min={2_500}
            max={12_000}
            step={500}
            disabled={!isHost}
            value={config.numberCallInterval}
            onChange={(event) =>
              update("numberCallInterval", Number(event.target.value))
            }
            className="accent-accent-400"
          />
        </label>
      </div>
      {blockedReason && (
        <p className="mt-3 text-sm text-content-secondary">{blockedReason}</p>
      )}
      {isHost && config.startMode === "HOST" && (
        <button
          type="button"
          disabled={!canStart}
          onClick={onStart}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-brand-400 to-brand-600 px-4 py-3 font-display font-black text-content-primary shadow-lg disabled:opacity-35"
        >
          Avvia la partita
        </button>
      )}
      {onCancelRound && (
        <button
          type="button"
          onClick={onCancelRound}
          className="mt-3 w-full rounded-lg border border-danger-500 px-3 py-2 text-sm font-bold text-danger-400"
        >
          Annulla round e rimborsa gli acquisti
        </button>
      )}
    </PanelShell>
  );
}

const QUALITY_LABEL: Record<HallQuality, string> = {
  LOW: "Bassa",
  MEDIUM: "Media",
  HIGH: "Alta",
};

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useHallSettings();

  return (
    <PanelShell
      title="Impostazioni sala"
      subtitle="Grafica, movimento e audio"
      onClose={onClose}
    >
      <div className="grid gap-4">
        <div>
          <p className="mb-2 text-2xs font-black uppercase tracking-[0.16em] text-content-primary/45">
            Qualità grafica
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(QUALITY_PRESETS) as HallQuality[]).map((quality) => (
              <button
                key={quality}
                type="button"
                aria-pressed={settings.quality === quality}
                onClick={() => settings.applyQuality(quality)}
                className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
                  settings.quality === quality
                    ? "border-brand-300 bg-brand-400/20 text-content-primary"
                    : "border-content-primary/12 bg-content-primary/4 text-content-primary/70 hover:bg-content-primary/8"
                }`}
              >
                {QUALITY_LABEL[quality]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 text-sm font-bold text-content-primary/75">
          Ombre
          <input
            type="checkbox"
            checked={settings.shadows}
            onChange={(event) => settings.set("shadows", event.target.checked)}
            className="h-5 w-5 accent-brand-400"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm font-bold text-content-primary/75">
          Movimento ridotto
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(event) =>
              settings.set("reducedMotion", event.target.checked)
            }
            className="h-5 w-5 accent-brand-400"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm font-bold text-content-primary/75">
          Oscillazione della testa
          <input
            type="checkbox"
            checked={settings.headBob}
            onChange={(event) => settings.set("headBob", event.target.checked)}
            className="h-5 w-5 accent-brand-400"
          />
        </label>

        <label className="grid gap-1 text-xs font-bold text-content-primary/60">
          Densità ospiti in sala: {settings.ambientGuests}
          <input
            type="range"
            min={0}
            max={24}
            value={settings.ambientGuests}
            onChange={(event) =>
              settings.set("ambientGuests", Number(event.target.value))
            }
            className="accent-brand-400"
          />
        </label>

        <div className="grid gap-2 border-t border-content-primary/8 pt-3">
          <label className="flex items-center justify-between gap-3 text-sm font-bold text-content-primary/75">
            Audio della sala
            <input
              type="checkbox"
              checked={!settings.muted}
              onChange={(event) => settings.set("muted", !event.target.checked)}
              className="h-5 w-5 accent-brand-400"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-content-primary/60">
            Volume: {Math.round(settings.volume * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(event) =>
                settings.set("volume", Number(event.target.value) / 100)
              }
              className="accent-accent-400"
            />
          </label>
        </div>
      </div>
    </PanelShell>
  );
}

export function ReadyPanel({
  me,
  onToggleReady,
  onOpenPurchase,
}: {
  me: BingoPlayerSummary | undefined;
  onToggleReady: () => void;
  onOpenPurchase: () => void;
}) {
  const hasCards = (me?.cardCount ?? 0) > 0;
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-content-primary/12 bg-surface-900/86 p-2 shadow-xl backdrop-blur-md">
      <div className="px-2 text-xs leading-tight">
        <p className="font-black uppercase tracking-[0.14em] text-accent-300">
          {me?.balance ?? 0} crediti
        </p>
        <p className="text-content-primary/55">
          {hasCards
            ? `${me?.cardCount} cartell${me?.cardCount === 1 ? "a" : "e"} sul tavolo`
            : "Nessuna cartella"}
        </p>
      </div>
      {!hasCards ? (
        <button
          type="button"
          onClick={onOpenPurchase}
          className="rounded-xl bg-gradient-to-r from-accent-300 to-accent-500 px-4 py-2.5 font-display text-sm font-black text-content-inverse shadow-lg transition hover:-translate-y-0.5"
        >
          Acquista cartelle
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggleReady}
          className={`rounded-xl px-4 py-2.5 font-display text-sm font-black transition ${
            me?.ready
              ? "border border-content-primary/12 bg-content-primary/8 text-content-primary"
              : "bg-success-400 text-content-inverse shadow-lg"
          }`}
        >
          {me?.ready ? "Annulla pronto" : "✓ Sono pronto"}
        </button>
      )}
    </div>
  );
}
