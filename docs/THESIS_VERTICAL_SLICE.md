# Vertical slice — Bingo italiano multiplayer

Questa versione sostituisce il prototipo 75-ball ad avvio immediato con una
vertical slice server-authoritative del Bingo italiano a 90 numeri.

## Stack rilevato

- React 19 + Vite + Tailwind CSS per interfaccia e HUD.
- React Three Fiber, Drei, Three.js e Rapier per hub e scene 3D.
- Zustand per autenticazione e stato client.
- Colyseus su WebSocket per stanze multiplayer.
- Express per API HTTP.
- Drizzle ORM + Neon PostgreSQL per persistenza e registro crediti.
- Vitest, TypeScript e tsup per qualità e build.

## Vertical slice implementata

1. Ingresso nella sala tramite codice invito.
2. Lobby con host, partecipanti, NPC, caricamento e stato Pronto.
3. Configurazione di avvio HOST, ALL_READY o TIMER.
4. Acquisto idempotente di 1, 3, 6 o N cartelle con soli crediti virtuali.
5. Cartelle italiane 3x9: 15 numeri, 5 per riga e fasce 1–90 corrette.
6. Countdown sincronizzato e annullabile dall'host.
7. Estrazione deterministica a seed e autorevole sul server, senza duplicati.
8. Segnatura manuale con errori correggibili o automatica sui soli estratti.
9. Cinquina e Bingo verificati esclusivamente dal server.
10. Pagamento virtuale tramite ledger append-only e chiavi di idempotenza.
11. Riconnessione di 60 secondi e riassegnazione dell'host.
12. Chiamata vocale italiana e storico degli ultimi cinque numeri.

## Autorità

Il client invia intenzioni: acquisto, pronto, segna e dichiara. Non invia
cartelle, seed, numeri estratti, saldo o risultati. Il server genera e conserva
questi dati, valida ogni payload con Zod e invia a ogni giocatore uno snapshot
privato delle proprie cartelle.

## Avvio locale

Prerequisiti: Node.js 22+, Corepack/pnpm 10 e un database PostgreSQL/Neon.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Il client è servito normalmente su `http://localhost:5173`; il server usa la
porta configurata in `.env`.

## Qualità

```bash
pnpm typecheck
pnpm test
pnpm build
```

Il workflow `.github/workflows/quality.yml` esegue gli stessi controlli a
ogni push e pull request.

## Asset 3D richiesti per la fase successiva

La vertical slice non introduce modelli proprietari o placeholder spacciati per
asset finali. Per la sala in prima persona servono ancora:

- kit modulare GLB della sala (pareti, palco, bar, porte);
- tavolo, sedie, macchina estrattrice e tabellone con LOD;
- personaggi umani riggati, originali e con licenza compatibile;
- set condiviso di animazioni locomotion/seated/reaction;
- blend shape per volto e labiale semplificato;
- mani in prima persona e pennarelli riggati;
- audio italiano registrato o TTS con licenza distributiva;
- texture KTX2/ASTC e mesh Draco/Meshopt ottimizzate.

## Roadmap successiva

1. FirstPersonController seduto e TableInteractionSystem con raycast.
2. Sala 3D modulare con impostazioni Basso/Medio/Alto/Ultra.
3. CharacterAnimationController con blending, head tracking e IK.
4. NPCController, profili e dialoghi contestuali.
5. EventDirector e cinque eventi ambientali.
6. Evento zombie comico, sincronizzato e indipendente dall'estrazione.
7. Test di carico, accessibilità e profilo prestazioni su GPU integrate.
