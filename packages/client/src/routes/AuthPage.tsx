import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginSchema, registerSchema } from '@bingo/shared';
import { Button, Field, Panel, ResponsiblePlayNotice } from '../components/ui';
import ConnectionWaitHint from '../components/ConnectionWaitHint';
import { useAuthStore } from '../store/auth';

type Mode = 'login' | 'register';

const BINGO_NUMBERS = [7, 18, 33, 54, 72];
const FEATURES = [
  { icon: '✦', title: 'Mondo 3D', copy: 'Esplora una piazza viva insieme agli altri giocatori.' },
  { icon: '●', title: 'Bingo e minigiochi', copy: 'Entra nelle sale, gioca e conquista premi virtuali.' },
  { icon: '◆', title: 'Community', copy: 'Chatta, usa emote e scopri nuove esperienze.' },
];

/**
 * Sign-in and sign-up. Validation runs against the same Zod schemas the server
 * uses, purely so the player gets instant feedback - the server re-validates
 * everything regardless of what happens here.
 */
export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const clearError = useAuthStore((state) => state.clearError);
  const serverError = useAuthStore((state) => state.error);
  const busy = useAuthStore((state) => state.status === 'loading');

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    clearError();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');

    const parsed =
      mode === 'login'
        ? loginSchema.safeParse({ email, password })
        : registerSchema.safeParse({
            email,
            password,
            displayName: String(form.get('displayName') ?? ''),
            ageAcknowledged: form.get('ageAcknowledged') === 'on' ? true : false,
          });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '_');
        errors[key] ??= LOCAL_MESSAGES[key] ?? 'Valore non valido.';
      }
      setFieldErrors(errors);
      return;
    }

    try {
      if (mode === 'login') {
        await login(parsed.data as { email: string; password: string });
      } else {
        await register(parsed.data as Parameters<typeof register>[0]);
      }
      navigate('/hub', { replace: true });
    } catch {
      // The store already turned this into a message for `serverError`.
    }
  }

  return (
    <main className="auth-shell relative min-h-full overflow-x-hidden">
      <div className="auth-grid" aria-hidden="true" />
      <div className="auth-aurora auth-aurora-one" aria-hidden="true" />
      <div className="auth-aurora auth-aurora-two" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid min-h-full w-full max-w-7xl items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:px-12">
        <section className="hidden flex-col justify-center lg:flex">
          <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-2 text-2xs font-bold uppercase tracking-[0.22em] text-brand-200 backdrop-blur">
            <span className="live-dot" />
            Piazza online
          </div>

          <p className="mb-3 text-sm font-bold uppercase tracking-[0.35em] text-accent-400">
            Bingo Simulator
          </p>
          <h1 className="max-w-3xl font-display text-5xl font-black leading-[0.96] tracking-tight text-content-primary xl:text-7xl">
            Il bingo diventa
            <span className="game-title-gradient block">un mondo da vivere.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-content-secondary">
            Entra nella piazza 3D, incontra altri giocatori e scopri sale bingo, slot e
            minigiochi creati per la community.
          </p>

          <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="feature-card">
                <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
                <h2 className="mt-3 text-sm font-bold text-content-primary">{feature.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-content-muted">{feature.copy}</p>
              </article>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-3" aria-label="Numeri del bingo">
            {BINGO_NUMBERS.map((number, index) => (
              <span
                key={number}
                className="bingo-ball"
                style={{ animationDelay: `${index * 130}ms` }}
              >
                {number}
              </span>
            ))}
            <div className="ml-2">
              <p className="text-sm font-bold text-content-primary">La fortuna ti aspetta</p>
              <p className="text-xs text-content-muted">Solo crediti virtuali, zero denaro reale.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-md flex-col justify-center">
          <header className="mb-6 text-center lg:hidden">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-brand-300/30 bg-brand-500/20 shadow-glow-brand">
              <span className="font-display text-2xl font-black text-brand-100">B!</span>
            </div>
            <p className="text-2xs font-bold uppercase tracking-[0.28em] text-accent-400">
              Piazza 3D multiplayer
            </p>
            <h1 className="mt-2 font-display text-4xl font-black text-content-primary">
              Bingo <span className="text-brand-300">Simulator</span>
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-content-secondary">
              Gioca, esplora e incontra la community.
            </p>
          </header>

          <Panel className="auth-panel relative overflow-hidden">
            <div className="auth-panel-shine" aria-hidden="true" />
            <div className="relative">
              <div className="mb-6">
                <p className="text-2xs font-bold uppercase tracking-[0.2em] text-brand-300">
                  {mode === 'login' ? 'Bentornato in piazza' : 'Il tuo viaggio inizia qui'}
                </p>
                <h2 className="mt-2 font-display text-3xl font-black text-content-primary">
                  {mode === 'login' ? 'Accedi al gioco' : 'Crea il tuo giocatore'}
                </h2>
                <p className="mt-2 text-sm text-content-muted">
                  {mode === 'login'
                    ? 'Riprendi da dove avevi lasciato.'
                    : 'Scegli il tuo nome e preparati a entrare.'}
                </p>
              </div>

              <div
                className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-surface-600/80 bg-surface-950/60 p-1.5"
                role="tablist"
                aria-label="Accesso"
              >
                <TabButton active={mode === 'login'} onClick={() => switchMode('login')}>
                  Accedi
                </TabButton>
                <TabButton active={mode === 'register'} onClick={() => switchMode('register')}>
                  Crea account
                </TabButton>
              </div>

              <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
                {mode === 'register' && (
                  <Field
                    label="Nome giocatore"
                    name="displayName"
                    autoComplete="nickname"
                    placeholder="Come ti vedranno gli altri"
                    error={fieldErrors.displayName}
                  />
                )}

                <Field
                  label="Email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@esempio.it"
                  error={fieldErrors.email}
                />

                <Field
                  label="Password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  hint={mode === 'register' ? 'Almeno 10 caratteri.' : undefined}
                  error={fieldErrors.password}
                />

                {mode === 'register' && (
                  <label className="age-check flex cursor-pointer items-start gap-3 rounded-xl border border-surface-600/70 bg-surface-900/50 p-3 text-sm text-content-secondary">
                    <input
                      type="checkbox"
                      name="ageAcknowledged"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                    />
                    <span>
                      Confermo di avere almeno 18 anni e di aver capito che si tratta di un
                      gioco simulato senza denaro reale.
                      {fieldErrors.ageAcknowledged && (
                        <em className="mt-1 block not-italic text-danger-400">
                          {fieldErrors.ageAcknowledged}
                        </em>
                      )}
                    </span>
                  </label>
                )}

                {busy && <ConnectionWaitHint />}
                {serverError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-danger-500/60 bg-danger-600/15 px-4 py-3 text-sm text-danger-400"
                  >
                    {serverError}
                  </p>
                )}

                <Button type="submit" loading={busy} size="lg" className="game-cta mt-1 w-full">
                  {mode === 'login' ? 'Entra nella piazza' : 'Crea e inizia a giocare'}
                  {!busy && <span aria-hidden="true">→</span>}
                </Button>
              </form>
            </div>
          </Panel>

          <ResponsiblePlayNotice className="mt-5 px-3" />

          <p className="mt-4 text-center">
            <Link
              to="/stile"
              className="text-2xs uppercase tracking-[0.18em] text-content-muted transition-colors hover:text-brand-300"
            >
              Design system
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

const LOCAL_MESSAGES: Record<string, string> = {
  email: 'Inserisci un indirizzo email valido.',
  password: 'La password deve avere almeno 10 caratteri.',
  displayName: 'Da 3 a 20 caratteri, senza simboli speciali.',
  ageAcknowledged: 'Devi confermare di avere almeno 18 anni.',
};

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-2.5 text-sm font-bold transition-all duration-200 ${
        active
          ? 'bg-brand-500 text-white shadow-glow-brand'
          : 'text-content-muted hover:bg-surface-800 hover:text-content-secondary'
      }`}
    >
      {children}
    </button>
  );
}
