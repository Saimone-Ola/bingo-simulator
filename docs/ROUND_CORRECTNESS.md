# Round, acquisti e dichiarazioni

Questa revisione conserva il motore Colyseus, le cartelle italiane, la segnatura
manuale con errori correggibili e il registro dei crediti virtuali. Non introduce
denaro reale, un altro servizio realtime o bot che acquistano al posto delle persone.

## Matrice verificata prima degli interventi

| Requisito | Comportamento precedente verificato | Correzione | Regressione |
|---|---|---|---|
| Prezzo stabile | Il cambio fascia dopo una vendita modificava il prezzo usato dal montepremi | Configurazione congelata dal primo acquisto in elaborazione; modifiche salvate per il prossimo round | Acquisto sospeso, cambio fascia, confronto prezzo e montepremi |
| Consegna e addebito | Il ledger veniva addebitato prima della generazione delle cartelle | Generazione prima dell'addebito; cartelle, acquisto e ledger nella stessa transazione | Generazione fallita, inserimento fallito, retry identico/conflittuale |
| Partecipanti reali | Gli NPC decorativi contribuivano al minimo; ogni visitatore doveva comprare | Il round comprende solo acquirenti; allenamento esplicito per una persona | Un umano con pubblico non raggiunge il minimo; spettatori non bloccano |
| Avvio coerente | L'host aggirava tutti-pronti; un ingresso annullava il conto alla rovescia | Prerequisiti della modalità applicati anche all'host; coorte congelata e rivalidata | Host, timer, caricamento, ingresso tardivo, annullamento |
| Ex aequo | La prima richiesta valida escludeva tutte le altre | Finestra server di cinque secondi con estrazioni ferme, una quota per cartella | Dichiarazioni simultanee/duplicate/tardive, resti interi |
| Premio recuperabile | Un errore nell'accredito diventava un premio completato da zero crediti | Gruppo vincitori persistito prima degli accrediti; risultati in sospeso e retry idempotenti | Persistenza gruppo fallita, accredito fallito, retry |
| Rientro | L'uscita eliminava le cartelle e ogni round reimpostava manuale | Cartelle e segni restano nel round; preferenza conservata | Nuova sessione stesso utente, nuovo UUID e nessun riacquisto |
| Sestina | Il percorso d'acquisto emetteva sei cartelle indipendenti | Sei cartelle usano il generatore `createSestina` condiviso | Cento seed, copertura esatta 1–90 |
| Eventi | Ogni evento fermava il round, anche se decorativo | Gli eventi con `allowedDuringDraw` continuano estrazioni e dichiarazioni | Evento decorativo contro evento che sospende |

## Preparazione e rientro

Il server pubblica l'identificativo UUID `roundId`, distinto dal contatore visibile.
Acquisti, segni e dichiarazioni devono riportare questo UUID: i messaggi con il
solo contatore vengono rifiutati, così una richiesta ritardata non può diventare
un acquisto nel round seguente. Le operazioni persistenti usano il medesimo UUID.

Prima dell'acquisto una persona è un visitatore. Dopo una consegna confermata
diventa un partecipante al round. Chi arriva dal countdown in poi è spettatore e
può acquistare nel round seguente. Gli NPC sono pubblico decorativo: non aumentano
il montepremi, non soddisfano il minimo e non dichiarano premi.

L'host configura la sala prima degli acquisti. Dal primo acquisto in elaborazione
le condizioni sono congelate anche mentre il database risponde. Le modifiche
successive sono esplicitamente destinate al prossimo round; non cambiano le
cartelle già acquistate. Una generazione fallita non addebita nulla. Il client
conferma soltanto il messaggio `purchaseConfirmed`, con ID, quantità e totale.
Un retry con lo stesso ID consegna le cartelle originali senza un secondo addebito.

- **Host:** avvio richiesto dall'host dopo gli acquisti dei partecipanti.
- **Tutti pronti:** ogni acquirente connesso deve confermare; il comando dell'host
  rispetta la medesima condizione.
- **Temporizzata:** una scadenza pubblicata delimita la preparazione; dopo la
  scadenza e con i prerequisiti soddisfatti segue un countdown di cinque secondi.
  Se mancano partecipanti, la sala mostra il motivo e attende. Gli acquisti in
  elaborazione impediscono sempre la partenza.

Se la risposta del database si interrompe, l'acquisto rimane in elaborazione
anche quando il primo tentativo di recupero fallisce. Il server conserva
cartelle e richiesta originali e ritenta la stessa transazione idempotente;
nessun round parte escludendo un acquisto dal risultato ancora incerto.

Il countdown congela l'elenco degli acquirenti. Nuovi ingressi non lo annullano.
Il messaggio `setPreparing` segnala pannelli di preparazione o risorse ancora in
caricamento: un acquirente in questo stato perde la conferma e blocca l'avvio,
mentre un visitatore senza cartelle continua a non bloccare il round.
Una disconnessione o un caricamento di un partecipante impedisce la partenza e i
prerequisiti vengono ricontrollati alla scadenza. L'host può annullare il countdown;
la partenza automatica resta sospesa fino a un'azione esplicita di disponibilità
o avvio dell'host. L'host passa subito a una persona connessa quando quello corrente
si scollega.

La modalità **allenamento** permette un partecipante reale e va scelta prima di
acquistare. In preparazione o countdown l'host può anche **annullare il round e
rimborsare**: la transazione ripristina gli acquisti e la preparazione successiva
usa le impostazioni eventualmente accodate. Il comando viene rifiutato finché un
acquisto è in elaborazione e non è disponibile durante una partita iniziata.
Anche un annullamento con risposta database incerta mantiene la sala bloccata:
il server ritenta la stessa UUID finché conferma il rimborso e chiude il round.
L'uscita volontaria da una partita iniziata non rimborsa la puntata: la stanza
continua il round sul server anche se tutti escono. Una vincita già pagata resta
definitiva durante l'animazione dei risultati. Arresto del server e annullamento
in preparazione seguono invece la procedura esplicita di recupero e rimborso.

I segni, le cartelle e la modalità restano associati all'utente durante il round,
anche tornando con una nuova connessione. La sedia è riservata per la finestra
prevista dal registro posti; allo scadere diventa libera e il rientro non scaccia
chi l'ha occupata. Il passaggio al round seguente non acquista cartelle e conserva
la preferenza di segnatura. Se il processo termina, il recupero persistente
annulla esplicitamente il round interrotto e rimborsa gli acquisti: non pretende
di ricostruire un'estrazione in corso senza il relativo stato.

## Segnatura, dichiarazioni e accrediti

Le decisioni precedenti del progetto trattano i segni come ausilio visivo. Sono
conservate: si possono segnare numeri non estratti e correggerli; celle vuote e
indici fuori cartella sono rifiutati. Il segno non crea una vincita. Il server
controlla sempre cartella posseduta, round e numeri estratti. La modalità automatica
segna tutte le cartelle acquistate, anche fuori inquadratura; non dichiara al posto
del giocatore.

La prima dichiarazione valida apre una finestra di cinque secondi per quel premio.
Il server congela l'estrazione, pubblica l'indice e l'ora di chiusura e accetta altre
cartelle valide contro lo stesso insieme di numeri. Sono ammesse combinazioni già
complete alle estrazioni precedenti se il premio non era stato chiuso. Non si può
aggiungere una cartella dopo la scadenza, anche se il tick di chiusura non è ancora
stato elaborato. Una cartella partecipa una volta al premio; retry o nuove sessioni
non creano quote aggiuntive. Una persona con più cartelle valide può dichiararle
separatamente entro la stessa finestra. Durante la finestra di un premio si attende
la chiusura prima di dichiarare l'altro.

La quota intera è `floor(premio / cartelle vincenti)`. Le unità residue vanno alle
prime cartelle nell'ordinamento stabile degli ID: l'ordine di arrivo delle richieste
non decide chi le riceve. Ogni cartella può differire al massimo di un credito.
Sono regole del simulatore, non percentuali o procedure economiche attribuite ad ADM.

L'intero gruppo di vincitori viene scritto atomicamente prima di consumare il
premio. Finché questa scrittura fallisce, l'estrazione resta ferma e si ritenta.
Gli accrediti falliti rimangono `PENDING`; il server ritenta con lo stesso ID e
trasmette l'annuncio di vittoria soltanto quando l'accredito risulta `PAID`.
Il round successivo attende tutti gli accrediti. Un riavvio onora i premi già
persistiti prima di rimborsare gli acquisti del round interrotto.

Gli eventi decorativi lasciano attive estrazioni e dichiarazioni e hanno fine
sincronizzata. Blackout e minigioco sospendono entrambe; una finestra già aperta
impedisce l'avvio di un nuovo evento che possa coprirla. La durata effettiva e la
politica derivano dal catalogo condiviso. Il tabellone continua a dare informazioni
equivalenti in caso di microfono difettoso.

## Regole italiane di riferimento

Il [D.M. 31 gennaio 2000 n. 29, art. 4, sul sito MEF](https://def.finanze.it/DocTribFrontend/getAttoNormativoDetail.do?ACTION=getArticolo&articolo=Articolo+4&codiceOrdinamento=200000400000000&id=%7BFD2E3B92-BFCC-49FE-AAA6-5376DF8EF7D0%7D)
descrive 90 numeri, cartelle con 15 numeri distinti su tre righe da cinque e nove
colonne per decina, ciascuna con uno, due o tre numeri. Cinquina e bingo sono le
combinazioni di base. Il generatore usa le fasce `1–9, 10–19, …, 80–90` e ordina
i numeri verticalmente. Sei cartelle vendute come sestina coprono 1–90 una volta.

[ADM, Come si gioca](https://www.adm.gov.it/portale/monopoli/giochi/bingo/bingo_sala/bingo_sala_gioca)
precisa che nel gioco di sala la vincita deve essere annunciata e verificata:
un annuncio tardivo può comportare una condivisione. Il
[regolamento pubblicato in Gazzetta Ufficiale, artt. 8–9](https://www.gazzettaufficiale.it/eli/gu/2000/11/29/279/so/198/sg/pdf)
prevede la ripartizione in parti uguali delle vincite dello stesso tipo.
La finestra server, gli arrotondamenti dei crediti, l'allenamento e la segnatura
assistita sono scelte esplicite del simulatore. Non sono stati importati ambo,
terno, quaterna, premi speciali o percentuali del gioco con denaro reale.

## Verifiche e limiti

`src/realtime/bingoLifecycle.test.ts` esercita il ciclo della stanza con servizi
contabili controllati per riprodurre errori e concorrenza; `test/bingoRoom.test.ts`
aggiunge due connessioni Colyseus reali e PostgreSQL dedicato, con acquisti,
estrazioni concordanti e risultati ex aequo. Le prove del servizio economico
verificano invece transazioni e idempotenza sul database.

La presenza di questi test non attesta da sola che siano stati eseguiti: gli esiti
dei comandi e delle prove browser sono riportati nella consegna della revisione.
I test con database devono usare esclusivamente `TEST_DATABASE_URL` su database
sacrificabile. Gli scenari di riavvio terminano il round e rimborsano: non è
implementata la ripresa della stessa estrazione dopo un arresto del processo.
