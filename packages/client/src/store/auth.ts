import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResponse, PublicUser } from '@bingo/shared';
import { ApiError, api, configureApi, request } from '../lib/api';

/**
 * Client-side auth state.
 *
 * It holds tokens and a copy of the player's profile for rendering only. The
 * balance kept here is a display cache refreshed from the server: no screen may
 * ever compute or adjust it locally.
 */
interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  balance: number;
  status: 'idle' | 'loading' | 'ready';
  error: string | null;

  register: (input: {
    email: string;
    password: string;
    displayName: string;
    ageAcknowledged: true;
  }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  clearError: () => void;
}

/** Italian copy for the server's stable error codes. */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email o password non corretti.',
  email_already_used: 'Questa email è già registrata.',
  display_name_already_used: 'Questo nome è già in uso.',
  validation_error: 'Controlla i dati inseriti.',
  rate_limited: 'Troppi tentativi. Riprova tra un minuto.',
  account_suspended: 'Account sospeso. Contatta la moderazione.',
  session_expired: 'Sessione scaduta, accedi di nuovo.',
  internal_error: 'Errore del server. Riprova più tardi.',
};

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return ERROR_MESSAGES[error.code] ?? ERROR_MESSAGES.internal_error!;
  }
  return 'Impossibile contattare il server.';
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      balance: 0,
      status: 'idle',
      error: null,

      register: async (input) => {
        set({ status: 'loading', error: null });
        try {
          const response = await api.register(input);
          applyAuth(set, response);
        } catch (error) {
          set({ status: 'ready', error: toMessage(error) });
          throw error;
        }
      },

      login: async (input) => {
        set({ status: 'loading', error: null });
        try {
          const response = await api.login(input);
          applyAuth(set, response);
        } catch (error) {
          set({ status: 'ready', error: toMessage(error) });
          throw error;
        }
      },

      logout: async () => {
        try {
          if (get().accessToken) await api.logout();
        } catch {
          // A failed logout must still clear the device.
        }
        set({ user: null, accessToken: null, refreshToken: null, balance: 0, status: 'ready' });
      },

      restore: async () => {
        if (!get().refreshToken) {
          set({ status: 'ready' });
          return;
        }
        set({ status: 'loading' });
        try {
          const me = await api.me();
          set({ user: me.user, balance: me.balance, status: 'ready', error: null });
        } catch {
          set({ user: null, accessToken: null, refreshToken: null, status: 'ready' });
        }
      },

      refreshBalance: async () => {
        if (!get().accessToken) return;
        try {
          const { balance } = await api.balance();
          set({ balance });
        } catch {
          // Leave the last known value; the HUD shows it as stale.
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'bingo.auth',
      // Only the tokens and the last known identity survive a reload; the
      // balance is always re-fetched from the server on restore.
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);

type SetState = (partial: Partial<AuthState>) => void;

function applyAuth(set: SetState, response: AuthResponse): void {
  set({
    user: response.user,
    accessToken: response.tokens.accessToken,
    refreshToken: response.tokens.refreshToken,
    balance: response.balance,
    status: 'ready',
    error: null,
  });
}

// Hand the API layer a live view of the tokens so it can rotate them without
// the components knowing anything about it.
configureApi({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onRefreshed: (response) => applyAuth(useAuthStore.setState, response),
  onRefreshFailed: () =>
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, balance: 0 }),
});

export { request };
