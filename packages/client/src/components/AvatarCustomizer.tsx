import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AVATAR_ACCESSORIES,
  AVATAR_BODY_TYPES,
  AVATAR_BROW_STYLES,
  AVATAR_EYE_STYLES,
  AVATAR_HAIR_STYLES,
  AVATAR_MOUTH_STYLES,
  DEFAULT_AVATAR_APPEARANCE,
  resolveAvatarAppearance,
  type AvatarAccessory,
  type AvatarAppearance,
  type AvatarBodyType,
  type AvatarBrowStyle,
  type AvatarEyeStyle,
  type AvatarHairStyle,
  type AvatarMouthStyle,
  type ResolvedAvatarAppearance,
} from '@bingo/shared';
import { api } from '../lib/api';
import ProceduralCharacter from '../three/ProceduralCharacter';
import { Button, HudCard } from './ui';

const BODY_LABELS: Record<AvatarBodyType, string> = {
  neutral: 'Classico',
  slim: 'Slanciato',
  athletic: 'Atletico',
  curvy: 'Morbido',
};

const HAIR_LABELS: Record<AvatarHairStyle, string> = {
  short: 'Corti',
  buzz: 'Rasati',
  bob: 'Caschetto',
  curly: 'Ricci',
  long: 'Lunghi',
};

const EYE_LABELS: Record<AvatarEyeStyle, string> = {
  round: 'Tondi',
  soft: 'Dolci',
  sharp: 'Decisi',
  sleepy: 'Assonnati',
};

const BROW_LABELS: Record<AvatarBrowStyle, string> = {
  neutral: 'Neutre',
  arched: 'Arcuate',
  thick: 'Folte',
  worried: 'Preoccupate',
};

const MOUTH_LABELS: Record<AvatarMouthStyle, string> = {
  smile: 'Sorriso',
  neutral: 'Neutra',
  grin: 'Sorrisone',
  smirk: 'Sorrisetto',
};

const ACCESSORY_LABELS: Record<AvatarAccessory, string> = {
  none: 'Nessuno',
  glasses: 'Occhiali',
  earrings: 'Orecchini',
  cap: 'Cappellino',
  scarf: 'Sciarpa',
};

const SKIN_TONES = ['#f3d1bd', '#e5b795', '#c98f6b', '#9b6247', '#70432f', '#44291f'];
const HAIR_COLORS = ['#17131d', '#2b2118', '#6b3b24', '#b96e38', '#e4c07a', '#8d5fce'];
const EYE_COLORS = ['#3c2a1f', '#5a7f4f', '#3f6ea8', '#6b4a8f', '#8a6a3a', '#2c2c34'];
const SHIRT_COLORS = ['#7c5cff', '#2fbf71', '#3ec9e0', '#e5488d', '#ff9e32', '#ef5c65'];
const PANTS_COLORS = ['#2f2a61', '#4a4585', '#243e62', '#48585c', '#6c3656', '#332d39'];
const ACCESSORY_COLORS = ['#f6c453', '#e8e8ef', '#c2455f', '#3f8f80', '#7357bd', '#1f1b26'];

/** One-click looks, handy when a player just wants to start playing. */
const PRESETS: ReadonlyArray<{ name: string; appearance: ResolvedAvatarAppearance }> = [
  {
    name: 'Classica',
    appearance: { ...DEFAULT_AVATAR_APPEARANCE },
  },
  {
    name: 'Elegante',
    appearance: {
      ...DEFAULT_AVATAR_APPEARANCE,
      bodyType: 'slim',
      hairStyle: 'bob',
      hairColor: '#17131d',
      shirtColor: '#e8e8ef',
      pantsColor: '#2f2a61',
      eyeStyle: 'soft',
      mouthStyle: 'smirk',
      accessory: 'earrings',
      accessoryColor: '#f6c453',
      heightCm: 170,
    },
  },
  {
    name: 'Sportiva',
    appearance: {
      ...DEFAULT_AVATAR_APPEARANCE,
      bodyType: 'athletic',
      hairStyle: 'buzz',
      skinTone: '#9b6247',
      shirtColor: '#2fbf71',
      pantsColor: '#243e62',
      eyeStyle: 'sharp',
      browStyle: 'thick',
      mouthStyle: 'grin',
      accessory: 'cap',
      accessoryColor: '#1f1b26',
      heightCm: 184,
    },
  },
  {
    name: 'Nonna fortunata',
    appearance: {
      ...DEFAULT_AVATAR_APPEARANCE,
      bodyType: 'curvy',
      hairStyle: 'curly',
      hairColor: '#e4c07a',
      skinTone: '#f3d1bd',
      shirtColor: '#e5488d',
      pantsColor: '#6c3656',
      eyeStyle: 'sleepy',
      browStyle: 'arched',
      mouthStyle: 'smile',
      accessory: 'glasses',
      accessoryColor: '#c2455f',
      heightCm: 158,
    },
  },
];

function ChoiceRow<T extends string>({
  label,
  values,
  value,
  labels,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-content-muted">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {values.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
              value === option
                ? 'border-brand-300 bg-brand-500/25 text-content-primary shadow-glow-brand'
                : 'border-surface-500/65 bg-surface-950/35 text-content-secondary hover:border-brand-400/70'
            }`}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ColourRow({
  label,
  colours,
  value,
  onChange,
}: {
  label: string;
  colours: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-content-muted">
        {label}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {colours.map((colour) => (
          <button
            key={colour}
            type="button"
            aria-label={`${label}: ${colour}`}
            aria-pressed={value === colour}
            onClick={() => onChange(colour)}
            className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 ${
              value === colour ? 'border-white shadow-glow-brand' : 'border-surface-500'
            }`}
            style={{ backgroundColor: colour }}
          />
        ))}
        <label className="grid h-8 w-8 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-surface-400 text-xs text-content-secondary">
          +
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="sr-only"
            aria-label={`Scegli un colore personalizzato per ${label}`}
          />
        </label>
      </div>
    </fieldset>
  );
}

/** Turntable so the player can inspect the back of the head and the outfit. */
function TurntableCharacter({
  appearance,
  spin,
  manualAngle,
}: {
  appearance: AvatarAppearance;
  spin: boolean;
  manualAngle: number;
}) {
  const group = useRef<THREE.Group>(null);
  const angle = useRef(manualAngle);

  useFrame((_state, delta) => {
    if (!group.current) return;
    if (spin) angle.current += delta * 0.5;
    else angle.current += (manualAngle - angle.current) * Math.min(1, delta * 8);
    group.current.rotation.y = angle.current;
  });

  return (
    <group ref={group}>
      <ProceduralCharacter
        appearance={appearance}
        state="IDLE"
        personality="CALM"
        position={[0, -1.02, 0]}
        rotationY={0}
        scale={0.98}
        phase={0.4}
      />
    </group>
  );
}

function AvatarPreview({ appearance }: { appearance: AvatarAppearance }) {
  const [angle, setAngle] = useState(0);
  const [spin, setSpin] = useState(true);

  return (
    <div className="grid gap-2">
      <div
        className="relative mx-auto h-[22rem] w-full max-w-xs overflow-hidden rounded-2xl border border-brand-300/25 bg-gradient-to-b from-[#493a9b] via-[#28215b] to-[#121026] shadow-panel"
        aria-label="Anteprima tridimensionale del personaggio"
      >
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [0, 0.78, 3.5], fov: 36, near: 0.1, far: 20 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.08;
          }}
        >
          <ambientLight intensity={1.2} color="#b9abff" />
          <hemisphereLight args={['#fff1d3', '#1e173d', 1.3]} />
          <directionalLight
            position={[2.5, 4, 3]}
            intensity={3}
            color="#ffe0b3"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <spotLight position={[-2.5, 2.8, 2]} intensity={12} angle={0.55} penumbra={0.8} color="#8b5cf6" />
          <mesh position={[0, -1.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[1.45, 40]} />
            <meshStandardMaterial color="#17132d" roughness={0.76} />
          </mesh>
          <TurntableCharacter appearance={appearance} spin={spin} manualAngle={angle} />
        </Canvas>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={-180}
          max={180}
          value={Math.round((angle * 180) / Math.PI)}
          onChange={(event) => {
            setSpin(false);
            setAngle((Number(event.target.value) * Math.PI) / 180);
          }}
          aria-label="Ruota il personaggio"
          className="flex-1 accent-brand-400"
        />
        <Button variant="ghost" size="sm" onClick={() => setSpin((value) => !value)}>
          {spin ? '⏸ Ferma' : '↻ Ruota'}
        </Button>
      </div>
    </div>
  );
}

export default function AvatarCustomizer({ onClose }: { onClose: () => void }) {
  const [appearance, setAppearance] = useState<ResolvedAvatarAppearance>(DEFAULT_AVATAR_APPEARANCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .avatar()
      .then(({ appearance: saved }) => {
        // Older profiles have none of the face fields; resolving them here means
        // the editor always shows a complete character.
        if (active) setAppearance(resolveAvatarAppearance(saved));
      })
      .catch(() => {
        if (active) setError('Non riesco a caricare il personaggio.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof ResolvedAvatarAppearance>(
    key: K,
    value: ResolvedAvatarAppearance[K],
  ) => {
    setAppearance((current) => ({ ...current, [key]: value }));
  };

  const preview = useMemo(() => appearance, [appearance]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateAvatar(appearance);
      // Rejoining refreshes the authoritative replicated avatar for every
      // player in the room, including friends already connected.
      window.location.reload();
    } catch {
      setSaving(false);
      setError('Salvataggio non riuscito. Riprova tra qualche secondo.');
    }
  };

  return (
    <div
      className="fixed inset-0 grid place-items-center bg-surface-950/80 p-4 backdrop-blur-md"
      style={{ zIndex: 'var(--z-modal)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-title"
    >
      <HudCard className="max-h-[92vh] w-full max-w-5xl overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-surface-600/80 px-5 py-4">
          <div>
            <p className="text-2xs font-black uppercase tracking-[0.2em] text-brand-300">
              Atelier in-game
            </p>
            <h2 id="avatar-title" className="font-display text-xl font-black text-content-primary">
              Personalizza il personaggio
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Chiudi personalizzazione">
            ✕ Chiudi
          </Button>
        </div>

        {loading ? (
          <div className="grid min-h-96 place-items-center text-content-secondary">
            Caricamento guardaroba…
          </div>
        ) : (
          <div className="grid gap-6 p-5 lg:grid-cols-[20rem_1fr]">
            <div className="grid content-start gap-4">
              <AvatarPreview appearance={preview} />
              <fieldset>
                <legend className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-content-muted">
                  Preset rapidi
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setAppearance(preset.appearance)}
                      className="rounded-lg border border-surface-500/65 bg-surface-950/35 px-3 py-2 text-xs font-bold text-content-secondary transition hover:border-brand-400/70"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="grid content-start gap-5">
              <ChoiceRow
                label="Corporatura"
                values={AVATAR_BODY_TYPES}
                value={appearance.bodyType}
                labels={BODY_LABELS}
                onChange={(value) => update('bodyType', value)}
              />
              <ChoiceRow
                label="Capelli"
                values={AVATAR_HAIR_STYLES}
                value={appearance.hairStyle}
                labels={HAIR_LABELS}
                onChange={(value) => update('hairStyle', value)}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <ChoiceRow
                  label="Occhi"
                  values={AVATAR_EYE_STYLES}
                  value={appearance.eyeStyle}
                  labels={EYE_LABELS}
                  onChange={(value) => update('eyeStyle', value)}
                />
                <ChoiceRow
                  label="Sopracciglia"
                  values={AVATAR_BROW_STYLES}
                  value={appearance.browStyle}
                  labels={BROW_LABELS}
                  onChange={(value) => update('browStyle', value)}
                />
                <ChoiceRow
                  label="Bocca"
                  values={AVATAR_MOUTH_STYLES}
                  value={appearance.mouthStyle}
                  labels={MOUTH_LABELS}
                  onChange={(value) => update('mouthStyle', value)}
                />
                <ChoiceRow
                  label="Accessori"
                  values={AVATAR_ACCESSORIES}
                  value={appearance.accessory}
                  labels={ACCESSORY_LABELS}
                  onChange={(value) => update('accessory', value)}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <ColourRow label="Pelle" colours={SKIN_TONES} value={appearance.skinTone} onChange={(value) => update('skinTone', value)} />
                <ColourRow label="Colore capelli" colours={HAIR_COLORS} value={appearance.hairColor} onChange={(value) => update('hairColor', value)} />
                <ColourRow label="Occhi" colours={EYE_COLORS} value={appearance.eyeColor} onChange={(value) => update('eyeColor', value)} />
                <ColourRow label="Maglia" colours={SHIRT_COLORS} value={appearance.shirtColor} onChange={(value) => update('shirtColor', value)} />
                <ColourRow label="Pantaloni" colours={PANTS_COLORS} value={appearance.pantsColor} onChange={(value) => update('pantsColor', value)} />
                {appearance.accessory !== 'none' && (
                  <ColourRow
                    label="Accessorio"
                    colours={ACCESSORY_COLORS}
                    value={appearance.accessoryColor}
                    onChange={(value) => update('accessoryColor', value)}
                  />
                )}
              </div>

              <label className="grid gap-2">
                <span className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-content-muted">
                  Altezza <strong className="text-content-primary">{appearance.heightCm} cm</strong>
                </span>
                <input
                  type="range"
                  min={140}
                  max={210}
                  step={1}
                  value={appearance.heightCm}
                  onChange={(event) => update('heightCm', Number(event.target.value))}
                  className="accent-brand-400"
                />
              </label>

              {error && (
                <p role="alert" className="rounded-lg border border-danger-500/50 bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-600/70 pt-4">
                <p className="max-w-lg text-xs leading-relaxed text-content-muted">
                  Le modifiche sono salvate sul profilo e condivise con gli altri giocatori.
                  Rientrerai automaticamente nella stessa stanza.
                </p>
                <Button variant="accent" size="lg" loading={saving} loadingLabel="Salvataggio…" onClick={() => void save()}>
                  ✓ Salva personaggio
                </Button>
              </div>
            </div>
          </div>
        )}
      </HudCard>
    </div>
  );
}
