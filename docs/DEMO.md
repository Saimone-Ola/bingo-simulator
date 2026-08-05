# Script della dimostrazione — 10 minuti

Pensato per essere seguito con il portatile davanti. I tempi sono indicativi ma
la somma sta in dieci minuti con un minuto di margine.

## Prima di entrare in aula

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Poi, in un terminale a parte, con la finestra già aperta e il comando **già
scritto ma non eseguito**:

```bash
pnpm typecheck && pnpm test
```

Apri due schede: `http://localhost:5173/tesi` e `http://localhost:5173/hub`.
Fai login prima. Nessuno vuole vedere una schermata di registrazione.

Se la rete o il database non collaborano, `/tesi` capitolo 05 funziona lo stesso:
è tutto codice che gira nel browser. È la rete di sicurezza della presentazione.

---

## 0:00 – 1:00 · Che cos'è, e cosa non è

Apri `/tesi`, capitolo 01.

> «È un gioco 3D multiplayer via browser: una piazza navigabile, una sala Bingo
> italiana a 90 numeri, e una sala slot dove le macchine le progettano gli
> utenti. Solo crediti virtuali: nessun deposito, nessun prelievo, nessuna
> conversione in denaro.»

Dillo subito. Toglie di mezzo la domanda che altrimenti aleggia per dieci minuti.

> «La tesi non è "ho fatto un gioco". È che in un gioco d'azzardo simulato il
> problema interessante è **chi decide gli esiti** e **come lo si dimostra**.»

## 1:00 – 3:00 · La piazza, e perché il movimento è un problema di rete

Passa a `/hub`. Cammina, corri, saluta con `1`, apri il pannello con `?`.

Il punto da fare mentre cammini:

> «Il client non manda mai la sua posizione. Manda l'intenzione: "sto premendo
> avanti". Il server simula e decide dove sono. Ma se aspettassi la risposta del
> server per muovermi, il gioco sarebbe inguardabile — quindi il client
> **predice**, eseguendo la stessa simulazione.»

> «La stessa funzione, non due implementazioni: sta in `@bingo/shared` e la
> importano entrambi. Se fossero due copie, la prima volta che ne tocco una il
> giocatore comincerebbe a vedere correzioni di posizione.»

**File da mostrare se chiedono:** `packages/shared/src/avatarMotion.ts`.

## 3:00 – 5:30 · La sala slot e l'editor

Vai su `/arcade`. Avvicinati a un cabinato, `E`, gioca un giro. Fai notare
l'impegno crittografico sotto i rulli.

> «L'hash del seed del prossimo giro è pubblicato **prima** che il giro avvenga.
> Dopo, il seed viene rivelato. Chiunque può rieseguire il motore e ottenere la
> stessa griglia: è questo che rende la giocata verificabile invece che
> "fidati".»

Poi `/arcade/editor`. Muovi un peso su un rullo e mostra l'RTP che cambia
all'istante. Poi premi **Simula**.

Il passaggio importante, da non saltare:

> «Ci sono due numeri e non sono due stime della stessa cosa. Quello calcolato è
> una somma in forma chiusa sul solo gioco base: esatto, istantaneo, e sempre
> **sotto** quello che la macchina paga davvero, perché non contiene scatter né
> giri gratuiti. Quello misurato è un Monte Carlo e li contiene: su questi preset
> le funzioni valgono fra un quinto e un terzo del ritorno.»

> «La pubblicazione è vincolata alla misura, non alla formula. Perché la formula
> non può vedere le funzioni.»

## 5:30 – 7:00 · Il Bingo

`/bingo`. Compra una cartella, fai partire una partita, dichiara una cinquina.

> «Le cartelle non le genera il client: arrivano già fatte dal server, e ogni
> giocatore riceve solo le proprie. Il client non ha nemmeno il codice per
> crearne una.»

> «La cinquina non la verifico io: la dichiaro, e il server controlla contro i
> numeri che ha estratto lui. Se dichiarassi il falso, verrei rifiutato.»

## 7:00 – 9:00 · Le verifiche dal vivo

Torna su `/tesi`, capitolo 05. **Questo è il momento forte: non correre.**

Le quattro verifiche sono già verdi all'apertura. Leggi la seconda ad alta voce:

> «Predizione a 60 Hz contro simulazione autorevole a 20 Hz: 1,6 centimetri di
> scarto dopo tre secondi. La soglia oltre cui il client smette di fidarsi della
> propria predizione è 75 centimetri. Quaranta volte di margine.»

Poi premi **Esegui ora** e lascia che la curva si assesti.

> «Duecentomila giri, calcolati adesso in questa pagina. La linea tratteggiata è
> il gioco base calcolato; la distanza fra le due è esattamente il contributo di
> scatter e giri gratuiti. Non è un risultato salvato: se domani rompessi il
> motore, questa pagina diventerebbe rossa.»

## 9:00 – 10:00 · Qualità, e chiusura

Vai sul terminale e lancia il comando già pronto.

> «Typecheck in `strict`, e i test. Circa 220 fra client e server. Quelli che
> toccano il database si saltano da soli quando non c'è, così il progetto resta
> eseguibile su un checkout pulito.»

Chiusura:

> «Il filo conduttore è uno solo: ogni proprietà che ho affermato è imposta in
> più di un punto, e verificabile dall'esterno. La finestra di RTP, per esempio,
> è nelle costanti condivise, nel controllo di pubblicazione, e in un vincolo del
> database: le tre cose non possono divergere senza che qualcosa si rompa.»

---

## Domande attese

**«Il client potrebbe barare?»**
Non può calcolare un esito: non li calcola mai. Può mentire su cosa manda —
una direzione, una puntata, una dichiarazione di cinquina — ed è per questo che
ogni payload è validato con Zod e ogni dichiarazione ricontrollata contro lo
stato del server. Al più può mentire a sé stesso: la predizione del movimento è
locale, e quando diverge viene tirata sulla posizione del server.
→ `packages/shared/src/protocol.ts`, `packages/server/src/realtime/`

**«Perché due RTP diversi? Non è un bug?»**
No, misurano cose diverse. Ho verificato la formula contro una simulazione delle
sole linee su tutti i preset: 74,06 contro 74,07, 52,13 contro 52,09. La formula
è giusta; semplicemente non vede le funzioni, che qui valgono fino a un terzo del
ritorno. Uno scarto positivo grande è normale. Sarebbe uno scarto **negativo** a
indicare un problema, perché il misurato starebbe sotto un limite inferiore.
→ `packages/shared/src/slots.ts` · `analyticLineRtp`, `compareSlotRtp`

**«Come impedisci che una slot paghi il 200%?»**
Tre volte. Le costanti condivise, il controllo in `publishSlotMachine` che
rilancia la simulazione su un milione di giri sulla configurazione *salvata*, e
un `CHECK` nel database che rifiuta la riga a prescindere dal codice.
→ `packages/server/src/services/slots.ts`, `packages/server/drizzle/0000_init.sql`

**«E se qualcuno rigioca la stessa richiesta di spin?»**
La puntata esce prima che i rulli siano letti, con chiave di idempotenza
`slot:<macchina>:<utente>:<richiesta>:bet`. Il nonce è prenotato con un
`UPDATE ... RETURNING` atomico, e c'è un indice unico su `(machine_id, nonce)`:
riusare un seed è impossibile anche sbagliando il codice applicativo.

**«Il saldo può divergere dalle scritture?»**
Il database rifiuta `UPDATE` e `DELETE` su `ledger_entries` con un trigger, le
correzioni si fanno con una scrittura di segno opposto come in un libro mastro, e
`pnpm --filter @bingo/server db:check` ri-deriva ogni saldo dalla somma delle
scritture e confronta.
→ `packages/server/src/services/ledger.ts`, migrazione `0001`

**«Perché i personaggi sono così semplici?»**
Sono procedurali, generati da codice, non modelli importati. È una scelta di
onestà del perimetro: non ho competenze di modellazione 3D e non volevo spacciare
asset scaricati per lavoro mio. Quello che ho costruito è il sistema che li
anima e li sincronizza.

**«Funziona senza scheda video?»**
La sala slot ha un ripiego 2D con le stesse macchine e lo stesso server. Le
verifiche della pagina `/tesi` non usano WebGL affatto.

**«Quanto è coperto da test?»**
Circa 220 test. Non è coverage: sono proprietà. Il caso migliore è quello sulle
cinematiche, che confronta due frequenze di simulazione diverse e fallisce se
client e server divergono — cioè testa la cosa che potrebbe davvero rompersi,
non che una funzione ritorni un numero.

**«Cosa manca?»**
Elencato in `docs/THESIS_VERTICAL_SLICE.md`, sezione "Non implementato". In
breve: creazione di sale dagli utenti, price game, negozio e progressione,
moderazione.
