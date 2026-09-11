# Verifica prima degli interventi — 11 settembre 2026

Base: `c7957ba` (`main`), checkout pulito, branch `codex/bingo-rounds-immersion`.
Requisiti: brief utente allegato, README, DESIGN, THESIS_VERTICAL_SLICE, DEMO e PR 13–14.

| Requisito | Comportamento verificato | Problema riproducibile | Intervento | Verifica |
|---|---|---|---|---|
| Prezzi stabili | `updateConfig` cambia tier durante acquisto; pool usa prezzo corrente | Comprare, poi cambiare tier modifica il premio | Congelare condizioni al primo acquisto in corso, differire nuova configurazione | Test cambio prezzo e acquisto concorrente |
| Acquisto atomico | Ledger precede `issueCards`; round numerico riparte | Errore emissione dopo addebito; collisione chiave dopo riavvio | UUID partita, carte e ledger stessa transazione, conferma esplicita | Rollback, retry, concorrenza e recupero |
| Ex aequo e accrediti | Primo claim chiude tier; errore ritorna premio zero | Due richieste valide: solo la prima riceve premio | Finestra server finita, quote deterministiche, premi pending persistenti | Reclami simultanei e accredito fallito |
| Preparazione reale | NPC decorativi contano nel minimo; tutti i visitatori devono comprare | Pubblico permette avvio solo; visitatore blocca gruppo | Partecipanti acquirenti, spettatori e allenamento esplicito | Late join, host disconnect, countdown e TIMER |
| Conferma acquisto UI | Click chiude pannello e suona prima della risposta | Saldo insufficiente sembra acquisto riuscito | Stato in elaborazione, conferma server, selezione conservata | Test protocollo e due browser |
| Posto scelto | Effetto COUNTDOWN prende `freeSeats[0]` | Teletrasporto senza consenso | Scelta sedia o mappa esplicita | Prova camera/posto |
| Manuale/automatico | Segni manuali correggibili, convalida sui numeri estratti | Preferenza resettata al nuovo round | Conservare preferenza; chiarire che dichiarazione resta manuale | Segni errati, vuoti, più cartelle, round successivo |
| Cartelle leggibili | Griglia sei cartelle compare dentro qualunque pannello aperto | Configurazione coperta da griglie e input concorrenti | Un pannello cartelle esplicito, selezione/ingrandimento | Viewport piccolo e fallback |
| Qualità 3D | Sala completa, LOD, avatar procedurali e camera esistenti | Volti poco leggibili, focus senza camera coordinata | Proporzioni/rig, materiali indaco, transizioni sala/tavolo e penne | Test geometria e screenshot reali |
| Suite completa | Vitest server include solo `test/**` | Test `src/realtime/*.test.ts` non eseguiti | Includere anche test accanto al sorgente | `pnpm typecheck`, `pnpm test`, `pnpm build`, ledger check |

## Scelte esplicite del simulatore

La finestra ex aequo, l'allenamento e l'assegnazione dei resti in crediti virtuali sono scelte di gameplay. I segni manuali restano un ausilio visivo correggibile, come documentato nel codice esistente: nessuna penalità nascosta. Il pubblico decorativo non acquista e non vince.

Nessun deploy in produzione, pagamento reale o migrazione distruttiva. Le prove DB usano un database vuoto su branch Neon dedicato.
