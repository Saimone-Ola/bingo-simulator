import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CreditAmount, HudCard } from '../components/ui';
import { SceneBoundary } from '../components/SceneBoundary';
import ChatPanel from '../components/ChatPanel';
import EmoteBar from '../components/EmoteBar';
import PlayerLabels from '../components/PlayerLabels';
import PoiMenu from '../components/PoiMenu';
import TouchJoystick from '../components/TouchJoystick';
import AvatarCustomizer from '../components/AvatarCustomizer';
import { connectToHub, leaveHub } from '../net/hubConnection';
import { attachKeyboard } from '../net/input';
import { useAuthStore } from '../store/auth';
import { useHubStore } from '../store/hub';
import { seedLocalPlayer } from '../three/localPlayer';
import { showBubble } from '../three/labels';

// The 3D bundle is heavy: keep it out of the auth path entirely.
const HubScene = lazy(() => import('../three/HubScene'));

const CONNECTION_COPY: Record<string, string> = {
  idle: 'In attesa…',
  connecting: 'Connessione alla piazza…',
  connected: '',
  reconnecting: 'Connessione persa. Riprovo…',
  disconnected: 'Disconnesso dalla piazza.',
  failed: 'Impossibile riconnettersi. Ricarica la pagina.',
};

export default function HubPage() {
  const navigate = useNavigate();
  const [showStats, setShowStats] = useState(false);
  const [showAvatar, setShowAvatar] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [touchDevice, setTouchDevice] = useState(false);

  const user = useAuthStore((state) => state.user);
  const balance = useAuthStore((state) => state.balance);
  const accessToken = useAuthStore((state) => state.accessToken);
  const logout = useAuthStore((state) => state.logout);
  const refreshBalance = useAuthStore((state) => state.refreshBalance);

  const status = useHubStore((state) => state.status);
  const players = useHubStore((state) => state.players);
  const notice = useHubStore((state) => state.notice);

  useEffect(() => {
    setTouchDevice(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => attachKeyboard(), []);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // Auto-dismiss the rejection banner; it is a nudge, not a dialog.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useHubStore.getState().clearNotice(), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!accessToken) return;
    const store = useHubStore.getState();
    let cancelled = false;

    void connectToHub(accessToken, {
      onStatus: (next) => store.setStatus(next),
      onWelcome: (payload) => {
        store.setIdentity(payload.sessionId, payload.userId);
      },
      onPlayerAdd: (sessionId, player) => {
        store.addPlayer(sessionId, player);
        // Seed the prediction from the first authoritative snapshot of us.
        if (sessionId === useHubStore.getState().mySessionId) {
          seedLocalPlayer(player.x, player.z, player.rotY);
        }
      },
      onPlayerRemove: (sessionId) => store.removePlayer(sessionId),
      onChat: (message) => {
        store.addChat(message);
        const speaker = useHubStore
          .getState()
          .players.find((entry) => entry.userId === message.senderId);
        if (speaker) showBubble(speaker.sessionId, message.body);
      },
      onChatHistory: (messages) => store.setChatHistory(messages),
      onEmote: (payload) => store.playEmote(payload.sessionId, payload.emote),
      onTeleport: (payload) => seedLocalPlayer(payload.x, payload.z, 0),
      onRejected: (payload) => store.showRejection(payload),
    }).catch(() => {
      if (!cancelled) store.setStatus('failed');
    });

    return () => {
      cancelled = true;
      void leaveHub();
      useHubStore.getState().reset();
    };
  }, [accessToken]);

  const statusCopy = CONNECTION_COPY[status] ?? '';

  return (
    <div className="relative h-full w-full overflow-hidden">
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
          <HubScene showStats={showStats} />
        </Suspense>
      </SceneBoundary>

      <PlayerLabels />

      {/* --- Top HUD --- */}
      <header
        id="hud"
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4"
        style={{ zIndex: 'var(--z-hud)' }}
      >
        <HudCard className="pointer-events-auto min-w-56">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand-300/25 bg-brand-500/20 font-display text-lg font-black text-brand-100 shadow-glow-brand">
              {(user?.displayName ?? 'B').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="hud-brand-line mb-1.5" aria-hidden="true" />
              <p className="truncate font-display text-base font-black text-content-primary">
                {user?.displayName ?? '—'}
              </p>
              <p className="text-2xs font-bold uppercase tracking-[0.16em] text-success-400">
                ● Online
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-4 border-t border-surface-600/70 pt-3">
            <div>
              <p className="text-2xs font-bold uppercase tracking-wide text-content-muted">Portafoglio</p>
              <p className="mt-0.5"><CreditAmount value={balance} /></p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-content-primary">{players.length}</p>
              <p className="text-2xs text-content-muted">
                {players.length === 1 ? 'giocatore' : 'giocatori'}
              </p>
            </div>
          </div>
        </HudCard>

        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" className="shadow-hud" onClick={() => setShowAvatar(true)}>
            <span aria-hidden="true">✦</span> Personaggio
          </Button>
          <Button variant="ghost" size="sm" className="bg-surface-900/85 shadow-hud backdrop-blur-xl" onClick={() => setShowChat((value) => !value)}>
            <span aria-hidden="true">◈</span> {showChat ? 'Nascondi chat' : 'Chat'}
          </Button>
          <Button variant="ghost" size="sm" className="bg-surface-900/85 shadow-hud backdrop-blur-xl" onClick={() => setShowStats((value) => !value)}>
            <span aria-hidden="true">⌁</span> {showStats ? 'Nascondi FPS' : 'FPS'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="bg-surface-900/85 shadow-hud backdrop-blur-xl"
            onClick={() => {
              void logout().then(() => navigate('/', { replace: true }));
            }}
          >
            <span aria-hidden="true">↗</span> Esci
          </Button>
        </div>
      </header>

      {/* --- Right rail --- */}
      <div
        className="pointer-events-none absolute right-4 top-32 flex flex-col items-end gap-2"
        style={{ zIndex: 'var(--z-hud)' }}
      >
        <PoiMenu />
      </div>

      {/* --- Status and rejection notices --- */}
      {(statusCopy || notice) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-4 flex justify-center"
          style={{ zIndex: 'var(--z-overlay)' }}
        >
          <p
            role="status"
            className={`rounded-md px-3 py-1.5 text-xs backdrop-blur ${
              notice
                ? 'border border-warning-600 bg-warning-600/20 text-warning-400'
                : 'border border-surface-600 bg-surface-800/85 text-content-secondary'
            }`}
          >
            {notice ?? statusCopy}
          </p>
        </div>
      )}

      {/* --- Bottom HUD --- */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4"
        style={{ zIndex: 'var(--z-hud)' }}
      >
        <div className="flex items-end gap-3">
          {touchDevice && <TouchJoystick />}
          {showChat && <ChatPanel onClose={() => setShowChat(false)} />}
        </div>

        <div className="flex flex-col items-end gap-2">
          <EmoteBar />
          <p className="pointer-events-none rounded-lg border border-surface-600/60 bg-surface-950/75 px-3 py-1.5 text-2xs font-medium text-content-muted shadow-hud backdrop-blur-xl">
            {touchDevice
              ? 'Stick per muoverti · trascina per girare'
              : 'WASD per muoverti · Shift per correre · trascina per girare'}
          </p>
        </div>
      </div>

      {showAvatar && <AvatarCustomizer onClose={() => setShowAvatar(false)} />}
    </div>
  );
}
