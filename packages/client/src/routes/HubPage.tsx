import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CreditAmount, HudCard } from '../components/ui';
import { SceneBoundary } from '../components/SceneBoundary';
import ChatPanel from '../components/ChatPanel';
import CommandsPanel from '../components/CommandsPanel';
import EmoteBar from '../components/EmoteBar';
import PlayerLabels from '../components/PlayerLabels';
import PoiMenu from '../components/PoiMenu';
import TouchJoystick from '../components/TouchJoystick';
import { useHallSettings, type HallQuality } from '../store/hallSettings';
import { connectToHub, leaveHub, sendEmote } from '../net/hubConnection';
import { attachKeyboard, input } from '../net/input';
import { resolveShortcut, shouldPreventDefault } from '../net/shortcuts';
import { useAuthStore } from '../store/auth';
import { useHubStore } from '../store/hub';
import { seedLocalPlayer } from '../three/localPlayer';
import { showBubble } from '../three/labels';

const HubScene = lazy(() => import('../three/HubScene'));
const AvatarCustomizer = lazy(() => import('../components/AvatarCustomizer'));
type Panel =
  | 'menu'
  | 'destinations'
  | 'chat'
  | 'emotes'
  | 'roster'
  | 'help'
  | 'avatar'
  | null;
const PANEL_TITLES = {
  menu: 'Menu della piazza',
  destinations: 'Destinazioni',
  chat: 'Chat',
  emotes: 'Gesti',
  roster: 'In piazza',
  help: 'Comandi',
  avatar: 'Personaggio',
};
const CONNECTION_COPY: Record<string, string> = {
  idle: 'In attesa…',
  connecting: 'Connessione alla piazza…',
  connected: '',
  reconnecting: 'Connessione persa. Riprovo…',
  disconnected: 'Disconnesso dalla piazza.',
  failed: 'Piazza non raggiungibile. Ricarica la pagina per riprovare.',
};

export default function HubPage() {
  const navigate = useNavigate();
  const [showStats, setShowStats] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const panelRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (panel && panel !== 'avatar') panelRef.current?.showModal();
  }, [panel]);
  const [touchDevice] = useState(
    () => window.matchMedia('(pointer: coarse), (max-width: 767px)').matches,
  );
  const user = useAuthStore((state) => state.user);
  const balance = useAuthStore((state) => state.balance);
  const logout = useAuthStore((state) => state.logout);
  const status = useHubStore((state) => state.status);
  const players = useHubStore((state) => state.players);
  const notice = useHubStore((state) => state.notice);
  const quality = useHallSettings((state) => state.quality);
  const applyQuality = useHallSettings((state) => state.applyQuality);
  const closePanel = () => setPanel(null);

  useEffect(() => attachKeyboard(), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      const typing =
        input.typing ||
        element?.tagName === 'INPUT' ||
        element?.tagName === 'TEXTAREA' ||
        element?.tagName === 'SELECT';
      const action = resolveShortcut(event, { typing });
      if (!action) return;
      if (shouldPreventDefault(action, event)) event.preventDefault();
      switch (action.kind) {
        case 'emote':
          if (!panel) sendEmote(action.emote);
          break;
        case 'chat':
          setPanel('chat');
          break;
        case 'emoteBar':
          setPanel((current) => (current === 'emotes' ? null : 'emotes'));
          break;
        case 'roster':
          setPanel((current) => (current === 'roster' ? null : 'roster'));
          break;
        case 'help':
          setPanel('help');
          break;
        case 'close':
          setPanel(null);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panel]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useHubStore.getState().clearNotice(), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const accessToken = useAuthStore.getState().accessToken;
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
  }, [user?.id]);

  const statusCopy = CONNECTION_COPY[status] ?? '';
  const openBingo = () => navigate('/bingo?room=TESI-2026');

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-950">
      <a
        href="#hud"
        className="skip-link rounded-md bg-surface-700 px-4 py-2 text-sm"
      >
        Salta al pannello giocatore
      </a>
      <SceneBoundary>
        <Suspense
          fallback={
            <div className="grid h-full place-items-center text-sm text-content-muted">
              Caricamento della piazza…
            </div>
          }
        >
          <HubScene showStats={showStats} inputEnabled={!panel} />
        </Suspense>
      </SceneBoundary>
      <PlayerLabels />
      <header
        id="hud"
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 md:p-4"
        style={{
          zIndex: 'var(--z-hud)',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
        }}
      >
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl border border-white/15 bg-surface-950/90 px-3 py-2 shadow-hud md:gap-3 md:px-4 md:py-3">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500/30 font-bold text-brand-100 md:h-10 md:w-10"
            aria-hidden="true"
          >
            {(user?.displayName ?? 'B').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="max-w-36 truncate text-xs font-bold text-content-primary md:max-w-64 md:text-base">
              {user?.displayName ?? '—'}
            </p>
            <p className="text-xs">
              <CreditAmount value={balance} />
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          className="pointer-events-auto min-h-11 shrink-0 shadow-hud"
          aria-expanded={panel === 'menu'}
          aria-controls="hub-panel"
          onClick={() =>
            setPanel((current) => (current === 'menu' ? null : 'menu'))
          }
        >
          ☰ Menu
        </Button>
      </header>
      {(statusCopy || notice) && (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-3 top-20 mx-auto max-w-md rounded-lg border border-surface-600 bg-surface-950/90 px-3 py-2 text-center text-xs text-content-secondary"
          style={{ zIndex: 'var(--z-overlay)' }}
        >
          {notice ?? statusCopy}
        </p>
      )}
      {!panel && (
        <>
          {touchDevice && (
            <div
              className="absolute bottom-24 left-4"
              style={{ zIndex: 'var(--z-hud)' }}
            >
              <TouchJoystick compact />
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-x-3 bottom-0 flex flex-col items-center gap-2 pb-3 md:inset-x-4 md:items-end"
            style={{
              zIndex: 'var(--z-hud)',
              paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            }}
          >
            <p className="hidden rounded-lg bg-surface-950/80 px-3 py-1.5 text-xs text-content-secondary md:block">
              WASD per muoverti · trascina per girare · ? per i comandi
            </p>
            <nav
              aria-label="Azioni della piazza"
              className="pointer-events-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto] gap-2 rounded-2xl border border-white/15 bg-surface-950/90 p-2 shadow-hud md:w-auto"
            >
              <Button
                variant="accent"
                size="sm"
                className="min-h-11"
                onClick={openBingo}
              >
                Sala Bingo →
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11"
                onClick={() => setPanel('destinations')}
              >
                Luoghi
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11"
                onClick={() => setPanel('chat')}
              >
                Chat
              </Button>
            </nav>
          </div>
        </>
      )}
      {panel && panel !== 'avatar' && (
        <dialog
          ref={panelRef}
          id="hub-panel"
          aria-labelledby="hub-panel-title"
          onCancel={closePanel}
          className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-24px)] max-w-sm overflow-y-auto overscroll-contain rounded-2xl border-0 bg-transparent p-0 text-content-primary backdrop:bg-surface-950/65"
        >
          <HudCard className="pointer-events-auto">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2
                id="hub-panel-title"
                className="font-display text-base font-bold"
              >
                {PANEL_TITLES[panel]}
              </h2>
              <Button
                variant="ghost"
                className="min-h-11"
                autoFocus
                onClick={closePanel}
                aria-label="Chiudi pannello"
              >
                ✕
              </Button>
            </div>
            {panel === 'menu' && (
              <div className="grid gap-2">
                <Button variant="accent" onClick={openBingo}>
                  Entra in Sala Bingo →
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setPanel('avatar')}
                  >
                    Personaggio
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPanel('destinations')}
                  >
                    Destinazioni
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPanel('emotes')}
                  >
                    Gesti
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPanel('roster')}
                  >
                    Giocatori · {players.length}
                  </Button>
                  <Button variant="secondary" onClick={() => setPanel('chat')}>
                    Chat
                  </Button>
                  <Button variant="secondary" onClick={() => setPanel('help')}>
                    Comandi
                  </Button>
                </div>
                <label className="mt-2 grid gap-1 text-xs font-semibold text-content-secondary">
                  Qualità grafica
                  <select
                    className="min-h-11 rounded-lg border border-surface-600 bg-surface-900 px-3 text-sm text-content-primary"
                    value={quality}
                    onChange={(event) =>
                      applyQuality(event.target.value as HallQuality)
                    }
                  >
                    <option value="LOW">
                      Leggera · consigliata sul telefono
                    </option>
                    <option value="MEDIUM">Media</option>
                    <option value="HIGH">Alta</option>
                  </select>
                </label>
                <div className="flex justify-between gap-2 border-t border-surface-600 pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowStats((value) => !value)}
                  >
                    {showStats ? 'Nascondi FPS' : 'Mostra FPS'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void logout().then(() => navigate('/', { replace: true }))
                    }
                  >
                    Esci
                  </Button>
                </div>
              </div>
            )}
            {panel === 'destinations' && <PoiMenu onNavigate={closePanel} />}
            {panel === 'chat' && <ChatPanel onClose={closePanel} />}
            {panel === 'emotes' && <EmoteBar />}
            {panel === 'help' && (
              <>
                <p className="mb-3 text-sm text-content-secondary">
                  Sul telefono usa lo stick per muoverti e trascina sulla piazza
                  per girare la visuale. Apri Luoghi per entrare negli edifici.
                </p>
                <CommandsPanel onClose={closePanel} />
              </>
            )}
            {panel === 'roster' && (
              <ul className="grid gap-2">
                {players.map((player) => (
                  <li
                    key={player.sessionId}
                    className="truncate rounded-lg bg-surface-800 p-2 text-sm"
                  >
                    {player.displayName}
                  </li>
                ))}
              </ul>
            )}
          </HudCard>
        </dialog>
      )}
      {panel === 'avatar' && (
        <Suspense
          fallback={
            <div
              role="status"
              className="absolute inset-0 grid place-items-center bg-surface-950/95"
              style={{ zIndex: 'var(--z-overlay)' }}
            >
              <div className="text-center">
                <p>Caricamento personaggio…</p>
                <Button onClick={closePanel}>Chiudi</Button>
              </div>
            </div>
          }
        >
          <AvatarCustomizer onClose={closePanel} />
        </Suspense>
      )}
    </div>
  );
}
