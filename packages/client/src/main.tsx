import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const CANONICAL_HOST = 'bingo-simulator-client-five.vercel.app';
const VERCEL_BRANCH_HOST = 'bingo-simulator-client-git-main-saimone-olas-projects.vercel.app';

// The Git branch alias is useful for deployments but is not the public game
// address. Keeping players on one canonical origin also keeps sessions and the
// API's CORS policy predictable.
if (window.location.hostname === VERCEL_BRANCH_HOST) {
  const target = new URL(window.location.href);
  target.hostname = CANONICAL_HOST;
  window.location.replace(target.toString());
} else {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element missing');

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
