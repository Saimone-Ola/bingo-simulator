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

1. Ingresso in una sala temporanea tramite codice, senza acquisto o posto
   automatici; spostamento, avatar, banco acquisti e scelta libera della sedia.
2. Distinzione tra visitatori, acquirenti del round e spettatori entrati tardi.
   Gli NPC sono pubblico decorativo: nessuna cartella, puntata, vincita o
   contributo al minimo. Servono due persone reali, oppure **Allenamento**
   esplicitamente scelto prima di comprare per una prova individuale.
3. Regia con HOST, ALL_READY o TIMER. Gli acquisti in elaborazione e gli
   acquirenti scollegati o in preparazione impediscono l'avvio. L'host rispetta
   tutti-pronti e la scadenza del timer; il countdown ricontrolla i prerequisiti.
4. Acquisto idempotente in crediti virtuali: fino a tre cartelle manuali o sei
   automatiche. Cartelle, addebito e montepremi sono atomici; un retry conferma
   l'acquisto originale. Gli esiti DB incerti restano bloccanti e ritentabili.
5. Cartelle italiane 3×9: 15 numeri, cinque per riga, colonne per decina ordinate.
   Sei cartelle acquistate insieme formano una sestina che copre 1–90 una volta.
6. Configurazione del round congelata dal primo acquisto in elaborazione.
   Modifiche successive accodate e visibili per il prossimo round.
7. Countdown sincronizzato e annullabile; un nuovo spettatore non lo annulla.
   In preparazione l'host può annullare il round e rimborsare gli acquisti.
8. Estrazione deterministica a seed, autorevole sul server, senza duplicati.
   L'hash è pubblicato; la rivelazione finale del seed Bingo non è implementata.
9. Segnatura manuale come ausilio visivo con errori correggibili, oppure
   automatica sui soli estratti, su tutte le proprie cartelle. La dichiarazione
   resta un'azione del giocatore in entrambe le modalità.
10. Cinquina e Bingo verificati sulle cartelle possedute e gli estratti. La
    prima dichiarazione valida ferma l'estrazione per una finestra server di
    cinque secondi; altre cartelle valide per lo stesso premio condividono
    l'importo. I resti interi seguono un ordinamento stabile degli ID.
11. Gruppo vincitori persistito prima degli accrediti, ledger append-only e
    retry idempotenti. Il riepilogo distingue premi pendenti e pagati; il round
    successivo aspetta i pagamenti.
12. Rientro dello stesso account con cartelle, segni e modalità conservati
    mentre il processo è attivo; posto tenuto per una finestra di 60 secondi e
    host trasferito a una persona connessa. Il nuovo round non riacquista e
    conserva la preferenza di segnatura.
13. Eventi decorativi compatibili con estrazioni e dichiarazioni; eventi che
    sospendono il gioco con ripresa e durata governate dal server. Audio
    italiano, tabellone e storico restano complementari.
14. Vista 2D dello stesso Bingo per il ripiego senza WebGL, accessibile con
    `?view=2d` e compatibile con il parametro `room`.

Finestra di cinque secondi, allenamento, gestione dei resti e segnatura assistita
sono scelte del simulatore. Le regole italiane di riferimento e i collegamenti
ufficiali sono distinti in [ROUND_CORRECTNESS](ROUND_CORRECTNESS.md).

### Recupero del Bingo e limiti

L'identità contabile è una UUID per round, distinta da codice sala e contatore
visibile. Payload di acquisto, segnatura e dichiarazione devono riportarla:
un vecchio messaggio non può diventare un acquisto della partita seguente.

Il processo non salva una ricostruzione completa di estrazioni, timer ed eventi.
Al riavvio onora i premi già persistiti e rimborsa i round interrotti. Se è già
persistito il gruppo vincitore del Bingo, completa i pagamenti e chiude la
partita senza rimborso. L'uscita volontaria da una partita iniziata non la
annulla: la stanza continua l'estrazione anche senza client connessi.

Un lock PostgreSQL permette un solo server autorevole per database, così un
secondo processo non può recuperare round ancora gestiti dal primo. Database
demo e test devono essere separati. Non sono implementati ripresa della stessa
estrazione dopo un crash o distribuzione della stessa partita fra più processi.
La procedura è descritta in [BINGO_RECOVERY](BINGO_RECOVERY.md); la prova con due
account, anche in LAN, è in [DEMO](DEMO.md#prova-con-due-amici-in-lan).

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

Gli interventi su leggibilità delle cartelle, materiali, luce, personaggi e
limiti delle prove visive sono documentati in
[VISUAL_IMPROVEMENTS](VISUAL_IMPROVEMENTS.md). La quantità di pubblico
decorativo e il numero di connessioni umane sono metriche distinte; uno
snapshot leggero della folla non equivale a una prova con altrettanti giocatori.

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

Le suite database usano `TEST_DATABASE_URL`, con fallback a `DATABASE_URL`
quando esportata. Si saltano quando entrambe mancano. Per le integrazioni
impostare esplicitamente un database di test sacrificabile:

```bash
TEST_DATABASE_URL=postgresql://…/bingo_test pnpm test
```

Il comando sopra è per Bash. In PowerShell impostare
`$env:TEST_DATABASE_URL = "postgresql://…/bingo_test"`, poi eseguire `pnpm test`.
Il workflow avvia un PostgreSQL 16 come service e applica le migrazioni prima
delle suite d'integrazione.

Per il Bingo le verifiche coprono generazione, avvio e riconnessione con servizi
controllati, transazioni contro PostgreSQL e un round con due connessioni
Colyseus reali. Quest'ultimo confronta estratti e risultati e misura i byte
degli snapshot, indicando separatamente persone e NPC. I test del trasporto
client verificano retry, conferme esplicite e messaggi tardivi dopo il rientro.
Le prove browser completano questi controlli per leggibilità e interazione.

Migrazioni, seed, integrità del ledger e build hanno comandi separati: riportare
nel verbale della dimostrazione gli esiti effettivi, gli eventuali test saltati
e il dispositivo usato. La presenza di una suite non costituisce prova della
sua esecuzione, e una misura su due connessioni non dimostra il carico massimo
di 512 giocatori.

## Non implementato

Elencato perché la domanda arriverà, e una risposta preparata vale più di una
improvvisata.

- Editor e pubblicazione persistente di sale di proprietà degli utenti. Le
  sale temporanee per codice e la configurazione della Regia sono disponibili.
- Editor visivo della sala e pattern di vittoria personalizzati.
- Price game, eventi a orario, jackpot progressivo.
- Negozio, inventario, guardaroba, progressione.
- Moderazione, anti-cheat oltre la validazione, analytics, internazionalizzazione.
- Asset 3D professionali: personaggi e arredi sono procedurali, non modelli
  importati. Nessun placeholder è spacciato per asset finale.
