import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CreditAmount, HudCard } from '../components/ui';
import { SceneBoundary } from '../components/SceneBoundary';
import { useAuthStore } from '../store/auth';

// The 3D bundle is heavy: keep it out of the auth path entirely.
const HubPreview = lazy(() => import('../three/HubPreview'));

/**
 * The signed-in shell. In phase 0 it renders the placeholder scene and the HUD
 * chrome; the Colyseus connection, avatars and chat arrive in phase 1.
 */
export default function HubPage() {
  const navigate = useNavigate();
  const [showStats, setShowStats] = useState(false);

  const user = useAuthStore((state) => state.user);
  const balance = useAuthStore((state) => state.balance);
  const logout = useAuthStore((state) => state.logout);
  const refreshBalance = useAuthStore((state) => state.refreshBalance);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  return (
    <div className="relative h-full w-full">
      <a href="#hud" className="skip-link rounded-md bg-surface-700 px-4 py-2 text-sm">
        Salta al pannello giocatore
      </a>

      <SceneBoundary>
        <Suspense
          fallback={
            <div className="grid h-full place-items-center text-content-muted">
              Caricamento del mondo…
            </div>
          }
        >
          <HubPreview showStats={showStats} />
        </Suspense>
      </SceneBoundary>

      <header
        id="hud"
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4"
        style={{ zIndex: 'var(--z-hud)' }}
      >
        <HudCard className="pointer-events-auto">
          <p className="text-2xs uppercase tracking-wide text-content-muted">Giocatore</p>
          <p className="font-semibold">{user?.displayName ?? '—'}</p>
          <p className="mt-1">
            <CreditAmount value={balance} />
          </p>
        </HudCard>

        <div className="pointer-events-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowStats((value) => !value)}>
            {showStats ? 'Nascondi FPS' : 'Mostra FPS'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void logout().then(() => navigate('/', { replace: true }));
            }}
          >
            Esci
          </Button>
        </div>
      </header>

      <footer
        className="pointer-events-none absolute inset-x-0 bottom-0 p-4"
        style={{ zIndex: 'var(--z-hud)' }}
      >
        <p className="mx-auto max-w-2xl rounded-md bg-surface-950/80 px-4 py-2 text-center text-xs text-content-muted backdrop-blur">
          Fase 0: anteprima tecnica. Avatar, movimento multiplayer e chat arrivano nella fase 1.
          Crediti virtuali, nessun denaro reale.
        </p>
      </footer>
    </div>
  );
}
