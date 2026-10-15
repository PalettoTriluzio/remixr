# Ultimo passo — Flip F10: strumentale generato (2026-10-15)

Il codice non è stato eseguito: va provato su Windows.
Non servono nuove dipendenze: niente da installare. scipy c'è già, arriva con librosa.

## Cosa c'è di nuovo
Nella vista **FLIP**, barra della timeline: **genera strumentale**.
- **Stile**: trap, drill, boom bap, lo-fi, house, reggaeton, afro, pop.
- **Armonia**:
  - **dalla canzone** = gli accordi originali che suonano sotto le clip che hai messo, quindi il beat sta bene con la voce;
  - **nuova** = una progressione nuova nella tonalità della canzone, scelta per **mood** (scuro, malinconico, epico, solare, sognante).
- **Parti**: batteria, basso, accordi, arpeggio.
- **Battute**: da dove a dove.
- **variante**: stesse impostazioni, scelte diverse.
- **silenzia batteria e basso originali** (attivo di default).

Tutto è **sintetizzato**: nessun sample, nessuna licenza.

Nascono le tracce **Beat**, **Basso synth**, **Accordi**, **Arpeggio**. Sotto il righello compare la riga **ACCORDI**.

Clicca una clip generata:
- **sotto la timeline** si apre l'editor:
  - batteria = griglia a step: clic on/off, Shift+clic intensità, tasto destro roll;
  - note = piano roll: clic aggiunge o toglie una nota;
- **scheda CLIP**: **rigenera questa parte**, lunghezza, gain, swing;
- **scheda TRACCIA**: kit o suono (808, sub, reese, pad, piano elettrico, campana…) e manopole (decay, glide, drive, filtro…).

## Cosa fare
1. `git pull`
2. Riavvia il backend (chiudi il vecchio uvicorn):
   ```powershell
   cd backend
   .venv\Scripts\activate
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
3. Avvia il frontend: `cd frontend` poi `npm run dev`, e apri http://localhost:5173

## Cosa provare
1. Vista FLIP: **Parti dal ritornello**, oppure metti tu qualche clip di voce.
2. **genera strumentale** → stile **Trap**, armonia **dalla canzone**, parti batteria + basso + accordi → **Genera**.
   - Il messaggio sotto il pulsante dice quali accordi ha usato.
   - Premi Spazio.
3. Se il BPM è lontano da quello dello stile, il pannello propone **Usa N BPM**: provalo.
4. Premi **variante** e rigenera: le tracce generate vengono sostituite, la voce resta.
5. Prova **House** con l'arpeggio, poi **Lo-fi** con armonia **nuova** e mood **sognante**.
6. Clicca la clip **Beat**:
   - accendi e spegni qualche step;
   - con il tasto destro su un hi-hat fai un roll;
   - nella scheda CLIP alza lo **swing**.
7. Clicca la clip **Basso synth**: nel piano roll aggiungi e togli note. Nella scheda TRACCIA cambia da **808** a **reese**.
8. **TONALITÀ +2** nella barra della timeline: voce, basso e accordi salgono, la batteria no.
9. Export dalla top bar.

## Da sapere
- Con armonia **dalla canzone** servono clip audio (voce/altro/mix) nel range. Se non ce ne sono, usa una progressione nuova e lo dice nel messaggio.
- Gli accordi della canzone vengono dall'analisi automatica: su brani armonicamente complessi possono essere imprecisi. In quel caso prova **nuova** con il mood giusto.
- I suoni sono sintetizzati: puliti e "da producer", non realistici.

## Se qualcosa non va
Copia il messaggio d'errore: sotto il pulsante **Genera**, oppure in alto a destra nella barra della timeline. Aggiungi l'errore del terminale del backend.

## Prossimo passo
**F11 — ricetta AI**: scrivi "rifalla drill a 142, tieni solo il ritornello, intro con voce filtrata" e l'AI costruisce l'intero flip (clip, tagli, tempo, tonalità, strumentale). Tutto resta modificabile a mano.
