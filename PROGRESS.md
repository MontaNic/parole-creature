# PROGRESS — Parole & Creature (gioco inglese per il bambino)

> Questo file e' lo specchio dello stato reale del progetto.
> Va aggiornato **prima** di ogni modifica sostanziale al codice.

## Stato attuale

**v1.1.0 — curriculum progressivo.**
Mascotte: **Pepe**, una cucciola di Jack Russell. Interfaccia in italiano,
contenuti in inglese.

Rispetto alla v1.0.0, `content.json` non e' piu' un elenco di parole per tema:
e' un corso a 8 unita', ognuna con un obiettivo linguistico dichiarato, con
revisione sistematica delle unita' precedenti e una soglia di padronanza da
superare per cambiare fase.

**Audio generato**: 113 tracce ElevenLabs su tre voci, 2,4 MB. Il gioco parla
con voci vere, non piu' con la sintesi del browser.

**Design system applicato a tutte le schermate** (`design-system.css`,
documentato in `design-system.md`, guida viva in `tools/design-preview.html`).

**43 illustrazioni generate** con Gemini e in uso nel gioco. I 38 sprite
restanti restano simboli SVG per scelta: numeri, colori, icone di interfaccia
e plurali.

Non ancora fatto: playtest reale con il bambino su tablet.

## Dove gira

**Pubblico, in HTTPS**: https://montanic.github.io/parole-creature/
(repo `MontaNic/parole-creature`, GitHub Pages da `main`).

E' pubblico per necessita', non per scelta: su un piano gratuito Pages
richiede un repo pubblico. Prima di pubblicare il nome del bambino e' stato
rimosso da file, titoli, nome del repo e messaggi di commit — la storia e'
stata riscritta e forzata sul remoto. Restano privati, in `.env` sul Mac, la
chiave ElevenLabs, quella Gemini e gli ID delle voci; i progressi di gioco
vivono solo sull'iPad.

Il motivo tecnico: su `http://IP` il browser nega service worker,
`getUserMedia` e `navigator.share`. HTTPS sblocca l'offline e due feature
della fase 2 in un colpo.

**Verificato in HTTPS il 2026-09-07**, da un profilo Chrome nuovo: il
service worker si installa, e la verifica riporta `PASS art 48/48 shell
9/9`. E' la prova che il bug dell'iPad ("niente offline") era davvero il
contesto insicuro di `http://IP` e non il codice.

La prova si ripete con `node tools/cache-check-remote.mjs` (Chrome headless
guidato via DevTools). Non usare `--dump-dom --virtual-time-budget` per
questo: sotto il tempo virtuale CacheStorage non risponde e la verifica si
ferma a meta', simulando un guasto. E' anche saltato fuori che
`cache-check.html` risolveva gli URL contro `location` invece che contro
`<base>`: alla radice passava, sotto `/parole-creature/` no. Corretto.

## Come si avvia

```bash
python3 -m http.server 8080     # dalla cartella del progetto
# gioco:            http://localhost:8080
# test logica:      http://localhost:8080/tools/curriculum-test.html
# test di sfoglio:  http://localhost:8080/tools/smoke-test.html
# palette (daltonismo): node tools/palette-check.mjs
```

---

# Logica del curriculum

## Il problema che risolve

La v1.0.0 raggruppava le parole per tema (creature, colori, numeri...). Un tema
non e' un obiettivo: alla fine di "colori" il bambino sapeva otto parole, ma non
sapeva *dire* niente. E la progressione era solo un contatore: finito un mondo,
si apriva il successivo, indipendentemente da quanto fosse rimasto.

Il curriculum v1.1.0 cambia tre cose.

## 1. Ogni unita' ha un obiettivo linguistico, non un tema

Ogni unita' insegna una **struttura** oltre al lessico, dichiarata in
`content.json` sotto `structures` e collegata all'unita' con `structureIds`.
La progressione delle strutture e' costruita sulle difficolta' specifiche di un
bambino *italiano*, non su un ordine generico:

| # | Unita' | Struttura | Perche' proprio qui |
|---|--------|-----------|---------------------|
| 1 | Valle dei Draghi | `What is it? — A dragon.` | E' la formula che il gioco stesso usa per interrogarlo: impararla subito rende trasparente tutto il resto |
| 2 | Giungla dei Dinosauri | `It's a tooth / It's an egg` | L'articolo che cambia davanti a vocale non esiste in italiano: va sentito molto prima di poterlo spiegare |
| 3 | Grotta dei Colori | `It's a red egg.` | **Il colore va prima del nome.** E' l'errore piu' duraturo degli italiani (*a dragon red*): si previene come formula, non si corregge dopo |
| 4 | Montagna dei Numeri | `How many? — Three.` | I numeri restano lettera morta se non hanno una domanda che li chiama |
| 5 | Foresta delle Parole | `This is a cat / These are cats` | La **-s** del plurale e' quasi impercettibile all'orecchio italiano: si introduce quando la parola scritta la rende visibile |
| 6 | Lago Magico | `The cat is small / The cats are small` | Prima vera regola del corso (**is/are**), e arriva solo dopo che singolare e plurale sono gia' familiari all'occhio |
| 7 | Ponte delle Frasi | `I have a sword / I can see a monster` | Primo passo dal riconoscere al dire qualcosa di proprio |
| 8 | Torre dei Dialoghi | `Is it red? — Yes, it is.` | Chiude il cerchio: usa la struttura con cui il gioco lo interroga dall'unita' 1 |

Le fasi restano tre e definiscono **come** si presenta il materiale, non cosa:

- **Fase 1 — Ascolto e riconoscimento.** La parola scritta non compare mai. Le
  strutture entrano come formule intere, ascoltate e indicate.
- **Fase 2 — La parola scritta.** Rende visibile cio' che l'orecchio ha gia'
  imparato, e usa la scrittura per mostrare quello che l'audio nasconde.
- **Fase 3 — Frasi e mini-dialoghi.** Si costruisce, non si riconosce soltanto.

Un vincolo concreto che ha guidato le scelte: le frasi dell'unita' 3 usano le
**uova colorate** (`It's a red egg`) e non i draghi, perche' i distrattori sono
le altre uova colorate. Cosi' per rispondere bisogna ascoltare *sia* il colore
*sia* il nome. Con un drago verde e la frase "a red dragon" l'immagine avrebbe
contraddetto l'audio.

## 2. Ogni unita' ripassa sistematicamente le precedenti

Ogni unita' dichiara `reviewFrom`: le unita' da cui pescare il ripasso. Una
partita di 8 domande e' composta da **~5 domande nuove + ~3 di ripasso**
(`curriculum.reviewWeight`, 0.35; 0.45 nelle ultime due unita', che hanno poco
materiale nuovo e molto da consolidare).

Le domande di ripasso non vengono accodate in fondo ma **distribuite** fra
quelle nuove (`interleave()` in `game.js`): alternare fa lavorare il richiamo,
metterle tutte alla fine no.

Perche' serviva, visto che c'era gia' la ripetizione spaziata: la SRS *ordina*
dentro un insieme di item, ma non decide quale insieme entra nella partita. Con
la sola SRS, giocando l'unita' 4 le parole dell'unita' 1 non sarebbero mai
ricomparse — nessun meccanismo le avrebbe rimesse sul tavolo. Le due cose
lavorano su piani diversi e servono entrambe.

## 3. Per cambiare fase serve padronanza dimostrata

Il gioco distingue **tre** stati, ed e' la distinzione che regge tutto:

| Stato | Significato | A cosa serve |
|-------|-------------|--------------|
| **visto** | comparso almeno una volta | statistiche |
| **completato** | ogni item dell'unita' indovinato almeno una volta | sblocca la creatura-ricompensa e l'unita' successiva |
| **padroneggiato** | box 3 della SRS: indovinato **piu' volte, in giorni diversi** | sblocca la **fase** successiva |

"Completato" e' generoso apposta: nessun bambino deve restare bloccato.
"Padroneggiato" e' severo apposta: cambiare fase deve significare che la fase
precedente regge davvero.

Per aprire una fase serve l'**80%** degli item della fase precedente
padroneggiati (`curriculum.phaseUnlockRatio`). Con la fase 1 a 50 item, servono
40 parole solide.

### Il dettaglio che rende la soglia reale

La soglia non varrebbe nulla se fosse aggirabile in una sessione fortunata.
Due modifiche alla SRS la rendono seria:

1. **`srsIntervals` parte da 1 e non da 0.** Un item promosso oggi non e' piu'
   "scaduto" fino a domani.
2. **`recordAnswer` promuove solo se l'item era scaduto.** Se una parola
   ricompare due volte nella stessa partita e viene indovinata entrambe le
   volte, il box sale una volta sola.

Conseguenza voluta: **il box sale al massimo una volta al giorno per item**,
quindi "padroneggiato" (box 3) implica almeno 3 giorni distinti. La fase 1
richiede realisticamente 5-7 giorni di gioco quotidiano. E' esattamente il ritmo
per cui il gioco e' pensato — 10 minuti al giorno — non un ostacolo.

L'errore invece retrocede sempre e subito al box 0: se sbagli, sbagli.

### Perche' un cancello non blocca il bambino

Un gate rigido rischia il muro. Tre valvole di sfogo:

- le unita' **dentro** la fase restano tutte aperte e rigiocabili;
- il **ripasso libero** pesca proprio dagli item non ancora solidi
  (`freeReviewPool`), quindi giocarci fa avanzare la soglia;
- un'unita' si apre anche dopo **3 partite**, non solo completandola: una
  singola parola ostica non blocca il percorso;
- i genitori hanno un interruttore **"Sblocca tutte le fasi"** che scavalca la
  soglia, se il bambino e' gia' piu' avanti o se una fase lo sta annoiando.

E soprattutto: la mappa mostra la barra di padronanza della fase **con una tacca
all'80%**, e Pepe dice quante parole mancano. Un traguardo visibile e' un
obiettivo; un cancello muto e' una frustrazione.

### Le tre voci

| Voce (`.env`) | Ruolo | Tracce | Caratteri | Sintesi |
|---|---|---|---|---|
| `VOICE_ID_ENGLISH` | **modello di pronuncia**: tutto il contenuto didattico inglese | 89 (51 parole + 38 frasi) | 893 | `stability 0.70/0.55` |
| `VOICE_ID_PEPE` | **la compagna**: Pepe in prima persona — accoglienza, istruzioni, incoraggiamenti | 21 | 755 | `stability 0.45, style 0.25` |
| `VOICE_ID_NARRATOR` | **il narratore**: annunci epici in terza persona, solo per i traguardi rari | 3 | 162 | `stability 0.60, style 0.35` |

Le separazioni non sono estetiche, e sono due, con due ragioni diverse.

**Inglese contro italiano.** Al bambino deve bastare il timbro per capire se
quello che sente e' da imparare o da capire. E' il segnale piu' immediato che
esista e non richiede lettura. Per questo `p_my_name` ("My name is Pepe."),
dove la mascotte si presenta in inglese, resta sulla voce inglese e non su
quella di Pepe: e' contenuto dell'unita' 8, una pronuncia da **imitare**.

**Pepe contro narratore.** L'epico funziona solo se e' raro. Il narratore ha
tre sole battute — mondo superato, nuova creatura, fase completata — perche'
sono gli unici eventi abbastanza rari perche' l'annuncio resti un evento.
`mission_done` capita ogni giorno e resta a Pepe: darlo al narratore lo
consumerebbe in una settimana.

Chi dice cosa e' dichiarato in `strings.mascotVoices`: dato, non codice.
Default `pepe`, si elencano solo le eccezioni. Spostare una battuta da una
voce all'altra e' una riga — ma se passa al narratore il **testo va riscritto
in terza persona**, altrimenti la voce epica dice "abbiamo" e suona sbagliata.
E' esattamente quello che e' successo alle tre battute attuali.

Le due battute con segnaposto (`session_end` con `{name}`, `locked_phase` con
`{n}`) non sono pre-generabili come sono: `strings.mascotSpoken` contiene la
forma neutra da registrare. Il fumetto continua a mostrare il nome del bambino,
l'audio resta nella voce di Pepe. Meglio la voce vera senza il nome che una
voce robotica col nome.

### Il bambino deve sempre sentire una voce quando sbaglia

Fino alla v1.1 le battute di incoraggiamento (`retry_1/2/3`) esistevano in
`strings.json` ma **non erano collegate a niente**: sbagliando, il gioco
mostrava solo un messaggio di testo. Per un bambino che non sa ancora leggere,
un errore in silenzio non e' feedback neutro: somiglia a un muro. Ed e' il
momento esatto in cui si decide se continuare o mollare.

Ora `fx.bad()` in `game.js` fa parlare Pepe a ogni errore, ruotando fra tre
battute diverse, e i mini-giochi **aspettano** che abbia finito prima di
riproporre la parola. Senza quell'attesa le due voci si sovrapporrebbero.

Per la stessa ragione la riproduzione vocale e' ora **esclusiva**: ogni nuova
battuta interrompe la precedente (`stopVoice()` dentro `playVoice`), e chi
stava aspettando la traccia interrotta prosegue invece di restare appeso. In
un gioco dove la voce *e'* il contenuto, due voci insieme sono peggio del
silenzio.

### Parametri, tutti in un posto

Stanno in `content.json` sotto `curriculum`, non nel codice:

```json
"masteryBox": 3, "unitMasteryRatio": 0.8, "phaseUnlockRatio": 0.8,
"reviewWeight": 0.35, "minReviewItems": 2, "maxBuildWords": 6
```

Le regole che li applicano stanno tutte in `js/curriculum.js`.

---

## Architettura

```
index.html               markup e schermate
design-system.css        token e componenti (font, palette, bottoni, card)
style.css                layout delle schermate, temi, animazioni
game.js                  avvio, navigazione, composizione della partita, clock di sessione
js/config.js             configurazione tecnica (intervalli SRS, parametri di gioco)
js/curriculum.js         REGOLE DIDATTICHE: padronanza, sblocchi, mix nuovo/ripasso
js/state.js              localStorage versionato, migrazioni, export/import, PIN, orari
js/content-loader.js     caricamento content.json / strings.json / sprite SVG
js/audio.js              mp3 pre-generati -> SpeechSynthesis, SFX e musica sintetizzati
js/srs.js                ripetizione spaziata (Leitner, promozione a cadenza giornaliera)
js/mascot.js             Pepe: disegno SVG, evoluzione, battute vocali
js/effects.js            coriandoli / stelle / bolle su canvas + toast
js/minigames.js          i 6 mini-giochi
js/missions.js           missione del giorno (deterministica dalla data)
js/screens.js            home a blocchi di fase, album, riepilogo, onboarding, blocco
js/parents.js            area genitori con PIN e 5 pannelli
content.json             il curriculum (unita', strutture, lessico, frasi, ricompense)
strings.json             testi UI in italiano
assets/img/art/          43 illustrazioni generate (+ index.json)
assets/img/sprites.svg   81 simboli; 38 ancora in uso (numeri, colori, icone, plurali)
assets/audio/index.json  elenco degli mp3 realmente presenti
sw.js                    cache offline
sw-art.js                GENERATO: elenco delle illustrazioni da pre-cachare
tools/check-assets.mjs   integrita' degli asset grafici (6 controlli, senza browser)
tools/generate-images.mjs generazione offline delle illustrazioni
tools/remove-bg.py       sfondo, ritaglio, plurali, indice, lista di precache
tools/generate-audio.mjs generazione offline degli audio
tools/curriculum-test.html  test delle regole didattiche
tools/smoke-test.html    test di sfoglio automatico
proxy/cloudflare-worker.js  proxy che custodisce la chiave ElevenLabs
```

## Funzionalita' implementate

- [x] Curriculum a 8 unita' con obiettivo linguistico esplicito e strutture dichiarate
- [x] Revisione sistematica delle unita' precedenti, distribuita dentro la partita
- [x] Soglia di padronanza (80%) per il passaggio di fase, con padronanza non accumulabile in un giorno
- [x] Mappa raggruppata per fasi, con barra di padronanza e tacca della soglia
- [x] Interruttore genitori per scavalcare la soglia
- [x] Onboarding senza testo da leggere (voce + icone, con tutorial giocato)
- [x] Mascotte Pepe che parla, si anima e evolve in 4 stadi (livelli 1/4/8/13)
- [x] Voce di Pepe a ogni errore, con tre battute a rotazione: mai un errore muto
- [x] Voce narrante separata per i tre traguardi rari (mondo, creatura, fase)
- [x] 6 mini-giochi: abbinamento, ascolta e ripeti, quiz audio, caccia alla parola,
      trascina la parola, ricomponi la frase (solo su frasi fino a 6 parole)
- [x] Modalita' ripasso libero, che punta agli item non ancora solidi
- [x] Ripetizione spaziata (Leitner a 6 box)
- [x] Nessun game over: l'errore riporta all'ascolto e si riprova
- [x] 3 varianti a rotazione di suono + animazione per la risposta giusta
- [x] Album creature: 12 creature, quelle non trovate in silhouette
- [x] Missione del giorno (8 tipi) e streak giornaliera
- [x] Limite di sessione gentile (default 10 min, mai bloccante)
- [x] Area genitori con PIN, orari, giorni, fasi, temi, pausa vacanza
- [x] Dashboard con avanzamento per fase e per unita', obiettivi e strutture
- [x] Pannello mini-ebook con prompt di generazione pronto da copiare
- [x] Export/import del salvataggio su file JSON
- [x] Audio pre-generato con fallback su sintesi vocale del browser
- [x] Funzionamento offline (service worker)
- [x] Due suite di test (`tools/curriculum-test.html`, `tools/smoke-test.html`)

## Contenuti didattici presenti

**89 item totali** distribuiti su 8 unita': 51 parole e 38 frasi.

| Fase | Unita' | Item | Struttura insegnata |
|------|--------|------|---------------------|
| 1 | Valle dei Draghi | 8 parole + 3 frasi | `What is it?` |
| 1 | Giungla dei Dinosauri | 9 parole + 4 frasi | `a` / `an` |
| 1 | Grotta dei Colori | 8 parole + 4 frasi | aggettivo prima del nome |
| 1 | Montagna dei Numeri | 10 parole + 4 frasi | `How many?` |
| 2 | Foresta delle Parole | 8 parole + 5 frasi | `this` / `these`, plurale -s |
| 2 | Lago Magico | 8 parole + 6 frasi | `is` / `are` |
| 3 | Ponte delle Frasi | 6 frasi | `I have` / `I can see` |
| 3 | Torre dei Dialoghi | 6 frasi | domanda e risposta breve |

Lessico: creature fantasy, parti del corpo dei dinosauri, 8 colori, numeri 1-10,
animali e natura, 8 aggettivi.

**Creature dell'album (12)**: Pepe, Fiammino, Codasso, Prisma, Numo, Rametto,
Sciazzo, Baluce, Torrek, Stellina (**premio per aver superato la fase 1**),
Umbra (25 parole padroneggiate), Aladoro (7 giorni di streak).

**Fase 4 — mini-ebook pianificati (6, nessuno ancora generato)**: allineati alle
strutture delle unita' che li sbloccano, cosi' il libretto ripassa esattamente
quello che il gioco ha appena insegnato.

| # | Titolo | Si sblocca dopo | Strutture |
|---|--------|-----------------|-----------|
| 1 | Pepe and the Red Egg | Valle dei Draghi | `What is it?` |
| 2 | The Dinosaur with One Horn | Giungla dei Dinosauri | `a`/`an` |
| 3 | Colors in the Cave | Grotta dei Colori | aggettivo + nome |
| 4 | Ten Little Stars | Montagna dei Numeri | `How many?` |
| 5 | The Happy Knight | Foresta delle Parole | `this/these`, `is/are` |
| 6 | Hello, Friend! | Ponte delle Frasi | `I have`, domande |

**Fase 5 — audiovisivi (6)**, riancorati alle fasi invece che a livelli generici.

## Decisioni tecniche prese

- **ES modules senza build step.** Serve un server statico locale: i browser
  bloccano `fetch` su `file://`.
- **Le regole didattiche stanno in un modulo solo** (`js/curriculum.js`), per
  poter cambiare la didattica senza rovistare nella UI o nei mini-giochi.
- **I parametri del curriculum stanno in `content.json`**, non nel codice.
- **Gli id di parole, frasi e unita' sono permanenti.** Il progresso e'
  indicizzato per id: rinominarne uno equivale a cancellare quello che il
  bambino ha imparato su quell'item. Si aggiunge, non si rinomina.
- **I plurali sono composti riusando i simboli singolari** (`<use>` annidati in
  `sprites.svg`): nessun disegno nuovo, e il plurale resta visibilmente "la
  stessa cosa, ma tante" — esattamente il contrasto che serve per la -s.
- **Un solo sprite SVG** iniettato nel DOM al boot, usato con `<use href="#id">`.
- **Effetti sonori e musica generati con Web Audio API**, non file.
- **La chiave ElevenLabs non tocca mai il client**: sta nel Worker o nel `.env`
  locale, e la usa solo lo script offline.
- **PIN con hash SHA-256**, con il limite dichiarato apertamente nell'interfaccia.

## Changelog

- **2026-09-02** — Scaffold iniziale del progetto.
- **2026-09-03** — Build v1.0.0 completa. Verificata con test di sfoglio
  automatico (0 errori su ~250 tocchi casuali) e screenshot su viewport tablet.
  Corretti: tocchi fuori sequenza nella caccia alla parola, doppio esito nel
  drag&drop, anatomia di Pepe e del mostro nello sprite.
- **2026-09-03** — **v1.1.0, curriculum progressivo.** `content.json`
  ristrutturato come corso a 8 unita' con obiettivi linguistici espliciti,
  strutture dichiarate, `reviewFrom` per la revisione sistematica e parametri
  del curriculum. Nuovo modulo `js/curriculum.js`. SRS con promozione a cadenza
  giornaliera. Mappa raggruppata per fasi con soglia visibile. Dashboard
  genitori con obiettivi e strutture per unita'. Nuova suite
  `tools/curriculum-test.html` (23 controlli, tutti superati). 6 nuovi sprite
  (occhio + 5 plurali composti). Contenuti passati da 62 a 89 item.
- **2026-09-03** — Spostata in `.env` la chiave ElevenLabs che era finita in
  `.env.example` (file tracciato da git). Verificato: nessun segreto nei file
  tracciati ne' nella storia.
- **2026-09-03** — **Due voci distinte** (`VOICE_ID_ENGLISH`,
  `VOICE_ID_NARRATOR`) al posto di una generica. Parametri di sintesi tarati
  per tipo di traccia. Aggiunto `strings.mascotSpoken` per le due battute con
  segnaposto, che prima non venivano generate affatto e finivano alla sintesi
  del browser. Nuovi flag `--plan` e `--dry-run` con riepilogo per voce.
- **2026-09-03** — **Mascotte rinominata da Zibo a Pepe** e ridisegnata: non
  piu' un cucciolo di drago ma una **cucciola di Jack Russell**, bianca con
  orecchio nero, orecchio e macchia marroni sull'occhio. Rinominati anche
  `sp-zibo` -> `sp-pepe` e `c_zibo` -> `c_pepe`; riposizionati i tre accessori
  dell'evoluzione (bandana, cappello a punta, corona) sulla nuova testa;
  ridisegnata `assets/img/icon.svg`. Accordo al femminile nelle due battute in
  cui Pepe parla di se' ("Sono contenta", "Sono cresciuta").
- **2026-09-03** — **Titolo cambiato in "Parole & Creature".** Il vecchio
  "Draghetti & Parole" era legato alla mascotte drago. Restano invariate tre
  stringhe che contengono ancora "draghetti" e che NON vanno mai rinominate:
  la chiave di `localStorage` (rinominarla cancella i progressi), il sale
  dell'hash del PIN (renderebbe irrecuperabile il PIN dei genitori) e il
  marcatore dei file di backup. Nel codice ci sono commenti che lo spiegano.
- **2026-09-03** — **Tre voci** al posto di due: `VOICE_ID_PEPE` per la
  mascotte in prima persona, `VOICE_ID_NARRATOR` ridefinita come voce epica
  in terza persona per i soli traguardi rari. Le tre battute passate al
  narratore sono state riscritte in terza persona. Rigenerate le sole 24
  tracce italiane (`--force --only it/`), le 89 inglesi non toccate.
- **2026-09-03** — **Collegate 6 battute che il gioco non usava.** In
  particolare `retry_1/2/3`: sbagliando, Pepe non diceva niente e restava solo
  un messaggio di testo. Collegate anche `nice_to_meet` (dopo il nome
  nell'onboarding, solo se il nome c'e'), `world_complete` (fine unita',
  narratore), `idle_2` (alternata a `idle_1` sulla home). Ora tutte e 24 le
  battute si sentono davvero. Rimosso il codice morto: `encouragementKey()`
  era definita e mai chiamata, ora ruota sia gli incoraggiamenti sia i
  complimenti.
- **2026-09-07** — **Pubblicato su GitHub Pages.** Repo `MontaNic/parole-creature`,
  pubblico (Pages su piano gratuito lo richiede). Prima di pubblicare: nome
  del bambino tolto da 8 file, dal nome del file del prompt, dal nome del repo
  e dall'unico messaggio di commit che lo citava (storia riscritta, push
  forzato). Verificato subito prima del push: nessun segreto nei file
  tracciati. Fase 2 disegnata in `docs/fase-2.md`.
- **2026-09-06** — **Giocabilita' dopo il secondo playtest.** Frasi fuori
  dai giochi a immagini (audio coerente), conferma scritta in verde dopo ogni
  risposta giusta, ordine dei giochi mescolato, difficolta' a salire dentro la
  partita con sfida finale annunciata, nuovo gioco "vero o falso" in tutte e
  otto le unita', serie ogni tre giuste. Schermata di gioco che sta nello
  schermo per costruzione; home con la sola fase corrente aperta. Quattro
  battute nuove di Pepe generate. Cache a v1.6.0.
  Vedi la sezione "Giocabilita'" per l'analisi.
- **2026-09-05** — **CACHE_VERSION alzata a v1.5.0, e un controllo perche' non
  succeda piu'.** Otto file di codice erano cambiati senza invalidare la cache
  del service worker: su un dispositivo che ha gia' installato il gioco, il
  primo avvio avrebbe servito dalla cache la build precedente, e chi provava
  le novita' non le avrebbe viste. E' un difetto invisibile in sviluppo —
  dove si apre sempre un profilo pulito — e sistematico al playtest, che e'
  l'unico posto dove fa danno. `tools/check-assets.mjs` ora confronta l'ultimo
  commit che ha toccato CACHE_VERSION con i file di codice cambiati dopo, e
  fallisce se il codice e' piu' recente della cache.
- **2026-09-04** — **Impostazioni generali e aiuto scritto progressivo.**
  Nuova scheda "Generali" nell'area genitori con tre cursori di volume
  (musica, voce, effetti), un controllo del funzionamento offline, versione e
  data di build, e l'azzeramento dei progressi con doppia conferma.
  Lo schema del salvataggio passa a **v2**: gli interruttori audio diventano
  volumi 0-100, con migrazione provata sui tre casi possibili.
  Il controllo offline e' la versione lato client di `check-assets.mjs`:
  quello verifica che i file esistano nel progetto, questo che siano gia'
  scesi sul dispositivo. Distingue cio' che blocca (illustrazioni, file del
  gioco) da cio' che non blocca (le tracce audio, che si scaricano giocando e
  senza le quali il gioco ripiega sulla sintesi vocale).
  L'azzeramento non usa `confirm()`: su iPad e' un foglio che si tocca via
  insieme a tutto il resto. Il primo tocco arma il bottone e fa comparire un
  Annulla, il secondo cancella, e dopo dieci secondi si disarma da solo.
  Aggiunto l'**aiuto scritto dopo due errori** sullo stesso item.
  `tools/curriculum-test.html` passa da 25 a 30 controlli.
- **2026-09-03** — **Correzioni dopo il playtest su iPad.**
  Due bug segnalati, tre trovati.

  *Offline.* Il worker leggeva `index.json` durante l'installazione e cachava
  quello che ci trovava. Sembrava equivalente a una lista e non lo era: se
  quella fetch falliva — rete lenta, installazione interrotta — il gioco
  restava senza illustrazioni offline, e online nessuno se ne accorgeva
  perche' continuavano ad arrivare dalla rete. Ora `sw-art.js`, generato
  insieme alle immagini, contiene l'elenco esplicito. Verificato dal log del
  server: con un profilo nuovo il worker richiede tutte e 48 in una sola
  apertura.

  *Immagini rotte anche online.* Non sono riuscito a riprodurlo: in locale
  nessun 404, tutti i 48 file servono, ogni riferimento si risolve. La causa
  probabile e' che il precache apriva ~70 connessioni contemporanee, che su
  un tablet in wifi affamano le richieste che la pagina sta facendo in quel
  momento per le sue immagini, fino a farle scadere. Ora si scarica a gruppi
  di sei. E' una correzione per meccanismo, non per riproduzione: se il
  sintomo tornasse, il sospetto successivo e' un worker vecchio rimasto
  attivo, e si azzera da Impostazioni Safari.

  *Plurali rimasti indietro.* Trovato mentre indagavo: `sp-cats` e gli altri
  quattro erano simboli SVG che riusavano i vecchi disegni, mentre i
  singolari erano diventati PNG. Il bambino vedeva due disegni diversi per la
  stessa cosa, e il confronto "la stessa cosa, ma tante" — cioe' la lezione
  della -s nelle unita' 5 e 6 — non funzionava piu'. Ora i plurali sono
  composti dalle nuove illustrazioni.

  Aggiunto `tools/check-assets.mjs`, che verifica staticamente tutti e tre i
  casi e fallisce se anche un solo riferimento e' rotto.
- **2026-09-03** — **43 illustrazioni generate e messe in uso.**
  `spriteSvg()` restituisce un `<img>` per gli sprite che hanno
  un'illustrazione e resta `<svg><use>` per gli altri 38; il CSS che li veste
  seleziona ora `svg, img`. Le immagini entrano nella cache offline
  all'installazione, a differenza degli audio: se manca un audio il gioco
  ripiega sulla sintesi vocale, se manca un'illustrazione la card resta vuota
  e la domanda diventa impossibile.
  Mettendo le immagini vere nel gioco e' emerso un **bug latente serio**: la
  stessa illustrazione compariva due volte nella stessa griglia di risposte.
  Nel curriculum una parola e la frase che la insegna condividono di proposito
  il disegno (`egg` e `It's an egg.`), ma i distrattori si escludevano per
  `id` invece che per sprite. 18 combinazioni potevano finire nella stessa
  unita'. Corretto in `distractors()`, nella caccia alla parola e in
  `buildSteps`; aggiunta una prova di regressione.
- **2026-09-03** — **Design system applicato a tutte le schermate.**
  `index.html` carica `design-system.css`; `style.css` ha perso i token e i
  componenti duplicati (`.btn`, `.icon-btn`, `.badge`, `.chip-toggle`) e tiene
  solo il layout delle schermate. Andika applicata **solo** ai cinque punti in
  cui compare inglese da imparare (`.word-written`, `.phrase-written`,
  `.choice-text`, `.drag-token`, `.build-chip`): il nome del bambino e i
  numeri dell'HUD restano in Fredoka, perche' il segnale "questo e' inglese"
  vale solo se resta esclusivo. Font e CSS aggiunti alla cache offline.
  Due correzioni emerse solo guardando le schermate vere: la barra
  "padroneggiate" era inchiostro al 50% sopra l'ambra e risultava marrone —
  ed e' poi risultata invisibile sui due mondi che hanno gia' un colore verde;
  e l'ombra delle card spariva sul fondo notte.
- **2026-09-03** — **Design system definito** (`design-system.css`,
  `design-system.md`, anteprima in `tools/design-preview.html`). Due font
  self-hosted scelti dopo un confronto visivo su cinque candidati; palette a
  12 token ancorata al colore di contorno degli sprite; componenti con
  contorno e ombra piena. Il gioco non e' ancora stato convertito.
- **2026-09-03** — **Generate tutte le 113 tracce audio**: 89 inglesi
  (`VOICE_ID_ENGLISH`, 1,6 MB) e 24 italiane (`VOICE_ID_NARRATOR`, 1,1 MB),
  2,5 MB totali, 23 kB di media. Zero errori. Verificato: tutti file MP3
  validi, nessuno vuoto, `assets/audio/index.json` allineato a 113 voci,
  nessuna traccia attesa mancante.
  Due problemi risolti durante la generazione:
  (1) tutte e 113 le richieste fallivano con `fetch failed` per un proxy TLS
  che rifirma i certificati — `curl` funzionava, Node no, perche' usa un
  proprio elenco di CA; lo script ora fa un preflight e si rilancia da solo
  con `--use-system-ca`;
  (2) `playFile` in `js/audio.js` non aveva timeout: se `ended` non fosse mai
  arrivato, il mini-gioco sarebbe rimasto appeso in attesa. Ora c'e' un tetto
  massimo basato sulla durata della traccia.

## Design system

Scelte e razionale completi in **`design-system.md`**. In sintesi:

- **Due font**: Fredoka per l'interfaccia italiana, **Andika solo per
  l'inglese da imparare**. Andika e' disegnata da SIL per chi impara a
  leggere: nella sequenza `Il1` gli altri candidati (Fredoka, Nunito, Baloo 2,
  il font di sistema) producono tre bastoncini identici, Andika tre forme
  distinte, e ha `a` e `g` a un piano come la scrittura a mano. E' la
  differenza fra riconoscere una parola a colpo d'occhio e decodificarla
  lettera per lettera — cioe' quello che il gioco chiede dalla fase 2.
  Verificato con uno specimen a confronto su cinque candidati prima di
  scegliere, non deciso a memoria.
- Entrambi **self-hosted** in `assets/fonts/` (80 kB, licenza OFL): il gioco
  deve funzionare offline, e nessun dato del bambino deve uscire verso un CDN.
- **Palette ancorata a `#2B2140`**, che non e' un colore nuovo ma il contorno
  gia' presente in tutti e 81 gli sprite. Estenderlo a bottoni e card fa
  sembrare l'interfaccia disegnata dalla stessa mano di Pepe.
- **Tre stati, tre colori**: ambra = cosa toccare, brace = riprova, foglia =
  giusto. Un primo `--coral` per la riprova e' stato eliminato perche' era
  indistinguibile dalla brace, e i due comparivano nella stessa schermata.
- **La riprova non e' rossa**: qui non si perde mai. E la distinzione dal
  verde non e' solo di tinta — giusto rimbalza, riprova trema, il che aiuta
  anche chi confonde i due colori.
- Componenti con **contorno spesso e ombra piena senza sfocatura**: gli sprite
  sono piatti, un'ombra sfumata li farebbe sembrare incollati sopra.
- `hover` solo dietro `@media (hover: hover)`: su tablet resterebbe appiccicato.
- Area genitori: stessa identita', tono sobrio via colore e peso, **senza un
  terzo font**.

`design-system.md` include anche le **regole per le illustrazioni** del
messaggio 3, cosi' le immagini generate nasceranno gia' dentro questo stile.

## Illustrazioni

43 immagini in `assets/img/art/`, generate offline e in uso nel gioco.
Pipeline: `tools/generate-images.mjs` (prompt) e `tools/remove-bg.py`
(sfondo, ritaglio, alleggerimento). Revisione: `tools/art-review.html`.

- **Modello**: `gemini-3.1-flash-lite-image`. Imagen 4 Fast non e'
  raggiungibile con questa chiave — i tre endpoint `imagen-*:predict`
  rispondono 404. Lo script accetta `--model`, quindi passare a Imagen
  quando fosse abilitato e' una parola sola.
- **Prompt**: lo stile fisso e' la trascrizione delle 8 regole di
  `design-system.md`, commentata regola per regola. L'unica parte variabile
  e' la descrizione del soggetto in `tools/image-subjects.json`.
- **Sfondo**: **non** rembg. Il modello di matting fotografico ha cancellato
  meta' del corpo di Pepe, che e' un cane bianco su fondo bianco (misurato:
  la meta' inferiore conservava il 20% dei pixel opachi della superiore,
  contro 1.06 sul drago verde). Il metodo `flood` considera sfondo solo il
  quasi-bianco **connesso al bordo**, quindi il bianco dentro la sagoma
  sopravvive. rembg resta con `--metodo rembg`.
- **38 sprite non si generano**: numeri (l'immagine E' il contenuto da
  contare), colori (il contenuto e' la tinta esatta), icone di interfaccia
  (appartengono al design system), plurali (composti dal singolare, ed e'
  quel "la stessa cosa ma tante" a rendere visibile la -s), e `big`/`small`
  (concetti relativi che un riquadro di dimensione fissa non puo' rendere).
- **Distinguibilita' verificata a coppie**, non a occhio. Due misure: la
  distanza di colore trova chi si somiglia, quella di sagoma dice se e' un
  problema vero o solo tinta condivisa. Ha trovato drago e dinosauro a 38 su
  mediana 75 — due parole che il gioco puo' mettere nella stessa griglia — e
  ha evitato di rifare `tree`/`slow`, vicini solo perche' entrambi verdi.
- **Le creature hanno una faccia, gli oggetti no**: e' la regola che tiene
  separate Rametto da `tree` e Fiammino da `hot`.
- **Integrita' verificata staticamente** da `node tools/check-assets.mjs`:
  sei controlli in un secondo, senza browser. Esce con codice 1 se un solo
  riferimento e' rotto. E' il controllo che avrebbe fermato prima del
  playtest i due bug trovati sull'iPad.

## Giocabilita': cosa ha detto il playtest e cosa e' cambiato

Il secondo playtest ha riportato tre cose: audio incoerente, nessuna
conferma visibile, gioco ripetitivo. Analizzando il codice con quei tre
sintomi in mano, le cause erano precise.

**Audio incoerente.** Per lo stesso disegno del drago il bambino sentiva a
volte "dragon" e a volte "What is it? A dragon.": erano due item diversi
(`w_dragon` e `p_q_dragon`) che finivano entrambi nell'abbinamento a
immagini, dove la frase e' solo una versione lunga della parola. Ora ogni
item va in un gioco che sa distinguerlo: le **frasi non entrano** in
abbinamento e caccia, vanno in ascolto, quiz col testo, costruzione e vero o
falso. Nessun audio rigenerato: cambia dove si usa, non cosa dice.

**Nessuna conferma.** Dopo la risposta giusta c'erano suono e coriandoli,
ma mai la parola. Ora compare in verde, in Andika, e vale anche in fase 1:
qui la lettura arriva DOPO la risposta come premio, non prima come aiuto —
e' la stessa distinzione dell'aiuto scritto dopo due errori, dall'altro lato.

**Ripetitivo.** Misurato, non sentito: `buildSteps` ciclava i giochi nello
stesso ordine fisso (abbinamento, ascolto, quiz, caccia, abbinamento…), ogni
partita era identica alla precedente; e la difficolta' era un solo numero
per tutta la partita, quindi nel primo round di ogni unita' erano due scelte
dalla prima domanda all'ultima. Quattro cambiamenti:

- **ordine mescolato**, mai lo stesso gioco due volte di fila;
- **difficolta' a salire dentro la partita**: primo terzo un gradino sotto la
  base, ultimo terzo un gradino sopra, e l'ultima domanda e' sempre la
  **sfida finale** a quattro scelte, annunciata da Pepe. La partita ha una
  forma — inizio facile, culmine in fondo — invece di essere una lista;
- **un gioco nuovo, "vero o falso"**: si vede un'immagine, si sente una
  parola, si decide se e' quella. E' un atto mentale diverso dallo scegliere
  fra quattro — si verifica invece di cercare — e meta' delle volte la
  risposta giusta e' "no";
- **serie**: ogni tre giuste di fila una festa piu' grande e una battuta di
  Pepe. Ritmo senza pressione: niente timer, niente penalita'.

**Scrolling.** Misurato a 768x884 (iPad con la barra di Safari): la
schermata di gioco NON scrollava con due scelte ma si', con quattro o con la
caccia. Ora la tessera e' il minimo fra quanto concede la larghezza e quanto
concede l'altezza (`--tile` in `style.css`, con `--cols`/`--rows` impostati
dal gioco): 2x2 e 3x2 stanno sempre nello schermo, per costruzione. La home
scrollava sempre: ora solo la fase in corso mostra le sue unita', le altre
sono una riga toccabile, e su tablet le quattro unita' stanno su una riga
sola.

## Audio: volumi, non interruttori

Lo schema del salvataggio e' passato a **v2**. `settings.music` e
`settings.sfx`, che erano booleani, sono diventati tre volumi 0-100:
`musicVolume`, `voiceVolume`, `sfxVolume`.

Tre e non due perche' prima la voce non era regolabile affatto, ed e' la cosa
che in questo gioco si sente di piu'. Un cursore solo per tutte le voci —
Pepe, narratore, pronuncia inglese — perche' un genitore ragiona per "quanto
parla forte il gioco", non per ruoli.

I default non sono uguali di proposito: **voce 100** perche' e' il contenuto
(se non si sente, il gioco non insegna), **musica 50** che corrisponde
esattamente al volume con cui era stata progettata (sottofondo, non
protagonista) e lascia margine per alzarla, **effetti 70**.

**Migrazione**: chi aveva la musica accesa la ritrova a 50, cioe' com'era;
chi l'aveva spenta la ritrova a 0. La voce parte al massimo. La migrazione e'
in `MIGRATIONS[1]` di `js/state.js` ed e' stata provata sui tre casi
possibili prima di essere usata.

## Un tocco prima della prima parola

Il 2026-09-07, al primo accesso al sito pubblico, Pepe ha salutato con la
voce sintetica del sistema invece che con la sua. Tutte le 28 battute hanno
il loro mp3 e Pages li serve: non mancava una voce. Strumentando la pagina
sul sito vero e' uscito il motivo:

```
play RIFIUTATO NotAllowedError it/mascot.welcome_first.mp3
SINTESI "Ciao! Io sono Pepe. Giochiamo insieme co"
```

Il saluto partiva al caricamento, prima di qualsiasi tocco, e il browser
rifiuta `play()` senza un gesto dell'utente. Il codice trattava quel rifiuto
come "file mancante" e ripiegava sulla sintesi. Dopo un tocco vero l'mp3
successivo partiva regolarmente. Succedeva a ogni avvio (anche
`welcome_back`), quindi era la prima cosa che il bambino sentiva ogni volta.

Due correzioni, una di esperienza e una di robustezza:

1. **Schermata d'ingresso**: Pepe e un solo bottone, "Tocca per iniziare".
   Il tocco sblocca AudioContext, sintesi e un elemento audio silenzioso
   (per iOS, che sblocca gli `<audio>` solo dentro un gesto); da li' in poi
   ogni `play()` e' consentito. Costa un tocco per avvio; e' la pratica di
   tutte le app per bambini, e con motivo.
2. **Un rifiuto per permesso non e' un file assente**: `playFile` marca
   `NotAllowedError` come `blocked` e `playVoice` in quel caso non passa
   alla sintesi. La battuta resta scritta nel fumetto. La sintesi rimane
   solo per un file davvero mancante, che oggi non esiste.

Verificato con un click vero (protocollo DevTools, non `.click()` da JS,
che non conta come gesto): dopo il tocco `welcome_first.mp3` e `ask_name.mp3`
partono, nessuna chiamata alla sintesi. Due lezioni da harness, per non
ripeterle: la finestra headless di default e' 756x417 e un bottone centrato
puo' cadere fuori viewport (il click colpisce `<html>` e sembra un bug del
gioco: passare `--window-size=1180,820`); e lo smoke test deve conoscere
l'ingresso, altrimenti fa zero click e passa a vuoto.

E una regressione vera, presa da `cache-check-remote` alla prima
esecuzione dopo l'ingresso: la registrazione del service worker stava dopo
l'attesa del tocco, quindi senza tocco niente cache (0/48). Il worker non
ha bisogno di gesti: ora si registra prima dell'ingresso.

## L'aiuto scritto dopo due errori

Sbagliando due volte lo stesso item, compare la forma scritta inglese in
Andika — anche in fase 1, che di testo non ne mostra mai.

La regola vive in una funzione sola, `serveAiutoScritto(errori, showWritten)`
in `js/minigames.js`, esportata e verificata da quattro controlli del test.
Non e' pedanteria: e' una **deroga a una regola didattica**, e una deroga
scritta in mezzo a tre mini-giochi diversi diventa in fretta una regola
diversa. Isolata, si vede a colpo d'occhio che scatta a due errori e mai
prima, e un test fallisce se qualcuno la sposta.

Il perche' della soglia: se il testo comparisse al primo tentativo
diventerebbe un modo per abituarsi a leggere invece che ad ascoltare, proprio
mentre l'ascolto e' cio' che la fase 1 allena. Compare solo dopo una
difficolta' dimostrata.

L'aiuto e' legato all'item e al tentativo: sparisce quando si passa
all'elemento successivo, e nella caccia alla parola viene tolto anche al
cambio di bersaglio dentro lo stesso turno, perche' resterebbe a suggerire la
parola sbagliata.

Applicato ad abbinamento, quiz e caccia. **Non** ad "ascolta e ripeti**": li'
non esiste un percorso di errore — si ascolta e si tocca "Fatto!" — quindi non
c'e' una difficolta' da rilevare. Aggiungerlo avrebbe voluto dire mostrare il
testo sempre, che e' esattamente cio' che la regola vuole evitare.

## La storia a episodi (fase 2, punto 1)

Spina approvata il 2026-09-07: *l'isola dove le creature hanno perso le
parole*. La Nebbia Muta ha tolto la voce alle creature; Pepe sbarca, in
ogni mondo impara le parole di quel posto e una creatura ritrova la voce.
Alla Torre dei Dialoghi parlano tutte insieme e la nebbia si alza.

**Dati**: `content.story` in content.json, prologo + 8 capitoli + epilogo.
Ogni riga ha `who`: `narrator` (VOICE_ID_NARRATOR, che finalmente ha il suo
ruolo), `pepe` (VOICE_ID_PEPE) o `creature` (la prima frase della creatura,
in inglese, voce modello VOICE_ID_ENGLISH, con la traduzione mostrata sotto).
30 righe italiane, 8 inglesi. Le frasi inglesi usano il lessico e le
strutture dell'unita' appena chiusa: sono inglese da imparare, non
decorazione. Audio: `it/story.<capitolo>.<riga>.mp3` e
`en/story.<capitolo>.mp3`, generati da `tools/generate-audio.mjs` come tutto
il resto.

**Quando scatta**: il prologo al primo avvio dopo l'onboarding (per chi ha
gia' un salvataggio, all'avvio successivo, una volta sola). Ogni capitolo
quando la sua creatura si sblocca: dopo il riepilogo con la festa, al tocco
su "Continua" o "Home", prima di proseguire. L'epilogo non alla soglia della
fase 3 come scritto nel disegno iniziale — la Torre sta *dentro* la fase 3,
quindi sarebbe arrivato prima del capitolo 8 — ma subito dopo il capitolo
di Torrek. Mai due volte da sole.

**Dove si rivede**: nell'album, una striscia di dieci capitoli sopra le
creature (Pepe, le otto creature, una stella per il finale); i capitoli
delle creature non ancora trovate sono in ombra. Toccare una creatura
trovata riapre il suo capitolo.

**Come si vede**: `#screen-story`, sfondo tinto col colore del mondo,
Pepe a sinistra e la creatura a destra (nell'epilogo, tutte e otto). Le
battute scorrono a tocco con "Avanti"; chi parla si anima, chi ascolta si
attenua; il narratore e' una didascalia bianca senza fumetto. L'inglese
della creatura e' in Andika, come ogni inglese del gioco. "Salta" piccolo
per il genitore. Nessuna illustrazione nuova.

**Persistenza**: `save.progress.storySeen[id]`, riempito dai default per i
salvataggi vecchi (nessuna migrazione). Gli id `st_*` sono permanenti.

## Gli scrigni a sorpresa (fase 2, punto 2)

Uno scrigno compare di rado, senza preavviso, in mezzo a una partita: non
nel primo passo, non nella sfida finale, mai nella primissima partita, mai
piu' di uno al giorno (`save.daily.chestOpened`, azzerato dal cambio
giorno), con probabilita' `CONFIG.chest.chance` (0,2) per partita.
La decisione e' presa a inizio partita da `planChest` in `js/chests.js`,
una funzione pura con il generatore iniettabile: cosi' il test la prova
davvero, non a caso.

Dentro c'e' un **adesivo**: una delle 12 parole-illustrazione scelte
(spada, scudo, castello, uovo, stella, luna, sole, osso, corno, ala, nido,
pesce). Nessuna immagine nuova: l'adesivo e' la parola da collezione, con
la scritta inglese in Andika e la pronuncia al tocco — anche la sorpresa
ripassa. Quando gli adesivi sono finiti, lo scrigno regala stelle
(`CONFIG.chest.xpBonus`). La "creatura rara fuori curriculum" del disegno
iniziale e' rimandata: vorrebbe un'illustrazione nuova, e le tre creature
rare esistenti (Stellina, Umbra, Aladoro) hanno gia' le loro regole.

Tre battute nuove di Pepe (`chest_found`, `chest_sticker`, `chest_stars`),
generate con ElevenLabs prima di pubblicare. Gli adesivi vivono in
`save.progress.stickers` e si vedono nell'album, sotto le creature.

## La registrazione della voce (fase 2, punto 3)

Nel gioco "ascolta e ripeti" — l'unico dove ripetere e' gia' l'esercizio —
compare un microfono: il bambino si registra dicendo la parola e si
riascolta subito. **Nessuna valutazione**, come da spec: il piacere di
sentirsi parlare inglese. Poi puo' riascoltarsi quante volte vuole, o
registrare di nuovo.

Regole: la registrazione vive in memoria e sparisce alla domanda dopo;
niente salvato, niente inviato, il microfono viene rilasciato appena si
ferma (l'indicatore rosso di iOS si spegne). Massimo 4 secondi, poi si
ferma da sola. Il bottone compare solo dove serve: contesto sicuro (HTTPS),
`MediaRecorder` disponibile, e l'interruttore dei genitori acceso
(`settings.voiceRecording`, acceso di default, in "Impostazioni generali").
Se il permesso al microfono viene negato, il bottone sparisce e la partita
continua come prima. Formato scelto a runtime fra `audio/mp4` (Safari) e
`audio/webm` (Chrome): `pickMimeType` in `js/recorder.js`, testato.
Una battuta nuova di Pepe (`record_done`), detta la prima volta per
sessione. `stats.totalRecordings` conta quante volte e' successo.

## La condivisione in famiglia (fase 2, punto 4)

A fine partita, sotto "Continua", un bottone "Condividi": il riepilogo
diventa un'immagine (1200x630, disegnata su canvas con Pepe, le stelle, il
punteggio, l'unita', la creatura trovata se c'e', la striscia di giorni) e
passa al foglio di condivisione del sistema con `navigator.share` e un
file. Nessun server, nessun account: da li' in poi e' Messaggi, WhatsApp,
Mail, quello che c'e' sul dispositivo.

Il bottone compare solo dove funziona: `navigator.canShare({ files })`
(iOS 15+, Android Chrome, non Safari desktop) e con l'interruttore dei
genitori acceso (`settings.familySharing`, default acceso: un bambino con
un foglio di condivisione in mano puo' anche mandare l'immagine a chi
capita, e un genitore deve poterlo spegnere). Annullare la condivisione non
e' un errore: il gioco tace. La carta si costruisce in `js/share.js`
(`buildSummaryCard`, testata in headless: dimensioni e PNG valido); le
immagini di Pepe e delle creature sono i PNG gia' in cache, quindi funziona
anche senza rete. Nessun audio nuovo: il tocco e' del genitore accanto.

Misurando dove finisse il bottone e' saltato fuori un bug piu' vecchio:
su iPad orizzontale (viewport ~680px) il riepilogo con una creatura nuova
era alto ~970px e la schermata non scorreva, quindi "Continua" e "Home"
stavano sotto il bordo. In verticale non si vedeva. Ora `#screen-summary`
scorre e il corpo si centra con `margin: auto`, che non taglia mai la cima.

## La tana (fase 2, punto 5)

Uno spazio suo. Dalla home, accanto all'album, "Tana": una stanza (parete e
pavimento disegnati in CSS, quattro colori di parete a scelta) dove il
bambino mette le cose che ha guadagnato: Pepe, le creature trovate, gli
adesivi degli scrigni. Sotto, un vassoio con quello che non e' ancora nella
stanza: un tocco lo mette al centro, poi si trascina dove si vuole (pointer
events, coordinate in percentuale della stanza, quindi la disposizione
regge in verticale e in orizzontale). Toccare una cosa nella stanza la
porta davanti e la fa parlare: la parola inglese per gli adesivi, il nome
per le creature. Trascinarla sul vassoio la ripone.

Tutto in `save.den` (`placed: { id: {x, y, z} }`, `wall`), riempito dai
default per i salvataggi vecchi. La logica pura — cosa e' disponibile,
dove si puo' mettere, il clamp — sta in `js/den.js` ed e' testata; il
trascinamento e' provato via DevTools con eventi del mouse veri.
Una battuta di Pepe (`den_welcome`), la prima volta per sessione.

E' la piu' incerta delle cinque: a 7 anni il senso di possesso puo'
funzionare molto o per niente. Da guardare al playtest: ci torna da solo?

## Fase 3 — la roadmap del prompt master

Dopo il terzo playtest (2026-09-07, "benissimo") si passa alle voci della
roadmap: PWA installabile, dashboard con grafici nel tempo, badge, palette
per il daltonismo, criteri di successo. Ogni punto con il suo check.

### 1. PWA installabile con icone vere

Il manifest aveva una sola icona SVG. Safari su iPad ignora il manifest per
l'icona della Home e vuole `<link rel="apple-touch-icon">` con un PNG
quadrato: senza, l'icona sulla Home era uno screenshot. Ora ci sono quattro
PNG in `assets/img/icons/` (180 Apple, 192, 512, 512 "maskable" con il
soggetto al 78% nella zona sicura di Android), rasterizzati da `icon.svg`
con Chrome headless (nessun rasterizzatore installato sul Mac). Il PNG
Apple ha il fondo pieno: angoli trasparenti su iOS diventano neri.
Manifest e `index.html` aggiornati; icone e manifest entrano nella
precache. Nell'area genitori, sotto le impostazioni generali, un riquadro
"Aggiungi alla schermata Home" con i due passi, che sparisce quando il
gioco gira gia' installato (`display-mode: standalone`).

### 2. Storico giornaliero, grafico e criteri di successo

Finora il salvataggio aveva solo totali: impossibile dire se il bambino
gioca *con regolarita'*, che e' l'unica cosa che conta per una lingua. Ora
`save.history[giorno]` accumula risposte giuste e sbagliate, minuti,
partite e una foto delle parole padroneggiate a fine partita
(`js/history.js`, funzioni pure con la data iniettabile, testate; si
tengono 90 giorni). Nel pannello progressi dei genitori:

- **Ultimi 14 giorni**: un grafico SVG disegnato a mano (nessuna libreria):
  barre dei minuti per giorno, e sopra ogni barra la precisione del giorno.
  I giorni senza gioco restano vuoti, ed e' proprio quello che si deve
  vedere.
- **Criteri di successo**, come chiedeva il prompt master, resi misurabili
  in `CONFIG.success`: almeno 10 giorni giocati su 14, e 40 parole
  padroneggiate (poco piu' di meta' del lessico). Due barre con l'esito.
  I numeri sono una prima taratura, non un verdetto: si cambiano in
  config.js.

### 3. I giochi bonus: "Bolle" (idea del 2026-09-07)

Proposta dopo il terzo playtest: ogni tanto un giochino breve, alla Super
Pang, come premio, contro la monotonia. Accolta con quattro regole, perche'
un arcade puro rischia di svuotare il gioco del suo motivo:

1. **breve**: 45 secondi, poi "Fine!" senza game over ne' punizioni;
2. **raro abbastanza da restare un premio**: dopo una partita da tre
   stelle, non piu' di uno ogni tre partite e tre al giorno (`planBonus`,
   pura, testata);
3. **l'inglese resta dentro, ma passivo**: la voce dice una parola e si
   scoppia la bolla con quella figura. Nessun effetto sulla ripetizione
   spaziata: non e' un test, e' un premio che ripassa;
4. **niente illustrazioni nuove**: le bolle usano i PNG gia' validati
   (31 parole ne hanno uno); se la partita ne offre meno di 4 il bonus
   semplicemente non scatta.

Il modello (`BubbleWorld`: bolle che rimbalzano sulle quattro pareti,
hit test dall'alto) e' separato dal disegno su canvas, cosi' il test lo
prova senza browser vero. Scatta dopo il riepilogo e dopo l'eventuale
capitolo della storia, al tocco su "Continua". Due battute di Pepe
(`bonus_start`, `bonus_end`). Altri giochini brevi possono entrare con lo
stesso contratto: `playX({ items, showWritten })` che si risolve a fine
partita.

### 4. I distintivi

Dieci traguardi di lungo periodo, per dare un motivo che duri oltre la
partita: prima partita, 3 e 7 giorni di fila, 10/25/50 parole
padroneggiate, le quattro creature della fase 1, il primo scrigno, tutti
gli adesivi, la storia finita, la prima registrazione. Definiti in
`js/badges.js` con una condizione pura sul salvataggio (testata), con id
`bd_*` permanenti in `save.progress.badges`. Si valutano a fine partita e
si annunciano nel riepilogo (fila di distintivi nuovi + una battuta di Pepe,
`badge_new`); si rivedono nell'album, sotto gli adesivi, con quelli non
ancora presi in ombra e la loro descrizione, cosi' il bambino sa cosa
inseguire. Nessuna icona nuova: si usano quelle del gioco.

### 5. La palette per chi confonde i colori

`tools/palette-check.mjs` legge i token da design-system.css, simula
protanopia, deuteranopia e tritanopia (matrici di Machado 2009) e misura
il contrasto WCAG delle coppie testo/fondo usate davvero e la
distinguibilita' (Delta E) delle coppie di colori che portano significati
diversi nella stessa schermata. Prima corsa: contrasti tutti a posto;
**giusto contro riprova (foglia contro brace) in protanopia Delta E 10**,
cioe' lo stesso colore. Erano gli anelli attorno alle risposte, che possono
comparire nella stessa griglia a pochi decimi di distanza.

Correzione senza toccare la palette approvata: due token semantici,
`--ring-good` (foglia) e `--ring-retry` (brace *scura*), e l'anello riprova
diventa **tratteggiato**: si distingue per luminosita' e per forma, non
solo per tinta. Delta E in protanopia da 10 a 26. Foglia contro cielo in
tritanopia resta a 15, ma sono stati sequenziali (trascina-qui, poi giusto)
con anche una scala diversa: misurato e riportato, non bloccante.
Il check e' esce con 1 se una soglia salta ed entra fra i controlli.

## Anno 2 del curriculum e giochi bonus (2026-09-07, sera)

Due decisioni del genitore: i contenuti nuovi seguono un modello di crescita
didattica "simil ministeriale" con l'obiettivo di imparare come un bambino
anglofono, giocando; il secondo gioco bonus lo scelgo io con una classifica.

- **Curriculum, anno 2**: modello e sillabo completo in
  `docs/curriculum-2.md`. Due bussole: i traguardi delle Indicazioni
  nazionali (A1 a fine primaria, quattro abilita') e il modo in cui un
  bambino anglofono accumula lessico per campi, comandi TPR e parole ad
  alta frequenza dentro formule. Tre fasi nuove (6-7-8) da quattro unita'
  (9-20), ~100 parole e ~65 frasi, parola scritta sempre mostrata. Si
  costruisce a lotti di una fase, con illustrazioni Gemini, audio
  ElevenLabs e il check dopo ognuno.
- **Giochi bonus**: classifica di dieci meccaniche arcade in
  `docs/giochi-bonus.md`, con criteri espliciti (dito, senza game over,
  inglese dentro, costo, diversita' da Bolle). Vince "Spunta!", il
  Whac-A-Mole: la voce dice la parola prima che la figura spunti, e
  l'attesa diventa ascolto. Poi "Il cestino".

### "Spunta!", il secondo gioco bonus

Il Whac-A-Mole della classifica: nove buchi, le figure spuntano una alla
volta e restano un secondo; la voce dice la parola *prima* che la figura
giusta spunti, cosi' l'attesa e' ascolto. Tocco secco, nessuna punizione:
una spunta persa non costa nulla, il bersaglio ricompare entro due spunte
(`MoleWorld.next`, garantito e testato). Stesso contratto di Bolle
(`play({ items, showWritten })`), stesso schermo, stesse immagini. Fra i
due si alterna a caso senza ripetere l'ultimo (`save.stats.lastBonus`).

### Anno 2, lotto 1: la fase 6 "Io e i miei" (unita' 9-12)

Fatto e pubblicato (contentVersion 2.1.0, app 1.7.0): 32 parole, 24 frasi,
4 strutture (`st_this_is_my`, `st_touch_your`, `st_put_on`,
`st_feelings`), 4 unita' con 4 creature nuove (Nonnetta, Gigione,
Sartina, Nuvolo), le fasi 6-7-8 dichiarate (7 e 8 ancora senza unita',
quindi non compaiono in home). Ogni unita' nuova ripassa *tutte* le
precedenti, come la regola dell'anno 1 (il test lo pretende).

Illustrazioni: 36 generate con Gemini in un batch (una rifiutata per
carico e rifatta), sfondo tolto col metodo flood, 84 PNG in precache.
La misura delle coppie confondibili ha segnalato tre casi reali, rifatti
con prompt diversi: naso di profilo (era un uovo color pelle), Gigione
verde (era la palette di Fiammino), annoiato rosa (era viola come
spaventato). Le facce delle emozioni seguono lo stile di happy/sad
(faccine tonde), non Pepe. Audio: 56 tracce inglesi nuove, nessuna
rigenerata, indice a 219.

Da guardare al playtest: la parola scritta sempre mostrata in fase 6 e'
un aiuto o una distrazione? "friend" (due bambini) si legge a 80px?

### Anno 2, lotto 2: la fase 7 "Ogni giorno" (unita' 13-16)

Fatto e pubblicato (contentVersion 2.2.0, app 1.8.0): 38 parole, 24 frasi,
5 strutture (`st_i_like`, `st_do_you_like`, `st_on_in_under`,
`st_can_i_have`, `st_i_can`), 4 unita' (cucina, casa, scuola, azioni) con
Pasticcio, Chiavetta, Maestrino, Saltello. Le dieci azioni sono Pepe che
le fa (correre, saltare, nuotare...): e' la prima volta che la mascotte
compare come soggetto di una parola, e regge. Illustrazioni: 42 in un
batch senza errori, 126 PNG in precache; la misura ha segnalato pizza
(tonda come le faccine: ora e' una fetta), righello (giallo come la
matita: ora azzurro) e porta (marrone come Maestrino: ora azzurra).
Audio: 62 tracce inglesi, indice a 281.

Verificato offline sul sito: 126/126 illustrazioni in cache. Nota da
harness: con 126 PNG (batch da 6) il precache non entra piu' nei 40 s che
`cache-check-remote` aspettava, e la prova dava 90/126 senza che nulla
fosse rotto. Ora aspetta 90 s di default (`--attesa` per cambiare); su
iPad il primo avvio con rete va lasciato aperto un minuto abbondante.

Preparati anche i simboli schematici per la fase 8 in `sprites.svg`:
numeri 11-20 in cornici da dieci (blu i primi dieci, ambra gli altri),
sette fogli di calendario con l'abbreviazione inglese in Andika, dodici
orologi con l'ora in punto. Come i numeri 1-10: schematici, non
illustrati.

### Anno 2, lotto 3: la fase 8 "Il mio mondo" (unita' 17-20). Anno 2 completo

Fatto e pubblicato (contentVersion 2.3.0, app 2.0.0): 46 parole (di cui
17 schematiche: sette giorni, numeri 11-20), 24 frasi, 6 strutture
(`st_weather`, `st_today_is`, `st_what_time`, `st_routine`,
`st_lets_go`, `st_how_old`), 4 unita' con Ventolino, Ticchetto, Rotolino,
Festino. Illustrazioni: 33 con Gemini; cinque scene (mattina, pomeriggio,
sera, notte, spiaggia) erano uscite incorniciate come cartoline e sono
state rifatte come ritagli, con l'istruzione esplicita "niente cielo,
niente cornice"; 159 PNG in precache. Audio: 70 tracce inglesi, indice a
351. Il calendario e gli orologi funzionano nei mini-giochi come i numeri.

**Il gioco ora ha 20 unita', 167 parole e 110 frasi**: il sillabo di
`docs/curriculum-2.md` e' realizzato per intero. Dalle prime otto unita'
alla Festa Finale il percorso copre i campi lessicali e le funzioni delle
Indicazioni nazionali per la primaria, fino all'ingresso nell'A1.

### La storia, stagione 2 (fasi 6-8)

Le dodici creature dell'anno 2 hanno i loro capitoli: *La lettera*, un
invito a una festa dall'altra parte dell'isola, nel paese delle persone.
Prologo (scatta quando si apre la fase 6, o al primo avvio per chi l'ha
gia' aperta), dodici capitoli (uno per unita', dopo il riepilogo che
consegna la creatura), epilogo dopo Festino. 42 righe italiane e 12
inglesi, tutte con la loro traccia; l'inglese di ogni creatura usa le
strutture della sua unita'. In content.json i capitoli hanno `season` e
`number` (il numero mostrato e' quello dell'unita'); il trigger nuovo
`phase` e' gestito da `pendingAfterRound(newCreatures, phaseUnlocked)` e
`pendingAtStart`. L'epilogo mostra le creature della propria stagione.
La striscia dell'album ora ha 24 tondi. curriculum-test 88 -> 91.

## Anno 3 del curriculum (dall'8 settembre 2026)

Sillabo in `docs/curriculum-3.md`: tre fasi (9 "Io e gli altri", 10 "Nel
mondo", 11 "Racconto"), unita' 21-32, ~120 parole e ~70 frasi. Descrivere,
muoversi nel mondo, raccontare: i traguardi di quarta e quinta. A lotti
di una fase, con il check dopo ognuno, come l'anno 2.

### Anno 3, lotto 1: la fase 9 "Io e gli altri" (unita' 21-24)

Fatto e pubblicato (contentVersion 3.0.0, app 2.1.0): 40 parole, 24 frasi,
4 strutture (`st_has_got`, `st_animal_can`, `st_like_playing`,
`st_jobs`), 4 unita' (ritratto, animali, sport, mestieri) con Specchietto,
Chicco, Golino, Timbrino; fasi 9-10-11 dichiarate. Il ritratto e' fatto di
persone diverse, una per tratto (capelli lunghi, ricci, biondi, occhiali,
barba, baffi, lentiggini, alto, basso): descrivere vuol dire distinguere.
Illustrazioni: 44 in un batch (Timbrino rifatto: era uscito come un
cagnolino col cappello, non un timbro); 203 PNG in precache. Audio: 64
tracce, indice a 469. Le fasi 10 e 11 sono gia' scritte in bozza (parole,
frasi, soggetti) e i loro simboli schematici — frecce, decine, dodici
mesi, mezze ore — sono in `sprites.svg`.

**Il rabbocco del service worker.** La prova offline del lotto 1 dava
158/203 dopo 200 secondi e ha fatto guardare `sw.js`: un file fallito al
precache (un 404 transitorio della CDN subito dopo un deploy, una
connessione caduta) veniva contato e mai piu' ritentato in quella
versione. Ora `topUp()` ricontrolla la lista all'attivazione e a ogni
apertura del gioco e scarica solo i mancanti, in sottofondo. Provato in
locale togliendo un PNG durante il precache e rimettendolo: alla
riapertura successiva e' in cache. Con 200+ illustrazioni il primo avvio
con rete resta lungo (3-4 minuti): dirlo al genitore.

### Anno 3, lotto 2: la fase 10 "Nel mondo" (unita' 25-28)

Fatto e pubblicato (contentVersion 3.1.0, app 2.2.0): 40 parole (4
schematiche: decine e cento; frecce per left/right), 24 frasi, 4
strutture (`st_directions`, `st_how_much`, `st_whats_the_matter`,
`st_there_is`), 4 unita' (citta', mercato, dottore, natura) con
Semaforino, Monetina, Cerottino, Sassolino. Le posizioni (behind, next
to, in front of) sono Pepe e una cassa azzurra, tre volte: e' la
differenza a insegnare la parola. Illustrazioni: 38 in un batch, il
deserto rifatto come ritaglio; 241 PNG in precache. Audio: 64 tracce,
indice a 533.

### Il precache che non finiva: la causa vera (v1.8.5)

Il lotto 2 dell'anno 3 ha portato la cache a 241 illustrazioni e la prova
offline sul sito ha smesso di passare (158/203, poi 135/241, poi 54): la
cache si fermava sempre a un prefisso alfabetico della lista. Con i
lifecycle event del worker catturati via DevTools e' uscito l'errore:
*"ServiceWorker failed to install: Operation has failed (unknown
reason)"*. Erano due difetti sommati:

1. **l'installazione durava troppo**: tutte le illustrazioni dentro
   l'evento `install`, e con 200+ file Chrome abbatteva il worker a meta',
   lasciando cache parziale e registrazione nulla (in locale, a 10 s, non
   si vedeva mai);
2. **un fetch dal worker restava appeso** sulla CDN, senza timeout, e
   bloccava per sempre anche il rabbocco.

Ora l'install scarica solo la shell (poco, veloce, non puo' fallire per
durata); le illustrazioni arrivano **a pezzi da 24**, chiesti dalla pagina
al worker con un messaggio finche' non manca nulla (`window.__rabbocco`
per i test); ogni fetch ha un **timeout di 12 s** e tre tentativi. Sul
sito: 273 voci in 30 secondi, worker attivo, mancanti 0. Se il bambino
chiude prima, la prossima apertura riprende da dove era.

Il tool `cache-check-remote` ora basta con `--attesa 60`.

**Gemini**: i crediti prepagati sono finiti ("prepayment credits are
depleted") sulle 39 illustrazioni della fase 11. Testo, unita' e audio
della fase 11 sono pronti in `docs/lotti/fase-11.json` (parole, frasi,
strutture, unita', creature e i 40 prompt del batch 8) e nelle 72 tracce
gia' generate; si uniscono a content.json quando i crediti tornano, con
lo stesso script di unione usato per la fase 10.

### Anno 3, lotto 3: la fase 11 "Racconto" (unita' 29-32). Anno 3 completo

Fatto e pubblicato (contentVersion 3.2.0, app 3.0.0) appena i crediti
Gemini sono tornati: 48 parole (12 mesi schematici), 24 frasi, 4
strutture (`st_daily_routine`, `st_present_continuous`,
`st_months_festivals`, `st_past_future`), 4 unita' (giornata, cosa stai
facendo, mesi e feste, ieri e domani) con Pigiamino, Riflesso, Zucchetta,
Valigetta. Venti illustrazioni sono Pepe che fa qualcosa (si alza, si
lava i denti, legge, dipinge...): la mascotte come soggetto regge anche
qui. 40 in un batch senza rifacimenti; 281 PNG in precache. Audio: 72
tracce, indice a 605.

**Il gioco ora ha 32 unita', 295 parole e 182 frasi**: i sillabi degli
anni 2 e 3 sono realizzati per intero. Dalla Valle dei Draghi a "Ieri e
domani" il percorso copre i campi lessicali, le funzioni e i traguardi
delle Indicazioni nazionali per la primaria, fino a un A1 pieno con i
primi mattoni dell'A2. L'anno finisce con Pepe che parte per il mondo:
una stagione 3 della storia avra' senso quando le fasi 9-11 saranno
giocate.

### Playtest dell'8 settembre: la conferma verde e lo scroll

Segnalazione del genitore giocando dall'inizio: la conferma verde spesso
si sovrapponeva al bottone verde, e a volte bisognava scorrere. Misurato
con DevTools su dieci combinazioni gioco/item a tre dimensioni di iPad
(orizzontale con barra di Safari 1180x740, orizzontale da Home 1180x820,
verticale 820x1080): la conferma scritta e l'aiuto scritto stavano *nel
flusso* dell'area di gioco, che non scrolla per costruzione, e la facevano
sbordare (fino a 86px nel trascina-qui, 38px nel tocca-l'immagine): il
contenuto centrato slittava e la conferma finiva sull'ultimo bottone.
Ora i due riquadri sono **fuori dal flusso**, in alto sopra la consegna,
senza intercettare i tocchi. Il trascina-qui aveva anche uno sbordo suo
(31px in orizzontale): le caselle ora sono limitate dall'altezza come le
tessere della griglia. Dopo: zero sbordo in tutte e trenta le combinazioni.

## Verso il prodotto finito (8 settembre, sera)

Il genitore ha chiesto di arrivare a un prodotto "finito", in autonomia.
Fatto in questo giro (versione 3.1.0):

- **Fondo su PC a schermo intero**: era `background-attachment: fixed` sul
  body, che dopo un ridimensionamento alcuni browser non ridipingono e
  lasciano bordi scoperti. Il fondo notte ora sta sulla radice `html`, che
  il browser dipinge sempre su tutta la finestra. Verificato a 2560x1080.
- **La storia, stagione 3** "La mappa" (fasi 9-11): prologo quando si apre
  la fase 9, dodici capitoli per le creature dell'anno 3, epilogo con
  Pepe che sale sull'aereo dopo Valigetta. 54 tracce. In totale 38 scene
  in tre stagioni.
- **Il cestino**, terzo gioco bonus dalla classifica: le figure cadono, il
  cestino si trascina col dito, si prende solo quella detta dalla voce; le
  altre rimbalzano via senza costare nulla. `BasketWorld` puro e testato;
  si alterna con Bolle e Spunta senza ripetersi. curriculum-test 91 -> 96.

### Il rabbocco, versione definitiva (v1.9.0)

Dopo la correzione dell'install a meta' restava un'intermittenza: la
prova offline sul sito a volte si fermava (168/281, 123/281) mentre la
misura con DevTools ogni 10 s arrivava sempre in fondo. La differenza era
la pagina: il giro successivo lo chiedeva un `setTimeout` della pagina,
che il browser rallenta quando la scheda e' ferma. Ora un solo messaggio
`rabbocca` fa fare al worker **tutti i giri dentro un unico evento**
(fino a 4 minuti), con limite di tempo per file (15 s, fetch e scrittura)
e per giro (60 s); la pagina lo rilancia ogni 5 s solo se a fine corsa
manca ancora qualcosa. Tre prove ufficiali di fila sul sito: 281/281.

`docs/guida-genitori.md`: una pagina per chi accompagna il bambino.
README aggiornato ai numeri di oggi.

### I libretti: i mini-ebook scritti e leggibili nel gioco (v3.2.0)

La fase 4 era rimasta "da generare altrove": sei schede con titolo,
sinossi, lessico e strutture, e un prompt da copiare. Ora i sei libretti
sono **scritti** (8 pagine ciascuno, 62-104 parole, solo lessico del gioco
piu' poche parole di servizio: un test lo verifica) e **leggibili nel
gioco**: nell'album, sotto gli adesivi, una mensola di copertine; ogni
pagina ha un'illustrazione del gioco, il testo in Andika e la sua traccia
(48 tracce con la voce modello). Un libretto si apre completando l'unita'
indicata nella scheda (`bookUnlocked`), e "The end!" lo segna letto
(`save.ebooks[id].status = 'read'`, visibile nell'area genitori). Le
schede restano per chi vuole rigenerarli per Kindle. E' la lettura che le
Indicazioni chiedono: parole imparate a orecchio, ritrovate scritte in un
testo continuo. curriculum-test 96 -> 101.

## Dal riconoscere al produrre (9 settembre 2026)

Il resoconto onesto del prodotto finito diceva: quasi tutto chiede di
riconoscere, poco di produrre. Sette rimedi possibili, in ordine; il
genitore ha dato il via.

### 1. "Dillo tu"

Un tipo di turno nuovo, in tutte le unita': figura (e per le frasi la
frase in italiano), nessuna scelta. Pepe dice "adesso dillo tu, ad alta
voce" e il bambino deve *produrre* prima di sentire il modello. Poi
"Ascolta": prima la sua registrazione se l'ha fatta, poi la voce modello,
in fila; infine si giudica da solo, "Uguale!" o "Quasi". Nessun voto:
"Uguale" conta come risposta giusta, "Quasi" come esposizione (come
ripetere). La parola scritta arriva dopo l'ascolto, in verde, come sempre.

Sopra, come opzione dei genitori spenta di default: la **conferma morbida**
del riconoscimento vocale del browser (Web Speech, `js/speech.js`). Con il
microfono acceso il bambino parla; se fra le alternative riconosciute c'e'
la parola giusta, Pepe dice "ho sentito: dragon!" con coriandoli;
altrimenti "non ho capito bene: ascolta e riprova", senza costo. Il
confronto e' tollerante (`matchesTarget`, testato): confronta parole
normalizzate, accetta la frase intera o la parola chiave. Va detto nella
scheda dell'opzione: su iPad il riconoscimento passa dai server di Apple,
ed e' l'unico caso in cui un suono esce dal dispositivo. Per questo e'
spento finche' un genitore non lo accende.

### 2. "Dialoghi"

Uno per unita', 32 in tutto, tre scambi ciascuno: la creatura dell'unita'
dice una battuta (voce modello, con la traduzione sotto), il bambino
sceglie fra tre risposte (un altoparlante su ognuna la fa ascoltare
prima), la creatura reagisce. Una risposta fuori posto riceve un "hmm,
try again" e si attenua; nessun costo. Chiude la partita dell'unita':
sempre le prime due volte, poi una su tre (`wantsDialogue`, testata).
E' un albero pre-registrato, non un interlocutore, ma le formule
diventano cose che si dicono a qualcuno: e' il traguardo "interagire con
un compagno" delle Indicazioni. 544 tracce inglesi (creatura, tre
risposte e reazione per scambio, due "hmm" per dialogo) e una battuta di
Pepe. `js/dialogues.js`; il turno ha lo stesso contratto dei mini-giochi.
Provato con click veri: risposta sbagliata attenuata e ritentabile,
tre scambi, fine con festa. curriculum-test 107 -> 110.

### 7. Il check del mese

L'unica misura *esterna* che il gioco puo' offrire. Nell'area genitori,
sotto i progressi: dieci parole a caso fra quelle "padroneggiate" (o, se
sono meno di dieci, tutte), una alla volta. Sullo schermo la parola in
italiano; il genitore la legge, il bambino deve dire l'inglese; il
genitore segna "l'ha detta" o "no" e puo' far sentire il modello per
confrontare. Alla fine il punteggio entra in `save.checks` e si vede la
serie dei check fatti. Consigliato una volta al mese: la card lo dice
quando sono passati 30 giorni. Se le padroneggiate dell'app non reggono
al check, la soglia va alzata in `content.json` (`masteryBox`).
`js/checkup.js`, funzioni pure testate (scelta a caso senza doppioni,
scadenza a 30 giorni, riepilogo).

### 6. Missioni fuori dallo schermo

Otto missioni del giorno nuove, di tipo `home`, che si alternano alle
otto di gioco (la scelta e' per giorno, quindi circa una su due): "chiedi
a un adulto *How are you?* e ascolta la risposta", "conta le sedie in
inglese", "di' *good night* prima di dormire". La card in home mostra il
bottone "Un adulto conferma"; un secondo tocco di conferma ("Fatto
davvero?") chiude la missione con la festa di sempre. Non e' una
garanzia di trasferimento, ma il gioco smette di far finta che tutto
succeda sullo schermo. `trackMissionEvent({ home: true })`, testato.

## Prossimi passi

**Stato al 9 settembre 2026**: dal riconoscere al produrre (versione 3.3.0):
"Dillo tu" in ogni unita', 32 dialoghi con le creature, il check del mese
nell'area genitori, otto missioni a casa. Prima, l'8 sera: anni 2 e 3 del
curriculum completi e pubblicati (versione 3.0.0: 32 unita', 295 parole, 182 frasi, 281
illustrazioni, 605 tracce, due stagioni di storia, due giochi bonus).
Prima, nel pomeriggio: anno 2 completo e pubblicato
(versione 2.0.0: 20 unita', 167 parole, 110 frasi, 159 illustrazioni, 351
tracce), due giochi bonus. Prima, la sera del 7: fase 3 completa (versione
1.6.0): icone PWA, storico e grafico, criteri di successo, distintivi,
palette misurata per il daltonismo, piu' il primo gioco bonus "Bolle".
Restano dalla roadmap: piu' contenuti (nuove unita': vorrebbero
illustrazioni e audio nuovi, e una scelta di temi), un secondo gioco bonus,
multi-profilo (solo se servira'), invio automatico su Kindle (vorrebbe un
server: fuori).

**Stato al 2026-09-07**: la fase 2 e' completa e pubblicata — storia a
episodi, scrigni, registrazione della voce, condivisione in famiglia, tana
(versione 1.5.0). Il prossimo passo non e' codice: e' un playtest vero.
Da guardare: preme "Avanti" prima che il narratore finisca? Capisce che il
tondo nell'album riapre la scena? Si registra da solo o va spinto? Torna
nella tana senza che nessuno glielo dica? L'ordine dei prossimi interventi
lo decide quello.

3. **Riascoltare le 113 tracce generate** e rigenerare quelle che non
   convincono (`--force` dopo aver cancellato il file, oppure cambiare voce
   in `.env` e rilanciare).
4. **Playtest con il bambino su tablet**, osservando senza suggerire. Da guardare:
   capisce l'onboarding da solo? nota la differenza fra `a` e `an`? la soglia di
   fase lo motiva o lo blocca?
5. **Testare su Safari iOS reale**: sblocco audio al primo tocco, drag&drop col
   dito, safe area, aggiunta alla schermata Home.
6. **Tarare la soglia dopo il playtest.** L'80% e' una scommessa ragionata, non
   un dato: se la fase 1 dura troppo, si abbassa a 0.7 in `content.json` senza
   toccare una riga di codice.

## Idee future (non in v1)

- PWA installabile, icone PNG, prompt di installazione.
- Grafici dei progressi nel tempo nella dashboard genitori.
- Badge/achievement per il lungo periodo.
- Multi-profilo per piu' bambini.
- Invio automatico dei mini-ebook a Send-to-Kindle.
- Riconoscimento vocale per la pronuncia, quando sara' affidabile sulle voci dei bambini.
- Palette verificata per il daltonismo.
- Criteri di successo misurabili (uso quotidiano per 2 settimane, N parole acquisite).

### Fase 2 — disegno in `docs/fase-2.md`

Ordine deciso dopo il secondo playtest: (0) GitHub Pages, perche' su
`http://IP` offline, registrazione della voce e condivisione sono negati dal
browser; (1) la storia a episodi — *l'isola dove le creature hanno perso le
parole*, un capitolo per unita', le creature dell'album come personaggi;
(2) scrigni a sorpresa; (3) voce; (4) condivisione; (5) tana.

### Fase 2 — le idee originali

- Micro-narrativa a episodi ogni 3-4 livelli.
- Base/tana personale da decorare con le ricompense.
- Sorprese casuali (creature rare, scrigni bonus).
- Condivisione asincrona in famiglia.
- Registrazione della propria voce per riascoltarsi, senza valutazione.
