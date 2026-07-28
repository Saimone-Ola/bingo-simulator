import { create } from 'zustand';
import type {
  ActionRejectedPayload,
  ChatMessagePayload,
  Emote,
  RejectionCode,
} from '@bingo/shared';
import type { ConnectionStatus, RemotePlayer } from '../net/hubConnection';

/**
 * Discrete hub events only.
 *
 * Positions deliberately do not live here: they change 20 times a second and
 * are read straight off the Colyseus room inside the render loop. What this
 * store holds is the stuff React actually needs to re-render for - who is in
 * the room, what was said, whether we are connected.
 */

/** The slowly-changing half of a player, mirrored for the UI. */
export interface PlayerCard {
  sessionId: string;
  userId: string;
  displayName: string;
  level: number;
}

const MAX_CHAT_MESSAGES = 200;

/** Italian copy for the server's stable rejection codes. */
const REJECTION_MESSAGES: Record<RejectionCode, string> = {
  rate_limited: 'Stai andando troppo veloce. Aspetta un attimo.',
  invalid_payload: 'Richiesta non valida.',
  unknown_target: 'Destinazione non trovata.',
  not_available_yet: 'Questa zona non è ancora aperta.',
  message_blocked: 'Messaggio bloccato dalla moderazione.',
  not_allowed: 'Azione non consentita.',
};

interface HubStore {
  status: ConnectionStatus;
  mySessionId: string | null;
  myUserId: string | null;
  players: PlayerCard[];
  chat: ChatMessagePayload[];
  /** Transient banner for a refused action. */
  notice: string | null;
  /** Emotes currently playing, by session id, with their expiry. */
  emotes: Record<string, { emote: Emote; until: number }>;

  setStatus: (status: ConnectionStatus) => void;
  setIdentity: (sessionId: string, userId: string) => void;
  addPlayer: (sessionId: string, player: RemotePlayer) => void;
  removePlayer: (sessionId: string) => void;
  addChat: (message: ChatMessagePayload) => void;
  setChatHistory: (messages: ChatMessagePayload[]) => void;
  playEmote: (sessionId: string, emote: Emote) => void;
  showRejection: (payload: ActionRejectedPayload) => void;
  clearNotice: () => void;
  reset: () => void;
}

export const useHubStore = create<HubStore>((set) => ({
  status: 'idle',
  mySessionId: null,
  myUserId: null,
  players: [],
  chat: [],
  notice: null,
  emotes: {},

  setStatus: (status) => set({ status }),

  setIdentity: (sessionId, userId) => set({ mySessionId: sessionId, myUserId: userId }),

  addPlayer: (sessionId, player) =>
    set((state) => {
      if (state.players.some((entry) => entry.sessionId === sessionId)) return state;
      return {
        players: [
          ...state.players,
          {
            sessionId,
            userId: player.userId,
            displayName: player.displayName,
            level: player.level,
          },
        ],
      };
    }),

  removePlayer: (sessionId) =>
    set((state) => ({
      players: state.players.filter((entry) => entry.sessionId !== sessionId),
    })),

  addChat: (message) =>
    set((state) => {
      // The server may echo a private message back to its sender; the id keeps
      // it from appearing twice.
      if (state.chat.some((entry) => entry.id === message.id)) return state;
      const next = [...state.chat, message];
      return { chat: next.length > MAX_CHAT_MESSAGES ? next.slice(-MAX_CHAT_MESSAGES) : next };
    }),

  setChatHistory: (messages) =>
    set((state) => {
      const known = new Set(state.chat.map((entry) => entry.id));
      const merged = [...messages.filter((entry) => !known.has(entry.id)), ...state.chat];
      return { chat: merged.slice(-MAX_CHAT_MESSAGES) };
    }),

  playEmote: (sessionId, emote) =>
    set((state) => ({
      emotes: { ...state.emotes, [sessionId]: { emote, until: Date.now() + 2500 } },
    })),

  showRejection: (payload) =>
    set({ notice: REJECTION_MESSAGES[payload.code] ?? 'Azione rifiutata.' }),

  clearNotice: () => set({ notice: null }),

  reset: () =>
    set({
      status: 'idle',
      mySessionId: null,
      myUserId: null,
      players: [],
      chat: [],
      notice: null,
      emotes: {},
    }),
}));
