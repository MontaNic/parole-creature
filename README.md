# Parole & Creature

Gioco browser per imparare l'inglese, pensato su misura per un bambino di 7 anni:
sessioni brevi, Pepe (una cucciola di Jack Russell) che guida a voce, mostri e
draghi originali da collezionare. Interfaccia in italiano, contenuti didattici in inglese.

- Nessun build step, nessun framework: HTML/CSS/JS vanilla con ES modules.
- Funziona offline (service worker) e su tablet, Safari iOS incluso.
- Nessun dato esce dal dispositivo: niente account, niente tracciamento, niente pubblicita'.

## Avviare il gioco

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
js/minigames.js          i 6 mini-giochi
js/missions.js           missione del giorno
js/screens.js            home a blocchi di fase, album, riepilogo, onboarding
js/parents.js            area genitori protetta da PIN
content.json             il curriculum: unita', strutture, parole, frasi, creature
strings.json             testi dell'interfaccia in italiano
assets/img/sprites.svg   tutte le illustrazioni (sprite SVG unico)
assets/audio/            audio pre-generati (+ index.json)
sw.js                    cache offline
tools/generate-audio.mjs generazione offline degli audio
tools/curriculum-test.html  test delle regole didattiche
tools/smoke-test.html    test di sfoglio automatico
proxy/cloudflare-worker.js  proxy che custodisce la chiave ElevenLabs
```

## Audio

Il gioco parla in due modi:

1. **File MP3 pre-generati** con ElevenLabs, dentro `assets/audio/`.
   Vengono creati una volta sola, offline, e poi cachati: nessuna chiamata
   all'API mentre il bambino gioca.
2. **Sintesi vocale del browser** come ripiego, per le tracce mancanti.

Il progetto include gia' **113 tracce generate** (2,5 MB): 89 inglesi e 24
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

**Tre voci, tre ruoli.** In `.env`:

- `VOICE_ID_ENGLISH` — il modello di pronuncia: dice tutte le parole e le frasi
  inglesi del curriculum. E' la voce che il bambino deve imitare. (89 tracce)
- `VOICE_ID_PEPE` — la mascotte quando parla in prima persona: accoglienza,
  istruzioni, incoraggiamenti, saluti. (21 tracce)
- `VOICE_ID_NARRATOR` — voce epica in terza persona, riservata ai tre traguardi
  rari: mondo superato, nuova creatura, fase completata. (3 tracce)

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

`content.json` non e' un elenco di parole: e' un corso a 8 unita', ognuna con un
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

Si apre dall'icona in alto a destra ed e' protetta da un PIN di 4 cifre.
**Il PIN non e' una misura di sicurezza informatica**: serve solo a impedire che
un bambino ci entri per sbaglio. Chi conosce gli strumenti del browser lo aggira.

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
