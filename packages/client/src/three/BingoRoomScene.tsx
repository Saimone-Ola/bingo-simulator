import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  ActiveBingoEvent,
  BingoPhase,
  BingoPlayerSummary,
  ItalianBingoCard,
  SeatOccupancy,
} from '@bingo/shared';
import { resolveAvatarAppearance } from '@bingo/shared';
import { SceneBoundary } from '../components/SceneBoundary';
import type { CharacterAnimationState } from './ProceduralCharacter';
import BingoHallEnvironment from './bingo/BingoHallEnvironment';
import BingoReception, { type ReceptionInfo } from './bingo/BingoReception';
import BingoStage from './bingo/BingoStage';
import BingoCardDeck3D from './bingo/BingoCardDeck3D';
import HallConfetti from './bingo/HallConfetti';
import RoomNpc, { WanderingWaiter } from './bingo/RoomNpc';
import RoundBingoTable, { TableTablet } from './bingo/RoundBingoTable';
import BingoChair from './bingo/BingoChair';
import PlayerMovementController, {
  type InteractionFocus,
} from './bingo/PlayerMovementController';
import { crowdAnimation, moodFor } from './bingo/eventChoreography';
import { buildOccupancy } from './bingo/occupants';
import CrowdInstances from './bingo/CrowdInstances';
import HallNumberBoards from './bingo/HallNumberBoards';
import InstancedFurniture from './bingo/InstancedFurniture';
import { budgetFor, selectCrowdTiers } from './bingo/crowdLod';
import {
  SEATS,
  SPAWN,
  STANDING_EYE_HEIGHT,
  TABLES,
  TABLE_TOP_HEIGHT,
  type SeatPlacement,
} from './bingo/hallLayout';
import { DECK_RADIUS } from './bingo/cardLayout';
import type { PlayerStance } from './bingo/movement';
import { RENDER_PROFILES, type HallQuality } from '../store/hallSettings';

/**
 * The virtual Bingo hall.
 *
 * This scene is mounted for the whole time a player is in the room — through
 * buying cards, waiting, the countdown, the draw and the results — so the hall
 * is never replaced by a screen. Everything the player needs to read is either
 * in the world (stage screen, tabellone, reception board, table cards) or in the
 * thin HUD the page draws on top.
 */

export interface BingoMarkInteraction {
  cardIndex: number;
  cellIndex: number;
  token: number;
}

export interface BingoRoomSceneProps {
  phase: BingoPhase;
  roomName: string;
  roomCode: string;
  cardPrice: number;
  maxPlayers: number;
  players: readonly BingoPlayerSummary[];
  mySessionId: string;
  /** Seat the server put this player in, or null while they are standing. */
  mySeatId: string | null;
  /** This client's own user id, used to find itself in the seating chart. */
  myUserId: string | null;
  /** Who the server says is sitting where. The floor is drawn from this. */
  seating: readonly SeatOccupancy[];
  myCards: readonly ItalianBingoCard[];
  currentNumber: number | null;
  drawnNumbers: readonly number[];
  activeEvent: ActiveBingoEvent | null;
  countdownSeconds: number | null;
  celebrating: boolean;
  selectedCard: number;
  markerColor: string;
  manualMarking: boolean;
  focusCard: boolean;
  stance: PlayerStance;
  /** Chairs nobody is in, so walking up to one and pressing E works. */
  freeSeats: readonly SeatPlacement[];
  quality: HallQuality;
  shadows: boolean;
  reducedMotion: boolean;
  headBob: boolean;
  ambientGuests: number;
  inputEnabled: boolean;
  onSelectCard: (index: number) => void;
  onSelectMarker: (color: string) => void;
  onMarkCell: (cardIndex: number, cellIndex: number, marked: boolean) => void;
  onInteract: (focus: InteractionFocus) => void;
  onTargetChange: (focus: InteractionFocus) => void;
  onFootstep: () => void;
  onRequestExitPointerLock: () => void;
  onSceneError?: (error: Error) => void;
}

const PHASE_HEADLINE: Record<BingoPhase, string> = {
  WAITING: 'BENVENUTI IN SALA',
  CARD_PURCHASE: 'ACQUISTO CARTELLE',
  COUNTDOWN: 'LA PARTITA STA PER INIZIARE',
  PLAYING: 'NUMERO ESTRATTO',
  EVENT_ACTIVE: 'UN MOMENTO…',
  RESULTS: 'PREMIAZIONE',
  ENDED: 'ROUND CONCLUSO',
};

const PHASE_LABEL: Record<BingoPhase, string> = {
  WAITING: 'In attesa',
  CARD_PURCHASE: 'Preparazione',
  COUNTDOWN: 'Partenza',
  PLAYING: 'In corso',
  EVENT_ACTIVE: 'Evento',
  RESULTS: 'Risultati',
  ENDED: 'Fine round',
};

/** Fades the hall lights between moods without re-mounting any light. */
function HallLighting({
  lightScale,
  tint,
  fogBoost,
  shadows,
  shadowMapSize,
  reducedMotion,
}: {
  lightScale: number;
  tint: string;
  fogBoost: number;
  shadows: boolean;
  shadowMapSize: number;
  reducedMotion: boolean;
}) {
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemisphere = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fog = useRef<THREE.Fog>(null);
  const tintColour = useMemo(() => new THREE.Color(tint), [tint]);

  useFrame((_state, delta) => {
    const lambda = reducedMotion ? 20 : 3.5;
    const blend = 1 - Math.exp(-lambda * delta);
    if (ambient.current) {
      ambient.current.intensity += (0.84 * lightScale - ambient.current.intensity) * blend;
      ambient.current.color.lerp(tintColour, blend);
    }
    if (hemisphere.current) {
      hemisphere.current.intensity += (1.5 * lightScale - hemisphere.current.intensity) * blend;
    }
    if (key.current) {
      key.current.intensity += (2.1 * lightScale - key.current.intensity) * blend;
    }
    if (fog.current) {
      // The hall is fifty-eight metres from the doors to the stage. Fog that
      // ended at forty-one was atmosphere in the old room and a grey wall across
      // the middle of this one — you walked in and the stage was not there.
      const target = 22 - fogBoost * 10;
      fog.current.near += (target - fog.current.near) * blend;
      fog.current.far += (target + 52 - fog.current.far) * blend;
    }
  });

  return (
    <>
      <color attach="background" args={['#100a1b']} />
      <fog ref={fog} attach="fog" args={['#1a1226', 22, 74]} />
      <ambientLight ref={ambient} intensity={0.84} color={tint} />
      <hemisphereLight ref={hemisphere} args={['#ffe6c4', '#3a2740', 1.5]} />
      <directionalLight
        ref={key}
        position={[4, 9, 8]}
        intensity={2.1}
        color="#ffdfb4"
        castShadow={shadows}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={34}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-bias={-0.0006}
      />
    </>
  );
}

/**
 * Marker pens lying beside the cards, in the deck's local frame.
 *
 * Picking a pen here is the in-world equivalent of the colour swatches in the
 * HUD: both write to the same piece of client-side state, neither touches the
 * server's record of which cells are marked.
 */
export const MARKER_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#7c3aed'] as const;

function MarkerTray3D({
  selectedColor,
  onSelect,
}: {
  selectedColor: string;
  onSelect: (color: string) => void;
}) {
  return (
    <group position={[0.5, 0, 0.02]}>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.12, 0.18]} />
        <meshStandardMaterial color="#241d2e" roughness={0.7} />
      </mesh>
      {MARKER_COLORS.map((color, index) => {
        const selected = color === selectedColor;
        return (
          <mesh
            key={color}
            position={[-0.045 + index * 0.03, 0.016 + (selected ? 0.008 : 0), 0]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect(color);
            }}
          >
            <cylinderGeometry args={[0.0095, 0.0095, 0.13, 8]} />
            <meshStandardMaterial
              color={color}
              roughness={0.42}
              emissive={selected ? color : '#000000'}
              emissiveIntensity={selected ? 0.6 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Scene(props: BingoRoomSceneProps) {
  const {
    phase,
    players,
    mySessionId,
    myCards,
    currentNumber,
    drawnNumbers,
    activeEvent,
    celebrating,
    reducedMotion,
    quality,
    shadows,
  } = props;

  const profile = RENDER_PROFILES[quality];
  const drawn = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);
  const mood = useMemo(() => moodFor(phase, activeEvent, celebrating), [phase, activeEvent, celebrating]);
  const occupancy = useMemo(
    () =>
      buildOccupancy(
        [...players],
        {
          ambientCount: props.ambientGuests,
          roomSeed: props.roomCode,
          mySeatId: props.mySeatId,
          myUserId: props.myUserId,
        },
        props.seating,
      ),
    [
      players,
      props.ambientGuests,
      props.roomCode,
      props.mySeatId,
      props.myUserId,
      props.seating,
    ],
  );

  const me = useMemo(
    () => players.find((player) => player.sessionId === mySessionId),
    [players, mySessionId],
  );
  const eyeHeightScale = useMemo(() => {
    const height = resolveAvatarAppearance(me?.appearance).heightCm;
    return THREE.MathUtils.clamp(height / 175, 0.88, 1.12);
  }, [me?.appearance]);

  // A "beat" only changes when the room does something worth reacting to, so
  // the crowd is recomputed a handful of times per round rather than per frame.
  const beat = drawnNumbers.length + (activeEvent ? 101 : 0) + (celebrating ? 211 : 0);

  const receptionInfo: ReceptionInfo = useMemo(
    () => ({
      roomName: props.roomName,
      roomCode: props.roomCode,
      playerCount: players.filter((player) => !player.isNpc).length,
      maxPlayers: props.maxPlayers,
      cardPrice: props.cardPrice,
      phaseLabel: PHASE_LABEL[phase],
    }),
    [props.roomName, props.roomCode, players, props.maxPlayers, props.cardPrice, phase],
  );

  const footer = useMemo(() => {
    if (props.countdownSeconds !== null) return `Inizio tra ${props.countdownSeconds}s`;
    if (mood.caption) return mood.caption;
    if (phase === 'CARD_PURCHASE') return 'Acquista le cartelle alla cassa';
    return `${drawnNumbers.length} / 90 estratti`;
  }, [props.countdownSeconds, mood.caption, phase, drawnNumbers.length]);

  // Where the tiering is centred. Updated only when the player has moved far
  // enough to change who is near, which is a few metres rather than a frame.
  const crowdOrigin = useCrowdOrigin();

  /**
   * The crowd, split by distance around the player.
   *
   * Recomputed when the player moves far enough to matter rather than every
   * frame: re-tiering five hundred guests sixty times a second would cost more
   * than the drawing it is saving.
   */
  const crowdTiers = useMemo(() => {
    const candidates = occupancy.occupants
      .filter((occupant) => !occupant.isLocal)
      .map((occupant) => ({ id: occupant.id, x: occupant.seat.x, z: occupant.seat.z }));
    return selectCrowdTiers(candidates, crowdOrigin[0], crowdOrigin[1], budgetFor(props.quality));
  }, [occupancy.occupants, crowdOrigin, props.quality]);

  const byId = useMemo(
    () => new Map(occupancy.occupants.map((occupant) => [occupant.id, occupant])),
    [occupancy.occupants],
  );
  const nearCrowd = useMemo(
    () => crowdTiers.full.map((entry) => byId.get(entry.id)).filter((o) => o !== undefined),
    [crowdTiers, byId],
  );
  const farCrowd = useMemo(
    () =>
      [...crowdTiers.simple, ...crowdTiers.instanced]
        .map((entry) => byId.get(entry.id))
        .filter((occupant) => occupant !== undefined)
        .map((occupant) => ({
          id: occupant.id,
          seat: occupant.seat,
          shirtColor: occupant.appearance.shirtColor ?? '#7357bd',
          skinTone: occupant.appearance.skinTone ?? '#e0b49a',
          phase: occupant.phase,
        })),
    [crowdTiers, byId],
  );

  /**
   * Furniture near enough for its detail to survive perspective.
   *
   * A detailed chair is ten meshes and a table thirty-six; at 512 and 64 that
   * is ~7 400 draw calls of furniture, several times the crowd. Past a few
   * metres none of that detail reads, so only the near ones are drawn in full
   * and everything else becomes four instanced meshes.
   */
  const furniture = useMemo(() => {
    const [ox, oz] = crowdOrigin;
    const nearSq = FURNITURE_DETAIL_RADIUS * FURNITURE_DETAIL_RADIUS;
    const within = (x: number, z: number) => (x - ox) ** 2 + (z - oz) ** 2 <= nearSq;

    const nearTables = TABLES.filter((table) => within(table.x, table.z));
    const nearTableIndices = new Set(nearTables.map((table) => table.index));
    return {
      nearTables,
      farTables: TABLES.filter((table) => !nearTableIndices.has(table.index)),
      nearSeats: SEATS.filter((seat) => nearTableIndices.has(seat.tableIndex)),
      farSeats: SEATS.filter((seat) => !nearTableIndices.has(seat.tableIndex)),
    };
  }, [crowdOrigin]);

  /**
   * Chairs a click should seat you in.
   *
   * Only the free ones, and only while standing: clicking a chair you are
   * already in should do nothing, and clicking someone else's would send a
   * request the server is going to refuse.
   */
  const freeSeatIds = useMemo(
    () => new Set(props.stance === 'STANDING' ? props.freeSeats.map((seat) => seat.id) : []),
    [props.freeSeats, props.stance],
  );

  const localSeat = occupancy.localSeat;
  const seatedTable = localSeat ? TABLES[localSeat.tableIndex] : undefined;
  const deckOrigin = useMemo(() => {
    if (!localSeat || !seatedTable) return null;
    return {
      x: seatedTable.x + Math.cos(localSeat.angle) * DECK_RADIUS,
      z: seatedTable.z + Math.sin(localSeat.angle) * DECK_RADIUS,
      // `facing` points a model at the table centre; the deck's local -Z has to
      // point that way instead, so the card header reads away from the player.
      rotation: localSeat.facing + Math.PI,
    };
  }, [localSeat, seatedTable]);

  return (
    <>
      <HallLighting
        lightScale={mood.lightScale}
        tint={mood.tint}
        fogBoost={mood.fogBoost}
        shadows={shadows}
        shadowMapSize={profile.shadowMapSize}
        reducedMotion={reducedMotion}
      />

      <PlayerMovementController
        seat={localSeat}
        stance={props.stance}
        freeSeats={props.freeSeats}
        eyeHeightScale={eyeHeightScale}
        reducedMotion={reducedMotion}
        headBob={props.headBob}
        focusStage={phase === 'COUNTDOWN' && props.stance === 'SEATED'}
        inputEnabled={props.inputEnabled}
        onInteract={props.onInteract}
        onTargetChange={props.onTargetChange}
        onFootstep={props.onFootstep}
        onRequestExitPointerLock={props.onRequestExitPointerLock}
      />

      <BingoHallEnvironment mood={mood} accentLights={profile.accentLights} shadows={shadows} />

      <BingoStage
        currentNumber={currentNumber}
        drawnNumbers={drawnNumbers}
        headline={PHASE_HEADLINE[phase]}
        footer={footer}
        mood={mood}
        reducedMotion={reducedMotion}
        shadows={shadows}
        spinning={phase === 'PLAYING'}
        hostState={mood.hostState}
      />

      {/* The numbers, repeated round the room: side walls, over the doors and
          on four-sided units hung above the aisles, so no seat in a fifty-metre
          hall has to squint at the stage. */}
      <HallNumberBoards drawnNumbers={drawnNumbers} currentNumber={currentNumber} />

      <BingoReception
        info={receptionInfo}
        highlighted={phase === 'CARD_PURCHASE' && (me?.cardCount ?? 0) === 0}
        reducedMotion={reducedMotion}
        shadows={shadows}
        onActivate={() => props.onInteract({ target: 'RECEPTION', seatId: null })}
      />

      {furniture.nearTables.map((table) => (
        <RoundBingoTable key={table.index} table={table} quality={quality === 'LOW' ? 'LOW' : 'FULL'} shadows={shadows} />
      ))}

      {/* Chairs are drawn from the seat list, so a chair always matches a
          collider and a character always matches a chair. Only the near ones
          are drawn in detail; the rest arrive as instances below. */}
      {furniture.nearSeats.map((seat) => (
        <BingoChair
          key={`chair-${seat.id}`}
          seat={seat}
          occupied={seat.id === occupancy.localSeat?.id}
          castShadow={shadows}
          selectable={freeSeatIds.has(seat.id)}
          onSit={(seatId) => props.onInteract({ target: 'SIT', seatId })}
        />
      ))}

      <InstancedFurniture tables={furniture.farTables} seats={furniture.farSeats} />

      {/*
        Only the near crowd is drawn as characters. The rest becomes simple
        silhouettes and then instances — see crowdLod.ts for why, and for the
        budgets each graphics setting spends.
      */}
      {nearCrowd.map((occupant) => {
          const state: CharacterAnimationState = crowdAnimation(
            Math.round(occupant.phase * 997),
            beat,
            mood,
            activeEvent,
            occupant.personality,
            celebrating,
          );
          return (
            <RoomNpc
              key={occupant.id}
              occupant={occupant}
              state={state}
              reducedMotion={reducedMotion}
              showName={occupant.kind !== 'AMBIENT'}
              showCards={occupant.kind !== 'AMBIENT' || quality === 'HIGH'}
              showReadyLight={phase === 'CARD_PURCHASE' && occupant.kind === 'PLAYER'}
            />
          );
        })}

      <CrowdInstances guests={farCrowd} />

      {quality !== 'LOW' && (
        <WanderingWaiter reducedMotion={reducedMotion} paused={phase === 'COUNTDOWN'} />
      )}

      {/* The local player's own cards and markers, on the table in front of
          their seat. They stay on the table when standing up. */}
      {deckOrigin && myCards.length > 0 && (
        <group position={[deckOrigin.x, TABLE_TOP_HEIGHT + 0.016, deckOrigin.z]} rotation={[0, deckOrigin.rotation, 0]}>
          <BingoCardDeck3D
            cards={myCards}
            drawn={drawn}
            markerColor={props.markerColor}
            selectedIndex={props.selectedCard}
            focused={props.focusCard}
            interactive={props.manualMarking && (phase === 'PLAYING' || phase === 'EVENT_ACTIVE')}
            reducedMotion={reducedMotion}
            onSelect={props.onSelectCard}
            onToggleCell={props.onMarkCell}
          />
          {props.manualMarking && (
            <MarkerTray3D selectedColor={props.markerColor} onSelect={props.onSelectMarker} />
          )}
        </group>
      )}

      {localSeat && phase === 'CARD_PURCHASE' && (
        <TableTablet
          position={[
            (seatedTable?.x ?? 0) + Math.cos(localSeat.angle) * (DECK_RADIUS - 0.3),
            TABLE_TOP_HEIGHT + 0.016,
            (seatedTable?.z ?? 0) + Math.sin(localSeat.angle) * (DECK_RADIUS - 0.3),
          ]}
          rotationY={localSeat.facing + Math.PI}
          active={(me?.cardCount ?? 0) === 0}
          onActivate={() => props.onInteract({ target: 'RECEPTION', seatId: null })}
        />
      )}

      <HallConfetti active={mood.confetti} reducedMotion={reducedMotion} />
    </>
  );
}

/**
 * The player's position, sampled coarsely.
 *
 * Re-tiering five hundred guests every frame would cost more than the drawing
 * it saves, and the tiers only change when the player has actually walked
 * somewhere — so this only publishes a new origin past a threshold.
 */
const CROWD_RESAMPLE_DISTANCE = 4;

/** How far detailed tables and chairs are drawn. Two table pitches. */
const FURNITURE_DETAIL_RADIUS = 12;

function useCrowdOrigin(): readonly [number, number] {
  const [origin, setOrigin] = useState<readonly [number, number]>([SPAWN.x, SPAWN.z]);
  const last = useRef<readonly [number, number]>([SPAWN.x, SPAWN.z]);

  useFrame(({ camera }) => {
    const dx = camera.position.x - last.current[0];
    const dz = camera.position.z - last.current[1];
    if (dx * dx + dz * dz < CROWD_RESAMPLE_DISTANCE * CROWD_RESAMPLE_DISTANCE) return;
    last.current = [camera.position.x, camera.position.z];
    setOrigin(last.current);
  });

  return origin;
}

export default function BingoRoomScene(props: BingoRoomSceneProps) {
  const profile = RENDER_PROFILES[props.quality];
  return (
    <SceneBoundary {...(props.onSceneError ? { onError: props.onSceneError } : {})}>
      <Canvas
        shadows={props.shadows}
        dpr={[profile.dpr[0], profile.dpr[1]]}
        // Starts where the player actually spawns. A literal here was fine in a
        // small room and puts the camera in the middle of the tables in a large
        // one — the hall grew and this did not.
        camera={{ position: [SPAWN.x, STANDING_EYE_HEIGHT, SPAWN.z], fov: 62, near: 0.06, far: 90 }}
        gl={{ antialias: profile.antialias, powerPreference: 'high-performance' }}
        performance={{ min: 0.45 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.06;
        }}
      >
        <Suspense fallback={null}>
          <Scene {...props} />
        </Suspense>
      </Canvas>
      <SceneDisposer />
    </SceneBoundary>
  );
}

/**
 * Frees GPU memory when the hall unmounts.
 *
 * R3F disposes the renderer, but the canvas textures the hall builds itself
 * (card faces, boards, signs) outlive it unless something asks Three to purge
 * its caches.
 */
function SceneDisposer() {
  useEffect(
    () => () => {
      THREE.Cache.clear();
    },
    [],
  );
  return null;
}

/** Re-exported so the page can talk about interaction targets without the 3D import. */
export type { InteractionFocus, InteractionTarget } from './bingo/PlayerMovementController';
export type { PlayerStance } from './bingo/movement';
