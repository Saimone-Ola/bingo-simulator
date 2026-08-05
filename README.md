# Bingo Simulator

Gioco 3D multiplayer via browser: hub navigabile, sale bingo e slot create dagli
utenti, price game sparsi nel mondo. Interfaccia in italiano, codice e commenti
in inglese.

**Solo crediti virtuali.** Nessun deposito, nessun prelievo, nessuna conversione
in denaro reale, nessun riferimento a marchi di casinò esistenti.

---

## Stato

| Fase | Contenuto | Stato |
|---|---|---|
| 0 | Monorepo, TypeScript, PostgreSQL + migrazioni, auth, ledger, deploy | ✅ fatto |
| 1 | Hub 3D, avatar, movimento multiplayer Colyseus, chat | ✅ fatto |
| 2 | Sala bingo funzionante end-to-end | ✅ fatto |
| 3 | Sale create dagli utenti, regole, codice privato, inviti | 🟡 ingresso per codice, creazione no |
| 4 | Slot giocabili + editor con calcolo RTP | ✅ fatto |
| 5 | Editor visivo sala, pattern personalizzati, sale slot | 🟡 sala slot fatta, editor sala no |
| 6 | Price game, eventi a orario, jackpot | ⬜ |
| 7 | Negozio, inventario, guardaroba, progressione | ⬜ |
| 8 | Moderazione, anti-cheat, ottimizzazione, analytics, i18n | ⬜ |

### Percorsi dell'applicazione

| Rotta | Cosa c'è |
|---|---|
| `/hub` | Piazza 3D: movimento, chat, emote, punti di interesse |
| `/bingo` | Sala Bingo italiana a 90 numeri, in prima persona |
| `/arcade` | Sala slot 3D: cabinati giocabili, `E` per sedersi a una macchina |
| `/arcade/editor` | Editor delle slot: nastri, tabella paga, linee, RTP calcolato e misurato |
| `/tesi` | Modalità discussione, con le verifiche eseguite dal vivo |
| `/stile` | Guida di stile del design system |

---

## Struttura

```
bingo-simulator/          <- radice del repository
├── packages/
│   ├── shared/     contratti condivisi: schemi Zod, costanti, protocollo Colyseus
│   ├── server/     API Express, Colyseus, Drizzle + PostgreSQL, auth, ledger, motore slot
│   └── client/     React + Vite + React Three Fiber, Tailwind, Zustand
├── scripts/        utility (generazione segreti)
├── Dockerfile      immagine del server di gioco
├── render.yaml     blueprint Render (servizio + database)
├── DEPLOY.md       messa online, passo per passo
├── DESIGN.md       design system: token, componenti, regole
├── docs/
│   ├── THESIS_VERTICAL_SLICE.md   cosa è implementato e verificato, e cosa no
│   └── DEMO.md                    script della dimostrazione e domande attese
├── pnpm-workspace.yaml
└── vercel.json     deploy del solo client
```

`@bingo/shared` esporta TypeScript sorgente: client e server non possono
divergere sui contratti perché compilano lo stesso file.

---

## Prerequisiti

- **Node.js 22+** — <https://nodejs.org> (verifica con `node -v`)
- **pnpm 10+** — `npm install -g pnpm`
- **Git**
- **PostgreSQL**: in produzione Neon; in locale va bene Neon anche per lo
  sviluppo, così non devi installare niente

> **Windows**: usa PowerShell, ma **non incollare comandi con `&&`**. Windows
> PowerShell 5.1 (quello preinstallato) non lo supporta: separa i comandi con
> `;` oppure eseguili su righe diverse. Tutti i comandi qui sotto sono già
> scritti uno per riga apposta.

## Avvio in locale

### 1. Clona il repository

```
git clone https://github.com/Saimone-Ola/bingo-simulator.git
cd bingo-simulator
```

### 2. Installa le dipendenze

```
npm install -g pnpm
pnpm install
```

Se `pnpm` non viene riconosciuto subito dopo l'installazione globale, chiudi e
riapri il terminale: la `PATH` viene aggiornata solo per le nuove sessioni.

### 3. Database

**Con Neon** (consigliato, identico alla produzione, zero installazioni): crea
un progetto su [neon.tech](https://neon.tech) e copia la connection string. Usa
un *branch* dedicato per lo sviluppo e uno per i test.

**Con un PostgreSQL locale**, se preferisci: `createdb bingo`.

### 4. Variabili d'ambiente

Windows (PowerShell):

```
Copy-Item .env.example packages\server\.env
Copy-Item packages\client\.env.example packages\client\.env
```

macOS / Linux:

```
cp .env.example packages/server/.env
cp packages/client/.env.example packages/client/.env
```

Genera i due segreti JWT — devono essere diversi tra loro:

```
pnpm secrets
```

Incolla le due righe stampate in `packages/server/.env` (sostituendo quelle
segnaposto) e metti lì anche la connection string di Neon in `DATABASE_URL` e
`DATABASE_URL_UNPOOLED`. Per aprire il file su Windows: `notepad
packages\server\.env`.

Il server rifiuta di avviarsi se manca una variabile o se i due segreti
coincidono: meglio un boot fallito che un token firmabile da chi non deve.

### 5. Migrazioni e seed

```
pnpm db:migrate
pnpm db:seed
```

Utenze create dal seed (sovrascrivibili con `SEED_ADMIN_EMAIL` ecc.):

| Email | Password | Ruolo |
|---|---|---|
| `admin@bingo.local` | `cambiami-subito-2026` | admin |
| `giocatore@bingo.local` | `cambiami-subito-2026` | player |

### 6. Avvio

```
pnpm dev
```

API, matchmaking e hub sulla **stessa porta** `:3001`; client su `:5173`. Apri
<http://localhost:5173>, crea un account e atterri nella piazza 3D: WASD per
muoverti, Shift per correre, trascina per girare la camera, chat ed emote in
basso.

> L'API è un'app Express montata dentro Colyseus, non un server a sé. Colyseus
> registra le sue rotte con `prependListener('request')` e, senza un'app a cui
> delegare, risponderebbe a *ogni* richiesta; dandogliela, il matchmaking va a
> Colyseus e tutto il resto all'API. Una porta sola è anche l'unica cosa che un
> PaaS espone per servizio.

### Se qualcosa non parte

| Sintomo | Causa e rimedio |
|---|---|
| `Il token '&&' non è un separatore di istruzioni valido` | Sei su Windows PowerShell 5.1. Esegui i comandi su righe separate, o usa `;` |
| `pnpm : Termine 'pnpm' non riconosciuto` | pnpm non installato o `PATH` non aggiornata: `npm install -g pnpm`, poi riapri il terminale |
| `Impossibile trovare il percorso '…\.env.example'` | Non sei dentro `bingo-simulator/`. Fai `cd` nella cartella prima di copiare |
| `Invalid environment configuration` all'avvio | Manca una variabile in `packages/server/.env`, oppure i due segreti JWT sono uguali |
| Errore di compilazione di `argon2` durante `pnpm install` | Manca un compilatore C++. Installa i [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) con il workload "Desktop development with C++", poi rilancia `pnpm install` |

### Comandi utili

| Comando | Cosa fa |
|---|---|
| `pnpm dev` | API + client in watch |
| `pnpm --filter @bingo/server load:hub -- --bots 19` | riempie l'hub di giocatori sintetici per profilare il client |
| `pnpm secrets` | genera i due segreti JWT |
| `pnpm build` | build di produzione dei tre pacchetti |
| `pnpm typecheck` | `tsc --noEmit` su tutto il workspace |
| `pnpm test` | suite di test |
| `pnpm db:generate` | genera una migrazione dal diff dello schema |
| `pnpm db:migrate` | applica le migrazioni |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm --filter @bingo/server db:check` | verifica di integrità del ledger |

---

## Test

```bash
pnpm test                                        # unit test, nessun database
TEST_DATABASE_URL=postgresql://… pnpm test       # include i test di integrità del ledger
```

I test che toccano il database si auto-escludono senza `TEST_DATABASE_URL`, così
`pnpm test` gira sempre su un checkout pulito. Coprono, ad oggi:

- hashing Argon2id, rotazione e riuso dei refresh token, manomissione del JWT;
- **saldo materializzato sempre uguale alla somma del ledger**;
- 200 movimenti concorrenti sullo stesso wallet senza perdere un credito;
- 20 addebiti simultanei su un saldo che ne copre 5 → esattamente 5 passano;
- idempotenza sotto retry storm: 10 tentativi, un solo accredito;
- `UPDATE`/`DELETE` su `ledger_entries` rifiutati **dal database**;
- nessun dato sensibile nei log quando una query fallisce;
- **20 client simultanei** nella stessa sala, tutti in movimento, senza che
  nessuno superi la velocità di corsa;
- un flusso di input a 4x il tick rate non guadagna un centimetro;
- sweep di collisione su tutta la piazza: nessun punto lascia dentro la
  geometria;
- il filtro testi non inciampa su "analisi", "assistente", "costante".

Ancora da scrivere (fasi successive): verifica vincita su tutti i pattern
bingo, simulazione di 100.000 spin per l'RTP.

Attenzione: `ledger_entries` è append-only, quindi i test di integrità lasciano
le loro righe nel database. Puntali su un branch Neon usa-e-getta.

---

## Architettura

### Server-authoritative, senza eccezioni

Il client non calcola mai un esito. Estrazione palline, risultato degli spin,
verifica del bingo e ogni movimento di crediti avvengono sul server; il client
riceve e renderizza. Il protocollo in `shared/src/protocol.ts` è scritto di
conseguenza: ogni messaggio client → server è una *richiesta*, mai
l'affermazione di un fatto.

### RNG e verificabilità

`crypto.randomBytes` lato server. Ogni partita e ogni spin salvano
`server_seed_hash` (pubblicato prima) e `server_seed` (pubblicato dopo), così
chiunque può rigiocare la sequenza e verificarla.

### Slot: motore, verificabilità, pubblicazione

Il motore (`shared/src/slots.ts`) è puro: date una configurazione, un seed e un
nonce restituisce sempre la stessa griglia. Da qui discende tutto il resto.

**Verificabilità.** Il seed di ogni giro è `HMAC(segreto, machineId:nonce)`. Il
server pubblica l'hash del seed *prima* che il giro avvenga e rivela il seed
*dopo*: chiunque può rieseguire `spinSlot` e ottenere la stessa griglia. La
pagina `/tesi` fa esattamente questa verifica dal vivo.

**Il nonce non si può riusare.** È prenotato con un `UPDATE ... RETURNING`
atomico sul contatore della macchina, e c'è un indice unico su
`(machine_id, nonce)`: anche se il livello applicativo sbagliasse, il database
rifiuta il doppione. Senza questo la promessa di verificabilità sarebbe vuota.

**Due RTP diversi, non due stime dello stesso.** `analyticLineRtp` è una somma
in forma chiusa sul solo gioco base: esatta, istantanea, e un limite inferiore
stretto perché ignora scatter e giri gratuiti. L'RTP misurato è un Monte Carlo
che li include: sui preset calibrati le funzioni valgono fra un quinto e un
terzo del ritorno totale. La pubblicazione è vincolata alla **misura**, non alla
formula, proprio perché la formula non può vedere le funzioni.

**La finestra 85–98% è imposta in tre punti indipendenti**: le costanti in
`shared/src/constants.ts`, il controllo in `publishSlotMachine`, e un vincolo
`CHECK` nel database (`slot_machines_published_rtp_window`) che rifiuta la riga
a prescindere dal codice che l'ha scritta.

**La puntata esce prima che i rulli siano letti**, e sia l'addebito sia
l'eventuale vincita passano dal ledger con chiave di idempotenza
`slot:<macchina>:<utente>:<richiesta>:bet|win`. Nessun credito si muove senza
una scrittura contabile.

### Ledger immutabile

I crediti non si aggiornano mai con un `UPDATE` del saldo. Ogni movimento è una
riga di `ledger_entries` scritta nella stessa transazione che aggiorna il saldo
materializzato in `wallets`, con il wallet bloccato `FOR UPDATE`. Tre difese in
profondità:

1. `services/ledger.ts` è l'unica porta d'accesso; l'`UPDATE` del wallet è
   condizionato al valore letto, quindi una scrittura concorrente non silenziosa
   fa fallire l'intera transazione invece di far divergere il saldo;
2. il database rifiuta `UPDATE`, `DELETE` e `TRUNCATE` su `ledger_entries`
   (trigger, migrazione `0001`). Le correzioni si fanno come in un libro mastro
   vero: con una scrittura di segno opposto;
3. `pnpm --filter @bingo/server db:check` ri-deriva ogni saldo dalla somma delle
   righe e segnala qualunque scostamento.

### Auth

Email + password, hashing **Argon2id** (64 MiB, 3 passate). Access token JWT a
vita breve (15 min) + refresh token opaco a rotazione, salvato solo come digest
HMAC: un dump del database non contiene credenziali riutilizzabili. Il riuso di
un refresh token già ruotato revoca l'intera famiglia di sessioni. Il tempo di
risposta del login è uguale per email inesistente e password sbagliata.

### Modello dati

19 tabelle, tutte in `packages/server/src/db/schema/`:

| File | Tabelle |
|---|---|
| `identity.ts` | `users`, `auth_sessions`, `avatars`, `wardrobe_sets`, `friendships` |
| `economy.ts` | `wallets`, `ledger_entries`, `items`, `user_inventory` |
| `rooms.ts` | `rooms`, `bingo_configs`, `bingo_games`, `bingo_cards` |
| `slots.ts` | `slot_machines`, `slot_spins` |
| `world.ts` | `prize_games`, `prize_claims` |
| `social.ts` | `chat_messages`, `reports` |

Le regole che devono valere sempre sono `CHECK` nel database, non solo
controlli applicativi: saldo mai negativo, importo di ledger mai zero, sala
privata sempre con codice, macchina slot pubblicabile solo con RTP fra 0,85 e
0,98 effettivamente calcolato.

---

## API

| Metodo | Rotta | Note |
|---|---|---|
| `GET` | `/health`, `/health/db` | liveness / readiness |
| `POST` | `/api/auth/register` | crea utente, wallet, avatar e bonus di benvenuto in una transazione |
| `POST` | `/api/auth/login` | |
| `POST` | `/api/auth/refresh` | rotazione con rilevamento del riuso |
| `POST` | `/api/auth/logout`, `/logout-all` | |
| `GET` | `/api/auth/me` | |
| `GET` | `/api/wallet/balance` | sola lettura |
| `GET` | `/api/wallet/statement` | estratto conto |

Slot (tutte sotto sessione autenticata):

| Metodo | Rotta | Note |
|---|---|---|
| `GET` | `/api/slots` | elenco, filtrabile su `mine` e volatilità |
| `POST` | `/api/slots` | crea una bozza |
| `PATCH` | `/api/slots/:id` | aggiorna la propria bozza |
| `POST` | `/api/slots/simulate` | Monte Carlo su una configurazione **non salvata**, per l'editor |
| `POST` | `/api/slots/:id/publish` | rilancia la simulazione su 1 000 000 di giri e pubblica o rifiuta |
| `GET` | `/api/slots/:id/commit` | hash dei seed dei prossimi giri, pubblicati prima che avvengano |
| `POST` | `/api/slots/:id/spin` | gioca un giro; `requestId` rende la richiesta idempotente |

Il client manda configurazioni e puntate. Non manda griglie, seed, vincite o
RTP, e non esiste una rotta che li accetterebbe.

Non esiste, e non esisterà, una rotta che scrive un saldo: i crediti si muovono
solo come effetto di un'azione di gioco risolta dal server.

Gli errori hanno sempre la forma `{ "error": { "code", "message", "fields"? } }`
con codici stabili (`invalid_credentials`, `insufficient_funds`, …); il client
li traduce in italiano.

---

## Design system

Documentazione completa in **[DESIGN.md](DESIGN.md)**. Guida di stile viva su
**`/stile`** (<http://localhost:5173/stile>): monta i componenti reali, quindi
non può divergere dal prodotto.

I token stanno tutti in `packages/client/src/styles/tokens.css` (blocco `@theme`
di Tailwind 4). Regola non negoziabile: **nessun valore letterale nei
componenti** — niente hex, niente pixel, niente `rgba()`. Unica eccezione
documentata `src/three/palette.ts`, perché i materiali Three.js non leggono le
custom property CSS.

Il bundle di handoff di Claude Design non è mai arrivato: questo sistema è stato
definito su richiesta esplicita in sostituzione. Se il bundle dovesse arrivare,
si sostituisce `tokens.css` e si allinea `palette.ts` — nient'altro.

## Deploy

Istruzioni complete e verificate in **[DEPLOY.md](DEPLOY.md)**. In breve:

- **Server → Render / Fly.io / Railway.** API, matchmaking e WebSocket stanno
  su **una sola porta**, quindi è un servizio solo. Il repo contiene già
  `Dockerfile` e `render.yaml` (Blueprint: colleghi il repo e Render provisiona
  servizio e database). Non può stare su Vercel: le funzioni serverless non
  tengono aperte le connessioni WebSocket.
- **Client → Vercel.** Root directory: la radice del repo. Unica variabile:
  `VITE_API_URL` con l'URL del server — il client ricava da sola l'endpoint
  `wss://`.
- **Database → Neon**, piano free (0 €, nessuna carta). Si sospende da solo
  dopo 5 minuti di inattività e **si risveglia in meno di un secondo**, senza
  nessun intervento. Le migrazioni girano sull'endpoint diretto (senza
  `-pooler`); il pooler non regge il lock del migratore. Passo per passo in
  [DEPLOY.md](DEPLOY.md).

## Vincoli di prodotto

- Interfaccia in italiano, codice e commenti in inglese.
- Nessun riferimento a marchi di casinò reali.
- Nessuna funzione di deposito, prelievo o conversione in denaro reale.
- Avviso di età consigliata mostrato in registrazione e in home; il campo
  `users.session_limit_minutes` è già previsto per i limiti di sessione
  opzionali (UI in fase 8).
