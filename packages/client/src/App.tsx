import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  type RouteProps,
} from 'react-router-dom';
import AuthPage from './routes/AuthPage';
import HubPage from './routes/HubPage';
import { useAuthStore } from './store/auth';

/** Routes that need a session; anonymous visitors land back on the auth page. */
function Protected({ children }: { children: RouteProps['element'] }) {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="grid h-full place-items-center text-(--color-text-muted)">Caricamento…</div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const restore = useAuthStore((state) => state.restore);
  const user = useAuthStore((state) => state.user);

  // Rehydrate the session once on boot: the persisted tokens are checked
  // against the server before anything is rendered as signed in.
  useEffect(() => {
    void restore();
  }, [restore]);

  return (
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
