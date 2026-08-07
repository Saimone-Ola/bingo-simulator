import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CLASSIC_PAYLINES,
  SLOT_THEMES,
  SLOT_THEME_LABELS,
  allLibrarySymbols,
  suggestedWeights,
  themeSymbols,
  type SlotTheme,
  SLOT_PUBLISH_SIMULATION_SPINS,
  SLOT_VOLATILITIES,
  SLOT_VOLATILITY_LABELS,
  defaultSlotConfig,
  slotPreset,
  type SlotConfig,
  type SlotSymbol as SlotSymbolConfig,
  type SlotMachineDetail,
  type SlotMachineSummary,
  type SlotSimulationReport,
  type SlotVolatility,
} from '@bingo/shared';
import { ApiError, api } from '../lib/api';
import {
  SLOT_RTP_MAX,
  SLOT_RTP_MIN,
  driftNote,
  editorSummary,
  hasPayline,
  payoutLengths,
  problemLabel,
  setFreeSpins,
  setPayout,
  setSymbolWeight,
  symbolStats,
  togglePayline,
} from '../lib/slotEditor';
import { Badge, Button, Field, Panel } from '../components/ui';
import SlotSymbol from '../components/SlotSymbol';

/**
 * The slot editor.
 *
 * Two figures sit side by side here and they are not the same figure. The
 * *calcolato* RTP is a closed form sum over the reel strips and the paytable:
 * it is exact, it updates on every keystroke, and it is what a designer steers
 * with. The *misurato* RTP is a Monte Carlo run on the server: it is the one
 * that decides whether the machine may be published, because it also contains
 * the scatters and the free spin feedback that no closed form here accounts
 * for. Showing both, and the gap between them, is the point of this screen.
 *
 * Nothing on this page decides whether a machine is legal. The editor can show
 * a green RTP all it likes; publication re-runs the simulation server side on
 * the stored configuration and refuses anything outside the window.
 */

const SYMBOL_ART = new Map(allLibrarySymbols().map((entry) => [entry.id, entry] as const));
const UNKNOWN_SYMBOL = { shape: 'circle' as const, color: '#8a80a8', accent: '#4a4266' };

function artFor(symbolId: string) {
  return SYMBOL_ART.get(symbolId) ?? UNKNOWN_SYMBOL;
}

/**
 * Swaps the machine's symbol set for another theme's, keeping the maths.
 *
 * The old symbol each new one inherits from is matched by *kind first, then
 * rank* — never by position in the array. A preset has six symbols with the
 * wild fifth and the scatter sixth; a theme has eight with the wild seventh and
 * the scatter eighth. Matching by index therefore handed the wild's paytable to
 * a bell and left the new wild and scatter paying nothing, which turns a
 * restyle into a silent recalibration of the machine's RTP.
 */
function applyTheme(config: SlotConfig, theme: SlotTheme): SlotConfig {
  const entries = themeSymbols(theme);
  const weights = suggestedWeights(theme);

  // Ranked within each kind, so the commonest old symbol feeds the commonest
  // new one and the wild feeds the wild.
  const previousByKind = new Map<SlotSymbolConfig['kind'], SlotSymbolConfig[]>();
  for (const symbol of config.symbols) {
    const bucket = previousByKind.get(symbol.kind) ?? [];
    bucket.push(symbol);
    previousByKind.set(symbol.kind, bucket);
  }
  const takenSoFar = new Map<SlotSymbolConfig['kind'], number>();
  const inherit = (kind: SlotSymbolConfig['kind']): SlotSymbolConfig | undefined => {
    const index = takenSoFar.get(kind) ?? 0;
    takenSoFar.set(kind, index + 1);
    return previousByKind.get(kind)?.[index];
  };

  const symbols: SlotSymbolConfig[] = [];
  const paytable: Record<string, Record<number, number>> = {};
  for (const entry of entries) {
    const old = inherit(entry.kind);
    symbols.push({
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      // Reuse the weights already tuned where the ranks line up, so switching
      // theme restyles a machine instead of resetting the work done on it.
      weights:
        old?.weights.length === config.reels
          ? [...old.weights]
          : Array.from({ length: config.reels }, () => weights[entry.id] ?? 10),
    });
    paytable[entry.id] = old ? { ...(config.paytable[old.id] ?? {}) } : {};
  }

  return { ...config, symbols, paytable };
}

const SIMULATION_CHOICES = [10_000, 50_000, 200_000] as const;

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export default function SlotEditorPage() {
  const navigate = useNavigate();

  const [mine, setMine] = useState<SlotMachineSummary[]>([]);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [status, setStatus] = useState<SlotMachineDetail['status'] | 'new'>('new');
  const [name, setName] = useState('La mia slot');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<SlotConfig>(() => defaultSlotConfig());
  const [report, setReport] = useState<SlotSimulationReport | null>(null);
  const [spins, setSpins] = useState<number>(10_000);
  const [busy, setBusy] = useState<null | 'save' | 'simulate' | 'publish'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recomputed on every edit. It is a closed form sum, not a simulation, so
  // this is cheap enough to run inline without a debounce.
  const summary = useMemo(() => editorSummary(config), [config]);
  const stats = useMemo(() => symbolStats(config), [config]);
  const lengths = useMemo(() => payoutLengths(config), [config]);

  const refreshMine = useCallback(async () => {
    try {
      const { machines } = await api.slots({ mine: true, limit: 50 });
      setMine(machines);
    } catch {
      /* The editor still works on an unsaved machine. */
    }
  }, []);

  useEffect(() => {
    void refreshMine();
  }, [refreshMine]);

  /** Any edit invalidates the measurement: it was made on the old strips. */
  const edit = useCallback((next: SlotConfig) => {
    setConfig(next);
    setReport(null);
    setNotice(null);
  }, []);

  const loadPreset = (volatility: SlotVolatility) => {
    edit(slotPreset(volatility));
  };

  const load = async (id: string) => {
    setError(null);
    try {
      const { machine } = await api.slot(id);
      setMachineId(machine.id);
      setStatus(machine.status);
      setName(machine.name);
      setDescription(machine.description ?? '');
      setConfig(machine.config);
      setReport(null);
      setNotice(null);
    } catch {
      setError('Non riesco ad aprire questa macchina.');
    }
  };

  const startNew = () => {
    setMachineId(null);
    setStatus('new');
    setName('La mia slot');
    setDescription('');
    setConfig(defaultSlotConfig());
    setReport(null);
    setNotice(null);
    setError(null);
  };

  const body = () => ({
    name: name.trim(),
    ...(description.trim() ? { description: description.trim() } : {}),
    config,
    minBetCredits: 1,
    maxBetCredits: 100,
  });

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      const { machine } = machineId
        ? await api.updateSlot(machineId, body())
        : await api.createSlot(body());
      setMachineId(machine.id);
      setStatus(machine.status);
      setNotice('Configurazione salvata come bozza.');
      void refreshMine();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? `Salvataggio rifiutato: ${caught.message}`
          : 'Salvataggio non riuscito.',
      );
    } finally {
      setBusy(null);
    }
  };

  /**
   * Runs the Monte Carlo on the server, on the configuration currently on
   * screen, without saving it. The measured figure is never sent up — only the
   * configuration goes, and only a report comes back.
   */
  const simulate = async () => {
    setBusy('simulate');
    setError(null);
    try {
      const { report: measured } = await api.simulateSlot(config, spins);
      setReport(measured);
      setNotice(null);
    } catch {
      setError('La simulazione non è andata a buon fine.');
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!machineId) return;
    setBusy('publish');
    setError(null);
    try {
      const result = await api.publishSlot(machineId);
      setStatus(result.machine.status);
      setReport(result.report);
      setNotice(
        result.machine.status === 'published'
          ? `Pubblicata. Il server ha misurato ${percent(result.report.rtp)} su ${result.simulationSpins.toLocaleString('it-IT')} giri.`
          : `Rifiutata dal server: ${result.machine.rejectionReason ?? 'configurazione non ammissibile'}.`,
      );
      void refreshMine();
    } catch {
      setError('La pubblicazione non è andata a buon fine.');
    } finally {
      setBusy(null);
    }
  };

  const blocked = summary.problems.length > 0;

  return (
    <main className="min-h-dvh bg-surface-950 px-4 py-6 text-content-primary">
      <div className="mx-auto grid max-w-6xl gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/arcade')}
              aria-label="Torna all’arcade"
              className="grid h-10 w-10 place-items-center rounded-lg border border-surface-600 bg-surface-900 font-black hover:bg-surface-800"
            >
              ←
            </button>
            <div>
              <h1 className="font-display text-2xl font-black">Editor slot</h1>
              <p className="text-xs text-content-muted">
                Progetta i rulli, misura l’RTP, pubblica in sala.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status === 'published' ? 'success' : status === 'rejected' ? 'danger' : 'neutral'}>
              {status === 'new' ? 'non salvata' : status}
            </Badge>
            <Button variant="ghost" size="sm" onClick={startNew}>
              Nuova
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void save()}
              loading={busy === 'save'}
              disabled={blocked || name.trim().length < 2}
            >
              Salva bozza
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void publish()}
              loading={busy === 'publish'}
              disabled={!machineId || blocked}
              title={machineId ? undefined : 'Salva prima la bozza'}
            >
              Pubblica
            </Button>
          </div>
        </header>

        {error && (
          <p role="alert" className="rounded-lg border border-danger-500/50 bg-danger-500/10 px-4 py-2 text-sm text-danger-400">
            {error}
          </p>
        )}
        {notice && (
          <p aria-live="polite" className="rounded-lg border border-brand-500/50 bg-brand-500/10 px-4 py-2 text-sm text-brand-200">
            {notice}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-4">
            {/* Identity and starting point */}
            <Panel className="grid gap-4 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Nome"
                  name="slot-name"
                  value={name}
                  maxLength={48}
                  onChange={(event) => setName(event.target.value)}
                />
                <Field
                  label="Descrizione"
                  name="slot-description"
                  value={description}
                  maxLength={280}
                  placeholder="Facoltativa"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div>
                <p className="mb-2 text-2xs font-black uppercase tracking-[0.16em] text-content-muted">
                  Parti da un preset
                </p>
                <div className="flex flex-wrap gap-2">
                  {SLOT_VOLATILITIES.map((volatility) => (
                    <Button
                      key={volatility}
                      size="sm"
                      variant={config.volatility === volatility ? 'accent' : 'ghost'}
                      onClick={() => loadPreset(volatility)}
                    >
                      {SLOT_VOLATILITY_LABELS[volatility]}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-2xs text-content-muted">
                  La volatilità non cambia quanto la macchina restituisce: cambia in quante
                  vincite lo restituisce. Si modella con i pesi dei rulli e la tabella paga,
                  mai con l’RTP.
                </p>
              </div>

              <div>
                <p className="mb-2 text-2xs font-black uppercase tracking-[0.16em] text-content-muted">
                  Tema dei simboli
                </p>
                <div className="flex flex-wrap gap-2">
                  {SLOT_THEMES.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => edit(applyTheme(config, theme))}
                      className="flex items-center gap-1.5 rounded-lg border border-surface-600 bg-surface-850 px-2.5 py-1.5 text-xs font-semibold text-content-secondary transition-colors hover:border-brand-400 hover:text-content-primary"
                    >
                      <span aria-hidden="true" className="flex gap-0.5">
                        {themeSymbols(theme)
                          .slice(0, 3)
                          .map((entry) => (
                            <span key={entry.id} className="inline-block h-4 w-4">
                              <SlotSymbol shape={entry.shape} color={entry.color} accent={entry.accent} />
                            </span>
                          ))}
                      </span>
                      {SLOT_THEME_LABELS[theme]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-2xs text-content-muted">
                  Cambiare tema ridisegna i simboli e conserva pesi e tabella paga: è una
                  riverniciatura, non un azzeramento del lavoro fatto.
                </p>
              </div>
            </Panel>

            {/* Reel strips */}
            <Panel className="grid gap-3 p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-black">Nastri dei rulli</h2>
                <p className="text-2xs text-content-muted">
                  peso per rullo · più alto = più frequente
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-sm">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wider text-content-muted">
                      <th className="pb-2 text-left font-black">Simbolo</th>
                      {Array.from({ length: config.reels }, (_value, reel) => (
                        <th key={reel} className="pb-2 text-center font-black">
                          R{reel + 1}
                        </th>
                      ))}
                      <th className="pb-2 text-right font-black">p(cella)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((stat) => (
                      <tr key={stat.symbol.id} className="border-t border-surface-700/70">
                        <td className="py-1.5 pr-2">
                          <span className="mr-1.5 inline-block h-4 w-4 align-[-3px]" aria-hidden="true">
                            <SlotSymbol {...artFor(stat.symbol.id)} />
                          </span>
                          <span className="font-medium">{stat.symbol.name}</span>
                          {stat.symbol.kind !== 'normal' && (
                            <span className="ml-1.5 text-2xs uppercase tracking-wider text-brand-300">
                              {stat.symbol.kind}
                            </span>
                          )}
                        </td>
                        {stat.symbol.weights.map((weight, reel) => (
                          <td key={reel} className="px-1 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={1000}
                              value={weight}
                              aria-label={`Peso di ${stat.symbol.name} sul rullo ${reel + 1}`}
                              onChange={(event) =>
                                edit(setSymbolWeight(config, stat.symbol.id, reel, Number(event.target.value)))
                              }
                              className="w-16 rounded-md border border-surface-600 bg-surface-950/60 px-2 py-1 text-center tabular focus:border-brand-400 focus:outline-none"
                            />
                          </td>
                        ))}
                        <td className="py-1.5 text-right tabular text-content-muted">
                          {percent(stat.averageProbability)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Paytable */}
            <Panel className="grid gap-3 p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-black">Tabella paga</h2>
                <p className="text-2xs text-content-muted">moltiplicatori della puntata di linea</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] border-collapse text-sm">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wider text-content-muted">
                      <th className="pb-2 text-left font-black">Simbolo</th>
                      {lengths.map((length) => (
                        <th key={length} className="pb-2 text-center font-black">
                          {length} uguali
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {config.symbols.map((symbol) => (
                      <tr key={symbol.id} className="border-t border-surface-700/70">
                        <td className="py-1.5 pr-2">
                          <span className="mr-1.5 inline-block h-4 w-4 align-[-3px]" aria-hidden="true">
                            <SlotSymbol {...artFor(symbol.id)} />
                          </span>
                          {symbol.name}
                        </td>
                        {lengths.map((length) => (
                          <td key={length} className="px-1 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={config.paytable[symbol.id]?.[length] ?? 0}
                              aria-label={`Pagamento di ${symbol.name} per ${length} simboli`}
                              onChange={(event) =>
                                edit(setPayout(config, symbol.id, length, Number(event.target.value)))
                              }
                              className="w-20 rounded-md border border-surface-600 bg-surface-950/60 px-2 py-1 text-center tabular focus:border-brand-400 focus:outline-none"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-2xs text-content-muted">
                Uno zero toglie il pagamento: la combinazione smette di essere una vincita.
              </p>
            </Panel>

            {/* Paylines */}
            <Panel className="grid gap-3 p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-black">Linee di pagamento</h2>
                <p className="text-2xs text-content-muted">{config.paylines.length} attive</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {CLASSIC_PAYLINES.map((payline, index) => {
                  const active = hasPayline(config, payline);
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => edit(togglePayline(config, payline))}
                      aria-pressed={active}
                      aria-label={`Linea ${index + 1}`}
                      className={`grid gap-1 rounded-lg border p-2 transition ${
                        active
                          ? 'border-accent-400 bg-accent-500/15'
                          : 'border-surface-600 bg-surface-850 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <span className="text-2xs font-black uppercase tracking-wider text-content-muted">
                        L{index + 1}
                      </span>
                      <span
                        className="grid gap-0.5"
                        style={{ gridTemplateColumns: `repeat(${config.reels}, 1fr)` }}
                        aria-hidden="true"
                      >
                        {Array.from({ length: config.rows * config.reels }, (_value, cell) => {
                          const reel = cell % config.reels;
                          const row = Math.floor(cell / config.reels);
                          const on = payline[reel] === row;
                          return (
                            <span
                              key={cell}
                              className={`h-2 rounded-sm ${on ? 'bg-accent-400' : 'bg-surface-600'}`}
                            />
                          );
                        })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* Free spins */}
            <Panel className="grid gap-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-black">Giri gratuiti</h2>
                <Button
                  size="sm"
                  variant={summary.freeSpins ? 'accent' : 'ghost'}
                  onClick={() => edit(setFreeSpins(config, summary.freeSpins ? null : {}))}
                >
                  {summary.freeSpins ? 'Attivi' : 'Disattivati'}
                </Button>
              </div>
              {config.features.freeSpins && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['triggerScatters', 'Scatter necessari', 2, 5],
                      ['spins', 'Giri assegnati', 1, 50],
                      ['multiplier', 'Moltiplicatore', 1, 10],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <label key={key} className="grid gap-1 text-sm">
                      <span className="text-2xs font-black uppercase tracking-wider text-content-muted">
                        {label}
                      </span>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={config.features.freeSpins?.[key] ?? min}
                        onChange={(event) =>
                          edit(setFreeSpins(config, { [key]: Number(event.target.value) }))
                        }
                        className="rounded-md border border-surface-600 bg-surface-950/60 px-2 py-1.5 tabular focus:border-brand-400 focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
              )}
              <p className="text-2xs text-content-muted">
                I giri gratuiti non entrano nel calcolo analitico: si vedono solo nella
                misura simulata, ed è per questo che le due cifre non coincidono mai.
              </p>
            </Panel>
          </div>

          {/* Live analysis, sticky beside the form */}
          <aside className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start">
            <Panel className="grid gap-3 p-4">
              <h2 className="font-display text-base font-black">RTP calcolato · gioco base</h2>
              <p className="font-display text-4xl font-black tabular text-brand-200">
                {blocked ? '—' : percent(summary.analyticRtp)}
              </p>
              <p className="text-2xs text-content-muted">
                Somma in forma chiusa su nastri e tabella paga: esatta, istantanea, e sempre
                <em> sotto</em> quello che la macchina paga davvero, perché non contiene né
                scatter né giri gratuiti. È un limite inferiore, non il valore da pubblicare.
              </p>
              {summary.overCeiling && (
                <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-2 py-1.5 text-2xs text-danger-300">
                  Le sole linee superano già il tetto del {percent(SLOT_RTP_MAX)}: nessuna
                  simulazione può riportare la macchina dentro la finestra, perché le funzioni
                  aggiungono soltanto ritorno.
                </p>
              )}

              {summary.problems.length > 0 ? (
                <ul className="grid gap-1 rounded-lg border border-danger-500/40 bg-danger-500/10 p-2 text-2xs text-danger-300">
                  {summary.problems.map((problem) => (
                    <li key={problem}>{problemLabel(problem)}</li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-success-500/40 bg-success-500/10 px-2 py-1.5 text-2xs text-success-400">
                  Configurazione valida: {summary.symbolCount} simboli, {summary.paylineCount} linee
                  {summary.hasWild && ', wild'}
                  {summary.hasScatter && ', scatter'}.
                </p>
              )}
            </Panel>

            <Panel className="grid gap-3 p-4">
              <h2 className="font-display text-base font-black">RTP misurato · totale</h2>
              <p className="text-2xs text-content-muted">
                Monte Carlo sul server, funzioni comprese. È questa la cifra confrontata con la
                finestra {percent(SLOT_RTP_MIN)}–{percent(SLOT_RTP_MAX)}.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SIMULATION_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setSpins(choice)}
                    aria-pressed={spins === choice}
                    className={`rounded-md border px-2 py-1 text-2xs font-black tabular transition ${
                      spins === choice
                        ? 'border-accent-400 bg-accent-500/20 text-content-primary'
                        : 'border-surface-600 bg-surface-850 text-content-secondary hover:border-brand-400'
                    }`}
                  >
                    {choice.toLocaleString('it-IT')}
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void simulate()}
                loading={busy === 'simulate'}
                loadingLabel="Simulazione…"
                disabled={blocked}
              >
                Simula {spins.toLocaleString('it-IT')} giri
              </Button>

              {report ? (
                <div className="grid gap-2">
                  <p className="font-display text-4xl font-black tabular text-accent-300">
                    {percent(report.rtp)}
                  </p>
                  <RtpBar value={report.rtp} />
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
                    <Stat label="Giri" value={report.spins.toLocaleString('it-IT')} />
                    <Stat label="Frequenza vincite" value={percent(report.hitFrequency)} />
                    <Stat label="Vincita massima" value={`${report.maxWinMultiplier.toFixed(0)}×`} />
                    <Stat label="Trigger free spin" value={percent(report.freeSpinTriggerRate)} />
                    <Stat label="Solo linee" value={percent(report.analyticLineRtp)} />
                  </dl>
                  <p className="text-2xs text-content-muted">{driftNote(report.drift, report.spins)}</p>
                  <WinHistogram distribution={report.distribution} spins={report.spins} />
                  <p
                    className={`rounded-lg border px-2 py-1.5 text-2xs ${
                      report.withinPublishWindow
                        ? 'border-success-500/40 bg-success-500/10 text-success-400'
                        : 'border-warning-500/40 bg-warning-500/10 text-warning-400'
                    }`}
                  >
                    {report.withinPublishWindow
                      ? 'Dentro la finestra: il server accetterebbe la pubblicazione.'
                      : 'Fuori dalla finestra: il server rifiuterebbe la pubblicazione.'}
                  </p>
                </div>
              ) : (
                <p className="text-2xs text-content-muted">
                  Nessuna misura per questa configurazione. Ogni modifica invalida la
                  precedente, perché era stata fatta su altri nastri.
                </p>
              )}
              <p className="border-t border-surface-700/70 pt-2 text-2xs text-content-muted">
                La pubblicazione rilancia comunque la simulazione sul server, su{' '}
                {SLOT_PUBLISH_SIMULATION_SPINS.toLocaleString('it-IT')} giri e sulla
                configurazione salvata: quello che vedi qui non decide nulla.
              </p>
            </Panel>

            {mine.length > 0 && (
              <Panel className="grid gap-2 p-4">
                <h2 className="font-display text-base font-black">Le mie macchine</h2>
                <ul className="grid gap-1">
                  {mine.map((machine) => (
                    <li key={machine.id}>
                      <button
                        type="button"
                        onClick={() => void load(machine.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                          machine.id === machineId
                            ? 'border-brand-400 bg-brand-500/10'
                            : 'border-surface-600 bg-surface-850 hover:border-brand-400'
                        }`}
                      >
                        <span className="truncate">{machine.name}</span>
                        <span className="shrink-0 text-2xs tabular text-content-muted">
                          {machine.rtpSimulated ? percent(machine.rtpSimulated) : machine.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-content-muted">{label}</dt>
      <dd className="text-right tabular text-content-secondary">{value}</dd>
    </>
  );
}

/** Where a figure sits relative to the window a machine may be published in. */
function RtpBar({ value }: { value: number }) {
  const lo = SLOT_RTP_MIN - 0.08;
  const hi = SLOT_RTP_MAX + 0.08;
  const place = (at: number) => `${Math.min(100, Math.max(0, ((at - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-surface-700" aria-hidden="true">
      <div
        className="absolute inset-y-0 rounded-full bg-success-500/30"
        style={{ left: place(SLOT_RTP_MIN), right: `calc(100% - ${place(SLOT_RTP_MAX)})` }}
      />
      <div
        className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-content-primary"
        style={{ left: place(value) }}
      />
    </div>
  );
}

/**
 * How the wins are spread, in multiples of the total bet.
 *
 * Two machines with the same RTP can look nothing alike, and this is where the
 * difference shows: a low volatility machine piles everything into the small
 * buckets, an extreme one leaves the small buckets empty and puts its return in
 * a tail you can barely see.
 */
function WinHistogram({
  distribution,
  spins,
}: {
  distribution: Record<string, number>;
  spins: number;
}) {
  const entries = Object.entries(distribution).sort(
    (a, b) => Number(a[0].replace('+', '')) - Number(b[0].replace('+', '')),
  );
  const peak = Math.max(1, ...entries.map(([, count]) => count));
  return (
    <div className="grid gap-1">
      <p className="text-2xs font-black uppercase tracking-wider text-content-muted">
        Distribuzione delle vincite (× puntata)
      </p>
      <div className="flex h-16 items-end gap-1" role="img" aria-label="Distribuzione delle vincite">
        {entries.map(([bucket, count]) => (
          <div key={bucket} className="grid flex-1 justify-items-center gap-0.5">
            <span
              className="w-full rounded-t-sm bg-brand-500/70"
              style={{ height: `${Math.max(2, (count / peak) * 46)}px` }}
              title={`${bucket}×: ${count} giri (${percent(count / Math.max(1, spins))})`}
            />
            <span className="text-[9px] text-content-muted">{bucket}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
