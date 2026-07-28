import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  CreditAmount,
  Field,
  HudCard,
  Panel,
  RarityBadge,
  ResponsiblePlayNotice,
  type Rarity,
} from '../components/ui';

/**
 * Living style guide at /stile.
 *
 * It renders the real components, so it cannot drift from the product the way
 * a static spec sheet does: if a token changes, this page changes with it, and
 * anything that looks wrong here is wrong in the game too.
 */
/*
 * Class names are written out in full on purpose. Tailwind scans source text
 * for complete utility strings, so a template literal like `bg-surface-${step}`
 * produces no CSS at all and every swatch renders blank.
 */
const SURFACES = [
  { label: 'surface-950', className: 'bg-surface-950' },
  { label: 'surface-900', className: 'bg-surface-900' },
  { label: 'surface-850', className: 'bg-surface-850' },
  { label: 'surface-800', className: 'bg-surface-800' },
  { label: 'surface-700', className: 'bg-surface-700' },
  { label: 'surface-600', className: 'bg-surface-600' },
  { label: 'surface-500', className: 'bg-surface-500' },
  { label: 'surface-400', className: 'bg-surface-400' },
];

const BRAND = [
  { label: 'brand-100', className: 'bg-brand-100' },
  { label: 'brand-200', className: 'bg-brand-200' },
  { label: 'brand-300', className: 'bg-brand-300' },
  { label: 'brand-400', className: 'bg-brand-400' },
  { label: 'brand-500', className: 'bg-brand-500' },
  { label: 'brand-600', className: 'bg-brand-600' },
  { label: 'brand-700', className: 'bg-brand-700' },
  { label: 'brand-800', className: 'bg-brand-800' },
];

const ACCENT = [
  { label: 'accent-100', className: 'bg-accent-100' },
  { label: 'accent-300', className: 'bg-accent-300' },
  { label: 'accent-400', className: 'bg-accent-400' },
  { label: 'accent-500', className: 'bg-accent-500' },
  { label: 'accent-600', className: 'bg-accent-600' },
  { label: 'accent-700', className: 'bg-accent-700' },
];

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export default function StyleGuidePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 p-6 pb-20">
      <header>
        <p className="text-2xs uppercase tracking-wide text-content-muted">Bingo Simulator</p>
        <h1 className="font-display text-display text-brand-100">Guida di stile</h1>
        <p className="mt-2 max-w-2xl text-sm text-content-secondary">
          Tutti i valori arrivano da <code className="text-brand-300">styles/tokens.css</code>.
          Questa pagina monta i componenti reali: se un token cambia, cambia anche qui.
        </p>
        <p className="mt-4">
          <Link to="/" className="text-sm text-brand-300 underline">
            ← Torna all’accesso
          </Link>
        </p>
      </header>

      <Section title="Superfici" note="Numeri bassi = più lontano dall’occhio.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SURFACES.map((token) => (
            <Swatch key={token.label} className={token.className} label={token.label} />
          ))}
        </div>
      </Section>

      <Section title="Brand" note="Violetto da luce di scena. Il 500 è il default interattivo.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BRAND.map((token) => (
            <Swatch key={token.label} className={token.className} label={token.label} />
          ))}
        </div>
      </Section>

      <Section
        title="Accento"
        note="Oro riservato al valore: crediti, vincite, premi, jackpot. Mai per la navigazione."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ACCENT.map((token) => (
            <Swatch key={token.label} className={token.className} label={token.label} />
          ))}
        </div>
      </Section>

      <Section title="Feedback">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch className="bg-success-500" label="success-500" />
          <Swatch className="bg-warning-500" label="warning-500" />
          <Swatch className="bg-danger-500" label="danger-500" />
          <Swatch className="bg-info-500" label="info-500" />
        </div>
      </Section>

      <Section title="Rarità" note="Una sola scala per negozio, inventario, guardaroba e premi.">
        <div className="flex flex-wrap gap-3">
          {RARITIES.map((rarity) => (
            <RarityBadge key={rarity} rarity={rarity} />
          ))}
        </div>
      </Section>

      <Section title="Tipografia">
        <div className="flex flex-col gap-2">
          <p className="font-display text-hero">Bingo — 90</p>
          <p className="font-display text-display">Titolo di sezione</p>
          <p className="text-base text-content-primary">
            Testo primario: la partita inizia tra pochi istanti.
          </p>
          <p className="text-sm text-content-secondary">
            Testo secondario: cartelle acquistate, in attesa dell’estrazione.
          </p>
          <p className="text-xs text-content-muted">Testo attenuato: dettagli e note.</p>
          <p className="tabular font-mono text-sm text-content-primary">
            Cifre tabellari 0123456789 — codice sala: 4KP-92X
          </p>
        </div>
      </Section>

      <Section title="Crediti" note="L’unico modo in cui un saldo viene mostrato.">
        <div className="flex flex-wrap items-baseline gap-6">
          <CreditAmount value={1000} size="sm" />
          <CreditAmount value={12500} />
          <CreditAmount value={1284350} size="lg" />
        </div>
      </Section>

      <Section title="Pulsanti">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primario</Button>
          <Button variant="secondary">Secondario</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="accent">Compra cartella</Button>
          <Button variant="danger">Abbandona</Button>
          <Button loading>Invio</Button>
          <Button disabled>Disabilitato</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm">Piccolo</Button>
          <Button size="md">Medio</Button>
          <Button size="lg">Grande</Button>
        </div>
      </Section>

      <Section title="Etichette">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutro</Badge>
          <Badge tone="brand">In corso</Badge>
          <Badge tone="success">Vincita</Badge>
          <Badge tone="warning">Ultimi posti</Badge>
          <Badge tone="danger">Sala piena</Badge>
          <Badge tone="info">Privata</Badge>
        </div>
      </Section>

      <Section title="Contenitori">
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel>
            <h3 className="font-semibold">Panel</h3>
            <p className="mt-1 text-sm text-content-secondary">
              Superficie opaca per i contenuti fuori dal mondo 3D.
            </p>
          </Panel>
          <HudCard>
            <h3 className="font-semibold">HudCard</h3>
            <p className="mt-1 text-sm text-content-secondary">
              Traslucida con blur: galleggia sopra la scena.
            </p>
          </HudCard>
        </div>
      </Section>

      <Section title="Campi">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome sala" name="demo-name" placeholder="Sala del Girasole" />
          <Field
            label="Codice di accesso"
            name="demo-code"
            defaultValue="ABC"
            error="Il codice deve avere 6 caratteri."
          />
        </div>
      </Section>

      <ResponsiblePlayNotice className="mt-4" />
    </main>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-xl text-content-primary">{title}</h2>
        {note && <p className="mt-1 text-sm text-content-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-surface-600">
      <div className={`h-14 ${className}`} />
      <p className="bg-surface-850 px-2 py-1 font-mono text-2xs text-content-muted">{label}</p>
    </div>
  );
}
