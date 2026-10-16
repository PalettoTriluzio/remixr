# Ultimo passo — Mood dalla canzone + Flip F11: ricetta AI (2026-10-16)

Il codice non è stato eseguito: va provato su Windows.
Non servono nuove dipendenze. Per l'AI serve il modello LLM, come nella vista REMIX.

## Cosa c'è di nuovo

### 1. Lo strumentale capisce il mood
In **genera strumentale** la riga **Mood** è sempre visibile. Il default è **dalla canzone (X)**:
- il generatore analizza la canzone: accordi maggiori/minori, energia, timbro scuro o brillante;
- considera anche l'energia delle parti da cui vengono le clip (un ritornello carico ≠ una strofa calma);
- sotto la riga leggi come "suona" la canzone e uno **stile adatto** (cliccabile).

Il mood ora cambia tutto, non solo gli accordi nuovi:
- **batteria**: più rada o più fitta, roll, ghost, intensità;
- **basso**: fermo sui battere se il pezzo è calmo;
- **accordi**: settime/none per sognante e malinconico, aperti per epico, più alti se brillante;
- **suoni**: filtri, riverbero e delay, drive dell'808.

Anche scegliendo un mood a mano, la canzone colora il risultato.

### 2. AI FLIP (F11)
Nella vista **FLIP** c'è un pannello **AI FLIP** a destra (si chiude con la X, si riapre con **AI** nella barra della timeline).
- Scrivi una frase, es. *"rifalla drill a 142, tieni solo il ritornello, intro con voce filtrata"*.
- L'AI scrive una **ricetta**: tempo, stile, mood, sezioni. Per ogni sezione: quale parte dell'originale mettere in loop, quali stems, effetti, quali parti generare e con quanta energia.
- La ricetta viene costruita sulla timeline e **sostituisce il progetto** (Ctrl+Z per tornare indietro).
- Sotto il righello compare la riga **SEZIONI**: clic su una sezione = loop su quella sezione.
- Tutto resta modificabile a mano, come sempre.
- **3 varianti**: tre ricette diverse dalla stessa frase; **ascolta questa** mette sulla timeline quella che vuoi.
- **altro strumentale**: stessa ricetta, nuovo strumentale, istantaneo (senza AI).

## Cosa fare
1. `git pull`
2. Riavvia il backend (chiudi il vecchio uvicorn):
   ```powershell
   cd backend
   .venv\Scripts\activate
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
3. Avvia il frontend: `cd frontend` poi `npm run dev`, e apri http://localhost:5173
4. Meglio con gli **stems separati** (vista REMIX → Stems): senza, l'AI può usare solo il mix intero.

## Cosa provare
1. **Mood**: vista FLIP → **Parti dal ritornello** → **genera strumentale**.
   - Controlla la riga sotto **Mood**: corrisponde a come senti la canzone?
   - Genera con **dalla canzone**, poi con **sognante** e con **epico** sullo stesso pezzo: devono suonare chiaramente diversi (densità, accordi, spazio).
   - Prova lo **stile adatto** proposto.
2. **AI FLIP**: clicca uno degli esempi, oppure scrivi la frase sopra → **Flippa**. La prima ricetta può metterci qualche secondo.
   - Leggi il riepilogo: sezioni, cosa tiene, effetti, parti.
   - Premi Spazio. Clicca le sezioni nella riga **SEZIONI** per ascoltarle in loop.
   - **altro strumentale** un paio di volte.
3. Spunta **3 varianti** e chiedi qualcosa di aperto (*"versione lo-fi notturna"*): confronta le tre con **ascolta questa**.
4. Dopo una ricetta, modifica a mano (sposta una clip, rigenera una parte) e prova **Ctrl+Z**.
5. Export dalla top bar.

## Da sapere
- Il mood è un'analisi automatica: su alcuni brani può sbagliare. In quel caso scegli il mood a mano.
- La prima volta che si apre il pannello Genera o si chiede una ricetta, il backend analizza il mood (qualche secondo); poi è in cache.
- La ricetta sostituisce il progetto intero. Per ora non modifica un progetto esistente.
- Con un modello piccolo (7B) le ricette possono essere meno precise: il 14B segue meglio le istruzioni.

## Se qualcosa non va
- Errori dell'AI: compaiono nel pannello AI FLIP.
  - **503** = modello non caricato (guarda il badge del modello nella vista REMIX).
  - **502** = risposta del modello non valida: riprova o cambia frase.
- Copia il messaggio e aggiungi l'errore del terminale del backend.

## Prossimo passo
Da decidere con te. Candidati da `PLAN.md`:
- ricetta AI che **modifica** il progetto esistente ("aggiungi un break di 4 battute", "togli l'arpeggio");
- forma d'onda vera degli stems nelle clip;
- automazioni e sidechain;
- export MP3 320;
- installer per Windows.
