import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, type RouteProps } from 'react-router-dom';
import AppErrorBoundary from './components/AppErrorBoundary';
import AuthPage from './routes/AuthPage';
import HubPage from './routes/HubPage';
import { useAuthStore } from './store/auth';

// Developer-facing and rarely opened surfaces stay outside the entry chunk.
const StyleGuidePage = lazy(() => import('./routes/StyleGuidePage'));
const BingoPage = lazy(() => import('./routes/BingoPage'));
const ThesisModePage = lazy(() => import('./routes/ThesisModePage'));

function RouteLoader({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-dvh place-items-center bg-[#090816] text-content-muted">
      <div className="grid justify-items-center gap-4">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-white/10 border-t-violet-400" />
        <p className="text-sm font-black uppercase tracking-[0.18em]">{label}</p>
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
        <Routes>
          <Route path="/" element={user ? <Navigate to="/hub" replace /> : <AuthPage />} />
          <Route
            path="/hub"
            element={
              <Protected>
                <HubPage />
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
