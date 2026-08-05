import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ThesisChecks from '../components/ThesisChecks';

const CHAPTERS = [
  {
    eyebrow: '01 · Architettura',
    title: 'Multiplayer server-authoritative',
    description:
      'Il client invia richieste, mentre server, estrazione, cartelle, premi e verifiche restano autoritativi.',
    proof: ['Colyseus realtime', 'RNG separato dagli eventi', 'Ledger crediti immutabile'],
  },
  {
    eyebrow: '02 · Regole',
    title: 'Bingo italiano a 90 numeri',
    description:
      'Cartelle 3×9 con 15 numeri, Cinquina e Bingo verificati dal server, modalità manuale o automatica.',
    proof: ['3 righe · 9 colonne', '5 numeri per riga', 'Nessun numero duplicato'],
  },
  {
    eyebrow: '03 · Immersione',
    title: 'Sala tridimensionale in prima persona',
    description:
      'Il giocatore osserva il palco, abbassa lo sguardo sulla cartella e interagisce con la sala e i personaggi.',
    proof: ['React Three Fiber', 'Personaggi procedurali', 'Interazioni raycast'],
  },
  {
    eyebrow: '04 · Innovazione',
    title: 'Event Director indipendente dal Bingo',
    description:
      'Eventi comici e imprevedibili modificano atmosfera e ritmo, senza cambiare l’ordine dei numeri o le probabilità.',
    proof: ['Selezione pesata', 'Cooldown e limiti', 'Modalità Classica–Assurda'],
  },
  {
    eyebrow: '05 · Verifica',
    title: 'Le proprietà, controllate mentre guardi',
    description:
      'Ogni affermazione dei capitoli precedenti è ricontrollata qui eseguendo il codice condiviso, adesso, in questa pagina.',
    proof: [],
  },
] as const;

/** The closing chapter runs code instead of describing it. */
const CHECKS_CHAPTER = CHAPTERS.length - 1;

export default function ThesisModePage() {
  const navigate = useNavigate();
  const [chapter, setChapter] = useState(0);
  const current = CHAPTERS[chapter]!;
  const progress = useMemo(() => ((chapter + 1) / CHAPTERS.length) * 100, [chapter]);

  const next = () => {
    if (chapter === CHAPTERS.length - 1) {
      navigate('/bingo?room=TESI-2026&presentation=1');
      return;
    }
    setChapter((value) => Math.min(CHAPTERS.length - 1, value + 1));
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#080713] px-5 py-8 text-white sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgb(124_58_237_/_0.3),transparent_34%),radial-gradient(circle_at_88%_82%,rgb(249_115_22_/_0.22),transparent_30%)]" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-7xl flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-violet-300">
              Modalità discussione di laurea
            </p>
            <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">
              Bingo Simulator · Vertical Slice
            </h1>
          </div>
          <div className="flex gap-2">
            <Link
              to="/hub"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Piazza 3D
            </Link>
            <Link
              to="/bingo?room=TESI-2026"
              className="rounded-2xl bg-white px-4 py-2.5 text-xs font-black text-[#171229] transition hover:-translate-y-0.5"
            >
              Apri subito il gioco
            </Link>
          </div>
        </header>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-400 transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">
              {current.eyebrow}
            </p>
            <h2
              className={`mt-4 max-w-4xl font-display font-black leading-[0.96] ${
                chapter === CHECKS_CHAPTER
                  ? 'text-3xl sm:text-4xl'
                  : 'text-5xl sm:text-6xl lg:text-7xl'
              }`}
            >
              {current.title}
            </h2>
            <p
              className={`max-w-3xl text-white/65 ${
                chapter === CHECKS_CHAPTER
                  ? 'mt-3 text-sm leading-6'
                  : 'mt-6 text-lg leading-8 sm:text-xl'
              }`}
            >
              {current.description}
            </p>

            {chapter === CHECKS_CHAPTER ? (
              <div className="mt-5">
                <ThesisChecks />
              </div>
            ) : (
              <div className="mt-8 flex flex-wrap gap-3">
                {current.proof.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-violet-300/20 bg-violet-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-violet-100"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-[#15132b]/88 p-5 shadow-[0_30px_100px_-35px_rgb(0_0_0_/_0.95)] backdrop-blur-xl sm:p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
              Traccia per l’esposizione
            </p>
            <div className="mt-5 space-y-3">
              {CHAPTERS.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setChapter(index)}
                  className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                    index === chapter
                      ? 'border-violet-300/35 bg-violet-400/15'
                      : 'border-white/7 bg-black/15 hover:bg-white/6'
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black ${
                      index <= chapter ? 'bg-white text-[#171229]' : 'bg-white/7 text-white/45'
                    }`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="block text-sm font-black">{item.title}</span>
                    <span className="mt-0.5 block text-[11px] text-white/45">{item.eyebrow}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setChapter((value) => Math.max(0, value - 1))}
                disabled={chapter === 0}
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-white/60 disabled:opacity-30"
              >
                Indietro
              </button>
              <button
                type="button"
                onClick={next}
                className="flex-1 rounded-2xl bg-gradient-to-r from-violet-400 to-fuchsia-500 px-5 py-3 text-sm font-black text-[#160c25] transition hover:-translate-y-0.5"
              >
                {chapter === CHAPTERS.length - 1 ? 'Avvia la dimostrazione' : 'Capitolo successivo'}
              </button>
            </div>
          </aside>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-5 text-[11px] text-white/35">
          <p>Solo crediti virtuali · Nessun deposito o premio convertibile</p>
          <p>React · TypeScript · Three.js · Colyseus · PostgreSQL</p>
        </footer>
      </div>
    </main>
  );
}
