import { useEffect, useRef } from 'react';
import { useHubStore } from '../store/hub';
import { LABEL_MAX_DISTANCE, chatBubbles, isNameTagVisible, labelAnchors } from '../three/labels';

/**
 * Name tags and chat bubbles, as DOM over the canvas.
 *
 * One React element per player, positioned by a single animation frame loop
 * that writes `transform` directly. React re-renders only when someone joins
 * or leaves; the sixty-times-a-second work never enters the component tree.
 *
 * Rendering these as DOM rather than in-scene text is also what keeps the
 * design system in charge of them - and avoids drei's <Text>, which pulls its
 * default font from a third-party CDN at runtime.
 */
export default function PlayerLabels() {
  const players = useHubStore((state) => state.players);
  const mySessionId = useHubStore((state) => state.mySessionId);

  const nodes = useRef(new Map<string, HTMLDivElement>());
  const bubbleNodes = useRef(new Map<string, HTMLDivElement>());
  const nameNodes = useRef(new Map<string, HTMLSpanElement>());
  // Read inside the animation frame, which is set up once and never re-bound.
  const myIdRef = useRef(mySessionId);
  myIdRef.current = mySessionId;

  useEffect(() => {
    let frame = 0;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = Date.now();

      for (const [sessionId, node] of nodes.current) {
        const anchor = labelAnchors.get(sessionId);
        if (!anchor || !anchor.visible) {
          node.style.opacity = '0';
          continue;
        }

        // Fade with distance instead of popping: twenty tags all appearing at
        // once as the camera moves is visual noise.
        const fade = 1 - Math.min(1, anchor.distance / LABEL_MAX_DISTANCE) ** 2;
        node.style.opacity = fade.toFixed(2);
        node.style.transform = `translate3d(${anchor.x}px, ${anchor.y}px, 0) translate(-50%, -100%)`;

        // The local player keeps their anchor - the chat bubble rides on it -
        // but never their own name tag.
        const nameNode = nameNodes.current.get(sessionId);
        if (nameNode) {
          nameNode.style.display = isNameTagVisible(anchor, sessionId === myIdRef.current)
            ? 'block'
            : 'none';
        }

        const bubbleNode = bubbleNodes.current.get(sessionId);
        if (bubbleNode) {
          const bubble = chatBubbles.get(sessionId);
          if (bubble && bubble.until > now) {
            bubbleNode.textContent = bubble.text;
            bubbleNode.style.display = 'block';
          } else {
            bubbleNode.style.display = 'none';
            if (bubble) chatBubbles.delete(sessionId);
          }
        }
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 'var(--z-hud)' }}
      aria-hidden="true"
    >
      {players.map((player) => (
        <div
          key={player.sessionId}
          ref={(node) => {
            if (node) nodes.current.set(player.sessionId, node);
            else nodes.current.delete(player.sessionId);
          }}
          className="absolute left-0 top-0 flex flex-col items-center gap-1 will-change-transform"
          style={{ opacity: 0 }}
        >
          <div
            ref={(node) => {
              if (node) bubbleNodes.current.set(player.sessionId, node);
              else bubbleNodes.current.delete(player.sessionId);
            }}
            className="max-w-[15rem] truncate rounded-md border border-surface-600 bg-surface-800/90 px-2 py-1 text-xs text-content-primary shadow-hud backdrop-blur"
            style={{ display: 'none' }}
          />
          <span
            ref={(node) => {
              if (node) nameNodes.current.set(player.sessionId, node);
              else nameNodes.current.delete(player.sessionId);
            }}
            className="whitespace-nowrap rounded-sm bg-surface-950/70 px-1.5 py-0.5 text-2xs font-semibold text-content-secondary"
            style={{ display: 'none' }}
          >
            {player.displayName}
          </span>
        </div>
      ))}
    </div>
  );
}
