# Verifica economia Bingo — 11 settembre 2026

Verifiche eseguite su Windows, Node 24.19.0 e PostgreSQL Neon isolato. Nessuna
scrittura sul database di produzione.

| Esecuzione | Esito |
|---|---|
| Ledger + economia Bingo | **17/17**, 279,87 secondi |
| Recupero dopo l'ultima correzione, incluso Bingo già registrato | **3/3**; gli altri 8 test del file non selezionati |
| Proprietà esclusiva del server | **2/2** |
| Conferme acquisto e riconnessioni del client, incluso rinnovo token | **14/14** |
| Resto della suite server, inclusi Hub e controlli del protocollo | **282/283** al primo run; attesa dello snapshot finale corretta nel test Bingo |
| File di integrazione Bingo, rieseguito dopo la correzione | **5/5**, 28,46 secondi |
| Copertura complessiva server | **304 test distinti verificati**, in esecuzioni separate, incluso termine del round senza dichiarazioni |
| Suite client completa | **220/220**, 20 file |
| Typecheck server e client | Passati |
| Migrazioni, seconda esecuzione sulla connessione diretta | **4 → 4**, nessuna riapplicazione |

La verifica mirata del recupero ripete due casi già compresi nei 17 iniziali e
aggiunge il caso del Bingo terminale: non sono 20 test economici distinti.

L'audit aggregato finale ha controllato **120 wallet**, **42 acquisti** e
**16 premi**: nessuno scostamento fra saldo e ledger, nessun
acquisto privo delle proprie cartelle, nessun importo o collegamento contabile
incoerente negli addebiti, rimborsi e accrediti; nessun premio pendente.

Il test con due connessioni reali ha verificato un unico addebito sotto retry,
una cartella manuale e una sestina automatica, gli stessi 90 estratti sui due
client e i due premi ex aequo pagati. L'errore iniziale riguardava l'attesa nel
test: il messaggio di vincita arriva prima dello snapshot finale che mostra il
pagamento; ora il test attende entrambi i messaggi.

La riconnessione WebSocket con access token scaduto usa il rinnovo già presente
nel broker HTTP, solo dopo un errore 401. I test coprono il nuovo token, la
conservazione della richiesta d'acquisto, la precedenza di una connessione più
recente, il rifiuto del refresh e gli errori di rete che non richiedono rinnovo.
La pagina mantiene la connessione finché identità e sala restano uguali: la
rotazione del token non esegue il cleanup, quindi conserva anche l'ID di un
acquisto ancora in attesa di conferma. Logout e cambio utente o sala continuano
a chiudere esplicitamente la connessione.

## Comandi usati

Da `packages/server`, con `.env` impostato sul database usa-e-getta:

```powershell
node --env-file=.env node_modules/vitest/vitest.mjs run test/bingoEconomy.test.ts test/ledger.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --configLoader=native --testTimeout=300000 --hookTimeout=300000
node --env-file=.env node_modules/vitest/vitest.mjs run test/bingoEconomy.test.ts -t 'recovery|durably awarded' --pool=threads --maxWorkers=1 --no-file-parallelism --configLoader=native --testTimeout=300000 --hookTimeout=300000
node --env-file=.env node_modules/vitest/vitest.mjs run test/bingoServerOwnership.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --configLoader=native
node --env-file=.env node_modules/vitest/vitest.mjs run --exclude test/bingoEconomy.test.ts --exclude test/ledger.test.ts --exclude test/bingoServerOwnership.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --configLoader=native --testTimeout=300000 --hookTimeout=300000
node --env-file=.env node_modules/vitest/vitest.mjs run test/bingoRoom.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --configLoader=native --testTimeout=300000 --hookTimeout=300000
```

Da `packages/client`:

```powershell
node node_modules/vitest/vitest.mjs run src/net/bingoConnection.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --configLoader=native
```

Dalla radice del repository:

```powershell
node node_modules/typescript/bin/tsc -p packages/server/tsconfig.json --noEmit
```

Il timeout di 300 secondi riguarda questa esecuzione sul database remoto: il test
con 200 movimenti sul medesimo wallet serializza numerosi viaggi di rete. La
configurazione ordinaria della suite non è stata allungata. I tentativi iniziali
con il timeout di 30 secondi erano terminati per tempo esaurito; la riesecuzione
isolata è passata.

## Comportamento del recupero

- Un Bingo già registrato viene pagato e chiuso senza rimborso delle puntate.
- Un round interrotto prima del Bingo viene annullato: eventuali Cinquine già
  registrate sono pagate e gli acquisti vengono rimborsati una sola volta.
- Il riavvio conserva lo storico, ma non ricostruisce estrazioni, timer o eventi.
- Un lock su connessione diretta impedisce che una seconda istanza recuperi i
  round di un server ancora attivo; la perdita del lock arresta il proprietario.

La descrizione completa è in [BINGO_RECOVERY.md](BINGO_RECOVERY.md).
