# Vertical slice — Bingo Simulator

Documento di riferimento per la discussione. Descrive **cosa è implementato e
verificato**, non cosa è previsto. Le parti non fatte sono elencate in fondo,
separate, perché una roadmap mescolata a un consuntivo non è utile a nessuno.

## Stack effettivo

- React 19 + Vite + Tailwind CSS 4 per interfaccia e HUD.
- React Three Fiber, Drei e Three.js per hub, sala Bingo e sala slot.
- Zustand per autenticazione e stato client.
- Colyseus su WebSocket per le stanze multiplayer.
- Express 5 per le API HTTP.
- Drizzle ORM + PostgreSQL per persistenza e registro crediti.
- Vitest, TypeScript in `strict` e tsup per qualità e build.

## Il principio che tiene insieme tutto

`@bingo/shared` non è una cartella di tipi: è il luogo dove vive **la
simulazione**, non solo il contratto. Client e server non implementano due volte
la stessa regola, importano la stessa funzione.

Tre casi concreti:

| Funzione | Chi la chiama | Cosa succederebbe con due copie |
|---|---|---|
| `resolvePosition` | predizione client, simulazione server | il giocatore attraverserebbe i muri solo sul suo schermo |
| `stepAvatarMotion` | predizione client, simulazione server | correzioni di posizione continue e visibili |
| `spinSlot` | server per giocare, chiunque per verificare | la verificabilità dei giri sarebbe indimostrabile |

Il client compila lo stesso sorgente del server: non possono divergere sui
contratti perché non esiste un secondo file da aggiornare.

## Implementato

### Bingo italiano a 90 numeri

1. Ingresso in sala tramite codice.
2. Lobby con host, partecipanti, NPC, stato Pronto.
3. Avvio configurabile: HOST, ALL_READY o TIMER.
4. Acquisto idempotente di 1, 3, 6 o N cartelle, in soli crediti virtuali.
5. Cartelle italiane 3×9: 15 numeri, 5 per riga, fasce 1–90 corrette.
6. Countdown sincronizzato e annullabile dall'host.
7. Estrazione deterministica a seed, autoritativa sul server, senza duplicati.
8. Segnatura manuale con errori correggibili, oppure automatica sui soli estratti.
9. Cinquina e Bingo verificati esclusivamente dal server.
10. Pagamento tramite ledger append-only con chiavi di idempotenza.
11. Riconnessione entro 60 secondi e riassegnazione dell'host.
12. Chiamata vocale italiana e storico degli ultimi cinque numeri.

### Sala da 512 posti

- 64 tavoli da 8 sedie su una griglia di circa 50 × 57 metri. Ogni sedia libera
  è occupabile: la stessa lista di posti serve al renderer, ai collider e al
  `SeatRegistry` autoritativo, quindi non esiste una sedia disegnata dove il
  server non farebbe sedere nessuno.
- **Livelli di dettaglio** per la folla e per l'arredo: i personaggi vicini sono
  completi, quelli a media distanza silhouette statiche, i lontani istanze in
  due sole chiamate di disegno. Tavoli e sedie oltre i 12 metri diventano
  quattro mesh istanziate invece di circa 7 400. La selezione è una funzione
  pura dei soli dati di posizione, quindi è verificata dai test e non dal
  frame rate di una macchina.
- **Venti tabelloni** distribuiti nella sala: la coppia ai lati del palco,
  pannelli sulle pareti laterali e sopra l'ingresso, e nove unità a quattro
  facce appese sopra i corridoi. Dal posto peggiore della sala il tabellone
  leggibile più vicino è a **11,0 metri**; la mediana è **5,7 metri**. Tutti
  condividono un'unica texture, ridipinta solo quando esce un numero.
- I test asseriscono le proprietà che contano: ogni posto vede un tabellone
  entro la distanza di lettura, nessuna unità appesa si frappone fra un posto e
  lo schermo del palco, e nessuna interseca i corpi illuminanti del soffitto.

### Hub navigabile

- Movimento in terza persona con predizione client e riconciliazione.
- Avatar con accelerazione e decelerazione, simulate dalla stessa funzione sui
  due lati: dopo tre secondi di cammino client e server restano a **1,6 cm** di
  distanza, contro una soglia di riconciliazione di 75 cm.
- Chat, emote, punti di interesse, elenco dei presenti.
- Scorciatoie da tastiera con pannello comandi (`?` o `F1`), che rispettano il
  focus dei campi di testo.

### Slot create dagli utenti

- **Motore puro** (`shared/src/slots.ts`): stessa configurazione, stesso seed,
  stesso nonce ⇒ stessa griglia. Wild, scatter, giri gratuiti, linee di
  pagamento configurabili.
- **RTP in forma chiusa** (`analyticLineRtp`) verificato contro una simulazione
  di 300 000 giri delle sole linee su tutti e quattro i preset: 74,06 contro
  74,07 · 52,13 contro 52,09 · 60,32 contro 60,39 · 82,72 contro 81,94.
- **Verificabilità**: seed derivato con `HMAC(segreto, machineId:nonce)`, hash
  pubblicato prima del giro, seed rivelato dopo.
- **Nonce irripetibile**: prenotazione atomica più indice unico su
  `(machine_id, nonce)` nel database.
- **Editor visivo** con nastri per rullo, tabella paga, linee attivabili, giri
  gratuiti, RTP calcolato in tempo reale e simulazione fino a 200 000 giri.
- **Sala 3D** con cabinati giocabili, e ripiego 2D per dispositivi senza WebGL:
  stesse macchine, stesso server, stessi giri, cambia solo la stanza.

### Autorità e sicurezza

Il client invia intenzioni: acquisto, pronto, segna, dichiara, punta. Non invia
cartelle, seed, numeri estratti, griglie, vincite, saldo o RTP. Il server genera
e conserva questi dati, valida ogni payload con Zod, e manda a ciascun giocatore
uno snapshot privato delle proprie cartelle.

La finestra di RTP pubblicabile (85–98%) è imposta in **tre punti indipendenti**:
le costanti condivise, il controllo in `publishSlotMachine`, e un vincolo `CHECK`
nel database. Lo stesso vale per l'integrità contabile: unico punto di accesso
applicativo, trigger che rifiuta `UPDATE`/`DELETE` su `ledger_entries`, e un
comando che ri-deriva ogni saldo dalla somma delle scritture.

## Verifiche eseguibili davanti alla commissione

La pagina `/tesi`, capitolo 05, esegue nel browser il codice condiviso e mostra
il risultato misurato in quel momento — non un valore salvato:

1. Riproducibilità di un giro dal suo seed, e differenza cambiando nonce.
2. Scarto fra predizione a 60 Hz e simulazione autorevole a 20 Hz.
3. Rifiuto di un accredito su una causale di solo addebito.
4. Nessun preset oltre il tetto di RTP sul solo gioco base.
5. Monte Carlo da 200 000 giri, con la curva che si assesta sotto gli occhi.

## Qualità

```bash
pnpm typecheck
pnpm test
pnpm build
```

Il workflow `.github/workflows/quality.yml` esegue gli stessi controlli a ogni
push e pull request.

I test che toccano il database si saltano da soli quando manca
`TEST_DATABASE_URL`, così `pnpm test` gira su un checkout pulito. Per eseguirli
serve un PostgreSQL usa-e-getta.

## Non implementato

Elencato perché la domanda arriverà, e una risposta preparata vale più di una
improvvisata.

- Creazione di sale da parte degli utenti (l'ingresso per codice c'è, la
  creazione no).
- Editor visivo della sala e pattern di vittoria personalizzati.
- Price game, eventi a orario, jackpot progressivo.
- Negozio, inventario, guardaroba, progressione.
- Moderazione, anti-cheat oltre la validazione, analytics, internazionalizzazione.
- Asset 3D professionali: personaggi e arredi sono procedurali, non modelli
  importati. Nessun placeholder è spacciato per asset finale.
