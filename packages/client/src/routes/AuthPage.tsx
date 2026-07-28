import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginSchema, registerSchema } from '@bingo/shared';
import { Button, Field, Panel, ResponsiblePlayNotice } from '../components/ui';
import { useAuthStore } from '../store/auth';

type Mode = 'login' | 'register';

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
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="font-display text-display text-brand-100">Bingo Simulator</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Entra nel mondo 3D, gioca a bingo e alle slot create dalla community.
        </p>
      </header>

      <Panel>
        <div className="mb-5 flex gap-2" role="tablist" aria-label="Accesso">
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
              label="Nome visualizzato"
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
            <label className="flex items-start gap-2 text-sm text-content-secondary">
              <input type="checkbox" name="ageAcknowledged" className="mt-1 accent-brand-500" />
              <span>
                Dichiaro di avere almeno 18 anni e di aver capito che si tratta di un gioco
                simulato senza denaro reale.
                {fieldErrors.ageAcknowledged && (
                  <em className="mt-1 block not-italic text-danger-400">
                    {fieldErrors.ageAcknowledged}
                  </em>
                )}
              </span>
            </label>
          )}

          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-danger-600 bg-danger-600/15 px-3 py-2 text-sm text-danger-400"
            >
              {serverError}
            </p>
          )}

          <Button type="submit" loading={busy} size="lg">
            {mode === 'login' ? 'Accedi' : 'Crea account'}
          </Button>
        </form>
      </Panel>

      <ResponsiblePlayNotice />

      <p className="text-center">
        <Link to="/stile" className="text-2xs uppercase tracking-wide text-content-muted underline">
          Guida di stile
        </Link>
      </p>
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
      className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
        active
          ? 'bg-surface-700 text-content-primary'
          : 'text-content-muted hover:text-content-secondary'
      }`}
    >
      {children}
    </button>
  );
}
