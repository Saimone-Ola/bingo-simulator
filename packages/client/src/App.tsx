import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, type RouteProps } from 'react-router-dom';
import AppErrorBoundary from './components/AppErrorBoundary';
import BingoEventOverlay from './components/BingoEventOverlay';
import AuthPage from './routes/AuthPage';
import { Button } from './components/ui';
import ConnectionWaitHint from './components/ConnectionWaitHint';
import { useAuthStore } from './store/auth';

// Developer-facing and rarely opened surfaces stay outside the entry chunk.
const StyleGuidePage = lazy(() => import('./routes/StyleGuidePage'));
const HubPage = lazy(() => import('./routes/HubPage'));
const BingoPage = lazy(() => import('./routes/BingoPage'));
const ThesisModePage = lazy(() => import('./routes/ThesisModePage'));
const ArcadePage = lazy(() => import('./routes/ArcadePage'));
const SlotEditorPage = lazy(() => import('./routes/SlotEditorPage'));

function RouteLoader({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-dvh place-items-center bg-[#090816] text-content-muted">
      <div role="status" className="grid max-w-sm justify-items-center gap-4 px-5 text-center">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-white/10 border-t-violet-400" />
        <p className="text-sm font-black uppercase tracking-[0.18em]">{label}</p>
        <ConnectionWaitHint />
      </div>
    </div>
  );
}

/** Routes that need a session; anonymous visitors land back on the auth page. */
function Protected({ children }: { children: RouteProps['element'] }) {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);

  if (status === 'idle' || status === 'loading') {
    return <RouteLoader label="Ripristino sessione" />;
  }
  if (status === 'offline') {
    return <div className="grid h-full min-h-dvh place-items-center bg-surface-950 p-5 text-center"><div className="grid max-w-sm gap-4">
      <h1 className="text-xl font-bold">Il server non risponde</h1>
      <p className="text-sm text-content-secondary">La sessione è stata conservata. Controlla la connessione e riprova: il server potrebbe essere in riavvio.</p>
      <Button onClick={() => void useAuthStore.getState().restore()}>Riprova a entrare</Button>
    </div></div>;
  }
  return user ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const restore = useAuthStore((state) => state.restore);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <BingoEventOverlay />
        <Routes>
          <Route path="/" element={user ? <Navigate to="/hub" replace /> : <AuthPage />} />
          <Route
            path="/hub"
            element={
              <Protected>
                <Suspense fallback={<RouteLoader label="Apertura piazza" />}>
                  <HubPage />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="/arcade"
            element={
              <Protected>
                <Suspense fallback={<RouteLoader label="Apertura arcade" />}>
                  <ArcadePage />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="/arcade/editor"
            element={
              <Protected>
                <Suspense fallback={<RouteLoader label="Apertura editor slot" />}>
                  <SlotEditorPage />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="/tesi"
            element={
              <Protected>
                <Suspense fallback={<RouteLoader label="Preparazione modalità tesi" />}>
                  <ThesisModePage />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="/bingo"
            element={
              <Protected>
                <Suspense fallback={<RouteLoader label="Apertura Sala Bingo" />}>
                  <BingoPage />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="/stile"
            element={
              <Suspense fallback={<RouteLoader label="Caricamento guida di stile" />}>
                <StyleGuidePage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
