# Deploy online

Due servizi: il **server di gioco** (API + matchmaking + WebSocket, una porta
sola) e il **front-end statico**. Più un database Postgres.

Il server non può stare su Vercel: le funzioni serverless non tengono
connessioni WebSocket aperte, e l'hub ne tiene una per giocatore per tutta la
sessione. Serve un host con processi persistenti — Render, Fly.io o Railway.

---

## 1. Server di gioco → Render (~5 minuti)

Il repository contiene già `render.yaml` e `Dockerfile`.

1. Vai su <https://dashboard.render.com/blueprints> → **New Blueprint Instance**
2. Collega il repository `bingo-simulator`
3. Render legge `render.yaml` e propone due risorse:
   - `bingo-db` — Postgres (piano free)
   - `bingo-server` — il servizio Docker
4. L'unica variabile da inserire a mano è **`CLIENT_ORIGINS`**. Alla prima
   creazione non conosci ancora l'URL Vercel: metti un valore provvisorio
   (`https://placeholder.vercel.app`) e correggilo al passo 3.
5. **Apply**

I due segreti JWT li genera Render (`generateValue`): non esistono in questo
repository e non passano da te.

Al primo deploy il `preDeployCommand` esegue le migrazioni. Quando è verde,
prendi nota dell'URL: `https://bingo-server-XXXX.onrender.com`.

Verifica:

```
curl https://bingo-server-XXXX.onrender.com/health
```

> **Piano free**: l'istanza va in sleep dopo 15 minuti di inattività e ci mette
> ~50 secondi a risvegliarsi. Per un gioco è pessimo — chi è nella piazza viene
> disconnesso. Per provarlo va bene; per farlo usare a qualcuno serve il piano
> a pagamento più basso (istanza sempre accesa).

### Alternative equivalenti

- **Fly.io**: `fly launch` legge il `Dockerfile`; imposta `PORT=8080` e le
  stesse variabili, poi `fly postgres create` e `fly postgres attach`.
- **Railway**: nuovo servizio da repo, rileva il `Dockerfile`, aggiungi il
  plugin Postgres e le stesse variabili.

In tutti i casi le variabili obbligatorie sono:

| Variabile | Valore |
|---|---|
| `DATABASE_URL` | connection string Postgres |
| `DATABASE_URL_UNPOOLED` | la stessa, o l'endpoint diretto se il provider ne ha uno |
| `AUTH_ACCESS_SECRET` | 48 byte casuali (`pnpm secrets`) |
| `AUTH_REFRESH_SECRET` | altri 48 byte, **diversi** |
| `CLIENT_ORIGINS` | l'URL del front-end, senza slash finale |
| `NODE_ENV` | `production` |

`PORT` la inietta la piattaforma: non impostarla a mano.

---

## 2. Front-end → Vercel (~3 minuti)

1. <https://vercel.com/new> → importa `bingo-simulator`
2. **Root Directory**: lascia la radice (il `vercel.json` fa il resto)
3. Variabile d'ambiente:

   | Nome | Valore |
   |---|---|
   | `VITE_API_URL` | `https://bingo-server-XXXX.onrender.com` |

   È l'unica che serve: il client ricava da sola l'endpoint WebSocket
   sostituendo `https` con `wss`, perché server e API stanno sulla stessa porta.
4. **Deploy**

---

## 3. Chiudi il cerchio

Torna su Render → `bingo-server` → **Environment** → imposta `CLIENT_ORIGINS`
sull'URL Vercel reale (es. `https://bingo-simulator.vercel.app`) e fai
**Manual Deploy → Deploy latest commit**.

Senza questo passo il browser blocca ogni chiamata: la CORS del server è chiusa
per impostazione, e rifiuta le origini non elencate sia sull'API sia sul
matchmaking.

Se hai più ambienti, `CLIENT_ORIGINS` accetta una lista separata da virgole.

---

## Verifica finale

```
curl https://bingo-server-XXXX.onrender.com/health        # {"status":"ok"}
curl https://bingo-server-XXXX.onrender.com/health/db     # {"status":"ok"}
```

Poi apri l'URL Vercel, crea un account e controlla che in alto **non** compaia
"Connessione persa": se compare, l'errore è quasi sempre `CLIENT_ORIGINS`
sbagliata o con lo slash finale.

Per provare il multiplayer davvero servono due browser diversi (o una finestra
in incognito): il server tiene **un avatar per account**, e un secondo accesso
con le stesse credenziali scollega il primo.

---

## Note per la produzione

- **Piano free = sleep.** Il primo giocatore dopo una pausa aspetta ~50s.
- **Una sola istanza.** Le sale Colyseus vivono in memoria: scalare a più
  istanze richiede il driver Redis (`@colyseus/redis-driver` +
  `@colyseus/redis-presence`), non ancora configurato.
- **Il database del piano free Render scade dopo 30 giorni.** Per qualcosa di
  duraturo usa Neon (che era lo stack previsto) e incolla la sua connection
  string in `DATABASE_URL`: il codice non cambia, è Postgres in entrambi i casi.
- **Le migrazioni girano a ogni deploy** dal `preDeployCommand`, prima che la
  nuova istanza prenda traffico.
