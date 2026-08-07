# Deploy online

Tre pezzi: **database**, **server di gioco** (API + matchmaking + WebSocket, una
porta sola) e **front-end statico**.

Il server non può stare su Vercel: le funzioni serverless non tengono
connessioni WebSocket aperte, e l'hub ne tiene una per giocatore per tutta la
sessione. Serve un host con processi persistenti.

---

## 1. Database → Supabase (il progetto già in uso)

Lo schema è **già applicato** sul progetto `bingo-simulator`
(`retshssatcmgehmnngsd`, eu-central-1): 19 tabelle, 62 indici, i tre trigger di
immutabilità del ledger e il guardiano dell'RTP. Il registro delle migrazioni di
Drizzle è allineato, quindi un `pnpm --filter @bingo/server db:migrate` non
riapplica niente: vede il database aggiornato e non fa nulla.

Manca **solo la password**, che non è leggibile da fuori: si prende da
**Project Settings → Database → Connection string**, oppure si rigenera lì con
**Reset database password**. Poi:

| Variabile | Stringa |
|---|---|
| `DATABASE_URL` | `postgresql://postgres.retshssatcmgehmnngsd:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres` |
| `DATABASE_URL_UNPOOLED` | `postgresql://postgres.retshssatcmgehmnngsd:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres` |

Cambia solo la **porta**: `6543` è il pooler in modalità *transaction*, giusto
per il server che apre e chiude connessioni brevi; `5432` sullo stesso host è la
modalità *session*, l'unica che regge l'advisory lock che il migratore prende.

Due dettagli già a posto nel codice, da non rompere:

- `prepare: false` in `db/client.ts` è **obbligatorio** sul pooler in modalità
  transaction: senza, i prepared statement si perdono fra una connessione e
  l'altra e le query falliscono a intermittenza.
- L'host diretto `db.retshssatcmgehmnngsd.supabase.co` è **solo IPv6**. Molti
  host PaaS non lo raggiungono: usare il pooler per entrambe le variabili.

Le API REST generate da Supabase sono **chiuse**: RLS attivo senza policy su
tutte le tabelle. L'applicazione non le usa — parla direttamente in Postgres — e
senza RLS chiunque avesse la chiave pubblica del bundle avrebbe letto
`users.password_hash`, i saldi e l'intero ledger.

---

## 1-bis. In alternativa: Neon (~2 minuti, gratis, nessuna carta)

1. Vai su <https://neon.tech> → registrati (basta il login GitHub)
2. **Create project**
   - Name: `bingo-simulator`
   - Postgres: 17
   - Region: **Europe (Frankfurt)** — la stessa del server, così la latenza
     verso il database è di pochi millisecondi invece di un giro dell'Atlantico
3. **Create**

Alla fine Neon mostra la connection string. Nel pannello **Connection details**
c'è un interruttore **Connection pooling**: ti servono **entrambe** le varianti,
e differiscono per un solo pezzo di testo.

| Variabile | Stringa | Perché |
|---|---|---|
| `DATABASE_URL` | quella **con** `-pooler` nell'host | Il server apre e chiude molte connessioni brevi; il pooler è fatto per quello |
| `DATABASE_URL_UNPOOLED` | la stessa **senza** `-pooler` | Solo per le migrazioni: il pooler non regge l'advisory lock che il migratore prende |

Concretamente cambia questo e nient'altro:

```
DATABASE_URL="postgresql://…@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://…@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require"
                                                       ↑ manca "-pooler"
```

> **Non togliere `?sslmode=require`**: Neon rifiuta le connessioni in chiaro.
> Verificato che il driver lo interpreti correttamente (diventa `ssl: require`)
> e che `prepare: false`, obbligatorio col pooler, resti attivo.

### Perché Neon e non altro

Il piano free si **sospende dopo 5 minuti di inattività** ma **si risveglia da
solo in meno di un secondo**, senza che nessuno debba toccare niente. È la
differenza che conta rispetto ad alternative come il free tier di Supabase, che
dopo 7 giorni mette il progetto in pausa e va riattivato a mano dalla dashboard.

Limiti del piano free: 0,5 GB di storage e 190 ore di compute al mese. Per un
gioco in sviluppo e per i primi giocatori è abbondante.

---

## 2. Server di gioco → Render

Il repository contiene già `render.yaml` e `Dockerfile`.

1. <https://dashboard.render.com/blueprints> → **New Blueprint Instance**
2. Collega il repository `bingo-simulator`
3. Render legge `render.yaml` e chiede le variabili marcate `sync: false`:

   | Variabile | Valore |
   |---|---|
   | `DATABASE_URL` | la stringa Neon **con** `-pooler` |
   | `DATABASE_URL_UNPOOLED` | la stessa **senza** `-pooler` |
   | `CLIENT_ORIGINS` | provvisorio, es. `https://placeholder.vercel.app` — lo correggi al passo 4 |

   I due segreti JWT li genera Render da sé.
4. **Apply**

Al primo deploy il `preDeployCommand` crea tutto lo schema (19 tabelle, i
trigger di immutabilità del ledger). Quando è verde, prendi l'URL:
`https://bingo-server-XXXX.onrender.com`.

```
curl https://bingo-server-XXXX.onrender.com/health      # {"status":"ok"}
curl https://bingo-server-XXXX.onrender.com/health/db   # {"status":"ok"}
```

### Il piano free non è "stabile"

`render.yaml` dice `plan: free`: **l'istanza dorme dopo 15 minuti di inattività
e ci mette ~50 secondi a risvegliarsi**, buttando fuori chi è nella piazza. Per
provarlo va bene; per farlo usare a qualcuno cambia una riga:

```yaml
plan: starter    # 7 $/mese, istanza sempre accesa
```

Alternative equivalenti, stesso `Dockerfile`:

| Host | Costo indicativo | Note |
|---|---|---|
| Render Starter | 7 $/mese | Il percorso già configurato qui |
| Fly.io | ~2–5 $/mese | `fly launch` legge il Dockerfile; `PORT=8080` |
| Railway | 5 $/mese di credito | Rileva il Dockerfile da sé |

---

## 3. Front-end → Vercel

1. <https://vercel.com/new> → importa `bingo-simulator`
2. **Root Directory: lasciala sulla radice** (`./`)

   > ⚠️ È il punto in cui il primo deploy è fallito. L'import di Vercel
   > riconosce l'app Vite dentro `packages/client` e **propone di spostare lì
   > la Root Directory**. Se accetti, Vercel smette di leggere il `vercel.json`
   > della radice e il build finisce con
   > `No Output Directory named "dist" found`.
   >
   > Per correggerlo su un progetto già creato:
   > **Settings → Build & Deployment → Root Directory** → svuota il campo
   > (deve tornare `./`) → **Save** → **Deployments → … → Redeploy**.
   >
   > Tenerla sulla radice non è pignoleria: `@bingo/client` importa
   > `@bingo/shared` dal sorgente, e con la Root Directory su
   > `packages/client` Vercel considera "non rilevanti" le modifiche a
   > `packages/shared` e salta il rebuild.
   >
   > Se preferisci comunque tenerla su `packages/client`, funziona lo stesso:
   > c'è un `packages/client/vercel.json` apposta. Perdi solo il rebuild
   > automatico sulle modifiche a `packages/shared`.
3. Variabile d'ambiente:

   | Nome | Valore |
   |---|---|
   | `VITE_API_URL` | `https://bingo-server-XXXX.onrender.com` |

   È l'unica che serve: il client ricava da sé l'endpoint WebSocket
   sostituendo `https` con `wss`, perché server, API e matchmaking stanno sulla
   stessa porta.

   Va impostata **prima** del build: Vite la incorpora nel bundle, quindi
   aggiungerla dopo richiede un redeploy. Senza, il client parla con la propria
   origine Vercel — che non ha nessuna API — e ogni chiamata fallisce.
4. **Deploy**

---

## 4. Chiudi il cerchio

Render → `bingo-server` → **Environment** → `CLIENT_ORIGINS` = l'URL Vercel
reale (es. `https://bingo-simulator.vercel.app`, **senza slash finale**) →
**Manual Deploy → Deploy latest commit**.

Senza questo passo il browser blocca ogni chiamata: la CORS del server è chiusa
per impostazione e rifiuta le origini non elencate, sia sull'API sia sul
matchmaking.

Per più ambienti, `CLIENT_ORIGINS` accetta una lista separata da virgole.

---

## Verifica finale

Apri l'URL Vercel, crea un account e controlla che in alto **non** compaia
"Connessione persa". Se compare, nell'ordine:

| Sintomo | Causa quasi certa |
|---|---|
| Build Vercel: `No Output Directory named "dist" found` | Root Directory spostata su `packages/client` — vedi il riquadro al passo 3 |
| "Connessione persa" subito | `CLIENT_ORIGINS` sbagliata o con slash finale |
| Le chiamate partono verso l'URL Vercel stesso | Manca `VITE_API_URL`: aggiungila e rifai il deploy |
| Registrazione fallisce con errore server | `DATABASE_URL` errata, o manca `?sslmode=require` |
| Deploy fallisce nel pre-deploy | `DATABASE_URL_UNPOOLED` contiene ancora `-pooler` |
| Tutto lento al primo accesso | Istanza free che si sveglia: ~50s |

Per provare il multiplayer servono due browser diversi (o una finestra in
incognito): il server tiene **un avatar per account**, e un secondo accesso con
le stesse credenziali scollega il primo.

---

## Limiti noti

- **Una sola istanza.** Le sale Colyseus vivono in memoria: scalare a più
  istanze richiede il driver Redis (`@colyseus/redis-driver` +
  `@colyseus/redis-presence`), non ancora configurato. Fino ad allora tieni il
  servizio a 1 istanza.
- **L'immagine Docker non è mai stata costruita.** Ogni passo che compie è stato
  eseguito a mano e verificato (bundle, manifest di runtime,
  `npm install --omit=dev`, migrazioni, avvio, CORS), ma il `docker build` in sé
  no: il registry era irraggiungibile dall'ambiente di sviluppo. Se il primo
  build su Render fallisce, l'errore sarà nel Dockerfile e non nel codice.
- **Le migrazioni girano a ogni deploy**, prima che la nuova istanza prenda
  traffico.
- **Il database Neon free si sospende dopo 5 minuti di inattività.** Si
  risveglia da solo in meno di un secondo: la prima query dopo una pausa è
  appena più lenta, nient'altro da fare.
