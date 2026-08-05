# Design system — Bingo Simulator

Interfaccia in italiano, codice e nomi dei token in inglese.

Guida di stile viva: **`/stile`** nell'app (`pnpm dev`, poi
<http://localhost:5173/stile>). Monta i componenti reali, quindi non può
divergere dal prodotto come farebbe una specifica statica.

---

## Da dove viene

Il bundle di handoff di Claude Design non è mai arrivato con la consegna. Questo
sistema è stato definito su richiesta esplicita del committente, in sostituzione.
Non è un segnaposto: è pensato per reggere le fasi 1–8.

Se il bundle di Claude Design dovesse arrivare in seguito, si sostituisce
`packages/client/src/styles/tokens.css` e si allinea
`packages/client/src/three/palette.ts`. Nient'altro va toccato: nessun
componente contiene un valore letterale.

---

## Regola numero uno

**Nessun valore letterale nei componenti.** Niente `#7c5cff`, niente `12px`,
niente `rgba(...)`. Tutto passa da un token dichiarato in `tokens.css` e usato
tramite un'utility Tailwind (`bg-brand-500`, `rounded-lg`, `shadow-panel`,
`text-content-secondary`).

Unica eccezione consentita: `src/three/palette.ts`, perché i materiali Three.js
non leggono le custom property CSS. Quel file è l'unico punto in cui un valore
di token è duplicato, ed è documentato come tale.

---

## Perché è scuro, e solo scuro

Il prodotto è un mondo 3D: la luce la fa il canvas, la chrome ci sta sopra.
Non esiste una variante chiara — non per pigrizia, ma perché il contrasto
dell'interfaccia va garantito sopra un rendering arbitrario e mutevole, e due
temi raddoppierebbero quella superficie di rischio senza servire nessuno.

---

## Colore

### Superfici — `surface-950 … surface-400`

Neri virati indaco. Numero basso = più lontano dall'occhio.

| Token | Uso |
|---|---|
| `surface-950` | sfondo pagina, pannelli sopra il mondo |
| `surface-900` | sfondo app — **coincide con il clear color del canvas** |
| `surface-850` | pozzi, campi di input |
| `surface-800` | card e pannelli |
| `surface-700` | menu, popover, HUD |
| `surface-600` | bordi sottili, divisori |
| `surface-500` | bordi marcati |
| `surface-400` | chrome disabilitata |

### Brand — `brand-100 … brand-900`

Violetto da luce di scena. `brand-500` è il default interattivo, `brand-400`
l'hover, `brand-600` l'active.

### Accento — `accent-100 … accent-700`

Oro. **Riservato al valore**: crediti, vincite, premi, jackpot. Usarlo per la
navigazione ordinaria smorzerebbe esattamente il segnale per cui esiste.

### Feedback — `success` / `warning` / `danger` / `info`

### Rarità — `rarity-common | rare | epic | legendary`

Una sola scala per negozio, inventario, guardaroba e drop dei price game: un
leggendario deve leggersi uguale in una card del negozio e in un banner di
vincita.

### Testo — `content-primary | secondary | muted | inverse`

Contrasto verificato su `surface-800`/`surface-900`: primary 15,8:1,
secondary 8,4:1, muted 4,6:1. `content-muted` è quindi ammesso solo per testo
secondario o di dimensione grande, mai per informazione critica.

---

## Tipografia

| Token | Uso |
|---|---|
| `font-display` | titoli e chrome di gioco |
| `font-sans` | tutto il resto dell'interfaccia |
| `font-mono` | numeri, codici sala, ID |

Stack di sistema, di proposito: un web font scaricato è una richiesta a terzi nel
percorso critico — lo stesso problema che ci ha già rotto la scena 3D con l'HDR
di drei. Un eventuale font di brand va servito dal nostro bundle.

Scala: quella di Tailwind, più `text-2xs` (etichette), `text-display` (titoli di
schermata) e `text-hero` (numeri delle palline, schermate di vincita).

**Cifre tabellari**: la classe `.tabular` va su qualunque numero che cambia nel
tempo — saldo crediti, contatore palline, timer. Senza, il layout balla a ogni
cifra.

---

## Forma, elevazione, movimento

Raggi: `rounded-sm` controlli minuti · `rounded-md` pulsanti e campi ·
`rounded-lg` HUD · `rounded-xl` pannelli · `rounded-2xl` modali.

Ombre: `shadow-panel`, `shadow-raised`, `shadow-hud`, più `shadow-glow-brand` e
`shadow-glow-accent` per gli stati celebrativi. Su fondo quasi nero un'ombra
stretta è invisibile: la separazione arriva da spread ampio più un bordo hairline.

Durate: `--duration-fast` 120ms · `--duration-base` 200ms · `--duration-slow`
320ms. Oltre, in una sala in diretta, sembra lag.

`prefers-reduced-motion` è rispettato globalmente in `index.css`: un gioco pieno
di rulli che girano e palline che schizzano è esattamente ciò per cui quella
preferenza esiste.

---

## Impilamento

Gli z-index sono dichiarati una volta sola in `tokens.css`
(`--z-world` 0 · `--z-hud` 10 · `--z-overlay` 20 · `--z-modal` 30 ·
`--z-toast` 40). Nessun componente inventa il proprio.

---

## Componenti (`components/ui.tsx`)

| Componente | Note |
|---|---|
| `Button` | varianti `primary`, `secondary`, `ghost`, `accent`, `danger`; taglie `sm`/`md`/`lg`. **`accent` solo per impegnare valore**: compra cartella, riscuoti premio, gira |
| `Field` | label, hint ed errore collegati con `aria-describedby`, `aria-invalid` sull'errore |
| `Panel` | superficie opaca, fuori dal mondo 3D |
| `HudCard` | traslucida con blur, galleggia sopra la scena |
| `Badge` | toni semantici |
| `RarityBadge` | scala rarità, etichette già in italiano |
| `CreditAmount` | **l'unico modo in cui un saldo viene mostrato**: oro, cifre tabellari, unità sempre esplicita |
| `ResponsiblePlayNotice` | vincolo di prodotto, non chiudibile |

---

## Trappola nota: classi costruite a runtime

Tailwind cerca stringhe di utility complete nel sorgente. Una classe assemblata
con un template literal non genera nessun CSS:

```tsx
<div className={`bg-surface-${step}`} />   // ❌ non produce niente
<div className={token.className} />        // ✅ con la stringa scritta per intero
```

È già costato dei campioni vuoti nella guida di stile una volta. Se un colore
"non si applica", questa è la prima cosa da controllare.

---

## Accessibilità

- `:focus-visible` sempre visibile, mai rimosso.
- Skip link oltre il canvas: senza, un utente da tastiera resta intrappolato
  prima di arrivare alla HUD.
- Gli errori di form sono testo, non solo colore.
- Il colore non è mai l'unico veicolo di un'informazione: la rarità ha
  l'etichetta, lo stato ha la parola.
- Le verifiche in `/tesi` hanno il segno `✓`/`✕` **e** un testo per lettori di
  schermo: verde e rosso non bastano.
- Ogni grafico ha `role="img"` con un `aria-label` che riporta il valore, perché
  una curva non è leggibile ad alta voce.

---

## Comandi da tastiera

La tabella dei comandi mostrata al giocatore (`components/CommandsPanel.tsx`)
non è scritta a mano: legge `SHORTCUT_HELP` da `net/shortcuts.ts`, lo stesso
modulo che decide cosa fa ciascun tasto. Un test verifica che ogni tasto
pubblicizzato risolva davvero in un'azione, così il pannello non può promettere
qualcosa che il codice non fa.

Due regole valgono più della tabella:

- Mentre un campo di testo ha il focus, l'unico tasto che significa ancora
  qualcosa è `Esc`. Si legge lo stesso flag `typing` del movimento, quindi un
  tasto non può contemporaneamente scrivere una lettera e muovere l'avatar.
- Il comportamento predefinito di `Esc` non viene **mai** soppresso: trattenerlo
  è il modo in cui una pagina intrappola l'utente nel pointer lock.

---

## 3D e design system

I materiali Three.js non leggono le custom property CSS, quindi i colori delle
scene stanno in `src/three/palette.ts` — l'unica eccezione documentata alla
regola "nessun valore letterale". Vale però lo stesso principio: un colore usato
in due scene sta in una costante, non in due letterali.

Sulle scene 3D il typecheck non dice quasi niente di utile: un materiale può
compilare e renderizzare nero, un piano può avere la normale dalla parte
sbagliata ed essere semplicemente invisibile. Entrambe le cose sono successe. La
verifica sensata è aprire la scena e guardarla.
