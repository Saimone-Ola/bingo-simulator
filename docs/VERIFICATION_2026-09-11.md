# Verifica della revisione — 11 settembre 2026

Revisione del repository esistente `Saimone-Ola/bingo-simulator`, base
`c7957ba45fb2ffd26e2b31c63ab7f296c4b06951`, branch
`codex/bingo-rounds-immersion`. Monorepo, autenticazione, hub, slot, editor,
funzioni sociali e modalità tesi conservati. Solo crediti virtuali.

## Incoerenze corrette

- Prezzo e configurazione del round si congelano al primo acquisto, anche in
  elaborazione. Le modifiche successive sono visibili come configurazione del
  prossimo round; il montepremi deriva dalle vendite effettive.
- Acquisto, cartelle e ledger sono una transazione persistente. UUID di round,
  acquisto e premio impediscono collisioni e doppie operazioni dopo retry.
  Risposte DB incerte restano bloccanti e vengono riconciliate con gli stessi ID.
- Cinquina e Bingo hanno una finestra server di cinque secondi per gli ex aequo.
  L'estrazione resta ferma; quote e residui sono deterministici. I premi in attesa
  sono distinti da quelli accreditati e vengono ritentati senza duplicazioni.
- Visitatori, spettatori e acquirenti sono distinti. Il pubblico decorativo non
  compra, non vince e non soddisfa il minimo. Caricamenti, preparazione e acquisti
  effettivi bloccano l'avvio; ingressi tardivi non annullano il countdown.
- Nessuna sedia scelta automaticamente al cambio fase. Posti, cartelle e segni
  confermati sono recuperati dopo una disconnessione entro le politiche di sala.
- La cassa chiude e suona solo dopo conferma server; errori e selezione restano
  consultabili. Il rinnovo dell'accesso WebSocket riusa il broker di autenticazione
  esistente e non interrompe una richiesta pendente per la sola rotazione token.
- Sei cartelle automatiche formano una vera sestina 1–90. Manuale e automatica
  restano distinte; la dichiarazione è sempre del giocatore.
- Migliorati geometria e rig procedurale dei personaggi, materiali, penne,
  inquadratura ravvicinata e ritorno alla vista precedente. La cache delle texture
  evita ridisegni identici; il dettaglio del pubblico è separato dai veri giocatori.

La matrice iniziale è in [IMPROVEMENT_MATRIX.md](IMPROVEMENT_MATRIX.md).
Le fonti ufficiali e le politiche sono in [ROUND_CORRECTNESS.md](ROUND_CORRECTNESS.md).

## Scelte del simulatore dichiarate

La finestra di cinque secondi, l'ordine dei residui, l'allenamento in solitaria e
il recupero tramite annullamento/rimborso sono politiche esplicite del simulatore.
I segni manuali restano un ausilio visivo correggibile, coerentemente con la
decisione già documentata: un segno su un numero non estratto non crea una vincita.
Non sono stati importati premi della tombola o percentuali obbligatorie del gioco
con denaro reale. I limiti restano tre cartelle manuali e sei automatiche.

## Ambiente e verifiche automatiche

Windows, Node **24.19.0**, pnpm del progetto **10.15.0**, Vitest **4.1.10**.
Database nuovi e separati nel branch Neon gratuito `codex-bingo-test-20260911`:
`bingo_test_20260911` per i test e `bingo_dev_20260911` per la prova browser.
Nessuna query sui dati di produzione e nessun deploy in produzione.

| Controllo | Esito |
|---|---|
| Client, intera suite | **220/220**, 20 file, 9,99 s |
| Server, copertura complessiva mediante esecuzioni separate | **304 test distinti passati** |
| Integrazione Colyseus con due connessioni reali | **5/5**, incluso round con 90 estratti e Bingo ex aequo pagato |
| Ledger + acquisti/premi | **17/17**; nuova regressione recupero Bingo terminale e due casi ripetuti **3/3** |
| Esclusività del server su PostgreSQL | **2/2** |
| Contratti, eventi e ciclo del round | **50/50** nelle quattro suite mirate |
| Migrazioni additive su database vuoto, ripetute | **4 → 4**, idempotenti |
| Typecheck client, server, shared | Passati con invocazione diretta di TypeScript |
| Build client | Passata con Vite e caricatore nativo |
| Build server | Passata invocando direttamente esbuild con le opzioni di tsup, poi generando il manifesto runtime |
| Build shared | Corrisponde al typecheck senza emissione, passato |

La configurazione server ora include anche `src/**/*.test.ts`, prima escluso.
La vecchia opzione `singleFork` non è più letta da Vitest 4: è stata sostituita
con `fileParallelism: false`, verificando `maxWorkers: 1` nella configurazione
risolta. Le suite di recupero economico non possono quindi interferire con i
round di altre suite sul database condiviso.
`@bingo/shared` non ha una suite autonoma: le regole condivise sono esercitate
dalle suite client/server, non viene conteggiato il suo comando segnaposto.

Sono stati eseguiti **`pnpm typecheck`, `pnpm test`, `pnpm build`** tramite il
launcher pnpm 10.15.0. I wrapper si interrompono con `spawn EPERM` in questo
ambiente Windows: pnpm ricorsivo e il caricatore esbuild di tsup non riescono ad
aprire i subprocessi con pipe. Non si tratta di comandi verdi: le verifiche sopra
sono le invocazioni equivalenti effettivamente riuscite. Non sono state riscritte
le procedure del progetto per adattarle a questa restrizione della macchina.

I primi test sul database remoto hanno superato il timeout ordinario di 30 s.
I casi di carico sono stati rieseguiti da soli con timeout di 300 s: il test con
200 movimenti sullo stesso wallet serializza i viaggi verso Neon. Un test Hub
dipendeva dalla precisione del timer Windows; ora genera raffiche controllate
senza indebolire il controllo del movimento. Il test Bingo aspettava i messaggi
di vincita ma non l'ultimo snapshot `PAID`: l'attesa è stata corretta e il file
è stato rieseguito con successo. Nessun test fallito è stato cancellato.

Dettaglio dei comandi e audit contabile in
[ECONOMY_VERIFICATION.md](ECONOMY_VERIFICATION.md).
Il database test ha mostrato 120 wallet, 42 acquisti e 16 premi coerenti, senza
premi pendenti nell'audit finale di quella esecuzione.

Invocazioni dirette riuscite per typecheck, client e build (PowerShell):

```powershell
# Dalla radice del repository
node node_modules/typescript/bin/tsc -p packages/shared/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p packages/server/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p packages/client/tsconfig.json --noEmit

# Da packages/client
node node_modules/vitest/vitest.mjs run --configLoader native --pool threads --maxWorkers 1 --reporter dot
node node_modules/vite/bin/vite.js build --configLoader native

# Da packages/server: stesse entry, target, formato ed esclusioni di tsup
$serverPackage = Get-Content package.json -Raw | ConvertFrom-Json
$buildArgs = @('src/index.ts', 'src/db/migrate.ts', '--bundle', '--platform=node', '--target=node22', '--format=esm', '--outdir=dist', '--sourcemap')
foreach ($dep in $serverPackage.dependencies.PSObject.Properties.Name) {
  if ($dep -ne '@bingo/shared') { $buildArgs += '--external:' + $dep }
}
& '../../node_modules/.pnpm/@esbuild+win32-x64@0.27.7/node_modules/@esbuild/win32-x64/esbuild.exe' @buildArgs
node scripts/emit-runtime-manifest.mjs
```

La dipendenza pubblica uWebSockets usa ora l'archivio HTTPS dello **stesso commit**
già fissato: l'installazione non richiede una chiave SSH GitHub. Il lockfile è
aggiornato. Nessun comando di deploy Vercel è stato eseguito.

## Prova browser e misure

Prova reale con account sintetici distinti Anna Test e Luca Test e archivi di
autenticazione separati (`127.0.0.1` e `localhost`), sulla medesima API di sviluppo
e sul medesimo codice sala `QA-DUE`. Non sono due mock.

Verificati acquisti da una e sei cartelle, attesa della conferma, scelta esplicita
di due posti, preparazione e countdown concordanti. Confrontati gli estratti nei
due browser. Verificati pennarello e segno in 3D, rifiuto di una dichiarazione
incompleta, correzione del segno, assistenza anche sulla sesta cartella e recupero
del segno manuale dopo ricaricamento. Il fallback 2D usa lo stesso round e le
stesse estrazioni. Acquisiti screenshot reali, inclusi avatar e sala prima/dopo.

Il round finale è arrivato alla cinquina condivisa all'estrazione 89 e al Bingo
condiviso all'estrazione 90, con entrambe le dichiarazioni inviate dalla vera UI
nella rispettiva finestra. Verificati in entrambi i browser tutti e quattro i
risultati, i numeri che li giustificano e lo stato **Accreditati**:

| Giocatore | Acquisto | Cinquina | Bingo | Saldo finale |
|---|---:|---:|---:|---:|
| Anna Test | 1 manuale, 10 cr (990 → 980) | 8 cr | 23 cr | **1011 cr** |
| Luca Test | 6 automatiche, 60 cr (940 → 880) | 9 cr | 23 cr | **912 cr** |

Il montepremi distribuito era 63 crediti: cinquina 17, Bingo 46. Il nuovo round
mostrava zero estratti, nessuna cartella e gli stessi saldi finali; il riepilogo
precedente restava consultabile. Verificato il cambio posto esplicito dalla
mappa, alzandosi prima dal posto corrente. Verificati pannelli, cassa, risultati,
mappa e fallback anche a **390×844**, oltre al 3D desktop.

Le schermate nella consegna includono `results-two-players.png`,
`results-mobile.png`, `purchase-six-cards.png`, `card-closeup-3d.png`,
`automatic-sixth-card.png`, `manual-invalid-claim.png`, `mobile-fallback.png`,
`mobile-3d.png`, `mobile-seat-map.png`, `avatar-before.png`, `avatar-after.png`,
`hall-before.png` e `hall-after.png`. Sono acquisizioni del browser, senza
ritocco o generazione di immagini. I confronti prima/dopo usano la base Git
indicata in apertura, avviata separatamente.

Il test di rete ha misurato snapshot JSON UTF-8 di **26.136 byte** per una cartella
manuale e **27.273 byte** per sei automatiche, con **2 connessioni reali** e
**241 NPC decorativi**. Sono dimensioni del payload JSON, non traffico WebSocket
compresso misurato sul filo. La folla non dimostra capacità per centinaia di client.

Nel browser integrato a 1280×720, qualità media, DPR 1, vista d'ingresso e circa
240 NPC, le finestre di osservazione di circa un secondo hanno mostrato
**1.425 → 483 draw call** e **22,5 → 29,4 FPS** dopo il contenimento del dettaglio
decorativo. Sono campioni indicativi, con altri processi di sviluppo attivi;
l'hardware non è stato identificato perché la lettura CIM era negata. Non sono
un benchmark stabile né misure separate di CPU e GPU. Il probe ripetibile è
disponibile solo in sviluppo aggiungendo `&perf=1` alla URL della sala.

## Limiti mantenuti espliciti

- Un riavvio del processo non ricostruisce la vecchia sequenza di estrazioni:
  recupera i premi registrati e annulla/rimborsa i round interrotti. Un Bingo già
  registrato viene chiuso senza rimborso delle cartelle. La riconnessione al
  processo ancora attivo ripristina invece la partita.
- Un solo server proprietario del database è supportato. Il lock diretto evita
  il recupero concorrente; il rilascio richiede la chiusura ordinata del vecchio
  processo. Non è stato introdotto uno scheduler distribuito.
- Il riepilogo resta consultabile nel client durante il passaggio al nuovo round;
  dopo ricaricamento non esiste ancora una pagina pubblica dello storico completo.
Le registrazioni economiche restano nel database.
- Capacità verificata: due sessioni browser e due connessioni nella prova
  automatizzata. Nessuna dichiarazione di carico equivalente a 512 giocatori.
- Nessun modello esterno richiesto per la scena: avatar e geometrie sono originali
  procedurali. Restano margini di rifinitura artistica, specialmente nei movimenti
  complessi; non vengono presentati come animazioni da motion capture.

## Come provarlo

Seguire [DEMO.md](DEMO.md) per configurazione e prova con due amici, anche in LAN.
Usare un database di sviluppo e applicare le migrazioni additive; le URL del pool
e della connessione diretta devono indicare lo stesso database. Avviare server e
client, registrare due account distinti, entrare nello stesso codice sala, scegliere
modalità/quantità e posto, poi premere entrambi **Sono pronto**. I premi si
dichiarano sulla cartella selezionata e si consultano in **Risultati**.

Per una prova individuale attivare **Allenamento** in Regia prima dell'acquisto.
Nessun nuovo acquisto avviene automaticamente nel round successivo.
