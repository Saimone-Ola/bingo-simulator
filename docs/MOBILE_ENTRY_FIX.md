# Correzione ingresso e interfaccia mobile — 11 settembre 2026

## Problemi confermati

- Sul frontend pubblico del commit `23157e3`, entrare in `/bingo?room=TESI-2026` produceva `Cannot read properties of undefined (reading 'length')`. La callback leggeva `snapshot.results.length`; il backend rispondeva ancora con il formato precedente. Il pannello Render non era accessibile durante la diagnosi: revisione, stato del deploy e piano effettivo del servizio restano da verificare.
- I pannelli della piazza erano tutti aperti e posizionati con misure da desktop. A larghezza telefono coprivano avatar e comandi.
- Il customizer era importato direttamente e il raggruppamento ricorsivo di Rolldown spostava React nel chunk R3F. Di conseguenza la pagina di accesso pre-caricava Three.js.
- La chiusura asincrona di una connessione hub poteva cancellare la nuova connessione; le riconnessioni ritardate non venivano invalidate quando si lasciava la piazza.
- Un errore temporaneo durante il ripristino/refresh cancellava le credenziali salvate.

## Modifiche

La piazza mostra un account compatto, il menu e una barra con Sala Bingo, Luoghi e Chat. Destinazioni, gesti, giocatori e opzioni si aprono singolarmente in un dialogo con focus contenuto e chiusura tramite Escape. Lo stick compatto resta separato dalla barra; aprire un pannello sospende il movimento. La viewport usa l'altezza dinamica e rispetta le aree sicure.

I nuovi dispositivi touch partono dalla qualità Leggera (DPR 0,7–1, ombre e antialiasing disattivati); una scelta valida già salvata viene rispettata. Anche la piazza usa queste impostazioni. Valori corrotti nello storage tornano a impostazioni valide.

Hub e customizer sono caricati su richiesta. Rolldown mantiene le dipendenze condivise fuori dal pacchetto 3D. Il grafo statico dell'accesso della build verificata comprende 359.468 byte di JS, circa 113.711 byte gzip; non comprende i chunk Three/R3F, che insieme pesano circa 890 KB non compressi. Sono dimensioni di build, non una misura del tempo sul telefono o una garanzia di FPS. Gli asset con hash hanno cache browser immutabile.

Il client verifica il formato dei dati prima di passarli a React. Un backend precedente mostra un errore esplicito e blocca gli acquisti; non si inventano identificativi di round o conferme. Un socket senza primo snapshot termina dopo 15 secondi. Le richieste HTTP hanno un limite di 75 secondi e la sessione sopravvive agli errori temporanei; il ripristino può essere ritentato.

## Verifiche

- Client: 242 test in 24 file superati, inclusi payload precedente, snapshot incompleto, timeout, retry, rotazione token, navigazione durante un join e chiusura ritardata.
- Typecheck client superato.
- Build Vite di produzione superata; grafo statico dell'accesso verificato senza Three/R3F.
- Browser Chromium dell'app, con server reale di sviluppo e database Neon dedicato: accesso, piazza, menu, chat e ingresso nella sala verificati a 390×640 e 360×600. La build compilata è stata provata anche tramite `vite preview`.
- Controlli completi di repository (typecheck, migrazioni su Postgres sacrificabile, test e build) eseguiti dal Quality Gate della PR; consultare il risultato della PR per l'esito finale.
- Nessuna prova su Safari/iPhone fisico: il limite va verificato sul dispositivo dell'utente dopo il rilascio.

Comandi locali equivalenti, con loader nativo richiesto dall'ambiente Windows:
```text
node node_modules/typescript/bin/tsc -p packages/client/tsconfig.json --noEmit
# da packages/client
node node_modules/vitest/vitest.mjs run --configLoader native --pool threads --maxWorkers 1 --reporter dot
node node_modules/vite/bin/vite.js build --configLoader native
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort --configLoader native
```

## Rilascio e prova

Questa correzione non aggiorna automaticamente il backend pubblico. Per riaprire la sala online serve allineare Render al server della PR #15 già presente su main, verificando prima revisione attiva, log e migrazioni pendenti. Il Docker entrypoint applica le migrazioni esistenti prima dell'avvio. Questa PR non aggiunge migrazioni né modifica crediti o regole di gioco.

Il repository configura Render Free. Se il servizio effettivo usa quel piano, dopo 15 minuti senza traffico può andare in sospensione e il risveglio richiede circa un minuto ([documentazione Render](https://render.com/docs/free#spinning-down-on-idle)). Le ottimizzazioni del client non eliminano quel tempo di avvio; non è stato attivato alcun servizio a pagamento.

Nessun merge o deploy in produzione viene eseguito da questa correzione senza autorizzazione, come richiesto nel brief iniziale.

Per la prova: aprire il client contro un backend aggiornato, accedere, aprire/chiudere il menu, entrare in Sala Bingo dalla barra inferiore e verificare che compaiano la sala e il comando Acquista cartelle. Con backend precedente deve apparire la spiegazione della versione incompatibile e il pulsante Riprova, senza crash.

Riferimenti tecnici: [code splitting Rolldown](https://rolldown.rs/reference/TypeAlias.CodeSplittingGroup), [cache Vercel](https://vercel.com/docs/caching/cache-control-headers).

