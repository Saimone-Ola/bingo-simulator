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
pnpm typecheck
pnpm test
```

Apri due schede: `http://localhost:5173/tesi` e `http://localhost:5173/hub`.
Fai login prima. Nessuno vuole vedere una schermata di registrazione.

Usa un database di sviluppo dedicato. I test d'integrazione vanno su un altro
database tramite `TEST_DATABASE_URL`; se manca, il bootstrap dei test usa
`DATABASE_URL` quando esportata. Non lanciare recovery e prove di carico sul
database della demo. Per mostrare un round con due persone, prepara due account
e due profili browser separati, oppure segui la guida LAN in fondo.

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

Apri `/bingo?room=DEMO-01`. Mostra prima che entrare non compra cartelle e non
sceglie la sedia: puoi camminare, aprire l'avatar e avvicinarti al banco acquisti.
In **Regia** scegli la modalità di avvio prima dell'acquisto. Servono due
acquirenti reali; se presenti da solo, abilita **Allenamento** prima di comprare.
Il pubblico NPC non conta per il minimo e non partecipa al montepremi.

Compra una cartella manuale, attendi la conferma con quantità e totale e
scegli un posto. In **Tutti pronti** entrambi i giocatori confermano «Sono
pronto». Mostra che una modifica della Regia dopo l'acquisto è indicata per
il prossimo round e che il countdown può essere annullato.

Avvia, mostra qualche estrazione e un segno correggibile. Una cinquina reale
non è garantita entro questa parte della presentazione: dichiarala solo se la
combinazione è completa, oppure mostra il rifiuto di una dichiarazione
incompleta. Il round completo si prova nella sessione con due amici descritta
sotto.

> «Le cartelle non le genera il client: arrivano già fatte dal server, e ogni
> giocatore riceve solo le proprie. Il protocollo non accetta cartelle o
> numeri estratti inventati dal client.»

> «La cinquina non la verifico io: la dichiaro, e il server controlla contro i
> numeri che ha estratto lui. Se dichiarassi il falso, verrei rifiutato.»

> «I segni sono un aiuto visivo: posso correggerli, ma la verifica usa i numeri
> estratti. La prima dichiarazione valida ferma l'estrazione per cinque secondi:
> altre cartelle valide possono condividere il premio. Il riepilogo separa gli
> accrediti ancora pendenti da quelli pagati.»

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

> «Typecheck in `strict`, e test dei contratti, della stanza e delle transazioni.
> Il riepilogo del comando mostra quali sono passati o saltati. Le prove
> d'integrazione richiedono un database di test separato.»

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
La sala slot e il Bingo hanno un ripiego 2D che usa lo stesso server. Per una
prova Bingo senza WebGL apri `/bingo?room=DEMO-01&view=2d`. Le verifiche della
pagina `/tesi` non usano WebGL affatto.

**«Quanto è coperto da test?»**
Mostra il riepilogo della verifica eseguita e distingui test unitari, database
e prova browser. Il numero dei test non è una percentuale di coverage. I test
sulle cinematiche confrontano due frequenze di simulazione diverse e falliscono
se client e server divergono: verificano una proprietà concreta del movimento.

**«Se cade la connessione durante l'acquisto o la vincita?»**
La richiesta conserva il proprio ID: cartelle e addebito sono atomici, i premi
persistiti si ritentano senza accrediti duplicati. Un esito DB incerto mantiene
la preparazione bloccata. Rientrando nello stesso round si conservano cartelle,
segni e modalità; il posto è tenuto per una finestra limitata. Se si arresta
l'intero processo, non si riprende la stessa estrazione: i round interrotti
vengono chiusi con i rimborsi previsti. Un Bingo già persistito viene pagato e
chiuso senza rimborso. Vedi [recupero](BINGO_RECOVERY.md).

**«Cosa manca?»**
Elencato in `docs/THESIS_VERTICAL_SLICE.md`, sezione "Non implementato". In
breve: editor e pubblicazione persistente delle sale, price game, negozio e
progressione, moderazione. Le sale temporanee per codice sono disponibili.

## Prova con due amici in LAN

Questa procedura usa il server locale e un database di sviluppo: non pubblica
il client e non modifica servizi di produzione. Basta un computer che esegue
Node e due browser sulla stessa rete. Il secondo computer non deve avviare un
altro server.

1. Sul computer host completa l'installazione, le variabili e le migrazioni del
   [README](../README.md#avvio-in-locale). Verifica che `DATABASE_URL` e
   `DATABASE_URL_UNPOOLED` puntino al database dedicato alla demo. Il server
   mantiene un lock di proprietà: un secondo processo sullo stesso database
   viene rifiutato.
2. Trova l'indirizzo IPv4 del computer host (`ipconfig` in PowerShell), per
   esempio `192.168.1.50`. Sostituisci questo esempio in tutti i valori sotto.
3. Imposta in `packages/server/.env`:

   ```dotenv
   HOST="0.0.0.0"
   PORT="3001"
   CLIENT_ORIGINS="http://localhost:5173,http://192.168.1.50:5173"
   ```

4. Imposta in `packages/client/.env`:

   ```dotenv
   VITE_API_URL="http://192.168.1.50:3001"
   ```

   Lascia `VITE_WS_URL` non impostata: API e WebSocket usano lo stesso server e
   il client ricava `ws://` dall'URL. `localhost` nel browser dell'amico
   indicherebbe il suo computer, quindi non va usato per l'API in questa prova.
5. Avvia due terminali dalla radice del repository:

   ```bash
   pnpm dev:server
   ```

   ```bash
   pnpm --filter @bingo/client dev --host 0.0.0.0
   ```

   Riavvia entrambi dopo ogni modifica degli `.env`. Consenti l'accesso alle
   porte TCP 3001 e 5173 sul firewall della rete privata, se richiesto. Non
   serve aprire porte sul router verso Internet.
6. Dal computer dell'amico apri prima
   `http://192.168.1.50:3001/health/db`, poi
   `http://192.168.1.50:5173`. Il primo deve rispondere con stato `ok`.
   Create due account distinti; due schede con lo stesso account rappresentano
   una sola persona e la nuova sessione sostituisce quella precedente.
7. Aprite entrambi
   `http://192.168.1.50:5173/bingo?room=AMICI-01`. Il primo entrato è host.
   Copiate l'indirizzo dalla barra del browser se il pulsante invito non ha
   accesso agli appunti sulla pagina HTTP locale.

### Sequenza della partita

- Prima di comprare, l'host sceglie **Tutti pronti**, fascia e intervallo delle
  estrazioni; per il primo giro scegliete **Classico** per non avere eventi. Lasciate
  **Allenamento** disattivato: verificherete due partecipanti reali.
- Il primo giocatore compra una cartella manuale e il secondo sei automatiche.
  Controllate conferma, saldo, prezzo congelato, totale delle cartelle vendute
  e montepremi. La sestina del secondo giocatore contiene 1–90 una volta.
- Sedetevi liberamente e confermate «Sono pronto». Prima dell'ultima conferma
  il round attende. Se un acquirente apre la personalizzazione o si disconnette
  durante il countdown, la preparazione riprende. Un nuovo spettatore non
  annulla il countdown e non può acquistare a estrazione iniziata.
- Controllate che ultimo numero e storico coincidano nei due browser. Segnate
  e correggete una cella manuale; le cartelle automatiche seguono tutte gli
  estratti, anche quelle non selezionate. Nessuna modalità dichiara da sola.
- Dichiarate cinquina o bingo soltanto su una cartella completa. Durante la
  finestra di cinque secondi l'estrazione si ferma: ogni altra cartella valida
  per lo stesso premio può dichiarare e condividere la vincita. Non è garantito
  che entrambe le persone completino la combinazione nella stessa finestra.
- Leggete risultati e quote pagate. Riprovare la stessa dichiarazione non
  aggiunge quote; il successivo round mantiene la preferenza manuale/automatica
  ma richiede un nuovo acquisto.
- Per provare il rientro, interrompete brevemente la connessione di un solo
  browser e riaprite la stessa sala con lo stesso account. Per provare il
  rimborso usate **Annulla round e rimborsa** durante la preparazione; l'uscita
  da una partita già iniziata non dà diritto al rimborso.

Se non parte, leggete il motivo nella sala: minimo reale, disponibilità,
acquisto in corso o scadenza non ancora raggiunta. Per isolare un problema 3D,
aggiungete `&view=2d` allo stesso indirizzo; per problemi di accesso controllate
IP, porte e corrispondenza esatta di `CLIENT_ORIGINS` con l'origine del browser.

Regole e motivazioni sono in [ROUND_CORRECTNESS](ROUND_CORRECTNESS.md),
limiti di riavvio in [BINGO_RECOVERY](BINGO_RECOVERY.md), interventi sulla sala
in [VISUAL_IMPROVEMENTS](VISUAL_IMPROVEMENTS.md).
