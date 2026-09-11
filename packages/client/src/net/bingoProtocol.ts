import type { BingoSnapshotPayload } from '@bingo/shared';

export type BingoConnectionIssue =
  | 'outdated_server'
  | 'invalid_snapshot'
  | 'snapshot_timeout'
  | 'network';

/** Check the wire format before a partial/older server response reaches React. */
export function snapshotIssue(value: unknown): BingoConnectionIssue | null {
  if (!value || typeof value !== 'object') return 'invalid_snapshot';
  const data = value as Partial<BingoSnapshotPayload>;
  if (
    typeof data.roundId !== 'string' ||
    !data.roundId ||
    !Array.isArray(data.results)
  ) {
    return 'outdated_server';
  }
  if (
    !data.config ||
    typeof data.config !== 'object' ||
    ![
      'players',
      'myCards',
      'drawnNumbers',
      'seating',
      'reservations',
      'eventHistory',
      'awardedTiers',
    ].every((key) => Array.isArray((data as Record<string, unknown>)[key]))
  ) {
    return 'invalid_snapshot';
  }
  return null;
}

export const BINGO_CONNECTION_COPY: Record<BingoConnectionIssue, string> = {
  outdated_server:
    'La sala usa ancora una versione precedente del server. Il gestore deve aggiornare il server di gioco; ricaricare il telefono non risolve questo errore. Gli acquisti restano bloccati finché le versioni non sono allineate.',
  invalid_snapshot:
    'Il server ha risposto con dati incompleti. Riprova a collegarti alla sala.',
  snapshot_timeout:
    'Il server ha aperto la connessione ma non ha inviato la sala. Puoi riprovare senza acquistare altre cartelle.',
  network:
    'La sala non risponde. Il server potrebbe essere in riavvio: attendi qualche secondo e riprova.',
};
