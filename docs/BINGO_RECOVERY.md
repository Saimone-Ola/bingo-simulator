# Acquisti, premi e recupero Bingo

La partita ha un UUID distinto dal codice sala e dal numero progressivo mostrato
nell'interfaccia. Lo stesso codice sala può essere riutilizzato senza riutilizzare
le chiavi contabili della partita precedente.

## Acquisto

Il server genera le cartelle prima dell'addebito. `purchaseBingoCards` blocca la
riga della partita e registra acquisto, cartelle, movimento ledger e totale della
sala nella stessa transazione. Se una cartella non può essere salvata, anche
l'addebito viene annullato. L'unicità delle griglie nella partita è controllata
anche dal database.

Ogni giocatore può effettuare un solo acquisto per partita. Ripetere la stessa
richiesta restituisce le cartelle persistite; una richiesta con parametri diversi
viene rifiutata. Le cartelle restano leggibili dal servizio per ripristinare una
sessione che non abbia ricevuto la risposta di acquisto. Il client conclude
l'attesa alla conferma esplicita della richiesta, non alla ricezione di uno
snapshot generico.

## Premi

Alla chiusura della finestra delle dichiarazioni, tutti i vincitori dello stesso
premio vengono registrati insieme, con estrazione, cartella e quota assegnata.
Quel gruppo diventa definitivo prima di tentare gli accrediti. Ogni premio resta
pendente fino alla transazione che scrive sia il ledger sia la data di pagamento.
Un errore lascia il premio disponibile per un nuovo tentativo; la chiave del
premio impedisce un secondo accredito.
Le stanze ritentano gli accrediti pendenti e un controllo globale ogni cinque
secondi copre anche le vincite rimaste dopo la chiusura di una stanza.

## Interruzione del processo

Estrazioni, temporizzazioni ed eventi non vengono riprodotti dopo un riavvio.
Prima di accettare giocatori, il server recupera i round rimasti aperti. Un premio
Bingo già registrato prova che la partita è conclusa: il recupero paga i premi
pendenti e completa la chiusura, senza rimborsare gli acquisti. Negli altri casi
paga gli eventuali premi di Cinquina già registrati, rimborsa integralmente gli
acquisti e marca il round come annullato, conservando cartelle e registrazioni
per verifica. Le vincite già pagate restano ai giocatori. Accrediti, eventuali
rimborsi e chiusura sono atomici; ripetere il recupero non aggiunge crediti.

Le cartelle sono quindi conservate come storico e l'acquisto interrotto è
rimborsato: il riavvio apre una nuova partita, non riprende la vecchia estrazione.
Anche la chiusura di una stanza non conclusa tenta questo recupero. Se il database
non è disponibile durante la chiusura, il round resta recuperabile all'avvio
successivo.

## Proprietà esclusiva del server

Prima del recupero, `index.ts` acquisisce un advisory lock PostgreSQL su una
connessione dedicata e diretta. `DATABASE_URL_UNPOOLED` deve indicare lo stesso
database e utente di `DATABASE_URL`; per Neon, il suo host non deve contenere
`-pooler`. La connessione ordinaria può continuare a utilizzare il pooler.

Una seconda istanza sullo stesso database rifiuta l'avvio finché la precedente
possiede il lock. Il rilascio avviene dopo la chiusura delle stanze e del pool.
Se la connessione proprietaria viene persa, il processo termina immediatamente.
Questo impedisce che un nuovo avvio rimborsi una partita ancora gestita da
un'altra istanza. I deploy devono quindi prevedere il passaggio tra due istanze
senza sovrapporre la loro attività sul medesimo database.

## Schema e verifiche

La migrazione additiva `0003_bingo_runtime` introduce `bingo_rounds`,
`bingo_purchases`, `bingo_issued_cards` e `bingo_awards`. Le tabelle di configurazione
`rooms` e `bingo_games` preesistenti restano disponibili; le sale Colyseus non
richiedono la creazione di una sala di proprietà di un utente.

Le suite `bingoEconomy.test.ts`, `bingoServerOwnership.test.ts` e `ledger.test.ts`
richiedono un PostgreSQL usa-e-getta. I test contabili lasciano righe append-only.
La suite di ownership termina esclusivamente la connessione che il test stesso
ha aperto, per verificare la perdita e la successiva acquisizione del lock.
