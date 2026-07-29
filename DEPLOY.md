# Deploy online

Tre pezzi: **database**, **server di gioco** (API + matchmaking + WebSocket, una
porta sola) e **front-end statico**.

Il server non può stare su Vercel: le funzioni serverless non tengono
connessioni WebSocket aperte, e l'hub ne tiene una per giocatore per tutta la
sessione. Serve un host con processi persistenti.

---

## 1. Database — già creato ✅

È stato creato un progetto Postgres pronto all'uso:

| | |
|---|---|
| Provider | Supabase |
| Progetto | `bingo-simulator` |
| Reference | `retshssatcmgehmnngsd` |
| Regione | `eu-central-1` (Francoforte) |
| Postgres | 17 |
| Costo | 0 €/mese |

Dashboard: <https://supabase.com/dashboard/project/retshssatcmgehmnngsd>

### Prendere le due connection string

Nel progetto → **Connect** (in alto) → sezione **Connection string**. Ti servono
**due** varianti, entrambe con la password del database (che trovi in *Project
Settings → Database → Database password*; se non l'hai mai vista, generane una
nuova lì):

| Variabile | Quale scegliere | Perché |
|---|---|---|
| `DATABASE_URL` | **Transaction pooler** (porta `6543`) | Il server tiene molte connessioni brevi; il pooler è fatto per quello. Il codice usa già `prepare: false`, obbligatorio con questo pooler. |
| `DATABASE_URL_UNPOOLED` | **Session pooler** (porta `5432`) | Solo per le migrazioni: il transaction pooler non regge l'advisory lock che il migratore prende. |

> Copia gli host **dalla dashboard**, non a memoria: il prefisso della regione
> nell'host del pooler varia da progetto a progetto. Evita la connessione
> *diretta* `db.<ref>.supabase.co` — è solo IPv6 e molti host PaaS non ci
> arrivano.

### Nota sulla stabilità

Il piano free di Supabase **mette in pausa il progetto dopo 7 giorni senza
attività**, e va riattivato a mano dalla dashboard. Se il gioco resta fermo una
settimana, la prima connessione fallisce finché non lo riattivi.

Due modi per non pensarci:
- **Supabase Pro**, 25 $/mese: nessuna pausa.
- **Neon** (lo stack che avevi indicato in origine), piano free: si sospende
  anche lui, ma **si risveglia da solo in meno di un secondo** e non richiede
  nessun intervento. Per questo progetto è la scelta migliore a costo zero.
  Se lo preferisci, crea il progetto su <https://neon.tech>, prendi la sua
  connection string e usa quella al posto delle due qui sopra — il codice non
  cambia di una riga, è Postgres in entrambi i casi.

---

## 2. Server di gioco → Render

Il repository contiene già `render.yaml` e `Dockerfile`.

1. <https://dashboard.render.com/blueprints> → **New Blueprint Instance**
2. Collega il repository `bingo-simulator`
3. Render legge `render.yaml` e chiede le variabili marcate `sync: false`:

   | Variabile | Valore |
   |---|---|
   | `DATABASE_URL` | transaction pooler (`:6543`) |
   | `DATABASE_URL_UNPOOLED` | session pooler (`:5432`) |
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
2. **Root Directory**: la radice (il `vercel.json` fa il resto)
3. Variabile d'ambiente:

   | Nome | Valore |
   |---|---|
   | `VITE_API_URL` | `https://bingo-server-XXXX.onrender.com` |

   È l'unica che serve: il client ricava da sé l'endpoint WebSocket
   sostituendo `https` con `wss`, perché server, API e matchmaking stanno sulla
   stessa porta.
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
| "Connessione persa" subito | `CLIENT_ORIGINS` sbagliata o con slash finale |
| Registrazione fallisce con errore server | `DATABASE_URL` errata, o progetto Supabase in pausa |
| Deploy fallisce nel pre-deploy | `DATABASE_URL_UNPOOLED` punta al transaction pooler invece che al session pooler |
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
