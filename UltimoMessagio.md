# Ultimo passo — Flip F9: timeline + campionatore (2026-10-15)

Il codice non è stato eseguito: va provato su Windows.
Non servono nuove dipendenze: niente da installare.

## Cosa c'è di nuovo
In alto, accanto al logo, ci sono due tasti: **REMIX | FLIP**.
- **REMIX**: tutto come prima.
- **FLIP**: ricostruisci la canzone dai suoi pezzi.
  - **In alto** c'è la canzone originale con battute e sezioni: è la *sorgente*.
  - **Sotto**, una timeline con tracce e clip, al **BPM e nella tonalità che scegli tu**.
  - **A sinistra**:
    - **CLIP** = il campionatore sulla clip selezionata;
    - **TRACCIA** = volume, pan ed effetti della traccia;
    - **MASTER** = il rack del remix, dove valgono anche look, preset, AI e intensità.

## Cosa fare
1. `git pull`
2. Riavvia il backend (chiudi il vecchio uvicorn):
   ```powershell
   cd backend
   .venv\Scripts\activate
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
3. Avvia il frontend:
   ```powershell
   cd frontend
   npm run dev
   ```
   Apri http://localhost:5173

## Cosa provare
1. Carica una canzone e separa gli stems (pannello Stems in vista REMIX, o dal link nella barra della vista FLIP).
2. Premi **FLIP**. Il progetto parte al BPM e nella tonalità della canzone, con le tracce Voce / Batteria / Basso / Altro.
3. Premi **Parti dal ritornello**: voce e batteria del ritornello in loop. Premi **Spazio** per ascoltare.
4. Cambia il **BPM** nella barra della timeline (es. da 90 a 140): tutto va al nuovo tempo e la voce resta intonata.
5. Usa **TONALITÀ − / +**: le tracce con ♪ cambiano tonalità, la batteria no.
6. Costruisci a mano:
   - seleziona un pezzo sulla waveform in alto (trascina, o clicca una sezione);
   - premi **Voce** nella barra sotto la waveform: diventa una clip al playhead.
   - Ripeti: i pezzi si mettono in fila.
7. Prova il campionatore su una clip di voce, nella scheda **CLIP**:
   - **Taglia → beat** (o *transienti*), poi sposta i pezzi trascinandoli; **Alt+trascina** = copia;
   - **loop**, **÷2 / ×2**, **◀ reverse**, **vinile** (velocità e pitch insieme);
   - **Gate ritmico 1/16**: effetto stutter a tempo;
   - **Intona** al 100%: ogni nota va sulla scala;
   - **+ seconda voce**: una terza sopra, su una traccia nuova.
8. Righello della timeline: **clic** = sposta il playhead, **trascina** = range di loop (**L** lo accende e lo spegne).
9. Scheda **TRACCIA**: effetti solo su quella traccia (es. riverbero solo sulla voce).
10. **Export** dalla top bar: salva il flip come `<nome>_flip.wav`.
11. **Ctrl+Z** annulla le modifiche al flip. **Canc** elimina la clip, **Ctrl+D** la duplica.
12. Ricarica la pagina: il progetto deve tornare (ripremi FLIP).

## Da sapere
- La forma d'onda dentro le clip è sempre quella del mix, anche per le clip di stems. Il suono invece è quello giusto.
- L'intonazione funziona bene su voci soliste pulite. Su cori o parti molto effettate può fare artefatti.
- Il pannello AI non c'è in vista FLIP: arriva con il passo 4 (ricetta AI).
- L'anteprima suona al massimo 120 s alla volta. Oltre, parte dalla battuta del playhead (o usa il loop). L'export è sempre completo.

## Se qualcosa non va
Copia il messaggio d'errore che compare in alto a destra nella barra della timeline. Se c'è, aggiungi l'errore del terminale del backend.

## Prossimo passo
**F10 — strumentale generato**:
- batteria a step con kit CC0;
- 808 e synth che seguono gli accordi;
- nuova progressione armonica.

Così il flip avrà un beat tutto nuovo sotto la voce.
