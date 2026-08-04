import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  SlotMachineDetail,
  SlotMachineSummary,
  SlotSpinResponse,
} from '@bingo/shared';
import { ApiError, api } from '../lib/api';
import { ResponsiblePlayNotice } from '../components/ui';
import TouchJoystick from '../components/TouchJoystick';
import { disposeHallAudio, playHallSfx } from '../audio/hallAudio';
import { useHallSettings } from '../store/hallSettings';
import type { CabinetPlacement } from '../three/arcade/arcadeLayout';

const ArcadeScene = lazy(() => import('../three/arcade/ArcadeScene'));
const SlotReelPanel = lazy(() => import('../components/SlotReelPanel'));

/**
 * The slot arcade.
 *
 * Walk in, walk up to a cabinet, press E. Every spin is a request to the
 * server: the bet leaves the wallet there, the reels are resolved there, and
 * the win is credited there. Nothing on this page decides an outcome — it only
 * animates one it was handed.
 */

function requestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `spin-${crypto.randomUUID()}`
    : `spin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ArcadePage() {
  const navigate = useNavigate();
  const settings = useHallSettings();

  const [machines, setMachines] = useState<SlotMachineSummary[]>([]);
  const [nearCabinet, setNearCabinet] = useState<CabinetPlacement | null>(null);
  const [openMachine, setOpenMachine] = useState<SlotMachineDetail | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [betPerLine, setBetPerLine] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  const reducedMotion = settings.reducedMotion || systemReducedMotion;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setSystemReducedMotion(media.matches);
    apply();
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => () => disposeHallAudio(), []);

  useEffect(() => {
    let active = true;
    void Promise.all([api.slots({ limit: 20 }), api.balance()])
      .then(([slots, wallet]) => {
        if (!active) return;
        setMachines(slots.machines);
        setBalance(wallet.balance);
      })
      .catch(() => {
        if (active) setLoadError('Non riesco a caricare le slot della sala.');
      });
    return () => {
      active = false;
    };
  }, []);

  /** Opens the machine standing in the cabinet the player is next to. */
  const openCabinet = useCallback(async () => {
    if (!nearCabinet) return;
    const summary = machines[nearCabinet.index];
    if (!summary) return;
    setError(null);
    try {
      const [detail, commit] = await Promise.all([
        api.slot(summary.id),
        api.slotCommitment(summary.id).catch(() => null),
      ]);
      setOpenMachine(detail.machine);
      setBetPerLine(Math.max(1, detail.machine.minBetCredits));
      setCommitment(commit?.entries[0]?.serverSeedHash ?? null);
      playHallSfx('purchase');
    } catch {
      setError('Questa macchina non è disponibile.');
    }
  }, [machines, nearCabinet]);

  const spin = useCallback(async (): Promise<SlotSpinResponse | null> => {
    if (!openMachine) return null;
    setBusy(true);
    setError(null);
    try {
      const { spin: result } = await api.spinSlot(openMachine.id, betPerLine, requestId());
      setBalance(result.balanceAfter);
      // Refresh the commitment so the next spin's hash is on screen before it
      // is played, which is the whole point of publishing it.
      void api
        .slotCommitment(openMachine.id)
        .then((next) => setCommitment(next.entries[0]?.serverSeedHash ?? null))
        .catch(() => undefined);
      return result;
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'insufficient_funds'
          ? 'Crediti virtuali insufficienti per questa puntata.'
          : 'Il giro non è andato a buon fine. Riprova.',
      );
      return null;
    } finally {
      setBusy(false);
    }
  }, [openMachine, betPerLine]);

  const nearName = useMemo(() => {
    if (!nearCabinet) return null;
    return machines[nearCabinet.index]?.name ?? null;
  }, [machines, nearCabinet]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-surface-950 text-content-primary">
      <div className="absolute inset-0">
        {sceneFailed ? (
          <ArcadeFallback machines={machines} onOpen={(machine) => void openMachineById(machine)} />
        ) : (
          <Suspense
            fallback={
              <div className="grid h-full place-items-center text-sm text-content-muted">
                Apertura della sala arcade…
              </div>
            }
          >
            <ArcadeScene
              machines={machines}
              activeCabinet={nearCabinet?.index ?? null}
              inputEnabled={openMachine === null}
              quality={settings.quality}
              shadows={settings.shadows}
              reducedMotion={reducedMotion}
              onNearCabinet={setNearCabinet}
              onInteract={() => void openCabinet()}
              onSceneError={() => setSceneFailed(true)}
            />
          </Suspense>
        )}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 bg-gradient-to-b from-surface-950/85 to-transparent p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/hub')}
            aria-label="Torna alla piazza"
            className="grid h-10 w-10 place-items-center rounded-lg border border-surface-500 bg-surface-900/70 font-black backdrop-blur hover:bg-surface-800"
          >
            ←
          </button>
          <div className="rounded-lg border border-surface-600 bg-surface-900/60 px-3 py-1.5 backdrop-blur">
            <p className="text-2xs font-black uppercase tracking-[0.2em] text-brand-300">
              Arcade Slot
            </p>
            <p className="text-xs text-content-secondary">
              {machines.length} macchine in sala
            </p>
          </div>
        </div>
        <div className="pointer-events-auto rounded-lg border border-surface-600 bg-surface-900/60 px-3 py-2 text-right backdrop-blur">
          <p className="text-2xs uppercase tracking-[0.16em] text-content-muted">Saldo</p>
          <p className="tabular font-semibold text-accent-300">{balance} crediti</p>
        </div>
      </header>

      {loadError && (
        <div className="absolute inset-x-0 top-20 z-30 flex justify-center px-4" aria-live="assertive">
          <p className="rounded-lg border border-danger-500/50 bg-surface-900/95 px-4 py-2 text-sm text-danger-400">
            {loadError}
          </p>
        </div>
      )}

      {!openMachine && nearCabinet && !sceneFailed && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-surface-500 bg-surface-900/85 px-4 py-2 text-center text-sm font-semibold backdrop-blur">
          <kbd className="mr-2 rounded border border-surface-400 bg-surface-800 px-2 py-0.5 font-mono text-xs">
            E
          </kbd>
          {nearName ? `per giocare a ${nearName}` : 'cabinato fuori servizio'}
        </div>
      )}

      {!openMachine && !sceneFailed && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60"
          />
          <div className="pointer-events-none absolute bottom-6 left-4 z-20 sm:hidden">
            <TouchJoystick />
          </div>
        </>
      )}

      {openMachine && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-surface-950/60 p-4 backdrop-blur-sm">
          <Suspense fallback={<p className="text-sm text-content-muted">Accensione…</p>}>
            <SlotReelPanel
              machine={openMachine}
              balance={balance}
              betPerLine={betPerLine}
              onBetPerLine={setBetPerLine}
              onSpin={spin}
              onClose={() => {
                setOpenMachine(null);
                setError(null);
              }}
              commitment={commitment}
              busy={busy}
              error={error}
            />
          </Suspense>
        </div>
      )}

      <ResponsiblePlayNotice className="pointer-events-none absolute bottom-0 left-1/2 z-10 hidden -translate-x-1/2 px-4 pb-1 text-center opacity-60 lg:block" />
    </main>
  );

  async function openMachineById(summary: SlotMachineSummary): Promise<void> {
    try {
      const [detail, commit] = await Promise.all([
        api.slot(summary.id),
        api.slotCommitment(summary.id).catch(() => null),
      ]);
      setOpenMachine(detail.machine);
      setBetPerLine(Math.max(1, detail.machine.minBetCredits));
      setCommitment(commit?.entries[0]?.serverSeedHash ?? null);
    } catch {
      setError('Questa macchina non è disponibile.');
    }
  }
}

/**
 * Flat list of the machines, for a device that cannot give us WebGL.
 *
 * Same machines, same server, same spins — only the room is missing.
 */
function ArcadeFallback({
  machines,
  onOpen,
}: {
  machines: readonly SlotMachineSummary[];
  onOpen: (machine: SlotMachineSummary) => void;
}) {
  return (
    <div className="h-full overflow-y-auto px-4 pb-24 pt-24">
      <div className="mx-auto max-w-2xl">
        <p className="rounded-lg border border-warning-500/40 bg-warning-500/10 px-4 py-2 text-xs text-warning-400">
          La grafica 3D non è disponibile su questo dispositivo. Le macchine e le regole sono
          identiche: cambia solo la sala attorno.
        </p>
        <ul className="mt-4 grid gap-2">
          {machines.map((machine) => (
            <li key={machine.id}>
              <button
                type="button"
                onClick={() => onOpen(machine)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-surface-600 bg-surface-850 px-4 py-3 text-left hover:border-brand-400"
              >
                <span>
                  <span className="block font-semibold text-content-primary">{machine.name}</span>
                  <span className="block text-2xs text-content-muted">
                    {machine.paylineCount} linee · RTP{' '}
                    {(((machine.rtpSimulated ?? machine.rtpTheoretical) ?? 0) * 100).toFixed(1)}%
                  </span>
                </span>
                <span className="text-2xs font-black uppercase tracking-wider text-brand-300">
                  Gioca
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
