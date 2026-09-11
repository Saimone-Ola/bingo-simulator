# Verifica della revisione visiva

## Stato iniziale e decisioni

La base di confronto è il commit `c7957ba45fb2ffd26e2b31c63ab7f296c4b06951`. La revisione mantiene la sala in prima persona, le sedute e il modello di personalizzazione già salvato. Le differenze sono state controllate in WebGL nel browser, oltre alle verifiche di geometria e movimento.

| Area | Problema osservato nella base | Intervento |
| --- | --- | --- |
| Volto | Cranio e mento sovrapposti; sopracciglia verticali; sorriso ovale; montature viste di taglio | Cranio unico con mandibola sagomata, sopracciglia orizzontali, curva del sorriso indipendente dall'apertura della bocca, occhiali frontali distanziati dalla pelle |
| Corpo | Torace squadrato, spalle a sfere, bacino allungato, piedi tagliati nell'anteprima | Torace continuo con profilo tornito, maniche raccordate, bacino compatto, collo più corto e gambe che poggiano sul pavimento |
| Gesti | Il busto ruotava attorno al pavimento; l'applauso non avvicinava le mani; l'attesa seduta somigliava alla posa zombie | Pivot del busto all'anca, spalle su due assi nell'applauso, braccia rilassate da seduto, cadenza del passo più leggibile, posa dedicata al vassoio |
| Anteprima | Rotazione iniziale continua e un'unica distanza | Vista frontale iniziale ferma, pulsanti figura intera/viso, selettore di saluto/applauso/risata; rotazione manuale e automatica ancora disponibili |
| Sala | Tinte bordeaux distanti dai token dell'interfaccia, fondale poco leggibile, cameriera su un percorso riferito alla vecchia sala | Materiali indaco neutri, feltro petrolio, illuminazione meno satura, corridoio centrale e passaggi tra file, percorso di servizio derivato dai limiti reali |
| Folla lontana | Teste prive di capelli, perdita dell'identità cromatica | Terza mesh instanziata per la silhouette dei capelli, con il colore risolto dall'avatar |
| Cartelle | Focus solo sull'oggetto, testo piccolo, trascinamento del mouse poteva segnare | Inquadratura esplicita della cartella fisica selezionata, ritorno alla visuale precedente, texture a risoluzione doppia, clic con soglia di trascinamento |
| Pennarelli | Oggetti piccoli e dispersi vicino alle cartelle | Vassoio sul tavolo, corpo/tappo/punta distinguibili, pennarello scelto sollevato e segnalato in viola, area cliccabile più ampia |

## Compatibilità e comportamento

- `resolveAvatarAppearance` resta il punto di normalizzazione. Preset, corporatura, altezza, colori, capelli, lineamenti e accessori conservano gli identificativi esistenti; nessuna migrazione o riscrittura dei profili.
- Il personaggio è ancora procedurale e condiviso fra anteprima, giocatori e NPC. Le nuove geometrie sono create in codice, memorizzate e rilasciate quando il componente viene smontato. Non sono stati introdotti modelli, font o texture remoti, né licenze di asset aggiuntive.
- I materiali nuovi sono raccolti in `three/palette.ts` e rispecchiati in `styles/tokens.css`. La revisione non pretende di bonificare ogni colore decorativo preesistente.
- I quattro colori dei pennarelli mantengono i valori già persistiti. Il viola indica l'interazione; l'oro resta associato ai valori dell'interfaccia.
- La modalità manuale disegna solo i segni confermati nelle cartelle: la texture non colora automaticamente ogni numero estratto. Il server resta la fonte dello stato dei segni.
- «Guarda cartella» mantiene posizione e seduta. Punta il centro della cartella selezionata e riduce il campo visivo; il ritorno ripristina la direzione precedente. Gli eventi di sala non orientano automaticamente la testa. La vista ravvicinata lascia il mouse disponibile per le cartelle e i pennarelli.
- Il movimento ridotto elimina oscillazione, respiro, battito delle palpebre e pulsazione dei pannelli; le pose restano riconoscibili. Il segnale `onSceneReady` viene emesso al montaggio della scena, senza dipendere dagli aggiornamenti di gioco.
- La folla lontana usa tre draw call instanziate, una in più rispetto alla base. I profili di qualità e il limite degli avatar dettagliati restano operativi. Le ombre usano il valore supportato `percentage` di React Three Fiber, evitando gli avvisi di deprecazione di `PCFSoftShadowMap` nella versione installata di Three.js.

## Verifiche eseguite

TypeScript client completato senza errori con:

```sh
node node_modules/typescript/bin/tsc -p packages/client/tsconfig.json --noEmit
```

Le prove mirate hanno verificato 37 casi in cinque file (`characterMotion`, `cameraView`, `waiterPath`, `cardLayout`, `occupants`). Dopo l'ultimo affinamento delle spalle e del gesto sono stati ripetuti gli otto casi dei primi tre file, tutti superati. Sono controlli geometrici e di comportamento: distanza delle mani durante l'applauso, separazione della posa seduta da quella zombie, vertici e normali finiti; puntamento delle sei cartelle da tutte le 512 sedie; conservazione e ripristino della direzione; percorso del cameriere dentro i limiti, libero da tavoli/reception e a velocità costante.

In questo ambiente Windows il wrapper pnpm tenta un'installazione del package manager e il caricamento standard della configurazione Vitest incontra `EPERM`/`require is not defined`. Per le prove mirate è stato usato l'eseguibile Vitest già installato, con `--pool=threads --configLoader=runner` e una configurazione temporanea esterna al repository contenente soltanto `test: { pool: 'threads', environment: 'node' }`. Non sono stati alterati gli esiti per aggirare un test fallito.

La verifica visiva è stata eseguita a 1280 × 720 nel browser integrato, con screenshot PNG originali senza ritocco. Il client iniziale è stato estratto con `git archive` in una directory separata e avviato sulla porta 5174; il client modificato sulla 5173. Entrambi usano il backend di sviluppo e crediti di prova. Non sono stati effettuati acquisti con il vecchio protocollo né salvate le variazioni temporanee mostrate nell'editor.

| Screenshot allegato | Contenuto |
| --- | --- |
| `avatar-before.png` | Avatar classico iniziale, frontale e rotazione fermata |
| `avatar-after.png` | Stesso aspetto classico e altezza, figura intera finale |
| `avatar-face-after.png` | Primo piano del volto finale |
| `avatar-glasses-after.png` | Preset Nonna nell'anteprima, verifica della montatura |
| `avatar-applause-after.png` | Corpo intero durante il gesto di applauso |
| `hall-before.png` | Ingresso della sala iniziale, posizione di spawn |
| `hall-after.png` | Stessa posizione della sala modificata |

Gli originali sono consegnati nella cartella `outputs/screenshots` della sessione di lavoro, separata dal codice. Il confronto della sala mantiene posizione, dimensioni e impostazioni iniziali; stato dei pannelli e numero di utenti possono differire perché il backend e l'interfaccia sono stati aggiornati. I fotogrammi documentano l'aspetto e una fase dei gesti, non una misura del frame rate. Non è stato eseguito un benchmark su hardware mobile o una verifica visiva di tutte le combinazioni possibili dell'avatar.

## Rifiniture emerse durante la prova della partita

La selezione della quantità nella cassa passa immediatamente da un valore all'altro: sfondo e testo non animano più tra due stati apparentemente attivi. La scelta usa il viola e viene esposta con `aria-pressed`; l'oro resta su prezzo e conferma. A 320 px le quantità si distribuiscono in due righe da tre; da 380 px occupano sei colonne. I due modi di segnatura diventano una colonna sotto 360 px. Il selettore del conto alla rovescia include anche il valore predefinito di 10 secondi.

La mappa dei posti ha altezza massima pari al contenitore della finestra: titolo e chiusura restano fuori dall'area scorrevole. La mappa mantiene almeno 600 px di larghezza e si può scorrere in entrambe le direzioni sui piccoli schermi, evitando che tavoli e posti si sovrappongano quando vengono compressi.

Nella verifica a 390 × 844 il menu superiore si distribuiva su quattro righe e copriva il fallback 2D. Sotto il breakpoint `sm`, titolo e codice ora occupano la prima riga, mentre le azioni rimangono sulla seconda in una barra scorrevole orizzontalmente. Il fallback riserva 112 px in alto (96 px su desktop ampio) e mostra lo stato del round nel normale flusso del contenuto. Preparazione, fase, evento, finestra ex aequo e accrediti pendenti condividono lo stesso testo della sala 3D; il relativo riquadro assoluto viene escluso dal fallback per evitare sovrapposizioni.

La texture delle cartelle conserva una firma dei pixel visibili e salta ridisegno e aggiornamento GPU quando lo snapshot sostituisce gli oggetti senza cambiare il loro contenuto. Anche un nuovo numero estratto non causa un aggiornamento se non modifica l'aspetto di un segno. Restano aggiornati segni, errori corretti, rimozioni, numeri della cartella, selezione e pennarello. Tre prove aggiuntive verificano il contatore `texture.version` e le chiamate di ridisegno; tutte superate.

## Come misurare le prestazioni

Solo con il server Vite di sviluppo, aggiungere `perf=1` alla query della sala, ad esempio `/bingo?perf=1` oppure `&perf=1` se è già presente il codice sala. `DevRenderProbe` mostra un piccolo riquadro tecnico, senza modificare stato di gioco o ciclo di rendering. In produzione il riquadro non viene montato. Il suo output è testo DOM con `data-bingo-performance="true"` e nome accessibile «Prestazioni rendering sviluppo».

Dopo due secondi iniziali il riquadro aggiorna i dati una volta al secondo: FPS, intervallo medio tra frame e P95, media delle draw call e dei triangoli segnalati dal renderer, geometrie e texture residenti, risoluzione e DPR. La misura usa il delta del ciclo R3F e i contatori `gl.info` del frame precedente; non misura separatamente tempo CPU o GPU. Il passaggio a una scheda nascosta azzera la finestra di campionamento; le pause lunghe durante una scheda visibile restano incluse.

Per confronti ripetibili: stessa finestra e dimensioni, stessa posizione/vista, stesso numero di cartelle e utenti, pannelli chiusi. Registrare almeno dieci aggiornamenti consecutivi dopo il riscaldamento all'ingresso, seduti e in vista cartella; ripetere con qualità bassa/media/alta. Conservare anche screenshot dei numeri e impostazioni. La sola assenza di errori WebGL non prova un frame rate adeguato.

| Profilo | DPR massimo | Mappa ombre | Ospiti decorativi completi, limite |
| --- | ---: | ---: | ---: |
| Basso | 1 | Disattivate nel preset | 0 |
| Medio | 1,5 | 1024 | 4 entro 6 m |
| Alto | 2 | 2048 | 28 |

I limiti provengono da `RENDER_PROFILES`, `QUALITY_PRESETS` e `CROWD_BUDGETS`; la distanza può ridurre ulteriormente gli avatar completi. In medio e alto i giocatori reali conservano volto, gesti e nome anche quando i posti decorativi vicini esauriscono il loro budget. I giocatori reali sono aggiuntivi rispetto al limite decorativo; il numero di partecipanti influisce quindi sul costo. Il profilo basso mantiene tutti semplificati. I tavoli e le sedie oltre 6/8/12 metri (basso/medio/alto) usano quattro mesh instanziate; il proprio tavolo rimane dettagliato. La folla lontana usa tre mesh instanziate. Sono vincoli del codice, non risultati di un benchmark.

Sei texture RGBA da 1152 × 432 richiedono circa 11,39 MiB per il solo livello base, escludendo mipmap e copie canvas/driver. È quattro volte la superficie della risoluzione precedente e rende importante evitare upload per snapshot identici. L'eventuale confronto in MiB/s va trattato come stima del volume di pixel richiesto, non come misura della banda GPU.

La prima lettura reale del probe all'ingresso, prima della riduzione del budget decorativo e del raggio degli arredi, ha riportato 22,5 FPS, intervallo medio 44,5 ms/P95 89,7 ms, 1425 draw call e 427.694 triangoli, con 731 geometrie e 18 texture. Condizioni dichiarate nella sessione: medio, 1280 × 720, DPR 1, 240 ospiti decorativi e due client. Una vista seduta verso il lato opposto riportava circa 30 FPS, 218 call e 136 mila triangoli: non è un confronto prima/dopo perché cambia l'inquadratura. Questo dato ha motivato il limite medio di quattro avatar decorativi e il raggio degli arredi di otto metri. Trenta prove LOD/occupazione e il typecheck sono passati dopo la modifica; le prove confermano anche che nessuno scompare durante il cambio di dettaglio e che i giocatori reali restano completi in medio.

La lettura successiva è stata ripetuta dallo stesso ingresso, con le stesse condizioni dichiarate (240 ospiti decorativi, due client, medio, 1280 × 720, DPR 1):

| Contatore del probe | Prima dell'ottimizzazione LOD | Dopo |
| --- | ---: | ---: |
| FPS indicativi | 22,5 | 29,4 |
| Intervallo medio tra frame | 44,5 ms | 34,0 ms |
| P95 degli intervalli | 89,7 ms | 59,8 ms |
| Draw call medie | 1425 | 483 |
| Triangoli medi | 427.694 | 196.514 |
| Geometrie residenti | 731 | 246 |
| Texture residenti | 18 | 11 |
| Campioni nella finestra | 23 | 30 |

La riduzione osservata delle draw call è del 66,1%. Sono due finestre di circa un secondo, non un benchmark statistico: gli FPS e i percentili sono indicativi e risentono di animazioni, sincronizzazione e altri processi locali. La prova è avvenuta su Windows nel browser integrato di Codex, mentre erano attivi anche processi di test. La lettura delle caratteristiche hardware con `Get-CimInstance` è stata negata nell'ambiente; CPU e GPU non sono state identificate. Questi dati non dimostrano una capacità massima di utenti o un frame rate garantito su altre macchine.
