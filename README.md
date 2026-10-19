# Pepe e la Leggenda delle Parole

(nome di lavoro e repository: *Parole & Creature*)

Gioco browser per imparare l'inglese, pensato su misura per un bambino di 7-9 anni:
sessioni brevi, Pepe (una cucciola di Jack Russell) che guida a voce, creature
originali da collezionare, una storia a episodi. Interfaccia in italiano,
contenuti didattici in inglese.

**Cosa contiene** (versione 3.8.0): 32 unita' in 9 fasi, 295 parole e
182 frasi con audio (1.352 tracce), 282 illustrazioni, 36 creature, una
storia in tre stagioni (38 scene), 32 dialoghi, 6 libretti, 4 lezioni sui
suoni delle lettere, mini-giochi a tocco e 3 giochi bonus, "Parla con Pepe"
per ripetere ad alta voce, scrigni, adesivi, distintivi, la tana,
condivisione in famiglia, tempo di gioco con codice genitore.

Alcune regole che reggono tutto il gioco (il perche' sta in `PROGRESS.md`):

- **il ritmo lo detta il gioco**: mentre una voce spiega o pronuncia, i
  comandi per andare avanti restano fermi (`js/pace.js`);
- **un disegno da solo e' una parola nuda**; le frasi hanno la cornice rosa
  e le alternative sono sempre dello stesso tipo della risposta;
- **prima l'inglese, poi l'italiano**: la traduzione arriva dopo la
  risposta, o a voce finita dove aiuta a capire senza rivelarla;
- **niente microfono nelle partite normali**: il parlato ha il suo giro,
  "Parla con Pepe", con al massimo due tentativi al microfono.
Il percorso didattico segue le Indicazioni nazionali per la primaria fino a
un A1 pieno: `docs/curriculum-2.md` e `docs/curriculum-3.md`.

- Nessun build step, nessun framework: HTML/CSS/JS vanilla con ES modules.
- Funziona offline (service worker) e su tablet, Safari iOS incluso.
- Nessun dato esce dal dispositivo: niente account, niente tracciamento, niente pubblicita'.

## Giocare

Il gioco e' pubblicato su GitHub Pages, in HTTPS:

**https://montanic.github.io/parole-creature/**

Sul tablet: aprilo in Safari e "Aggiungi a Home". Da li' funziona anche
senza connessione, perche' HTTPS e' cio' che permette al service worker di
installarsi e di tenere in cache illustrazioni e file del gioco. Su un
indirizzo `http://` in rete locale il browser lo nega: si gioca lo stesso,
ma non offline.

Per chi accompagna il bambino: `docs/guida-genitori.md`, una pagina.

## Avviare il gioco in locale (sviluppo)

Serve un piccolo server statico (i browser bloccano `fetch` su `file://`,
e i contenuti stanno in file `.json` separati dalla logica):

```bash
cd parole-creature
python3 -m http.server 8080
# poi apri http://localhost:8080
```

Per provarlo sul tablet, apri lo stesso indirizzo usando l'IP del computer
(es. `http://192.168.1.20:8080`) con tablet e computer sulla stessa rete.

## Struttura

```
index.html               markup e schermate
style.css                stile, temi, animazioni
game.js                  avvio, navigazione, composizione delle partite
js/config.js             configurazione tecnica (nessuna chiave API)
js/curriculum.js         regole didattiche: padronanza, sblocchi, mix nuovo/ripasso
js/state.js              salvataggio localStorage versionato + export/import
js/content-loader.js     caricamento di content.json, strings.json, sprite
js/audio.js              voce, effetti sonori, musica
js/srs.js                ripetizione spaziata (Leitner)
js/mascot.js             Pepe: disegno, evoluzione, battute
js/effects.js            coriandoli, stelle, messaggi
js/minigames.js          i mini-giochi e il turno del bambino al microfono
js/pace.js               il ritmo: comandi fermi finche' la voce parla; istruzioni di Pepe
js/dialogues.js          i dialoghi con le creature (con la figura di cui si parla)
js/phonics.js            "I suoni": lettere, suoni e fusione
js/books.js              i libretti illustrati
js/story.js              la storia a episodi (tre stagioni)
js/chests.js             scrigni a sorpresa e adesivi
js/bonus.js              i giochi bonus: Bolle, Spunta!, Il cestino
js/badges.js             i distintivi
js/den.js                la tana
js/recorder.js           registrazione della voce, rilevamento della voce
js/speech.js             riconoscimento vocale (facoltativo, dai genitori)
js/share.js              condivisione in famiglia
js/history.js            storico giornaliero e criteri di successo
js/missions.js           missione del giorno (missioni di avvio, poi solo fattibili)
js/checkup.js            il check del mese
js/lock.js               tempo di gioco finito: codice genitore, sblocco, backup
js/pepe-touch.js         Pepe che reagisce quando lo si tocca
js/screens.js            home a blocchi di fase, album, riepilogo, onboarding
js/parents.js            area genitori protetta da PIN
content.json             il curriculum: unita', strutture, parole, frasi, creature
strings.json             testi dell'interfaccia in italiano
assets/img/sprites.svg   icone e simboli schematici (sprite SVG unico)
assets/img/art/          le illustrazioni PNG generate (+ index.json)
assets/audio/            audio pre-generati (+ index.json)
sw.js                    cache offline
tools/generate-audio.mjs generazione offline degli audio (allinea anche il volume)
tools/normalize-audio.mjs  porta tutte le tracce allo stesso volume (serve ffmpeg)
tools/curriculum-test.html  test delle regole didattiche e dei moduli
tools/smoke-test.html    test di sfoglio automatico
tools/check-assets.mjs   integrita' degli asset e della cache
tools/palette-check.mjs  palette per chi confonde i colori
tools/cache-check-remote.mjs  prova dell'offline sul sito pubblicato
tools/generate-images.mjs + remove-bg.py  pipeline delle illustrazioni (Gemini)
proxy/cloudflare-worker.js  proxy che custodisce la chiave ElevenLabs
```

## Audio

Il gioco parla in due modi:

1. **File MP3 pre-generati** con ElevenLabs, dentro `assets/audio/`.
   Vengono creati una volta sola, offline, e poi cachati: nessuna chiamata
   all'API mentre il bambino gioca.
2. **Sintesi vocale del browser** come ripiego, per le tracce mancanti.

Il progetto include gia' **1.352 tracce generate**: 1.168 inglesi e 184
italiane. Per rigenerarle o aggiungerne di nuove:

```bash
cp .env.example .env       # poi compila .env (non viene mai committato)
node tools/generate-audio.mjs --dry-run   # mostra cosa farebbe
node tools/generate-audio.mjs             # genera i file mancanti
```

```bash
node tools/generate-audio.mjs --plan             # riepilogo per voce, senza generare
node tools/generate-audio.mjs --force --only it/ # rigenera solo l'italiano
```

**Quattro voci, quattro ruoli.** In `.env`:

- `VOICE_ID_ENGLISH` — il modello di pronuncia: parole, frasi, battute
  inglesi delle creature, libretti, suoni. E' la voce che il bambino deve
  imitare. (880 tracce)
- `VOICE_ID_BAMBINO` — una voce di bambino per le risposte dei dialoghi:
  chi risponde e' "il bambino", non il modello. (288 tracce)
- `VOICE_ID_PEPE` — la mascotte in prima persona: accoglienza, istruzioni
  dei giochi, incoraggiamenti, saluti, le frasi quando la si tocca. (105 tracce)
- `VOICE_ID_NARRATOR` — voce in terza persona: il racconto della storia e i
  traguardi rari (mondo superato, nuova creatura, fase completata). (79 tracce)

**Lo stesso volume per tutte.** Le voci arrivano da ElevenLabs con livelli
molto diversi (misurati: oltre 21 dB di scarto). `tools/normalize-audio.mjs`
le porta tutte a -24 dB (sulle parti con voce), e `generate-audio.mjs` lo
fa da solo per ogni traccia nuova. Serve ffmpeg: su un Mac Intel, dove
Homebrew non si installa piu', va bene la build statica di evermeet.cx in
`~/.local/bin/ffmpeg` (o il percorso in `FFMPEG`).

```bash
node tools/normalize-audio.mjs --report   # misura e basta
node tools/normalize-audio.mjs            # corregge le tracce fuori tolleranza
```

Chi dice cosa e' dichiarato in `strings.mascotVoices`. Se sposti una battuta al
narratore, **riscrivi il testo in terza persona**: la voce epica che dice
"abbiamo finito" suona sbagliata.

Le separazioni non sono estetiche. Fra inglese e italiano, al bambino deve
bastare il timbro per capire se quello che sente e' da imparare o da capire.
Fra Pepe e narratore, l'epico funziona solo se resta raro.

La chiave ElevenLabs **non sta mai nel codice client**. Due modi, entrambi sicuri
anche con repository pubblico:

- **con proxy** (consigliato): la chiave vive dentro un Cloudflare Worker
  (`proxy/cloudflare-worker.js`); in `.env` metti solo `TTS_PROXY_URL` e `TTS_PROXY_TOKEN`;
- **diretto**: `ELEVENLABS_API_KEY` nel `.env` locale, escluso da git.

> Dietro un proxy che rifirma i certificati TLS, Node fallisce dove `curl`
> funziona. Lo script se ne accorge e si rilancia da solo con `--use-system-ca`.

## Il curriculum

`content.json` non e' un elenco di parole: e' un corso a 32 unita' in 9 fasi, ognuna con un
obiettivo linguistico dichiarato (non "colori" ma "il colore va prima del nome"),
con revisione sistematica delle unita' precedenti in ogni partita e una soglia
di padronanza dell'80% per passare di fase.

La logica completa e il perche' di ogni scelta stanno in `PROGRESS.md`, sezione
**Logica del curriculum**. Le regole vivono in `js/curriculum.js`, i parametri
in `content.json` sotto `curriculum`.

## Aggiungere contenuti

Si modifica solo `content.json`. Aggiungere parole, frasi o unita' **non rompe i
salvataggi**: il progresso e' indicizzato per `id`, e lo schema del salvataggio
ha un numero di versione con migrazioni in `js/state.js`.

> **Gli id sono permanenti.** Rinominare l'id di una parola equivale a
> cancellare quello che il bambino ha imparato su quella parola. Si aggiunge,
> non si rinomina.

Per una parola nuova servono tre cose:

1. una voce in `words` (con `id`, `en`, `it`, `phase`, `theme`, `sprite`);
2. un `<symbol id="sp-...">` in `assets/img/sprites.svg`;
3. il suo `id` dentro `newItems` di un'unita'.

Poi `node tools/generate-audio.mjs` per la voce inglese, e
`tools/curriculum-test.html` per controllare che il curriculum resti coerente.

## Area genitori

Si apre dall'icona in alto a destra ed e' protetta da un codice di 4 cifre:
**1357 di partenza**, da cambiare con uno che conoscono solo i genitori.
**Il codice non e' una misura di sicurezza informatica**: serve solo a impedire
che un bambino ci entri per sbaglio. Chi conosce gli strumenti del browser lo aggira.

**Tempo di gioco.** Il default e' 30 minuti al giorno. Alla scadenza Pepe
saluta e il gioco si ferma; per continuare serve lo stesso codice, che
aggiunge altrettanti minuti e propone di salvare una copia dei dati (su
iPad dal pannello di condivisione, "Salva su File").

Da li' si impostano: durata della sessione, fasce orarie e giorni consentiti,
fasi didattiche e temi attivi, pausa vacanza, musica ed effetti, email
Send-to-Kindle, e si vedono progressi, mini-ebook da generare e film consigliati.
C'e' anche **export/import del salvataggio**: conviene esportare ogni tanto,
perche' una pulizia della cache cancella `localStorage` senza preavviso.

## Test

```bash
node tools/check-assets.mjs        # integrita' degli asset grafici, senza browser

python3 -m http.server 8080
# regole didattiche: http://localhost:8080/tools/curriculum-test.html
# sfoglio a caso:    http://localhost:8080/tools/smoke-test.html
#                    http://localhost:8080/tools/smoke-test.html#full
```

**`curriculum-test.html`** verifica le regole che il gioco non lascia vedere:
la soglia di padronanza fra le fasi, il fatto che la padronanza non sia
accumulabile in una sola sessione, la presenza del ripasso in ogni partita e
l'integrita' del curriculum (nessun item orfano, nessun riferimento rotto).

**`smoke-test.html`** tocca a caso i comandi per qualche minuto e riporta gli
errori: verifica che nessun percorso si rompa, compresi quelli assurdi che un
bambino di 7 anni prende davvero.

## Stato del progetto

Vedi `PROGRESS.md` — va tenuto aggiornato a ogni modifica sostanziale.
