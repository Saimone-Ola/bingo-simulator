import { schema } from '@colyseus/schema';

/**
 * Replicated hub state.
 *
 * Declared with the `schema()` helper rather than decorators, so the package
 * needs no `experimentalDecorators` (which does not coexist well with
 * `verbatimModuleSyntax`). Note this is *not* interchangeable with the older
 * `defineTypes()` API: under @colyseus/schema 4 that one fails to attach the
 * metadata the encoder reads for nested types, and a map of schemas throws at
 * the first patch.
 *
 * Field widths are chosen deliberately: this state is re-serialised 20 times a
 * second for every connected client, so a float64 that could be a float32 is a
 * cost paid 20 times per second per player.
 *
 * Nothing sensitive lives here. The state is broadcast to every player in the
 * hub, so it carries no email, no balance, no token and no role.
 */
export const PlayerState = schema(
  {
    userId: 'string',
    displayName: 'string',
    level: 'uint16',

    /** Authoritative position, in metres. Only the server ever writes it. */
    x: 'float32',
    y: 'float32',
    z: 'float32',
    /** Facing angle in radians. */
    rotY: 'float32',

    moving: 'boolean',
    running: 'boolean',

    /** Currently playing emote id, empty when idle. */
    emote: 'string',

    /**
     * Last movement intent the server has integrated for this player. The
     * client replays its own unacknowledged inputs from here to reconcile its
     * prediction.
     */
    lastSeq: 'uint32',

    /** False while the player is inside the reconnection window. */
    connected: 'boolean',

    // Appearance: enough for players to recognise each other. The full
    // wardrobe arrives with the shop in phase 7.
    bodyType: 'string',
    skinTone: 'string',
    hairStyle: 'string',
    hairColor: 'string',
    shirtColor: 'string',
    pantsColor: 'string',
    heightCm: 'uint16',
  },
  'PlayerState',
);

export type PlayerState = InstanceType<typeof PlayerState>;

export const HubState = schema(
  {
    players: { map: PlayerState },
    /** Server tick counter, surfaced in the client's debug overlay. */
    tick: 'uint32',
  },
  'HubState',
);

export type HubState = InstanceType<typeof HubState>;
