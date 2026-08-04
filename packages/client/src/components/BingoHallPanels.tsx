import type {
  BingoMarkingMode,
  BingoPlayerSummary,
  BingoRoomTier,
  BingoStartMode,
  RoomBingoConfig,
} from '@bingo/shared';
import {
  QUALITY_PRESETS,
  useHallSettings,
  type HallQuality,
} from '../store/hallSettings';

/**
 * Small contextual panels that float over the hall.
 *
 * Every one of these is deliberately a card, not a page: the 3D room stays
 * visible and interactive behind them, which is the difference between
 * "preparing inside the hall" and "a lobby screen with a render behind it".
 */

function PanelShell({
  title,
  subtitle,
  onClose,
  children,
  width = 'max-w-md',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className={`pointer-events-auto w-full ${width} overflow-hidden rounded-2xl border border-white/12 bg-[#120d21]/94 shadow-[0_28px_80px_-30px_rgb(0_0_0_/_0.95)] backdrop-blur-xl`}>
      <div className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-black text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-white/50">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi pannello"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/12 bg-white/5 text-sm font-black text-white hover:bg-white/12"
        >
          ✕
        </button>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

export function PurchasePanel({
  config,
  balance,
  quantity,
  mode,
  alreadyBought,
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
  onQuantity: (quantity: number) => void;
  onMode: (mode: BingoMarkingMode) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const limit = mode === 'MANUAL' ? config.maxManualCards : config.maxAutomaticCards;
  const total = quantity * config.cardPrice;
  const remaining = balance - total;

  return (
    <PanelShell
      title="Cassa della sala"
      subtitle="Acquisto con soli crediti virtuali, senza valore reale"
      onClose={onClose}
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          {(['MANUAL', 'AUTOMATIC'] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={alreadyBought}
              onClick={() => {
                onMode(option);
                onQuantity(
                  Math.min(
                    quantity,
                    option === 'MANUAL' ? config.maxManualCards : config.maxAutomaticCards,
                  ),
                );
              }}
              className={`rounded-xl border p-3 text-left transition ${
                mode === option
                  ? 'border-violet-300 bg-violet-400/18'
                  : 'border-white/10 bg-white/4 hover:bg-white/8'
              } disabled:opacity-50`}
            >
              <p className="font-display text-sm font-black text-white">
                {option === 'MANUAL' ? '✎ Manuale' : '✦ Automatica'}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-white/55">
                {option === 'MANUAL'
                  ? 'Segni tu i numeri sulle cartelle in tavola.'
                  : 'Il server segna solo i numeri realmente estratti.'}
              </p>
            </button>
          ))}
        </div>

        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
            Quantità · massimo {limit}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: limit }, (_value, index) => index + 1).map((count) => (
              <button
                key={count}
                type="button"
                disabled={alreadyBought}
                onClick={() => onQuantity(count)}
                className={`h-11 w-11 rounded-xl border font-display text-base font-black transition ${
                  quantity === count
                    ? 'border-amber-300 bg-amber-300 text-[#241406]'
                    : 'border-white/12 bg-white/5 text-white hover:bg-white/10'
                } disabled:opacity-30`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <dl className="grid gap-1.5 rounded-xl border border-white/10 bg-black/25 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-white/55">Costo unitario</dt>
            <dd className="font-black text-white">{config.cardPrice} cr</dd>
          </div>
          <div className="flex justify-between border-t border-white/8 pt-1.5">
            <dt className="text-white/75">Totale</dt>
            <dd className="font-display text-lg font-black text-amber-300">{total} cr</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/55">Saldo dopo</dt>
            <dd className={`font-black ${remaining < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
              {remaining} cr
            </dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={alreadyBought || remaining < 0}
          onClick={onConfirm}
          className="w-full rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-3 font-display text-base font-black text-[#241406] shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {alreadyBought ? '✓ Cartelle già sul tavolo' : 'Ritira le cartelle'}
        </button>
        <p className="text-center text-[11px] text-white/40">
          Le cartelle compaiono sul tuo tavolo: raggiungi il posto e siediti.
        </p>
      </div>
    </PanelShell>
  );
}

export function HostPanel({
  config,
  isHost,
  canStart,
  onChange,
  onStart,
  onClose,
}: {
  config: RoomBingoConfig;
  isHost: boolean;
  canStart: boolean;
  onChange: (config: RoomBingoConfig) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const update = <K extends keyof RoomBingoConfig>(key: K, value: RoomBingoConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const selectClass =
    'w-full rounded-lg border border-white/12 bg-[#0c0918] px-3 py-2 text-sm font-bold text-white outline-none focus:border-violet-400 disabled:opacity-50';

  return (
    <PanelShell
      title="Regia della sala"
      subtitle={isHost ? 'Solo l’host può modificare queste impostazioni' : 'Impostazioni scelte dall’host'}
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[11px] font-bold text-white/60">
          Partenza
          <select
            disabled={!isHost}
            value={config.startMode}
            onChange={(event) => update('startMode', event.target.value as BingoStartMode)}
            className={selectClass}
          >
            <option value="HOST">Manuale dall’host</option>
            <option value="ALL_READY">Quando tutti sono pronti</option>
            <option value="TIMER">Timer programmato</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-white/60">
          Sala
          <select
            disabled={!isHost}
            value={config.tier}
            onChange={(event) => update('tier', event.target.value as BingoRoomTier)}
            className={selectClass}
          >
            <option value="ECONOMY">Economica</option>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium virtuale</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-white/60">
          Conto alla rovescia
          <select
            disabled={!isHost}
            value={config.countdownSeconds}
            onChange={(event) => update('countdownSeconds', Number(event.target.value))}
            className={selectClass}
          >
            <option value={5}>5 secondi (demo)</option>
            <option value={30}>30 secondi</option>
            <option value={60}>60 secondi</option>
            <option value={90}>90 secondi</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-white/60">
          Livello di caos
          <select
            disabled={!isHost}
            value={config.chaosLevel}
            onChange={(event) => update('chaosLevel', event.target.value as RoomBingoConfig['chaosLevel'])}
            className={selectClass}
          >
            <option value="CLASSIC">Classico</option>
            <option value="LIGHT">Leggero</option>
            <option value="CHAOTIC">Caotico</option>
            <option value="ABSURD">Assurdo</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-white/60">
          NPC ai posti liberi: {config.npcCount}
          <input
            type="range"
            min={0}
            max={6}
            disabled={!isHost}
            value={config.npcCount}
            onChange={(event) => update('npcCount', Number(event.target.value))}
            className="accent-violet-400"
          />
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-white/60">
          Ritmo chiamata: {(config.numberCallInterval / 1_000).toFixed(1)} s
          <input
            type="range"
            min={2_500}
            max={12_000}
            step={500}
            disabled={!isHost}
            value={config.numberCallInterval}
            onChange={(event) => update('numberCallInterval', Number(event.target.value))}
            className="accent-amber-400"
          />
        </label>
      </div>
      {isHost && config.startMode === 'HOST' && (
        <button
          type="button"
          disabled={!canStart}
          onClick={onStart}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-400 to-indigo-600 px-4 py-3 font-display font-black text-white shadow-lg disabled:opacity-35"
        >
          Avvia la partita
        </button>
      )}
    </PanelShell>
  );
}

const QUALITY_LABEL: Record<HallQuality, string> = {
  LOW: 'Bassa',
  MEDIUM: 'Media',
  HIGH: 'Alta',
};

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useHallSettings();

  return (
    <PanelShell title="Impostazioni sala" subtitle="Grafica, movimento e audio" onClose={onClose}>
      <div className="grid gap-4">
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Qualità grafica</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(QUALITY_PRESETS) as HallQuality[]).map((quality) => (
              <button
                key={quality}
                type="button"
                aria-pressed={settings.quality === quality}
                onClick={() => settings.applyQuality(quality)}
                className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
                  settings.quality === quality
                    ? 'border-violet-300 bg-violet-400/20 text-white'
                    : 'border-white/12 bg-white/4 text-white/70 hover:bg-white/8'
                }`}
              >
                {QUALITY_LABEL[quality]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 text-sm font-bold text-white/75">
          Ombre
          <input
            type="checkbox"
            checked={settings.shadows}
            onChange={(event) => settings.set('shadows', event.target.checked)}
            className="h-5 w-5 accent-violet-400"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm font-bold text-white/75">
          Movimento ridotto
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(event) => settings.set('reducedMotion', event.target.checked)}
            className="h-5 w-5 accent-violet-400"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm font-bold text-white/75">
          Oscillazione della testa
          <input
            type="checkbox"
            checked={settings.headBob}
            onChange={(event) => settings.set('headBob', event.target.checked)}
            className="h-5 w-5 accent-violet-400"
          />
        </label>

        <label className="grid gap-1 text-[11px] font-bold text-white/60">
          Densità ospiti in sala: {settings.ambientGuests}
          <input
            type="range"
            min={0}
            max={24}
            value={settings.ambientGuests}
            onChange={(event) => settings.set('ambientGuests', Number(event.target.value))}
            className="accent-violet-400"
          />
        </label>

        <div className="grid gap-2 border-t border-white/8 pt-3">
          <label className="flex items-center justify-between gap-3 text-sm font-bold text-white/75">
            Audio della sala
            <input
              type="checkbox"
              checked={!settings.muted}
              onChange={(event) => settings.set('muted', !event.target.checked)}
              className="h-5 w-5 accent-violet-400"
            />
          </label>
          <label className="grid gap-1 text-[11px] font-bold text-white/60">
            Volume: {Math.round(settings.volume * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(event) => settings.set('volume', Number(event.target.value) / 100)}
              className="accent-amber-400"
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
    <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/12 bg-[#120d21]/86 p-2 shadow-xl backdrop-blur-md">
      <div className="px-2 text-[11px] leading-tight">
        <p className="font-black uppercase tracking-[0.14em] text-amber-300">
          {me?.balance ?? 0} crediti
        </p>
        <p className="text-white/55">
          {hasCards ? `${me?.cardCount} cartell${me?.cardCount === 1 ? 'a' : 'e'} sul tavolo` : 'Nessuna cartella'}
        </p>
      </div>
      {!hasCards ? (
        <button
          type="button"
          onClick={onOpenPurchase}
          className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2.5 font-display text-sm font-black text-[#241406] shadow-lg transition hover:-translate-y-0.5"
        >
          Acquista cartelle
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggleReady}
          className={`rounded-xl px-4 py-2.5 font-display text-sm font-black transition ${
            me?.ready
              ? 'border border-white/12 bg-white/8 text-white'
              : 'bg-emerald-400 text-[#08251b] shadow-lg'
          }`}
        >
          {me?.ready ? 'Annulla pronto' : '✓ Sono pronto'}
        </button>
      )}
    </div>
  );
}
