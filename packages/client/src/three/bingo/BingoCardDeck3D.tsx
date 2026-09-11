import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { ItalianBingoCard } from '@bingo/shared';
import {
  CARD_DEPTH,
  CARD_REST_Y,
  CARD_SELECTED_LIFT,
  CARD_THICKNESS,
  CARD_WIDTH,
  cellIndexFromUv,
  layoutCards,
  type CardPlacement,
} from './cardLayout';
import { createCardFaceTexture, type CardFaceTexture } from './textures';
import { HALL_PALETTE } from '../palette';
import { damp } from './movement';

/**
 * The player's cards, lying on the table in front of their seat.
 *
 * Each card is two meshes — a rounded body and a textured face — and the face
 * texture is repainted in place whenever the marks change. Picking a cell is
 * done from the UV of the ray hit rather than from 27 child meshes per card,
 * which is what makes six interactive cards affordable.
 */

export interface CardInteraction {
  readonly cardIndex: number;
  readonly cellIndex: number;
}

interface CardProps {
  card: ItalianBingoCard;
  placement: CardPlacement;
  drawn: ReadonlySet<number>;
  markerColor: string;
  selected: boolean;
  focused: boolean;
  interactive: boolean;
  reducedMotion: boolean;
  onSelect: (cardIndex: number) => void;
  onToggleCell: (cardIndex: number, cellIndex: number, marked: boolean) => void;
}

function InteractiveBingoCard({
  card,
  placement,
  drawn,
  markerColor,
  selected,
  focused,
  interactive,
  reducedMotion,
  onSelect,
  onToggleCell,
}: CardProps) {
  const group = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const [hovered, setHovered] = useState(false);
  const faceRef = useRef<CardFaceTexture | null>(null);
  const [face, setFace] = useState<CardFaceTexture | null>(null);

  useEffect(() => {
    const created = createCardFaceTexture();
    faceRef.current = created;
    setFace(created);
    return () => {
      created?.dispose();
      faceRef.current = null;
    };
  }, []);

  const title = `CARTELLA ${placement.index + 1}`;
  useEffect(() => {
    faceRef.current?.redraw({ card, drawn, markerColor, title, active: selected });
  }, [card, drawn, markerColor, selected, title, face]);

  useEffect(() => () => { gl.domElement.style.cursor = ''; }, [gl]);

  useFrame((_state, delta) => {
    const node = group.current;
    if (!node) return;
    const zoomed = focused && selected;
    const lift = selected ? CARD_SELECTED_LIFT : hovered && interactive ? CARD_SELECTED_LIFT * 0.5 : 0;
    // Zooming lifts the card off the table and tips it up towards the player,
    // the way you would pick one up — without hiding the rest of the deck.
    const targetY = CARD_REST_Y + lift + (zoomed ? 0.15 : 0);
    // Positive rotation about X turns the face normal towards +Z, which is
    // where the player sits: tilting the other way shows them the card's back.
    const targetTilt = zoomed ? 0.55 : 0;
    const targetZ = placement.z + (zoomed ? 0.07 : 0);
    const lambda = reducedMotion ? 30 : 11;
    node.position.y = damp(node.position.y, targetY, lambda, delta);
    node.position.z = damp(node.position.z, targetZ, lambda, delta);
    node.rotation.x = damp(node.rotation.x, targetTilt, lambda, delta);
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 5) return;
    event.stopPropagation();
    if (!selected) {
      onSelect(placement.index);
      return;
    }
    if (!interactive) return;
    const uv = event.uv;
    if (!uv) return;
    const cellIndex = cellIndexFromUv(uv.x, uv.y);
    if (cellIndex === null) return;
    if (card.cells[cellIndex] === null || card.cells[cellIndex] === undefined) return;
    const alreadyMarked = card.markedIndices.includes(cellIndex);
    onToggleCell(placement.index, cellIndex, !alreadyMarked);
  };

  return (
    <group
      ref={group}
      position={[placement.x, CARD_REST_Y, placement.z]}
      rotation={[0, placement.rotationY, 0]}
    >
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[CARD_WIDTH, CARD_DEPTH, CARD_THICKNESS]} />
        <meshStandardMaterial color={selected ? HALL_PALETTE.paper : HALL_PALETTE.paperMuted} roughness={0.82} />
      </mesh>
      {/* The face mesh only appears once its texture exists. Swapping a
          material from "no map" to "map" leaves Three's compiled program
          without the texture sampler, which renders the card black. */}
      {face && (
        <mesh
          position={[0, CARD_THICKNESS / 2 + 0.0012, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHovered(true);
            gl.domElement.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            setHovered(false);
            gl.domElement.style.cursor = '';
          }}
          onClick={handleClick}
        >
          <planeGeometry args={[CARD_WIDTH, CARD_DEPTH]} />
          <meshBasicMaterial map={face.texture} toneMapped={false} />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CARD_WIDTH + 0.026, CARD_DEPTH + 0.026]} />
          <meshBasicMaterial color={HALL_PALETTE.interaction} transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}

export function BingoCardDeck3D({
  cards,
  drawn,
  markerColor,
  selectedIndex,
  focused,
  interactive,
  reducedMotion,
  onSelect,
  onToggleCell,
}: {
  cards: readonly ItalianBingoCard[];
  drawn: ReadonlySet<number>;
  markerColor: string;
  selectedIndex: number;
  focused: boolean;
  interactive: boolean;
  reducedMotion: boolean;
  onSelect: (cardIndex: number) => void;
  onToggleCell: (cardIndex: number, cellIndex: number, marked: boolean) => void;
}) {
  const placements = useMemo(() => layoutCards(cards.length), [cards.length]);

  return (
    <group>
      {placements.map((placement) => {
        const card = cards[placement.index];
        if (!card) return null;
        return (
          <InteractiveBingoCard
            key={card.id}
            card={card}
            placement={placement}
            drawn={drawn}
            markerColor={markerColor}
            selected={placement.index === selectedIndex}
            focused={focused}
            interactive={interactive}
            reducedMotion={reducedMotion}
            onSelect={onSelect}
            onToggleCell={onToggleCell}
          />
        );
      })}
    </group>
  );
}

export default BingoCardDeck3D;
