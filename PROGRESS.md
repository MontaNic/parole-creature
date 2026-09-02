# PROGRESS — Draghetti & Parole (gioco inglese per Pietro)

> Questo file e' lo specchio dello stato reale del progetto.
> Va aggiornato **prima** di ogni modifica sostanziale al codice.

## Stato attuale

**v1.0.0 — completa e giocabile.**
Mascotte: **Zibo**, cucciolo di drago. Interfaccia in italiano, contenuti in inglese.

Non ancora fatto: generazione delle voci ElevenLabs (il gioco gira con la
sintesi vocale del browser finche' non si lancia `tools/generate-audio.mjs`)
e playtest reale con Pietro su tablet.

## Come si avvia

```bash
python3 -m http.server 8080     # dalla cartella del progetto
# http://localhost:8080
```

## Architettura

```
index.html               markup e schermate
style.css                stile, temi, animazioni
game.js                  avvio, navigazione, costruzione delle partite, clock di sessione
js/config.js             configurazione (endpoint proxy TTS, parametri di gioco)
js/state.js              localStorage versionato, migrazioni, export/import, PIN, orari
js/content-loader.js     caricamento content.json / strings.json / sprite SVG
js/audio.js              mp3 pre-generati -> SpeechSynthesis, SFX e musica sintetizzati
js/srs.js                ripetizione spaziata (Leitner a 6 box)
js/mascot.js             Zibo: disegno SVG, evoluzione, battute vocali
js/effects.js            coriandoli / stelle / bolle su canvas + toast
js/minigames.js          i 6 mini-giochi
js/missions.js           missione del giorno (deterministica dalla data)
js/screens.js            home, album, riepilogo, onboarding, schermata di blocco
js/parents.js            area genitori con PIN e 5 pannelli
content.json             contenuti didattici
strings.json             testi UI in italiano
assets/img/sprites.svg   75 illustrazioni in un solo file
assets/img/icon.svg      icona dell'app
assets/audio/index.json  elenco degli mp3 realmente presenti
sw.js                    cache offline
manifest.webmanifest     metadati PWA
tools/generate-audio.mjs generazione offline degli audio
tools/smoke-test.html    test di sfoglio automatico
proxy/cloudflare-worker.js  proxy che custodisce la chiave ElevenLabs
```

## Funzionalita' implementate

- [x] Onboarding senza testo da leggere (voce + icone, con tutorial giocato)
- [x] Mascotte Zibo sempre presente, parla in italiano, si anima quando parla
- [x] Evoluzione della mascotte in 4 stadi (livelli 1 / 4 / 8 / 13: sciarpa, cappello, corona)
- [x] 6 mini-giochi: abbinamento, ascolta e ripeti, quiz audio, caccia alla parola,
      trascina la parola, ricomponi la frase
- [x] 8 mondi sbloccabili in sequenza (con sblocco anche dopo 3 partite: nessun vicolo cieco)
- [x] Modalita' ripasso libero, che dà la precedenza alle parole scadute
- [x] Ripetizione spaziata: sbagliata torna subito, indovinata torna sempre piu' tardi
- [x] Nessun game over: l'errore riporta all'ascolto e si riprova
- [x] 3 varianti a rotazione di suono + animazione per la risposta giusta
- [x] Album creature: 12 creature, quelle non trovate in silhouette
- [x] Missione del giorno (8 tipi, scelta in modo deterministico dalla data)
- [x] Streak giornaliera + record
- [x] Limite di sessione gentile (default 10 min, configurabile, mai bloccante)
- [x] Area genitori con PIN a 4 cifre (hash SHA-256, limite dichiarato apertamente)
- [x] Impostazioni: minuti, fascia oraria, giorni, fasi, temi, pausa vacanza, audio, email Kindle
- [x] Dashboard progressi: streak, padroneggiate, accuratezza, parole piu' difficili, avanzamento per mondo
- [x] Pannello mini-ebook con stato e prompt di generazione pronto da copiare
- [x] Pannello film/cartoni consigliati per livello
- [x] Export/import del salvataggio su file JSON
- [x] Audio pre-generato con fallback su sintesi vocale del browser
- [x] Funzionamento offline (service worker, cache separata per shell e audio)
- [x] Salvataggio versionato con migrazioni: aggiungere contenuti non rompe i progressi
- [x] Test di sfoglio automatico (`tools/smoke-test.html`)

## Contenuti didattici presenti

**Fase 1 — parole con immagine e audio (34 parole, nessun testo scritto)**
- Creature: dragon, monster, knight, wizard, castle, sword, shield, egg
- Dinosauri: dinosaur, tail, wing, horn, tooth, claw, bone, nest
- Colori: red, blue, green, yellow, orange, purple, black, white
- Numeri: one → ten

**Fase 2 — parole scritte (16 parole)**
- Natura: cat, dog, fish, bird, tree, star, moon, sun
- Aggettivi: big, small, happy, sad, hot, cold, fast, slow

**Fase 3 — frasi (12 frasi)**
- Ponte delle Frasi: "The dragon is big.", "I see a monster!", "The knight is happy.",
  "This is my egg.", "The dinosaur is fast.", "I see a red star."
- Torre dei Dialoghi: "Hello! I am Zibo.", "What is your name?", "How are you? I am happy.",
  "Look! A blue dragon!", "Come with me, friend!", "Thank you! Good night."

**Mondi (8)**: Valle dei Draghi, Giungla dei Dinosauri, Grotta dei Colori,
Montagna dei Numeri, Foresta delle Parole, Lago Magico, Ponte delle Frasi, Torre dei Dialoghi.

**Creature dell'album (12)**: Zibo, Fiammino, Codasso, Prisma, Numo, Rametto,
Sciazzo, Baluce, Torrek, Stellina (10 parole padroneggiate), Umbra (25 parole),
Aladoro (7 giorni di streak).

**Fase 4 — mini-ebook pianificati (6, nessuno ancora generato)**
| # | Titolo | Si sblocca dopo | Stato |
|---|--------|-----------------|-------|
| 1 | Zibo and the Red Egg | Valle dei Draghi | da generare |
| 2 | The Dinosaur with One Horn | Giungla dei Dinosauri | da generare |
| 3 | Colors in the Cave | Grotta dei Colori | da generare |
| 4 | Ten Little Stars | Montagna dei Numeri | da generare |
| 5 | The Happy Knight | Foresta delle Parole | da generare |
| 6 | Hello, Friend! | Ponte delle Frasi | da generare |

Il prompt di generazione si copia dall'area genitori: include il vocabolario
obbligatorio, quello gia' noto a Pietro e le regole del graded reader.

**Fase 5 — audiovisivi consigliati (6)**: Peppa Pig e Bluey (liv. 1),
Ben and Holly (liv. 2), Dragons: Rescue Riders e Gigantosaurus (liv. 3),
How to Train Your Dragon (liv. 4, come traguardo).

## Decisioni tecniche prese

- **ES modules senza build step.** Serve un server statico locale: i browser
  bloccano `fetch` su `file://`. Scelta consapevole per tenere `content.json`
  come vero file dati separato dalla logica, come da specifica.
- **Un solo sprite SVG** (`assets/img/sprites.svg`, 75 simboli) iniettato nel DOM
  al boot e usato con `<use href="#id">`. Stile unico, peso minimo, zero
  chiamate di rete a runtime, silhouette dell'album ottenute con un filtro CSS.
- **Effetti sonori e musica generati con Web Audio API**, non file: zero byte da
  scaricare e nessun problema di licenza.
- **Audio delle parole: mp3 statici pre-generati**, con `assets/audio/index.json`
  che dice al gioco quali file esistono davvero (niente 404 a raffica).
- **La chiave ElevenLabs non tocca mai il client**: sta nel Worker o nel `.env`
  locale, e viene usata solo dallo script offline.
- **Le battute con segnaposto** (es. "Ci vediamo domani, {name}!") restano alla
  sintesi vocale, cosi' Zibo puo' dire il nome del bambino.
- **Progresso indicizzato per id**, schema versionato con migrazioni: aggiungere
  contenuti e' un'operazione sicura rispetto ai salvataggi esistenti.
- **PIN con hash SHA-256** e fallback in chiaro dove `crypto.subtle` non c'e'.
  Il limite e' dichiarato nell'interfaccia, non nascosto.
- **Sblocco dei mondi anche dopo 3 partite**, non solo completando il precedente:
  una parola ostica non deve poter bloccare il gioco.

## Changelog

- **2026-09-02** — Creato scaffold iniziale del progetto (README, schemi, .env.example).
- **2026-09-03** — Build v1.0.0 completa: tutte le funzionalita' sopra, contenuti
  delle fasi 1-3, pianificazione fasi 4-5, area genitori, offline, tooling audio.
  Verificata con test di sfoglio automatico (0 errori su ~250 tocchi casuali,
  home / partita / riepilogo / album / area genitori) e con screenshot su
  viewport tablet. Corretti in corsa: tocchi fuori sequenza nella caccia alla
  parola, doppio esito nel drag&drop, anatomia di Zibo e del mostro nello sprite.

## Prossimi passi

1. **Generare le voci ElevenLabs** (`node tools/generate-audio.mjs`) e riascoltarle:
   la sintesi del browser va bene come rete di sicurezza, non come esperienza.
2. **Playtest con Pietro su tablet**, osservando senza suggerire. Cosa guardare:
   capisce l'onboarding senza aiuto? tocca l'orb per riascoltare? si annoia prima
   della fine della partita? torna il giorno dopo?
3. **Testare su Safari iOS reale**: sblocco audio al primo tocco, drag&drop col dito,
   safe area, aggiunta alla schermata Home.
4. **Generare il primo mini-ebook** (Zibo and the Red Egg) e mandarlo su Kindle.
5. Regolare `sessionMinutes` e il numero di domande per partita dopo il playtest.

## Idee future (non in v1)

- PWA installabile con prompt di installazione dedicato e icone PNG.
- Grafici dei progressi nel tempo nella dashboard genitori.
- Badge/achievement per il lungo periodo.
- Multi-profilo per piu' bambini.
- Invio automatico dei mini-ebook all'indirizzo Send-to-Kindle.
- Riconoscimento vocale per la pronuncia, quando sara' affidabile sulle voci dei bambini.
- Palette verificata per il daltonismo.
- Criteri di successo misurabili (es. uso quotidiano per 2 settimane, N parole acquisite).

### Fase 2 — da valutare dopo aver visto la reazione di Pietro

- Micro-narrativa a episodi ogni 3-4 livelli.
- Base/tana personale da decorare con le ricompense.
- Sorprese casuali (creature rare, scrigni bonus).
- Condivisione asincrona in famiglia ("manda il risultato a papa'").
- Registrazione della propria voce per riascoltarsi, senza valutazione.
