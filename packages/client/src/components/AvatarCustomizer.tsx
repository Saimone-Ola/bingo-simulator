import { useEffect, useState } from 'react';
import {
  AVATAR_BODY_TYPES,
  AVATAR_HAIR_STYLES,
  type AvatarAppearance,
  type AvatarBodyType,
  type AvatarHairStyle,
} from '@bingo/shared';
import { api } from '../lib/api';
import { Button, HudCard } from './ui';

const DEFAULT_APPEARANCE: AvatarAppearance = {
  bodyType: 'neutral',
  skinTone: '#e0b49a',
  hairStyle: 'short',
  hairColor: '#2b2118',
  shirtColor: '#7c5cff',
  pantsColor: '#4a4585',
  heightCm: 175,
};

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

const SKIN_TONES = ['#f3d1bd', '#e0b49a', '#c98f6b', '#9b6247', '#70432f', '#44291f'];
const HAIR_COLORS = ['#17131d', '#2b2118', '#6b3b24', '#b96e38', '#e4c07a', '#8d5fce'];
const SHIRT_COLORS = ['#7c5cff', '#2fbf71', '#3ec9e0', '#e5488d', '#ff9e32', '#ef5c65'];
const PANTS_COLORS = ['#2f2a61', '#4a4585', '#243e62', '#48585c', '#6c3656', '#332d39'];

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

function AvatarPreview({ appearance }: { appearance: AvatarAppearance }) {
  const width = {
    neutral: 1,
    slim: 0.82,
    athletic: 1.18,
    curvy: 1.12,
  }[appearance.bodyType];

  const hairStyle = {
    short: { width: 68, height: 30, top: 14, radius: '50% 50% 34% 34%' },
    buzz: { width: 62, height: 20, top: 17, radius: '50% 50% 30% 30%' },
    bob: { width: 74, height: 58, top: 13, radius: '48% 48% 38% 38%' },
    curly: { width: 76, height: 36, top: 9, radius: '50%' },
    long: { width: 76, height: 86, top: 12, radius: '48% 48% 38% 38%' },
  }[appearance.hairStyle];

  return (
    <div className="relative mx-auto h-72 w-52 overflow-hidden rounded-2xl border border-brand-300/20 bg-gradient-to-b from-[#4c3ca5] via-[#30266d] to-[#181333] shadow-panel">
      <div className="absolute inset-x-0 bottom-3 mx-auto h-8 w-32 rounded-full bg-black/25 blur-md" />
      <div className="absolute inset-x-0 top-5 mx-auto h-60 w-28">
        <div
          className="absolute left-1/2 z-0 -translate-x-1/2"
          style={{
            width: hairStyle.width,
            height: hairStyle.height,
            top: hairStyle.top,
            borderRadius: hairStyle.radius,
            backgroundColor: appearance.hairColor,
          }}
        />
        <div
          className="absolute left-1/2 top-7 z-10 h-16 w-16 -translate-x-1/2 rounded-full border-2 border-white/20"
          style={{ backgroundColor: appearance.skinTone }}
        >
          <span className="absolute left-4 top-7 h-1.5 w-1.5 rounded-full bg-[#241a2d]" />
          <span className="absolute right-4 top-7 h-1.5 w-1.5 rounded-full bg-[#241a2d]" />
          <span className="absolute bottom-3 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-black/20" />
        </div>
        <div
          className="absolute left-1/2 top-[5.2rem] z-20 h-[5.8rem] w-[4.7rem] -translate-x-1/2 rounded-[2rem_2rem_1.3rem_1.3rem] border-2 border-white/15"
          style={{ backgroundColor: appearance.shirtColor, transform: `translateX(-50%) scaleX(${width})` }}
        />
        <div className="absolute left-0 top-[5.7rem] h-[5.2rem] w-5 rotate-6 rounded-full" style={{ backgroundColor: appearance.shirtColor }} />
        <div className="absolute right-0 top-[5.7rem] h-[5.2rem] w-5 -rotate-6 rounded-full" style={{ backgroundColor: appearance.shirtColor }} />
        <div className="absolute left-[1.25rem] top-[10.2rem] h-[4.6rem] w-7 rounded-b-full" style={{ backgroundColor: appearance.pantsColor }} />
        <div className="absolute right-[1.25rem] top-[10.2rem] h-[4.6rem] w-7 rounded-b-full" style={{ backgroundColor: appearance.pantsColor }} />
      </div>
      <p className="absolute inset-x-0 bottom-3 text-center text-2xs font-black uppercase tracking-[0.18em] text-white/70">
        Anteprima personaggio
      </p>
    </div>
  );
}

export default function AvatarCustomizer({ onClose }: { onClose: () => void }) {
  const [appearance, setAppearance] = useState<AvatarAppearance>(DEFAULT_APPEARANCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .avatar()
      .then(({ appearance: saved }) => {
        if (active) setAppearance(saved);
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

  const update = <K extends keyof AvatarAppearance>(key: K, value: AvatarAppearance[K]) => {
    setAppearance((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateAvatar(appearance);
      // Rejoining refreshes the authoritative replicated avatar for every
      // player in the plaza, including friends already connected.
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
          <div className="grid min-h-96 place-items-center text-content-secondary">Caricamento guardaroba…</div>
        ) : (
          <div className="grid gap-6 p-5 lg:grid-cols-[16rem_1fr]">
            <AvatarPreview appearance={appearance} />

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
                <ColourRow label="Pelle" colours={SKIN_TONES} value={appearance.skinTone} onChange={(value) => update('skinTone', value)} />
                <ColourRow label="Colore capelli" colours={HAIR_COLORS} value={appearance.hairColor} onChange={(value) => update('hairColor', value)} />
                <ColourRow label="Maglia" colours={SHIRT_COLORS} value={appearance.shirtColor} onChange={(value) => update('shirtColor', value)} />
                <ColourRow label="Pantaloni" colours={PANTS_COLORS} value={appearance.pantsColor} onChange={(value) => update('pantsColor', value)} />
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

              {error && <p role="alert" className="rounded-lg border border-danger-500/50 bg-danger-500/10 px-3 py-2 text-sm text-danger-400">{error}</p>}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-600/70 pt-4">
                <p className="max-w-lg text-xs leading-relaxed text-content-muted">
                  Le modifiche sono salvate sul profilo e condivise con gli altri giocatori. Rientrerai automaticamente nella stessa stanza.
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
